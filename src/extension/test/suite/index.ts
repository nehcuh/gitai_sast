import * as vscode from 'vscode';
import { Finding } from '../../src/core/types';

/**
 * 测试辅助函数
 */

/**
 * 创建测试 Finding 对象
 */
export function createTestFinding(
  overrides: Partial<Finding> = {}
): Finding {
  return {
    id: 'test-1',
    rule_id: 'test.rule',
    type: 'security',
    severity: 'high',
    title: 'Test vulnerability',
    description: 'Test description',
    location: { file: 'test.ts', line: 1, column: 0 },
    code_snippet: 'const x = 1;',
    provider: 'local',
    ...overrides,
  };
}

/**
 * 创建测试文档
 */
export async function createTestDocument(
  content: string,
  language = 'typescript'
): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:test.${language}`);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);

  await editor.edit((editBuilder) => {
    editBuilder.insert(new vscode.Position(0, 0), content);
  });

  await document.save();

  return document;
}

/**
 * 等待一段时间
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 等待命令执行
 */
export async function waitForCommand(
  command: string,
  timeout = 5000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // TODO: 实现命令等待逻辑
      // 目前仅使用 sleep
      await sleep(100);
    } catch (error) {
      // 忽略错误
    }
  }

  throw new Error(`Command ${command} timed out`);
}

/**
 * 关闭所有编辑器
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await sleep(100);
}

/**
 * 清理测试文件
 */
export async function cleanupTestFiles(uris: vscode.Uri[]): Promise<void> {
  for (const uri of uris) {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      // 忽略删除失败
    }
  }
}
