import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { compileTraverse } from './path-compiler';
import { validateTraverse } from './cpm-validation';
import { CPM_TOOL_NAMES, CpmToolName } from './cpm-tools';
import { EdgeMap, TraverseSpec } from './types';

const STATEMENT_TIMEOUT_MS = 3000;

export interface ToolResult {
  rows?: unknown[];
  error?: string;
}

/**
 * Read-only access to the CPM serving Postgres for the chatbot's process tools.
 *
 * Every tool runs inside a transaction that first sets `app.source_id` (RLS
 * confines the reader to that source) and a statement timeout. The pool uses the
 * `cpm_reader` role, which has SELECT only and is subject to RLS — so a bug that
 * forgot the source filter still cannot cross tenants.
 *
 * If CPM_DATABASE_URL is not configured the service is inert: `isConfigured()`
 * is false and callers must not register the tools.
 */
@Injectable()
export class CpmProcessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CpmProcessService.name);
  private readonly pool: Pool | null;
  private readonly edgeMapCache = new Map<number, { generatedAt: string; edgeMap: EdgeMap; catalogue: string }>();

  // coaching tenantId -> CPM source_id. STEP-5 PLACEHOLDER: this belongs in the
  // per-tenant config (features.cpmProcesses + cpmSourceId). Until that lands it
  // is read from env so step 4 is testable: CPM_TENANT_SOURCE_MAP="1:1,2:1" plus
  // an optional CPM_DEFAULT_SOURCE_ID fallback.
  private readonly tenantSourceMap: Map<number, number>;
  private readonly defaultSourceId: number | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('CPM_DATABASE_URL');
    this.pool = url ? new Pool({ connectionString: url, max: 4 }) : null;

    this.tenantSourceMap = parseTenantSourceMap(this.config.get<string>('CPM_TENANT_SOURCE_MAP'));
    const def = this.config.get<string>('CPM_DEFAULT_SOURCE_ID');
    this.defaultSourceId = def !== undefined && def !== '' && Number.isInteger(Number(def)) ? Number(def) : null;
  }

  /**
   * Resolve the CPM source a coaching tenant may query, or null if the feature
   * is off for it (not configured, or no mapping). Callers must treat null as
   * "do not register the CPM tools".
   */
  resolveSourceId(tenantId: number): number | null {
    if (!this.pool) return null;
    return this.tenantSourceMap.get(tenantId) ?? this.defaultSourceId;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.log('CPM_DATABASE_URL not set — CPM process tools disabled');
      return;
    }
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('CPM process serving DB reachable (read-only)');
    } catch (e) {
      this.logger.error(`CPM serving DB unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  isConfigured(): boolean {
    return this.pool !== null;
  }

  /** Compact prompt catalogue for a source, to inject into the system prompt. */
  async getPromptCatalogue(sourceId: number): Promise<string | null> {
    const cat = await this.loadCatalogue(sourceId);
    return cat?.catalogue ?? null;
  }

  /**
   * Dispatch a tool call. `args` is the parsed JSON from the model. Never throws
   * for expected conditions (unknown tool, validation failure, DB down) — returns
   * `{ error }` so the model can relay it and the chat never 500s.
   */
  async run(toolName: string, args: Record<string, unknown>, sourceId: number): Promise<ToolResult> {
    if (!this.pool) return { error: 'process data unavailable' };
    if (!CPM_TOOL_NAMES.includes(toolName as CpmToolName)) {
      return { error: `unknown tool '${toolName}'` };
    }
    try {
      switch (toolName as CpmToolName) {
        case 'search_elements':
          return await this.searchElements(args, sourceId);
        case 'traverse':
          return await this.traverse(args, sourceId);
        case 'get_process_hierarchy':
          return await this.getProcessHierarchy(args, sourceId);
        case 'get_element':
          return await this.getElement(args, sourceId);
      }
    } catch (e) {
      this.logger.error(`tool ${toolName} failed: ${e instanceof Error ? e.message : String(e)}`);
      return { error: 'process data unavailable' };
    }
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  private async searchElements(args: Record<string, unknown>, sourceId: number): Promise<ToolResult> {
    const where: string[] = [];
    const params: unknown[] = [];
    const bind = (v: unknown) => `$${params.push(v)}`;

    const query = asString(args.query);
    const facet = asString(args.facet);
    const type = asString(args.type);
    // Default 'any', not 'released': in this data is_released is largely unset, so
    // defaulting to released would hide everything and produce false "none exist"
    // answers. The model can still ask for released explicitly.
    const status = asString(args.status) ?? 'any';
    const changedSince = asString(args.changedSince);
    const limit = clamp(asInt(args.limit), 20, 100);

    if (query) {
      const like = bind(`%${query}%`);
      where.push(`(name_de ILIKE ${like} OR name_en ILIKE ${like})`);
    }
    if (facet) where.push(`facet = ${bind(facet)}`);
    if (type) where.push(`type = ${bind(type)}`);
    if (status === 'released') where.push('is_released IS TRUE');
    else if (status === 'draft') where.push('is_released IS NOT TRUE');
    if (changedSince) where.push(`changed_on >= ${bind(changedSince)}::timestamptz`);

    const sql =
      `SELECT id, coalesce(name_de, name_en) AS name, facet, type, is_released, changed_on, permalink
       FROM element
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY changed_on DESC NULLS LAST
       LIMIT ${bind(limit)}`;

    const rows = await this.withSource(sourceId, (c) => c.query(sql, params));
    return { rows: rows.rows };
  }

  private async traverse(args: Record<string, unknown>, sourceId: number): Promise<ToolResult> {
    const edgeMap = (await this.loadCatalogue(sourceId))?.edgeMap;
    if (!edgeMap) return { error: 'process data unavailable' };

    const spec = args as unknown as TraverseSpec;
    const check = validateTraverse(spec, edgeMap);
    if (!check.ok) return { error: check.reason };

    let compiled;
    try {
      compiled = compileTraverse(spec);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'invalid traverse spec' };
    }

    const rows = await this.withSource(sourceId, (c) => c.query(compiled.text, compiled.params));
    return { rows: rows.rows };
  }

  private async getProcessHierarchy(args: Record<string, unknown>, sourceId: number): Promise<ToolResult> {
    const root = asString(args.root);
    if (!root) return { error: 'root is required' };
    const direction = asString(args.direction) ?? 'descendants';
    const typeFilter = asString(args.typeFilter);
    const maxDepth = direction === 'children' ? 1 : asInt(args.maxDepth);

    const params: unknown[] = [];
    const bind = (v: unknown) => `$${params.push(v)}`;
    const rootId = bind(root);
    const rootLike = bind(`%${root}%`);

    // ancestors: walk up (root is the descendant); else walk down.
    const [anchorCol, pickCol] =
      direction === 'ancestors' ? ['descendant_id', 'ancestor_id'] : ['ancestor_id', 'descendant_id'];

    const extra: string[] = [];
    if (maxDepth) extra.push(`AND hc.distance <= ${bind(maxDepth)}`);
    if (typeFilter) extra.push(`AND c.type = ${bind(typeFilter)}`);

    const sql =
      `WITH root AS (
         SELECT id FROM element
         WHERE facet = 'processes' AND (id::text = ${rootId} OR name_de ILIKE ${rootLike} OR name_en ILIKE ${rootLike})
         ORDER BY (id::text = ${rootId}) DESC, length(coalesce(name_de, name_en))
         LIMIT 1
       )
       SELECT c.id, coalesce(c.name_de, c.name_en) AS name, c.type, hc.distance
       FROM hierarchy_closure hc
       JOIN root      ON hc.${anchorCol} = root.id
       JOIN element c ON c.id = hc.${pickCol}
       WHERE hc.distance > 0 ${extra.join(' ')}
       ORDER BY hc.distance, name`;

    const rows = await this.withSource(sourceId, (c) => c.query(sql, params));
    return { rows: rows.rows };
  }

  private async getElement(args: Record<string, unknown>, sourceId: number): Promise<ToolResult> {
    const element = asString(args.element);
    if (!element) return { error: 'element is required' };
    const params: unknown[] = [];
    const bind = (v: unknown) => `$${params.push(v)}`;
    const idParam = bind(element);
    const likeParam = bind(`%${element}%`);

    const sql =
      `WITH e AS (
         SELECT * FROM element
         WHERE id::text = ${idParam} OR name_de ILIKE ${likeParam} OR name_en ILIKE ${likeParam}
         ORDER BY (id::text = ${idParam}) DESC, length(coalesce(name_de, name_en))
         LIMIT 1
       )
       SELECT e.id, coalesce(e.name_de, e.name_en) AS name, e.facet, e.type, e.stereotype,
              e.description_de, e.is_released, e.state, e.valid_from, e.valid_until,
              e.changed_on, e.permalink,
              (SELECT count(*) FROM relation r WHERE r.source_element = e.id) AS outgoing_relations,
              (SELECT count(*) FROM relation r WHERE r.target_element = e.id) AS incoming_relations
       FROM e`;

    const rows = await this.withSource(sourceId, (c) => c.query(sql, params));
    return { rows: rows.rows };
  }

  // -------------------------------------------------------------------------
  // Infrastructure
  // -------------------------------------------------------------------------

  /**
   * Run `fn` in a transaction confined to `sourceId` via RLS, with a statement
   * timeout. SET LOCAL requires a transaction, which is why every read opens one.
   */
  private async withSource<T>(sourceId: number, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('CPM pool not configured');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      // set_config(..., true) = LOCAL to this transaction. Parameterised, so the
      // source id is bound, not concatenated.
      await client.query('SELECT set_config($1, $2, true)', ['app.source_id', String(sourceId)]);
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /** Load + cache the edge map / prompt catalogue, refreshing on generated_at change. */
  private async loadCatalogue(sourceId: number): Promise<{ edgeMap: EdgeMap; catalogue: string } | null> {
    if (!this.pool) return null;
    const meta = await this.pool.query<{ generated_at: string; catalogue: string; edge_map: EdgeMap }>(
      'SELECT generated_at, catalogue, edge_map FROM graph_catalogue WHERE source_id = $1',
      [sourceId],
    );
    if (meta.rowCount === 0) return null;
    const row = meta.rows[0];
    const generatedAt = String(row.generated_at);

    const cached = this.edgeMapCache.get(sourceId);
    if (cached && cached.generatedAt === generatedAt) return cached;

    const entry = { generatedAt, edgeMap: row.edge_map, catalogue: row.catalogue };
    this.edgeMapCache.set(sourceId, entry);
    return entry;
  }
}

// ---------------------------------------------------------------------------
// Small arg coercers — the model's JSON is untyped.
// ---------------------------------------------------------------------------

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}
function asInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : undefined;
}
function clamp(v: number | undefined, def: number, max: number): number {
  if (!v || v < 1) return def;
  return Math.min(v, max);
}

// Parse "tenantId:sourceId,tenantId:sourceId" into a Map, skipping malformed pairs.
function parseTenantSourceMap(raw: string | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [t, s] = pair.split(':').map((x) => Number(x.trim()));
    if (Number.isInteger(t) && Number.isInteger(s)) map.set(t, s);
  }
  return map;
}
