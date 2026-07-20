/**
 * OpenAI function-calling schemas for the CPM process tools. Exported so the chat
 * layer (step 4) can register them when a tenant has the feature enabled. The
 * repository graph is a small vocabulary, so four tools cover the combinatorial
 * question space; `traverse` is the workhorse.
 *
 * The concrete relation/facet names live in the per-tenant edge map that gets
 * injected into the system prompt — not hard-coded here — so this list never goes
 * stale when a tenant starts maintaining a new relation.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const CPM_TOOL_NAMES = ['search_elements', 'traverse', 'get_process_hierarchy', 'get_element'] as const;
export type CpmToolName = (typeof CPM_TOOL_NAMES)[number];

const searchElements: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_elements',
    description:
      'Search CPM repository objects (processes, documents=knowledge, applications=it, roles, risks, KPIs). ' +
      "Use for 'find X', 'list released processes', 'documents changed recently'.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name fragment (German or English). Omit to list by filters only.' },
        facet: { type: 'string', description: 'Object category from the repository graph, e.g. processes, knowledge, it, roles.' },
        type: { type: 'string', description: 'Sub-type, e.g. mainProcess, subProcess, task, role.' },
        status: { type: 'string', enum: ['released', 'draft', 'any'], description: 'Default any. Use released only when the user explicitly asks for released/current items.' },
        changedSince: { type: 'string', description: 'ISO date; only objects changed on/after it.' },
        limit: { type: 'integer', description: 'Max rows (default 20).' },
      },
      additionalProperties: false,
    },
  },
};

const traverse: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'traverse',
    description:
      'Follow typed relations from a starting object across one or more hops. Use for: which roles/systems/documents/risks ' +
      'belong to a process; which processes a role participates in; multi-hop paths (project -> processes -> requirements); ' +
      'gap analysis (objects LACKING a relation, via exists:false); counts (via aggregate). Only relations listed in the ' +
      'repository graph carry data — do not invent relation names.',
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'object',
          description: 'Anchor object(s). Omit query to start from a whole facet.',
          properties: {
            facet: { type: 'string' },
            query: { type: 'string', description: 'Name fragment or id.' },
            type: { type: 'string' },
            status: { type: 'string', enum: ['released', 'draft', 'any'] },
          },
          additionalProperties: false,
        },
        hops: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              relation: { type: 'string', description: 'Relation type from the repository graph.' },
              direction: { type: 'string', enum: ['out', 'in'], description: 'out: objects the node points to. in: objects pointing at it.' },
              targetFacet: { type: 'string' },
              targetType: { type: 'string' },
              exists: { type: 'boolean', description: 'false = return start objects with NO such relation. Last hop only.' },
            },
            required: ['relation'],
            additionalProperties: false,
          },
        },
        aggregate: {
          type: 'object',
          description: 'Omit to get the objects themselves.',
          properties: {
            op: { type: 'string', enum: ['count'] },
            groupBy: { type: 'string', enum: ['start', 'facet', 'type'] },
          },
          required: ['op', 'groupBy'],
          additionalProperties: false,
        },
        limit: { type: 'integer' },
      },
      required: ['start', 'hops'],
      additionalProperties: false,
    },
  },
};

const getProcessHierarchy: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_process_hierarchy',
    description:
      "Return the sub-tree, direct children, or ancestors of a process. Use for 'subprocesses under X', 'what sits below X', " +
      "'which main process contains X'.",
    parameters: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Process name fragment or id.' },
        direction: { type: 'string', enum: ['children', 'descendants', 'ancestors'], description: 'Default descendants.' },
        typeFilter: { type: 'string', description: 'e.g. subProcess, mainProcess.' },
        maxDepth: { type: 'integer' },
      },
      required: ['root'],
      additionalProperties: false,
    },
  },
};

const getElement: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_element',
    description: 'Full attributes of one repository object plus a count of its relations. Use to inspect or disambiguate.',
    parameters: {
      type: 'object',
      properties: { element: { type: 'string', description: 'Name fragment or id.' } },
      required: ['element'],
      additionalProperties: false,
    },
  },
};

export const CPM_TOOLS: ChatCompletionTool[] = [searchElements, traverse, getProcessHierarchy, getElement];
