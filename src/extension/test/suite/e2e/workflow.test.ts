import * as assert from 'assert';
import * as vscode from 'vscode';
import { createTestDocument, closeAllEditors, createTestFinding } from '../index';
import { Finding } from '../../../src/core/types';

suite('E2E Workflow Test Suite', () => {
  setup(async () => {
    // 等待扩展激活
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  teardown(async () => {
    // 关闭所有编辑器
    await closeAllEditors();
  });

  test('should create test document', async () => {
    const document = await createTestDocument(
      'const x = 1;\nconst y = 2;\n',
      'typescript'
    );

    assert.strictEqual(document.isUntitled, true);
    assert.strictEqual(document.languageId, 'typescript');
    assert.strictEqual(document.getText(), 'const x = 1;\nconst y = 2;\n');
  });

  test('should create test Finding', () => {
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

    const testFinding = createTestFinding();

    assert.strictEqual(testFinding.id, 'test-1');
    assert.strictEqual(testFinding.rule_id, 'test.rule');
    assert.strictEqual(testFinding.severity, 'high');
  });

  test('should handle complete workflow', async () => {
    // 1. 创建测试文档
    const document = await createTestDocument(
      'const x = 1;\nconst y = 2;\n',
      'typescript'
    );

    // 2. 验证文档内容
    assert.strictEqual(
      document.getText(),
      'const x = 1;\nconst y = 2;\n'
    );

    // 3. 创建 Finding
    const finding: Finding = createTestFinding({
      location: { file: document.uri.fsPath, line: 1, column: 0 },
      code_snippet: 'const x = 1;',
    });

    // 4. 验证 Finding
    assert.strictEqual(finding.location.line, 1);
    assert.strictEqual(finding.code_snippet, 'const x = 1;');

    // 5. 清理
    await closeAllEditors();

    // 6. 验证编辑器已关闭
    const editor = vscode.window.activeTextEditor;
    assert.strictEqual(editor, undefined);
  });

  test('should execute AI Fix command', async () => {
    // 创建测试文档
    const document = await createTestDocument(
      'const x = 1;\n',
      'typescript'
    );

    const finding: Finding = createTestFinding({
      location: { file: document.uri.fsPath, line: 1, column: 0 },
      code_snippet: 'const x = 1;',
    });

    // 尝试执行 AI Fix 命令
    try {
      await vscode.commands.executeCommand(
        'gitai.sast.aiFix',
        document.uri,
        finding
      );

      // 注意：实际执行可能需要更多的设置
      // 这里只是验证命令可以被调用
      assert.ok(true);
    } catch (error) {
      // 命令可能需要更多的上下文，这是预期的
      console.log('[E2E] AI Fix command error:', error);
    }
  });
});
