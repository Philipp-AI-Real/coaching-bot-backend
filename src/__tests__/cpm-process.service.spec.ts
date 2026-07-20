import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CpmProcessService } from '../cpm-process/cpm-process.service';

// Mock pg: a pool with query() (pool-level) + connect() returning a client.
const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockEnd = vi.fn();

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = mockPoolQuery;
    end = mockEnd;
    connect = async () => ({ query: mockClientQuery, release: mockRelease });
  },
}));

const EDGE_MAP = {
  facets: [
    { facet: 'processes', objects: 388 },
    { facet: 'roles', objects: 9 },
  ],
  edges: [{ srcFacet: 'processes', relationType: 'responsibleRole', tgtFacet: 'roles', count: 92 }],
  relationTypes: { withData: ['responsibleRole'], unresolvedOnly: [], declaredEmpty: ['requirements'] },
};

// Pass `null` for the unset case — `undefined` would trigger the default param.
async function build(url: string | null = 'postgres://cpm_reader@localhost/cpm') {
  const config = { get: vi.fn().mockImplementation((k: string) => (k === 'CPM_DATABASE_URL' ? url ?? undefined : undefined)) };
  const moduleRef = await Test.createTestingModule({
    providers: [CpmProcessService, { provide: ConfigService, useValue: config }],
  }).compile();
  return moduleRef.get(CpmProcessService);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: tool SELECTs return one row; session statements return nothing.
  mockClientQuery.mockImplementation((sql: string) =>
    /FROM element|FROM hierarchy_closure|WITH /i.test(sql) && /SELECT/i.test(sql)
      ? Promise.resolve({ rows: [{ id: 'p1', name: 'Einkauf' }] })
      : Promise.resolve({ rows: [] }),
  );
  mockPoolQuery.mockResolvedValue({
    rowCount: 1,
    rows: [{ generated_at: 't1', catalogue: 'CATALOGUE', edge_map: EDGE_MAP }],
  });
});

describe('CpmProcessService', () => {
  it('is inert when CPM_DATABASE_URL is unset', async () => {
    const svc = await build(null);
    expect(svc.isConfigured()).toBe(false);
    expect(await svc.run('search_elements', {}, 1)).toEqual({ error: 'process data unavailable' });
  });

  it('rejects an unknown tool', async () => {
    const svc = await build();
    expect(await svc.run('drop_everything', {}, 1)).toEqual({ error: "unknown tool 'drop_everything'" });
  });

  it('confines every read to the source via a per-request RLS session', async () => {
    const svc = await build();
    await svc.run('search_elements', { query: 'Einkauf' }, 7);

    const calls = mockClientQuery.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatch(/BEGIN READ ONLY/);
    // app.source_id is set LOCAL, bound as a parameter (not concatenated).
    const setConfig = mockClientQuery.mock.calls.find((c) => String(c[0]).includes('set_config'));
    expect(setConfig?.[1]).toEqual(['app.source_id', '7']);
    expect(calls.some((s) => /statement_timeout/.test(s))).toBe(true);
    expect(calls.some((s) => /COMMIT/.test(s))).toBe(true);
  });

  it('search_elements returns rows', async () => {
    const svc = await build();
    const res = await svc.run('search_elements', { query: 'Einkauf' }, 1);
    expect(res.rows).toEqual([{ id: 'p1', name: 'Einkauf' }]);
  });

  it('traverse validates against the edge map before touching the DB', async () => {
    const svc = await build();
    const res = await svc.run(
      'traverse',
      { start: { facet: 'processes' }, hops: [{ relation: 'requirements' }] },
      1,
    );
    expect(res.error).toMatch(/not maintained|nothing is recorded/);
    // Rejected before any connection/transaction was opened.
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('traverse runs a validated path', async () => {
    const svc = await build();
    const res = await svc.run(
      'traverse',
      { start: { facet: 'processes', query: 'Einkauf' }, hops: [{ relation: 'responsibleRole', direction: 'out', targetFacet: 'roles' }] },
      1,
    );
    expect(res.rows).toBeDefined();
    expect(mockClientQuery).toHaveBeenCalled();
  });

  it('surfaces a DB failure as a safe error and rolls back', async () => {
    const svc = await build();
    mockClientQuery.mockImplementation((sql: string) => {
      if (/FROM element/i.test(sql)) return Promise.reject(new Error('boom'));
      return Promise.resolve({ rows: [] });
    });
    const res = await svc.run('search_elements', { query: 'x' }, 1);
    expect(res).toEqual({ error: 'process data unavailable' });
    expect(mockClientQuery.mock.calls.some((c) => /ROLLBACK/.test(String(c[0])))).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('exposes the prompt catalogue for the system prompt', async () => {
    const svc = await build();
    expect(await svc.getPromptCatalogue(1)).toBe('CATALOGUE');
  });
});
