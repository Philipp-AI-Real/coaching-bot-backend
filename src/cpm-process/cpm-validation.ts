/**
 * Validate a TraverseSpec against the tenant's edge map BEFORE compiling SQL.
 *
 * This is what makes the difference between an honest "none recorded" and a
 * silent, confidently-wrong empty result. A relation that is modelled but
 * unmaintained, or a mistyped facet, is rejected here with a reason the model
 * can relay — it never reaches the database as a query that quietly returns zero
 * rows.
 */

import { TraverseSpec, EdgeMap } from './types';

export interface ValidationResult {
  ok: boolean;
  /** Human-readable reason, safe to surface to the model, when ok === false. */
  reason?: string;
}

export function validateTraverse(spec: TraverseSpec, edgeMap: EdgeMap): ValidationResult {
  const facets = new Set(edgeMap.facets.map((f) => f.facet));

  if (spec.start.facet && !facets.has(spec.start.facet)) {
    return fail(`unknown facet '${spec.start.facet}'. Known facets: ${[...facets].join(', ')}`);
  }

  for (const hop of spec.hops) {
    const rel = hop.relation;

    if (edgeMap.relationTypes.withData.includes(rel)) {
      // traversable — fine
    } else if (edgeMap.relationTypes.declaredEmpty.includes(rel)) {
      return fail(`relation '${rel}' is modelled but not maintained in this tenant — nothing is recorded for it`);
    } else if (edgeMap.relationTypes.unresolvedOnly.includes(rel)) {
      return fail(`relation '${rel}' exists but does not link to queryable objects`);
    } else {
      return fail(`unknown relation '${rel}'. Traversable relations: ${edgeMap.relationTypes.withData.join(', ')}`);
    }

    if (hop.targetFacet && !facets.has(hop.targetFacet)) {
      return fail(`unknown targetFacet '${hop.targetFacet}'. Known facets: ${[...facets].join(', ')}`);
    }

    // A relation carries data, but maybe not into the requested target facet.
    if (hop.targetFacet) {
      const dir = hop.direction ?? 'out';
      const reachable = edgeMap.edges.some((e) =>
        e.relationType === rel && (dir === 'out' ? e.tgtFacet === hop.targetFacet : e.srcFacet === hop.targetFacet),
      );
      if (!reachable) {
        return fail(`relation '${rel}' does not link to '${hop.targetFacet}' objects in this tenant`);
      }
    }
  }

  return { ok: true };
}

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}
