/**
 * Shared types for the CPM process integration.
 *
 * The chatbot never writes SQL. It composes a TraverseSpec (which the LLM emits
 * as tool arguments); the path compiler turns that into parameterised SQL. The
 * edge map (EdgeMap) is both the prompt vocabulary and the validation whitelist.
 */

export type HopDirection = 'out' | 'in';

export interface TraverseStart {
  facet?: string;
  query?: string; // name fragment or id
  type?: string;
  status?: 'released' | 'draft' | 'any';
}

export interface TraverseHop {
  relation: string;
  direction?: HopDirection;
  targetFacet?: string;
  targetType?: string;
  /** false = return start objects lacking this relation (gap analysis). Last hop only. */
  exists?: boolean;
}

export interface TraverseAggregate {
  op: 'count';
  groupBy: 'start' | 'facet' | 'type';
}

export interface TraverseSpec {
  start: TraverseStart;
  hops: TraverseHop[];
  aggregate?: TraverseAggregate;
  limit?: number;
}

/** Compiled, ready-to-run parameterised query. */
export interface CompiledQuery {
  text: string;
  params: unknown[];
}

/** The slice of the edge map the backend needs as a whitelist. */
export interface EdgeMap {
  facets: { facet: string; objects: number }[];
  edges: { srcFacet: string; relationType: string; tgtFacet: string; count: number }[];
  relationTypes: {
    withData: string[];
    unresolvedOnly: string[];
    declaredEmpty: string[];
  };
}

export interface ElementRow {
  id: string;
  name: string | null;
  facet: string;
  type: string | null;
  is_released?: boolean | null;
  changed_on?: Date | null;
  permalink?: string | null;
}
