/**
 * Live integration test for the CPM process tools against a real serving
 * Postgres — NO OpenAI involved. Proves the path compiler, edge-map validation,
 * RLS session and the four tools work end-to-end on real data.
 *
 * Opt-in: only runs when CPM_DATABASE_URL points at a synced serving DB. Bring it
 * up + sync first (serving/docker-compose.yml, npm run sync-postgres), then:
 *
 *   $env:CPM_DATABASE_URL="postgres://cpm_reader:reader_local_dev@localhost:5433/cpm"
 *   npx vitest run src/__tests__/cpm-live.spec.ts
 *
 * Unlike the other CPM specs, this one does NOT mock 'pg'.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { CpmProcessService } from '../cpm-process/cpm-process.service';

const URL = process.env.CPM_DATABASE_URL;
const SOURCE_ID = 1;

// Minimal ConfigService stand-in reading the two env vars the service needs.
const config = {
  get: (key: string) =>
    key === 'CPM_DATABASE_URL'
      ? URL
      : key === 'CPM_DEFAULT_SOURCE_ID'
        ? '1'
        : undefined,
} as unknown as ConfigService;

describe.skipIf(!URL)('CpmProcessService (live DB)', () => {
  const svc = new CpmProcessService(config);
  afterAll(async () => {
    await svc.onModuleDestroy();
  });

  it('resolves a mapped tenant to the default source', () => {
    expect(svc.isConfigured()).toBe(true);
    expect(svc.resolveSourceId(999)).toBe(1); // via CPM_DEFAULT_SOURCE_ID
  });

  it('get_process_hierarchy returns the subprocesses under Support_M1', async () => {
    const res = await svc.run('get_process_hierarchy', { root: 'Support_M1' }, SOURCE_ID);
    expect(res.error).toBeUndefined();
    const rows = res.rows as { name: string; type: string; distance: number }[];
    const subs = rows.filter((r) => r.type === 'subProcess');
    expect(subs.length).toBeGreaterThanOrEqual(4);
    // Includes a depth-2 descendant → transitive closure, not just direct children.
    expect(rows.some((r) => r.distance >= 2)).toBe(true);
  });

  it('search_elements finds a process by name', async () => {
    const res = await svc.run('search_elements', { query: 'Support', facet: 'processes', status: 'any' }, SOURCE_ID);
    const rows = res.rows as { name: string }[];
    expect(rows.some((r) => r.name?.includes('Support'))).toBe(true);
  });

  it('traverse resolves processes for roles (validated in-hop)', async () => {
    const res = await svc.run(
      'traverse',
      { start: { facet: 'roles' }, hops: [{ relation: 'responsibleRole', direction: 'in', targetFacet: 'processes' }] },
      SOURCE_ID,
    );
    expect(res.error).toBeUndefined();
    expect((res.rows as unknown[]).length).toBeGreaterThan(0);
  });

  it('traverse gap analysis returns processes lacking a responsible role', async () => {
    const res = await svc.run(
      'traverse',
      { start: { facet: 'processes', type: 'mainProcess' }, hops: [{ relation: 'responsibleRole', direction: 'out', exists: false }] },
      SOURCE_ID,
    );
    expect(res.error).toBeUndefined();
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it('rejects a modelled-but-empty relation instead of returning a silent empty set', async () => {
    const res = await svc.run(
      'traverse',
      { start: { facet: 'processes' }, hops: [{ relation: 'requirements' }] },
      SOURCE_ID,
    );
    expect(res.rows).toBeUndefined();
    expect(res.error).toMatch(/not maintained|nothing is recorded|does not link/);
  });

  it('get_element returns detail with relation counts', async () => {
    const res = await svc.run('get_element', { element: 'Support_M1' }, SOURCE_ID);
    const rows = res.rows as { name: string; outgoing_relations: number }[];
    expect(rows.length).toBe(1);
    expect(rows[0].name).toContain('Support');
  });
});
