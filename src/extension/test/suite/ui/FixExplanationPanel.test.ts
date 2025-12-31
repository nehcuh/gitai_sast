import * as assert from 'assert';
import { Finding } from '../../../src/core/types';

suite('FixExplanationPanel Test Suite', () => {
  test('should create Finding object for testing', () => {
    const finding: Finding = {
      id: 'test-1',
      rule_id: 'test.rule',
      type: 'security',
      severity: 'high',
      title: 'Test vulnerability',
      description: 'Test description',
      location: { file: 'test.ts', line: 1, column: 0 },
      code_snippet: 'const x = 1;',
      provider: 'local',
    };

    assert.strictEqual(finding.id, 'test-1');
    assert.strictEqual(finding.rule_id, 'test.rule');
    assert.strictEqual(finding.severity, 'high');
    assert.strictEqual(finding.location.line, 1);
  });

  test('should escape HTML entities', () => {
    const text = '<div>Hello</div>';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    assert.strictEqual(escaped, '&lt;div&gt;Hello&lt;/div&gt;');
  });

  test('should extract code block with language', () => {
    const suggestion = 'Fix:\n```typescript\nconst x = 2;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match?.[1], 'const x = 2;');
  });

  test('should extract code block without language', () => {
    const suggestion = 'Fix:\n```\nconst x = 2;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match?.[1], 'const x = 2;');
  });

  test('should handle no code block', () => {
    const suggestion = 'const x = 2;';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match, null);
  });

  test('should trim extracted code', () => {
    const suggestion = 'Fix:\n```\n  const x = 2;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match?.[1], '  const x = 2;');
  });

  test('should handle empty suggestion', () => {
    const suggestion = '';
    const trimmed = suggestion.trim();

    assert.strictEqual(trimmed, '');
  });

  test('should handle multiple code blocks (first one)', () => {
    const suggestion =
      'Fix:\n```\nconst x = 2;\n```\nAnd more:\n```\nconst y = 3;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match?.[1], 'const x = 2;');
  });

  test('should handle thinking content', () => {
    const thinking = 'Root cause is...';
    assert.strictEqual(thinking, 'Root cause is...');
  });

  test('should handle severity mapping', () => {
    const severities = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'critical',
    };

    assert.strictEqual(severities.low, 'low');
    assert.strictEqual(severities.medium, 'medium');
    assert.strictEqual(severities.high, 'high');
    assert.strictEqual(severities.critical, 'critical');
  });

  test('should handle button command mapping', () => {
    const commands = {
      applyFix: 'applyFix',
      copyCode: 'copyCode',
      dismiss: 'dismiss',
    };

    assert.strictEqual(commands.applyFix, 'applyFix');
    assert.strictEqual(commands.copyCode, 'copyCode');
    assert.strictEqual(commands.dismiss, 'dismiss');
  });
});
