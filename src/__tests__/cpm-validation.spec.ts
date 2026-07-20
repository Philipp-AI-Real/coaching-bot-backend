import { describe, it, expect } from 'vitest';
import { validateTraverse } from '../cpm-process/cpm-validation';
import { EdgeMap } from '../cpm-process/types';

const edgeMap: EdgeMap = {
  facets: [
    { facet: 'processes', objects: 388 },
    { facet: 'roles', objects: 9 },
    { facet: 'it', objects: 10 },
    { facet: 'projects', objects: 5 },
    { facet: 'requirements', objects: 1 },
  ],
  edges: [
    { srcFacet: 'processes', relationType: 'responsibleRole', tgtFacet: 'roles', count: 92 },
    { srcFacet: 'processes', relationType: 'systems', tgtFacet: 'it', count: 55 },
  ],
  relationTypes: {
    withData: ['responsibleRole', 'systems'],
    unresolvedOnly: ['annotations'],
    declaredEmpty: ['requirements', 'accountableRole'],
  },
};

describe('validateTraverse', () => {
  it('accepts a traversable relation into the right facet', () => {
    const r = validateTraverse(
      { start: { facet: 'processes' }, hops: [{ relation: 'responsibleRole', direction: 'out', targetFacet: 'roles' }] },
      edgeMap,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a modelled-but-empty relation with an honest reason', () => {
    const r = validateTraverse(
      { start: { facet: 'projects' }, hops: [{ relation: 'requirements' }] },
      edgeMap,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not maintained|nothing is recorded/);
  });

  it('rejects a relation that has rows but no queryable targets', () => {
    const r = validateTraverse(
      { start: { facet: 'processes' }, hops: [{ relation: 'annotations' }] },
      edgeMap,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not link to queryable/);
  });

  it('rejects an unknown relation and lists the traversable ones', () => {
    const r = validateTraverse(
      { start: { facet: 'processes' }, hops: [{ relation: 'madeUpRelation' }] },
      edgeMap,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/responsibleRole, systems/);
  });

  it('rejects an unknown start facet', () => {
    const r = validateTraverse(
      { start: { facet: 'documents' }, hops: [{ relation: 'systems' }] },
      edgeMap,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown facet 'documents'/);
  });

  it('rejects a real relation aimed at a facet it does not reach', () => {
    const r = validateTraverse(
      { start: { facet: 'processes' }, hops: [{ relation: 'systems', direction: 'out', targetFacet: 'roles' }] },
      edgeMap,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not link to 'roles'/);
  });

  it('respects direction when checking reachability', () => {
    // responsibleRole goes processes -> roles; from roles it is reachable inbound.
    const r = validateTraverse(
      { start: { facet: 'roles' }, hops: [{ relation: 'responsibleRole', direction: 'in', targetFacet: 'processes' }] },
      edgeMap,
    );
    expect(r.ok).toBe(true);
  });
});
