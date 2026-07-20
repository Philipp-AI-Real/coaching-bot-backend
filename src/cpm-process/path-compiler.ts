/**
 * Path compiler — turns a validated TraverseSpec into a single parameterised SQL
 * query over `element` + `relation`.
 *
 * SECURITY INVARIANT: no value from the spec is ever concatenated into the SQL
 * string. Every relation type, facet, type, name and limit is a bound parameter
 * ($1, $2, …). The only spec-derived thing that shapes the SQL *text* is control
 * flow (hop count, direction, exists, aggregate) — never a data value. Tenant
 * isolation is handled out-of-band by RLS (`SET LOCAL app.source_id`), so no
 * source_id predicate appears here.
 *
 * Each CTE carries the origin (`root_id`, `root_name`) so `aggregate.groupBy:
 * 'start'` can count targets per starting object across any number of hops.
 */

import { TraverseSpec, CompiledQuery, TraverseStart } from './types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

class ParamBag {
  readonly values: unknown[] = [];
  /** Bind a value, return its `$n` placeholder. */
  bind(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

export function compileTraverse(spec: TraverseSpec): CompiledQuery {
  if (!spec.hops || spec.hops.length === 0) {
    throw new Error('traverse requires at least one hop');
  }
  // Guard: exists=false is a terminal negation; it may only appear on the last hop.
  spec.hops.forEach((h, i) => {
    if (h.exists === false && i !== spec.hops.length - 1) {
      throw new Error('exists:false is only allowed on the last hop');
    }
  });

  const p = new ParamBag();
  const ctes: string[] = [buildStartCte(spec.start, p)];

  const lastHop = spec.hops[spec.hops.length - 1];
  const negatedLast = lastHop.exists === false;
  const bodyHops = negatedLast ? spec.hops.slice(0, -1) : spec.hops;

  bodyHops.forEach((hop, i) => {
    ctes.push(buildHopCte(i + 1, hop, p));
  });

  const finalRel = negatedLast ? `s${bodyHops.length}` : `s${bodyHops.length}`;

  let select: string;
  if (negatedLast) {
    // Gap analysis: nodes reached so far that LACK the final relation.
    select = buildGapSelect(finalRel, bodyHops.length, lastHop, p);
  } else if (spec.aggregate) {
    select = buildAggregateSelect(finalRel, spec.aggregate);
  } else {
    const limit = clampLimit(spec.limit);
    select = `SELECT DISTINCT id, name, facet, type, permalink FROM ${finalRel} LIMIT ${p.bind(limit)}`;
  }

  return { text: `WITH ${ctes.join(',\n')}\n${select}`, params: p.values };
}

// ---------------------------------------------------------------------------

function buildStartCte(start: TraverseStart, p: ParamBag): string {
  const where: string[] = [];
  if (start.facet) where.push(`facet = ${p.bind(start.facet)}`);
  if (start.type) where.push(`type = ${p.bind(start.type)}`);
  if (start.query) {
    const idParam = p.bind(start.query);
    const likeParam = p.bind(`%${start.query}%`);
    where.push(`(id::text = ${idParam} OR name_de ILIKE ${likeParam} OR name_en ILIKE ${likeParam})`);
  }
  if (start.status === 'released') where.push('is_released IS TRUE');
  else if (start.status === 'draft') where.push('is_released IS NOT TRUE');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return `s0 AS (
  SELECT id,
         id            AS root_id,
         coalesce(name_de, name_en) AS root_name,
         coalesce(name_de, name_en) AS name,
         facet, type, permalink
  FROM element
  ${whereSql}
)`;
}

function buildHopCte(idx: number, hop: { relation: string; direction?: string; targetFacet?: string; targetType?: string }, p: ParamBag): string {
  const prev = `s${idx - 1}`;
  const [fromCol, toCol] =
    hop.direction === 'in' ? ['target_element', 'source_element'] : ['source_element', 'target_element'];

  const extra: string[] = [];
  if (hop.targetFacet) extra.push(`AND t.facet = ${p.bind(hop.targetFacet)}`);
  if (hop.targetType) extra.push(`AND t.type = ${p.bind(hop.targetType)}`);

  return `s${idx} AS (
  SELECT DISTINCT
         t.id,
         ${prev}.root_id,
         ${prev}.root_name,
         coalesce(t.name_de, t.name_en) AS name,
         t.facet, t.type, t.permalink
  FROM ${prev}
  JOIN relation r ON r.${fromCol} = ${prev}.id AND r.relation_type = ${p.bind(hop.relation)}
  JOIN element  t ON t.id = r.${toCol}
  ${extra.join('\n  ')}
)`;
}

function buildGapSelect(prevCte: string, prevIdx: number, hop: { relation: string; direction?: string }, p: ParamBag): string {
  // "start objects that have no such relation" — anti-join on the node set
  // produced by the preceding hops (s{prevIdx}); with no prior hop that is s0.
  const node = `s${prevIdx}`;
  const [fromCol] = hop.direction === 'in' ? ['target_element'] : ['source_element'];
  const relParam = p.bind(hop.relation);
  const limit = p.bind(clampLimit(undefined));
  return `SELECT DISTINCT id, name, facet, type, permalink
FROM ${node} n
WHERE NOT EXISTS (
  SELECT 1 FROM relation r
   WHERE r.${fromCol} = n.id AND r.relation_type = ${relParam}
)
LIMIT ${limit}`;
}

function buildAggregateSelect(finalCte: string, agg: { groupBy: string }): string {
  switch (agg.groupBy) {
    case 'start':
      return `SELECT root_id, root_name, count(DISTINCT id) AS count
FROM ${finalCte} GROUP BY root_id, root_name ORDER BY count DESC`;
    case 'facet':
      return `SELECT facet, count(DISTINCT id) AS count
FROM ${finalCte} GROUP BY facet ORDER BY count DESC`;
    case 'type':
      return `SELECT type, count(DISTINCT id) AS count
FROM ${finalCte} GROUP BY type ORDER BY count DESC`;
    default:
      throw new Error(`unsupported groupBy: ${agg.groupBy}`);
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}
