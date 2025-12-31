import assert from 'node:assert/strict';
import test from 'node:test';

import { createChatCompletion } from './OpenAiCompatibleClient';

test('createChatCompletion includes stream=true in request payload when enabled', async () => {
  const logs: string[] = [];

  const options = {
    apiUrl: 'not-a-url',
    apiKey: '',
    model: 'test-model',
    temperature: 0.2,
    timeoutMs: 1000,
    debugLog: (line: string) => logs.push(line),
    debugMaxChars: 100000,
    stream: true,
  } as any;

  await assert.rejects(createChatCompletion(options, [{ role: 'user', content: 'hi' }]), /Invalid URL/);

  const requestBodyLine = logs.find((line) => line.startsWith('[OpenAI-compatible] requestBody='));
  assert.ok(requestBodyLine, 'Expected requestBody log line');

  const jsonText = requestBodyLine.slice('[OpenAI-compatible] requestBody='.length);
  const payload = JSON.parse(jsonText);
  assert.equal(payload.stream, true);
});
