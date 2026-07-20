import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { OpenAIChatService } from '../chat/openai-chat.service';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

const DUMMY_TOOL: ChatCompletionTool = {
  type: 'function',
  function: { name: 'traverse', description: 'x', parameters: { type: 'object', properties: {} } },
};

// Shape a minimal ChatCompletion.
function reply(message: Record<string, unknown>) {
  return { choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: {} };
}
function toolCall(id: string, name: string, args: unknown) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

async function build() {
  const config = {
    get: vi.fn().mockImplementation((k: string, d?: unknown) => (k === 'OPENAI_API_KEY' ? 'sk-test' : d)),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [OpenAIChatService, { provide: ConfigService, useValue: config }],
  }).compile();
  return moduleRef.get(OpenAIChatService);
}

beforeEach(() => vi.clearAllMocks());

describe('OpenAIChatService.generateReply tool loop', () => {
  it('returns the assistant text when no tool is called', async () => {
    const svc = await build();
    mockCreate.mockResolvedValueOnce(reply({ content: 'hello' }));
    expect(await svc.generateReply('sys', 'msg', {})).toEqual({ text: 'hello' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('executes an extra tool and feeds its result back before answering', async () => {
    const svc = await build();
    const executeTool = vi.fn().mockResolvedValue({ rows: [{ id: 'p1' }] });
    mockCreate
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall('c1', 'traverse', { start: { facet: 'processes' } })] }))
      .mockResolvedValueOnce(reply({ content: 'Process P1 is responsible.' }));

    const res = await svc.generateReply('sys', 'msg', { extraTools: [DUMMY_TOOL], executeTool });

    expect(executeTool).toHaveBeenCalledWith('traverse', { start: { facet: 'processes' } });
    expect(res).toEqual({ text: 'Process P1 is responsible.' });
    // The second call must include a role:'tool' message carrying the rows.
    const secondMessages = mockCreate.mock.calls[1][0].messages;
    const toolMsg = secondMessages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg.content).toContain('p1');
  });

  it('captures a suggested coaching item and still answers', async () => {
    const svc = await build();
    mockCreate
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall('c1', 'suggest_coaching_item', { type: 'habit', title: 'Daily review' })] }))
      .mockResolvedValueOnce(reply({ content: 'Sounds good.' }));

    const res = await svc.generateReply('sys', 'msg', { enableItemSuggestion: true });
    expect(res.text).toBe('Sounds good.');
    expect(res.suggestedItem).toEqual({ type: 'habit', title: 'Daily review' });
  });

  it('relays an error result when the tool executor rejects', async () => {
    const svc = await build();
    const executeTool = vi.fn().mockRejectedValue(new Error('boom'));
    mockCreate
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall('c1', 'traverse', {})] }))
      .mockResolvedValueOnce(reply({ content: 'Could not fetch that.' }));

    const res = await svc.generateReply('sys', 'msg', { extraTools: [DUMMY_TOOL], executeTool });
    expect(res.text).toBe('Could not fetch that.');
    const toolMsg = mockCreate.mock.calls[1][0].messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg.content).toContain('error');
  });

  it('forces a final answer when the tool loop keeps calling tools', async () => {
    const svc = await build();
    const executeTool = vi.fn().mockResolvedValue({ rows: [] });
    // Always request a tool for the 4 loop steps, then the forced final call (no
    // tools) returns text.
    mockCreate.mockImplementation((params: { tools?: unknown }) =>
      Promise.resolve(
        params.tools
          ? reply({ content: null, tool_calls: [toolCall('c', 'traverse', {})] })
          : reply({ content: 'Final synthesis.' }),
      ),
    );

    const res = await svc.generateReply('sys', 'msg', { extraTools: [DUMMY_TOOL], executeTool });
    expect(res.text).toBe('Final synthesis.');
    expect(executeTool).toHaveBeenCalledTimes(4); // MAX_TOOL_STEPS
    expect(mockCreate).toHaveBeenCalledTimes(5); // 4 loop + 1 forced final
  });
});
