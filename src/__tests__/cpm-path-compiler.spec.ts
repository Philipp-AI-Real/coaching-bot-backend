import { describe, it, expect } from 'vitest';
import { compileTraverse } from '../cpm-process/path-compiler';
import { TraverseSpec } from '../cpm-process/types';

describe('compileTraverse', () => {
  it('compiles a single outgoing hop into a relation join', () => {
    const { text, params } = compileTraverse({
      start: { facet: 'processes', query: 'Einkauf' },
      hops: [{ relation: 'responsibleRole', direction: 'out', targetFacet: 'roles' }],
    });
    expect(text).toMatch(/JOIN relation r ON r\.source_element = s0\.id/);
    expect(text).toMatch(/JOIN element  t ON t\.id = r\.target_element/);
    // Values are bound, not inlined.
    expect(params).toContain('responsibleRole');
    expect(params).toContain('processes');
    expect(params).toContain('roles');
    expect(params).toContain('%Einkauf%');
  });

  it('SECURITY: no spec data value ever appears in the SQL text', () => {
    const evil = "x'; DROP TABLE element; --";
    const { text, params } = compileTraverse({
      start: { facet: evil, query: evil, type: evil },
      hops: [{ relation: evil, direction: 'out', targetFacet: evil, targetType: evil }],
    });
    expect(text).not.toContain('DROP TABLE');
    expect(text).not.toContain(evil);
    // The dangerous string is safely carried as bound parameters instead.
    expect(params).toContain(evil);
    // Every placeholder in the text has a corresponding param.
    const placeholders = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...placeholders)).toBe(params.length);
  });

  it('swaps join columns for an incoming hop', () => {
    const { text } = compileTraverse({
      start: { facet: 'roles', query: 'Anlagenfahrer' },
      hops: [{ relation: 'responsibleRole', direction: 'in', targetFacet: 'processes' }],
    });
    expect(text).toMatch(/r\.target_element = s0\.id/);
    expect(text).toMatch(/t\.id = r\.source_element/);
  });

  it('chains multiple hops, carrying the origin through', () => {
    const { text } = compileTraverse({
      start: { facet: 'projects', query: 'X' },
      hops: [
        { relation: 'startProcesses', direction: 'out', targetFacet: 'processes' },
        { relation: 'requirements', direction: 'out', targetFacet: 'requirements' },
      ],
    });
    expect(text).toMatch(/s1 AS/);
    expect(text).toMatch(/s2 AS/);
    expect(text).toMatch(/FROM s2/);
    // root_id threads through every hop for later aggregation.
    expect(text.match(/root_id/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('compiles exists:false into an anti-join (gap analysis)', () => {
    const { text } = compileTraverse({
      start: { facet: 'processes' },
      hops: [{ relation: 'responsibleRole', direction: 'out', exists: false }],
    });
    expect(text).toMatch(/NOT EXISTS/);
    expect(text).toMatch(/FROM s0 n/);
    // The negated hop does not create an s1 CTE.
    expect(text).not.toMatch(/s1 AS/);
  });

  it('compiles aggregate count grouped by start', () => {
    const spec: TraverseSpec = {
      start: { facet: 'processes' },
      hops: [{ relation: 'responsibleRole', direction: 'out', targetFacet: 'roles' }],
      aggregate: { op: 'count', groupBy: 'start' },
    };
    const { text } = compileTraverse(spec);
    expect(text).toMatch(/count\(DISTINCT id\) AS count/);
    expect(text).toMatch(/GROUP BY root_id, root_name/);
  });

  it('clamps the limit to the maximum', () => {
    const { text, params } = compileTraverse({
      start: { facet: 'processes' },
      hops: [{ relation: 'systems', direction: 'out' }],
      limit: 999999,
    });
    expect(params).toContain(200);
    expect(text).toMatch(/LIMIT \$\d+/);
  });

  it('rejects a spec with no hops', () => {
    expect(() => compileTraverse({ start: {}, hops: [] })).toThrow(/at least one hop/);
  });

  it('rejects exists:false on a non-final hop', () => {
    expect(() =>
      compileTraverse({
        start: { facet: 'processes' },
        hops: [
          { relation: 'systems', exists: false },
          { relation: 'author' },
        ],
      }),
    ).toThrow(/last hop/);
  });
});
