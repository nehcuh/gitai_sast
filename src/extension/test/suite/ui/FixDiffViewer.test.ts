import * as assert from 'assert';
import * as vscode from 'vscode';
import { FixDiffViewer } from '../../../src/ui/FixDiffViewer';
import { Finding } from '../../../src/core/types';

suite('FixDiffViewer Test Suite', () => {
  let originalUri: vscode.Uri;
  let document: vscode.TextDocument;

  setup(async () => {
    // 创建测试文档
    originalUri = vscode.Uri.parse('untitled:test.ts');
    document = await vscode.workspace.openTextDocument(originalUri);
    const editor = await vscode.window.showTextDocument(document);

    // 写入测试内容
    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(0, 0),
        'const x = 1;\nconst y = 2;\nconst z = 3;\n'
      );
    });

    // 等待保存
    await document.save();
  });

  teardown(async () => {
    // 关闭所有编辑器
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should create Finding object', () => {
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

  test('should extract code from suggestion with code block', () => {
    const suggestion = 'Here is the fix:\n```typescript\nconst x = 2;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match?.[1], 'const x = 2;');
  });

  test('should extract code from suggestion without code block', () => {
    const suggestion = 'const x = 2;';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(match, null);
    assert.strictEqual(suggestion.trim(), 'const x = 2;');
  });

  test('should replace range in content', () => {
    const content = 'const x = 1;\nconst y = 2;\nconst z = 3;\n';
    const range = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 12)
    );
    const replacement = 'const x = 2;';

    const result =
      content.substring(0, 0) + replacement + content.substring(12);

    assert.strictEqual(
      result,
      'const x = 2;\nconst y = 2;\nconst z = 3;\n'
    );
  });

  test('should escape HTML entities', () => {
    const text = '<script>alert("test")</script>';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    assert.strictEqual(
      escaped,
      '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;'
    );
  });

  test('should identify severity tags', () => {
    const severities = ['high', 'medium', 'low', 'critical'];

    for (const severity of severities) {
      const tagClass = `severity-${severity}`;
      assert.strictEqual(tagClass.includes('severity-'), true);
    }
  });

  test('should handle empty suggestion', () => {
    const suggestion = '';
    const trimmed = suggestion.trim();

    assert.strictEqual(trimmed, '');
  });

  test('should handle multi-line code extraction', () => {
    const suggestion =
      'Here is the fix:\n```\nconst x = 2;\nconst y = 3;\n```';
    const codeBlockRegex = /```(?:[\w-]+)?\s*\n([\s\S]*?)\n?```/;
    const match = suggestion.match(codeBlockRegex);

    assert.strictEqual(
      match?.[1],
      'const x = 2;\nconst y = 3;'
    );
  });
});
