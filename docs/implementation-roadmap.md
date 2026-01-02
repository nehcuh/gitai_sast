# GitAI SAST 实施路线图

> **版本**: v1.0  
> **更新时间**: 2025-12-31  
> **预计总工期**: 3.5 周 (140 小时)

> **注意**：任务状态与统一编号已迁移到 `docs/tasks/ROADMAP.md`；本文档保留为实现细节/参考。

---

## 任务概览

| 阶段 | 目标 | 工期 | 关键交付物 |
|------|------|------|-----------|
| **Phase 1** | 核心 UI/UX 优化 | 1 周 (40h) | Diff 查看器、增强 Code Actions、忽略管理 |
| **Phase 2** | Copilot Chat 集成 | 1 周 (40h) | @sast 参与者、Chat 命令、智能理解 |
| **Phase 3** | AI 服务增强 & 整体交互优化 | 1.5 周 (60h) | Copilot Agent 提供商、首次引导、状态栏、智能通知 |

---

## Phase 1: 核心 UI/UX 优化

**目标**: 优化 AI Fix 展示方式、增强 Quick Fix、实现忽略管理

### P1-001: Diff 查看器实现

> **优先级**: P0  
> **预计工时**: 12 小时  
> **负责**: 待定  
> **阶段**: Phase 1

---

#### 任务概述

实现 VSCode Diff 编辑器集成，用于展示 AI 修复建议，同时提供详细解释的 Webview 面板。

---

#### 验收标准

- [ ] 支持在 Diff 编辑器中展示原始代码 vs 修复代码
- [ ] 支持侧边栏 Webview 显示详细解释和 AI 推理过程
- [ ] 支持 Apply、Copy、Dismiss 等操作
- [ ] 支持 Markdown 格式化输出
- [ ] 支持多语言语法高亮
- [ ] 编写单元测试

---

#### 子任务列表

##### 1. 设计 Diff 查看器架构 (2h)
- [ ] 定义 `FixDiffViewer` 类接口
- [ ] 设计 Webview 面板布局
- [ ] 设计 Apply Fix 策略（最佳尝试 vs 精确替换）
- [ ] 设计 UI 主题样式

##### 2. 实现 Diff 编辑器集成 (4h)
- [ ] 实现 `showFixDiff` 方法
- [ ] 实现修复代码应用逻辑（`applyFix`）
- [ ] 实现临时文件创建和清理
- [ ] 实现 Diff 视图配置

##### 3. 实现 Webview 解释面板 (4h)
- [ ] 实现 `showExplanationPanel` 方法
- [ ] 实现 HTML 模板引擎
- [ ] 实现 Markdown 渲染（使用 VSCode API）
- [ ] 实现响应式布局

##### 4. 实现操作按钮 (1h)
- [ ] 实现 Apply Fix 按钮逻辑
- [ ] 实现 Copy Code 按钮逻辑
- [ ] 实现 Dismiss 按钮逻辑

##### 5. 编写单元测试 (1h)
- [ ] 测试 `applyFix` 逻辑
- [ ] 测试 HTML 模板渲染

---

#### 技术方案

##### 文件结构

```
src/extension/src/ui/
├── FixDiffViewer.ts      # Diff 编辑器集成
├── FixExplanationPanel.ts  # Webview 解释面板
└── templates/
    └── explanation.html   # HTML 模板
```

##### 核心接口

```typescript
// src/ui/FixDiffViewer.ts
export class FixDiffViewer {
  /**
   * 在 Diff 编辑器中展示修复建议
   */
  static async showFixDiff(
    originalUri: vscode.Uri,
    finding: Finding,
    fixCode: string,
    suggestion: string,
    thinking?: string
  ): Promise<void>;

  /**
   * 应用修复到原文档
   */
  private static async applyFix(
    editor: vscode.TextEditor,
    finding: Finding,
    fixCode: string
  ): Promise<boolean>;
}

// src/ui/FixExplanationPanel.ts
export class FixExplanationPanel {
  /**
   * 显示解释面板
   */
  static async show(
    finding: Finding,
    suggestion: string,
    thinking?: string
  ): Promise<void>;

  /**
   * 生成 HTML 内容
   */
  private static buildHtml(
    finding: Finding,
    suggestion: string,
    thinking?: string
  ): string;
}
```

##### Diff 展示逻辑

```typescript
// 应用修复策略
enum FixApplyStrategy {
  BestEffort,  // 最佳尝试：尝试匹配代码片段
  ExactMatch,  // 精确匹配：替换完全匹配的行
  Manual      // 手动：仅复制到剪贴板
}

async function applyFix(
  editor: vscode.TextEditor,
  finding: Finding,
  fixCode: string
): Promise<boolean> {
  // 尝试精确匹配
  const range = findExactMatch(editor.document, finding.location, fixCode);
  if (range) {
    await editor.edit(editBuilder => {
      editBuilder.replace(range, fixCode);
    });
    return true;
  }

  // 尝试模糊匹配（行号附近）
  const fuzzyRange = findFuzzyMatch(editor.document, finding.location, fixCode);
  if (fuzzyRange) {
    await editor.edit(editBuilder => {
      editBuilder.replace(fuzzyRange, fixCode);
    });
    return true;
  }

  return false;
}
```

##### Webview HTML 模板

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Fix Explanation</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .finding {
      background: var(--vscode-textBlockQuote-background);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
      border-left: 4px solid var(--vscode-editorInfo-foreground);
    }

    .thinking {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    .suggestion {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }

    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="finding">
    <h3>📌 Vulnerability</h3>
    <p><strong>Rule ID:</strong> ${finding.rule_id}</p>
    <p><strong>Severity:</strong> ${finding.severity}</p>
    <p><strong>Title:</strong> ${finding.title}</p>
    <p><strong>Description:</strong> ${finding.description}</p>
  </div>

  ${thinking ? `
  <div class="thinking">
    <h3>🧠 AI Reasoning</h3>
    <pre><code>${escapeHtml(thinking)}</code></pre>
  </div>
  ` : ''}

  <div class="suggestion">
    <h3>💡 AI Suggestion</h3>
    <div>${renderMarkdown(suggestion)}</div>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick="applyFix()">Apply Fix</button>
    <button class="btn-secondary" onclick="copyCode()">Copy Code</button>
    <button class="btn-secondary" onclick="dismiss()">Dismiss</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function applyFix() {
      vscode.postMessage({ command: 'applyFix' });
    }

    function copyCode() {
      vscode.postMessage({ command: 'copyCode' });
    }

    function dismiss() {
      vscode.postMessage({ command: 'dismiss' });
    }
  </script>
</body>
</html>
```

---

#### 参考资料

- [VSCode Diff Editor API](https://code.visualstudio.com/api/extension-guides/diff-editor)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [现有 aiFix.ts 实现](../../src/extension/src/commands/aiFix.ts)

---

### P1-002: 增强 Code Actions (Quick Fix)

> **优先级**: P0  
> **预计工时**: 8 小时  
> **负责**: 待定  
> **阶段**: Phase 1

---

#### 任务概述

增强 Code Actions，提供丰富的操作选项：AI Fix、Ask AI to explain、Show details、View taint path、Ignore 等。

---

#### 验收标准

- [ ] 支持 AI Fix Code Action（已存在，需优化）
- [ ] 支持 Ask AI to explain Code Action
- [ ] 支持 Show details Code Action
- [ ] 支持 View taint path Code Action（仅远程扫描）
- [ ] 支持 Ignore this occurrence Code Action
- [ ] 支持 Ignore in file Code Action
- [ ] 支持 Ignore globally Code Action
- [ ] 所有 Code Action 显示正确的图标和标签
- [ ] 编写单元测试

---

#### 子任务列表

##### 1. 重新设计 Code Action 架构 (2h)
- [ ] 定义 Code Action 类型
- [ ] 设计 Code Action 工厂
- [ ] 设计 Code Action 图标和标签

##### 2. 实现 AI Fix Code Action (1h)
- [ ] 优化现有的 AI Fix Code Action
- [ ] 添加正确的图标和标签
- [ ] 集成 FixDiffViewer

##### 3. 实现 Ask AI to explain Code Action (1h)
- [ ] 实现命令逻辑（调用 Copilot Chat）
- [ ] 添加图标和标签

##### 4. 实现 Show details Code Action (1h)
- [ ] 实现命令逻辑（显示 Webview 面板）
- [ ] 添加图标和标签

##### 5. 实现 View taint path Code Action (1h)
- [ ] 实现命令逻辑（调用 MCP get_taint_path）
- [ ] 添加图标和标签
- [ ] 条件：仅远程扫描时显示

##### 6. 实现 Ignore Code Actions (2h)
- [ ] 实现 Ignore this occurrence
- [ ] 实现 Ignore in file
- [ ] 实现 Ignore globally
- [ ] 添加图标和标签

---

#### 技术方案

##### 文件结构

```
src/extension/src/
├── codeactions/
│   ├── EnhancedCodeActionProvider.ts  # 增强的 Code Action 提供者
│   └── types.ts                      # Code Action 类型定义
└── commands/
    ├── explainInChat.ts               # Ask AI to explain 命令
    ├── showDetails.ts                 # Show details 命令
    ├── viewTaintPath.ts               # View taint path 命令
    └── ignore.ts                      # Ignore 命令
```

##### 核心接口

```typescript
// src/codeactions/EnhancedCodeActionProvider.ts
export class EnhancedCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]>;
}

// src/codeactions/types.ts
export enum SastCodeActionKind {
  AiFix = 'gitai.sast.aiFix',
  ExplainInChat = 'gitai.sast.explainInChat',
  ShowDetails = 'gitai.sast.showDetails',
  ViewTaintPath = 'gitai.sast.viewTaintPath',
  IgnoreOccurrence = 'gitai.sast.ignoreOccurrence',
  IgnoreInFile = 'gitai.sast.ignoreInFile',
  IgnoreGlobally = 'gitai.sast.ignoreGlobally',
}

export interface SastCodeActionMetadata {
  kind: SastCodeActionKind;
  title: string;
  icon?: string;
  isPreferred?: boolean;
  condition?: (finding: Finding) => boolean;
}
```

##### Code Action 配置

```typescript
// src/codeactions/EnhancedCodeActionProvider.ts
private readonly ACTIONS: SastCodeActionMetadata[] = [
  {
    kind: SastCodeActionKind.AiFix,
    title: 'AI Fix: {title}',
    icon: '$(sparkle)',
    isPreferred: true,
  },
  {
    kind: SastCodeActionKind.ExplainInChat,
    title: 'Ask AI to explain vulnerability',
    icon: '$(comment-discussion)',
  },
  {
    kind: SastCodeActionKind.ShowDetails,
    title: 'Show vulnerability details',
    icon: '$(info)',
  },
  {
    kind: SastCodeActionKind.ViewTaintPath,
    title: 'View taint analysis path',
    icon: '$(graph)',
    condition: (finding) => finding.provider === 'remote',
  },
  {
    kind: SastCodeActionKind.IgnoreOccurrence,
    title: 'Ignore this occurrence',
    icon: '$(eye-closed)',
  },
  {
    kind: SastCodeActionKind.IgnoreInFile,
    title: 'Ignore rule in this file',
    icon: '$(file)',
  },
  {
    kind: SastCodeActionKind.IgnoreGlobally,
    title: 'Ignore rule globally',
    icon: '$(globe)',
  },
];
```

##### 忽略管理

```typescript
// src/commands/ignore.ts
export class IgnoreManager {
  private static readonly IGNORES_FILE = '.vscode/sast.ignores.json';

  /**
   * 忽略特定出现位置
   */
  static async addOccurrence(uri: vscode.Uri, finding: Finding): Promise<void> {
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      file: uri.fsPath,
      line: finding.location.line,
      column: finding.location.column,
      rule_id: finding.rule_id,
      comment: `Ignored on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 更新诊断信息
    await vscode.commands.executeCommand('gitai.sast.refreshDiagnostics');
  }

  /**
   * 忽略文件中的规则
   */
  static async addRuleInFile(uri: vscode.Uri, ruleId: string): Promise<void> {
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      file: uri.fsPath,
      rule_id: ruleId,
      comment: `Ignored on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 更新诊断信息
    await vscode.commands.executeCommand('gitai.sast.refreshDiagnostics');
  }

  /**
   * 全局忽略规则
   */
  static async addGlobalRule(ruleId: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const uri = workspaceFolder.uri;
    const ignores = await this.loadIgnores(uri);

    const newIgnore: IgnoreRule = {
      rule_id: ruleId,
      comment: `Ignored globally on ${new Date().toISOString()}`,
    };

    ignores.push(newIgnore);
    await this.saveIgnores(uri, ignores);

    // 更新所有诊断信息
    await vscode.commands.executeCommand('gitai.sast.refreshDiagnostics');
  }

  /**
   * 加载忽略列表
   */
  private static async loadIgnores(uri: vscode.Uri): Promise<IgnoreRule[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return [];
    }

    const ignoresPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      IgnoreManager.IGNORES_FILE
    );

    try {
      const content = await vscode.workspace.fs.readFile(ignoresPath);
      const data = JSON.parse(new TextDecoder().decode(content));
      return data.ignores || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * 保存忽略列表
   */
  private static async saveIgnores(uri: vscode.Uri, ignores: IgnoreRule[]): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const ignoresPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      IgnoreManager.IGNORES_FILE
    );

    const data = { ignores };
    const content = JSON.stringify(data, null, 2);

    await vscode.workspace.fs.writeFile(
      ignoresPath,
      new TextEncoder().encode(content)
    );
  }
}

interface IgnoreRule {
  file?: string;
  line?: number;
  column?: number;
  rule_id: string;
  comment?: string;
}
```

---

#### 参考资料

- [VSCode Code Actions API](https://code.visualstudio.com/api/references/vscode-api#CodeActionProvider)
- [现有 DiagnosticManager 实现](../../src/extension/src/core/DiagnosticManager.ts)

---

### P1-003: 刷新诊断信息

> **优先级**: P0  
> **预计工时**: 2 小时  
> **负责**: 待定  
> **阶段**: Phase 1

---

#### 任务概述

实现 `refreshDiagnostics` 命令，用于在忽略规则变更后刷新诊断信息。

---

#### 验收标准

- [ ] 实现 `gitai.sast.refreshDiagnostics` 命令
- [ ] 重新扫描当前文件或工作区
- [ ] 应用忽略规则过滤结果
- [ ] 更新诊断信息显示

---

#### 子任务列表

##### 1. 实现刷新命令 (2h)
- [ ] 实现命令逻辑
- [ ] 集成 SastScanner
- [ ] 集成 DiagnosticManager

---

#### 技术方案

```typescript
// src/commands/refreshDiagnostics.ts
export function registerRefreshDiagnosticsCommand(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitai.sast.refreshDiagnostics',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const uri = editor.document.uri;
        const document = editor.document;

        // 扫描当前文件
        const response = await scanner.scanFile(
          vscode.workspace.rootPath || '',
          uri.fsPath,
          document.getText()
        );

        // 更新诊断信息
        diagnostics.updateDiagnostics(uri, response.findings);
      }
    )
  );
}
```

---

### P1-004: 编写 E2E 测试

> **优先级**: P0  
> **预计工时**: 18 小时  
> **负责**: 待定  
> **阶段**: Phase 1

---

#### 任务概述

为 Phase 1 新增功能编写 E2E 测试，确保功能正确性和稳定性。

---

#### 验收标准

- [ ] 测试 Diff 查看器功能
- [ ] 测试 Apply Fix 功能
- [ ] 测试 Code Actions
- [ ] 测试忽略功能
- [ ] 测试刷新诊断信息
- [ ] 测试覆盖率 > 80%

---

#### 子任务列表

##### 1. 设计测试框架 (2h)
- [ ] 选择测试框架（Mocha vs Jest）
- [ ] 设计测试数据
- [ ] 设计测试辅助函数

##### 2. 编写 Diff 查看器测试 (4h)
- [ ] 测试 Diff 显示
- [ ] 测试 Apply Fix
- [ ] 测试 Copy Code
- [ ] 测试 Dismiss

##### 3. 编写 Code Actions 测试 (4h)
- [ ] 测试 AI Fix
- [ ] 测试 Ask AI to explain
- [ ] 测试 Show details
- [ ] 测试 Ignore

##### 4. 编写忽略管理测试 (4h)
- [ ] 测试 Add occurrence
- [ ] 测试 Add rule in file
- [ ] 测试 Add global rule
- [ ] 测试刷新诊断信息

##### 5. 编写集成测试 (4h)
- [ ] 测试完整工作流（扫描 → Code Action → Fix）

---

#### 技术方案

##### 测试文件结构

```
src/extension/test/suite/
├── ui/
│   ├── fixDiffViewer.test.ts
│   └── fixExplanationPanel.test.ts
├── codeactions/
│   └── enhancedCodeActionProvider.test.ts
├── commands/
│   └── ignore.test.ts
└── e2e/
    └── workflow.test.ts
```

##### 测试示例

```typescript
// test/suite/ui/fixDiffViewer.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';
import { FixDiffViewer } from '../../../src/ui/FixDiffViewer';
import { Finding } from '../../../src/core/types';

suite('FixDiffViewer Test Suite', () => {
  test('should show diff viewer', async () => {
    // 创建测试文档
    const uri = vscode.Uri.parse('untitled:test.ts');
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // 创建测试 Finding
    const finding: Finding = {
      id: 'test-1',
      rule_id: 'test.rule',
      type: 'security',
      severity: 'high',
      title: 'Test vulnerability',
      description: 'Test description',
      location: { file: uri.fsPath, line: 1, column: 0 },
      code_snippet: 'const x = 1;',
      provider: 'local',
    };

    const fixCode = 'const x = 2;';

    // 显示 Diff
    await FixDiffViewer.showFixDiff(uri, finding, fixCode, 'Test suggestion');

    // 验证 Diff 编辑器已打开
    // (需要实现验证逻辑)

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
```

---

---

## Phase 2: Copilot Chat 集成

**目标**: 实现 `@sast` Chat 参与者，支持通过 Copilot Chat 访问 SAST 服务

### P2-001: Chat Participant 实现

> **优先级**: P0  
> **预计工时**: 16 小时  
> **负责**: 待定  
> **阶段**: Phase 2

---

#### 任务概述

实现 `@sast` Chat 参与者，支持 explain、fix、taint、scan 等命令，以及自然语言理解。

---

#### 验收标准

- [ ] 实现 `gitai.sast.chatParticipant` 参与者
- [ ] 支持 `@sast explain` 命令
- [ ] 支持 `@sast fix` 命令
- [ ] 支持 `@sast taint` 命令
- [ ] 支持 `@sast scan` 命令
- [ ] 支持自然语言理解（智能识别意图）
- [ ] 支持流式输出
- [ ] 支持 Follow-up 提示
- [ ] 编写单元测试

---

#### 子任务列表

##### 1. 设计 Chat Participant 架构 (3h)
- [ ] 定义 `SastChatParticipant` 类
- [ ] 设计命令处理流程
- [ ] 设计自然语言理解逻辑

##### 2. 实现 explain 命令 (3h)
- [ ] 实现漏洞解释逻辑
- [ ] 集成 AiFixProvider
- [ ] 实现流式输出

##### 3. 实现 fix 命令 (3h)
- [ ] 实现修复生成逻辑
- [ ] 集成 FixDiffViewer
- [ ] 实现流式输出

##### 4. 实现 taint 命令 (3h)
- [ ] 实现污点路径获取逻辑
- [ ] 调用 MCP `get_taint_path` 工具
- [ ] 实现格式化输出

##### 5. 实现 scan 命令 (2h)
- [ ] 实现文件扫描逻辑
- [ ] 实现工作区扫描逻辑
- [ ] 实现结果格式化输出

##### 6. 实现自然语言理解 (2h)
- [ ] 实现意图识别
- [ ] 实现参数提取
- [ ] 实现默认回复

---

#### 技术方案

##### 文件结构

```
src/extension/src/chat/
├── SastChatParticipant.ts       # Chat 参与者主类
├── handlers/
│   ├── ExplainHandler.ts        # explain 命令处理器
│   ├── FixHandler.ts            # fix 命令处理器
│   ├── TaintHandler.ts          # taint 命令处理器
│   └── ScanHandler.ts          # scan 命令处理器
└── nlp/
    └── IntentRecognizer.ts      # 意图识别器
```

##### 核心接口

```typescript
// src/chat/SastChatParticipant.ts
export class SastChatParticipant {
  private static readonly ID = 'gitai.sast.chatParticipant';

  constructor(
    private aiFixProvider: AiFixProvider,
    private mcpClient: McpClient,
    private scanner: SastScanner,
    private diagnostics: DiagnosticManager
  ) {}

  register(context: vscode.ExtensionContext): void {
    const participant = vscode.chat.createChatParticipant(
      SastChatParticipant.ID,
      this.handleRequest.bind(this)
    );

    participant.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'sast-icon.png'
    );

    participant.followupProvider = this.getFollowupProvider();

    context.subscriptions.push(participant);
  }

  private async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult>;

  private getFollowupProvider(): vscode.ChatFollowupProvider;
}

// src/chat/nlp/IntentRecognizer.ts
export enum Intent {
  Explain,
  Fix,
  Taint,
  Scan,
  Unknown,
}

export class IntentRecognizer {
  /**
   * 识别用户意图
   */
  static recognize(input: string): { intent: Intent; params: Record<string, string> };

  /**
   * 提取漏洞上下文
   */
  static extractFindingContext(input: string, document: vscode.TextDocument): Finding | null;
}
```

##### Chat Participant 配置

```json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "gitai.sast.chatParticipant",
        "name": "sast",
        "description": "Security analysis and AI fixes",
        "isSticky": true,
        "commands": [
          {
            "name": "explain",
            "description": "Explain vulnerabilities in detail"
          },
          {
            "name": "fix",
            "description": "Generate AI-powered fixes"
          },
          {
            "name": "taint",
            "description": "Show taint analysis paths"
          },
          {
            "name": "scan",
            "description": "Scan current file or workspace"
          }
        ]
      }
    ]
  }
}
```

##### 命令处理流程

```typescript
// src/chat/SastChatParticipant.ts
private async handleRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const command = request.command;
  const input = request.prompt;

  try {
    switch (command) {
      case 'explain':
        return await this.handleExplain(request, context, stream, token);
      case 'fix':
        return await this.handleFix(request, context, stream, token);
      case 'taint':
        return await this.handleTaint(request, context, stream, token);
      case 'scan':
        return await this.handleScan(request, context, stream, token);
      default:
        return await this.handleNaturalLanguage(request, context, stream, token);
    }
  } catch (error) {
    stream.markdown(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return { metadata: { success: false } };
  }
}
```

##### 自然语言理解

```typescript
// src/chat/nlp/IntentRecognizer.ts
export class IntentRecognizer {
  static recognize(input: string): { intent: Intent; params: Record<string, string> } {
    const lower = input.toLowerCase();

    // 关键词匹配
    if (lower.includes('explain') || lower.includes('what is')) {
      return { intent: Intent.Explain, params: {} };
    }

    if (lower.includes('fix') || lower.includes('repair') || lower.includes('solve')) {
      return { intent: Intent.Fix, params: {} };
    }

    if (lower.includes('taint') || lower.includes('path') || lower.includes('flow')) {
      return { intent: Intent.Taint, params: {} };
    }

    if (lower.includes('scan') || lower.includes('check') || lower.includes('analyze')) {
      return { intent: Intent.Scan, params: {} };
    }

    // 默认未知
    return { intent: Intent.Unknown, params: {} };
  }

  static extractFindingContext(
    input: string,
    document: vscode.TextDocument
  ): Finding | null {
    // 尝试从输入中提取 Rule ID
    const ruleIdMatch = input.match(/rule\s*id\s*[:\s]*([a-z0-9\.-]+)/i);
    if (ruleIdMatch) {
      const ruleId = ruleIdMatch[1];
      const findings = // 从 DiagnosticManager 获取 findings;
      return findings.find(f => f.rule_id === ruleId) || null;
    }

    // 如果没有指定 Rule ID，返回第一个 finding
    const findings = // 从 DiagnosticManager 获取 findings;
    return findings[0] || null;
  }
}
```

##### Follow-up 提示

```typescript
// src/chat/SastChatParticipant.ts
private getFollowupProvider(): vscode.ChatFollowupProvider {
  return {
    provideFollowups: (
      result: vscode.ChatResult,
      context: vscode.ChatContext,
      token: vscode.CancellationToken
    ) => {
      return [
        {
          prompt: 'Explain this vulnerability in detail',
          label: 'Explain Vulnerability',
          kind: vscode.ChatFollowupKind.Action,
        },
        {
          prompt: 'Generate a fix with code',
          label: 'Generate Fix',
          kind: vscode.ChatFollowupKind.Action,
        },
        {
          prompt: 'Show me the taint path',
          label: 'View Taint Path',
          kind: vscode.ChatFollowupKind.Action,
        },
      ];
    },
  };
}
```

---

#### 参考资料

- [VSCode Chat API](https://code.visualstudio.com/api/extension-guides/chat)
- [Chat Participants](https://code.visualstudio.com/api/extension-guides/chat#chat-participants)

---

### P2-002: 编写 Chat Participant 测试

> **优先级**: P0  
> **预计工时**: 12 小时  
> **负责**: 待定  
> **阶段**: Phase 2

---

#### 任务概述

为 Chat Participant 编写单元测试和集成测试。

---

#### 验收标准

- [ ] 测试 explain 命令
- [ ] 测试 fix 命令
- [ ] 测试 taint 命令
- [ ] 测试 scan 命令
- [ ] 测试自然语言理解
- [ ] 测试 Follow-up 提示
- [ ] 测试覆盖率 > 80%

---

#### 子任务列表

##### 1. 编写命令处理器测试 (8h)
- [ ] 测试 ExplainHandler
- [ ] 测试 FixHandler
- [ ] 测试 TaintHandler
- [ ] 测试 ScanHandler

##### 2. 编写自然语言理解测试 (2h)
- [ ] 测试意图识别
- [ ] 测试参数提取

##### 3. 编写集成测试 (2h)
- [ ] 测试完整 Chat 流程

---

#### 技术方案

##### 测试文件结构

```
src/extension/test/suite/chat/
├── SastChatParticipant.test.ts
├── handlers/
│   ├── ExplainHandler.test.ts
│   ├── FixHandler.test.ts
│   ├── TaintHandler.test.ts
│   └── ScanHandler.test.ts
└── nlp/
    └── IntentRecognizer.test.ts
```

---

### P2-003: Chat Participant 图标和资源

> **优先级**: P1  
> **预计工时**: 4 小时  
> **负责**: 待定  
> **阶段**: Phase 2

---

#### 任务概述

设计并创建 Chat Participant 的图标和其他资源。

---

#### 验收标准

- [ ] 设计 Chat Participant 图标（256x256 PNG）
- [ ] 创建图标文件
- [ ] 集成图标到 extension
- [ ] 验证图标在 Chat 中显示正常

---

#### 子任务列表

##### 1. 设计图标 (2h)
- [ ] 设计图标概念
- [ ] 使用 Figma/Sketch 设计图标
- [ ] 导出 PNG 文件

##### 2. 集成图标 (2h)
- [ ] 将图标文件放到 `resources` 目录
- [ ] 更新 `participant.iconPath`
- [ ] 验证图标显示

---

---

## Phase 3: AI 服务增强 & 整体交互优化

**目标**: 增强 AI 服务灵活性，实现首次引导、状态栏、智能通知等整体交互优化

### P3-001: Copilot Agent 提供商

> **优先级**: P1  
> **预计工时**: 8 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现 `copilotAgent` AI 提供商，支持通过 Copilot Chat API 发送请求。

---

#### 验收标准

- [ ] 实现 `CopilotAgentProvider` 类
- [ ] 支持请求发送（当 API 可用时）
- [ ] 支持流式输出
- [ ] 支持 API 可用性检测
- [ ] 编写单元测试

---

#### 子任务列表

##### 1. 设计 Copilot Agent 提供商架构 (2h)
- [ ] 定义 `CopilotAgentProvider` 类
- [ ] 设计 API 调用逻辑
- [ ] 设计回退逻辑（API 不可用时提示）

##### 2. 实现 API 调用逻辑 (4h)
- [ ] 实现 `request` 方法
- [ ] 实现流式输出支持
- [ ] 实现错误处理

##### 3. 实现可用性检测 (1h)
- [ ] 实现 `checkAvailability` 方法
- [ ] 检测 Copilot Chat 扩展安装
- [ ] 检测 API 可用性

##### 4. 编写单元测试 (1h)
- [ ] 测试 API 调用
- [ ] 测试错误处理

---

#### 技术方案

##### 文件结构

```
src/extension/src/ai/
└── CopilotAgentProvider.ts
```

##### 核心接口

```typescript
// src/ai/CopilotAgentProvider.ts
export class CopilotAgentProvider {
  /**
   * 发送请求到 Copilot Agent
   */
  static async request(
    prompt: string,
    options?: { stream?: boolean; onDelta?: (text: string) => void }
  ): Promise<string>;

  /**
   * 检查 Copilot Agent 是否可用
   */
  static async checkAvailability(): Promise<boolean>;

  /**
   * 获取可用模型列表
   */
  static async getModels(): Promise<string[]>;
}
```

##### 实现说明

```typescript
// 注意：当前 Copilot Chat 没有公开 API
// 这个实现是预留的，未来 API 公开后需要更新

export class CopilotAgentProvider {
  static async request(
    prompt: string,
    options?: { stream?: boolean; onDelta?: (text: string) => void }
  ): Promise<string> {
    // 检查 Copilot Chat 是否安装
    const hasCopilot = vscode.extensions.getExtension('GitHub.copilot-chat');
    if (!hasCopilot) {
      throw new Error('Copilot Chat extension is not installed');
    }

    // 检查 API 是否可用
    const apiAvailable = await this.checkApiAvailable();
    if (!apiAvailable) {
      // 回退：打开 Chat 窗口并输入消息
      await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
      throw new Error(
        'Copilot Chat API is not yet available. ' +
        'Please use "vscode" or "openaiCompatible" provider.'
      );
    }

    // TODO: 当 API 公开后实现
    // const api = hasCopilot.exports.chatApi;
    // const response = await api.request(prompt, options);
    // return response.text;

    throw new Error('Copilot Chat API is not yet available');
  }

  static async checkAvailability(): Promise<boolean> {
    // 检查扩展是否安装
    const hasCopilot = vscode.extensions.getExtension('GitHub.copilot-chat');
    if (!hasCopilot) {
      return false;
    }

    // 检查 API 是否可用
    return await this.checkApiAvailable();
  }

  private static async checkApiAvailable(): Promise<boolean> {
    // TODO: 当 API 公开后实现检测逻辑
    return false;
  }
}
```

---

#### 参考资料

- [Copilot Chat Extension](https://github.com/github/vscode-copilot-chat)

---

### P3-002: AI 服务自动检测

> **优先级**: P1  
> **预计工时**: 6 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现 AI 提供商自动检测功能，按优先级选择可用的 AI 服务。

---

#### 验收标准

- [ ] 实现 `auto` 提供商模式
- [ ] 支持优先级配置
- [ ] 支持提供商可用性检测
- [ ] 更新 `package.json` 配置
- [ ] 编写单元测试

---

#### 子任务列表

##### 1. 设计自动检测架构 (2h)
- [ ] 设计检测流程
- [ ] 设计优先级配置
- [ ] 设计缓存机制

##### 2. 实现自动检测逻辑 (3h)
- [ ] 实现 `checkProviderAvailable` 方法
- [ ] 实现 `detectProvider` 方法
- [ ] 实现 `activeProvider` 状态管理

##### 3. 更新配置和 AiFixProvider (1h)
- [ ] 更新 `package.json` 配置项
- [ ] 更新 `AiFixProvider` 集成自动检测

---

#### 技术方案

##### 配置更新

```json
{
  "gitai.sast.ai.provider": {
    "type": "string",
    "enum": [
      "disabled",
      "vscode",
      "openaiCompatible",
      "copilotAgent",
      "auto"
    ],
    "default": "auto",
    "description": "AI provider for fix suggestions (disabled, VS Code built-in models, OpenAI-compatible API, Copilot Chat agent, or auto-detect)"
  },
  "gitai.sast.ai.autoDetectPriority": {
    "type": "array",
    "items": {
      "type": "string",
      "enum": ["copilotAgent", "vscode", "openaiCompatible"]
    },
    "default": ["copilotAgent", "vscode", "openaiCompatible"],
    "description": "Priority order for auto-detecting AI provider"
  }
}
```

##### 实现逻辑

```typescript
// src/ai/AiFixProvider.ts
export class AiFixProvider {
  private activeProvider: AiProvider | null = null;

  async checkAvailability(): Promise<boolean> {
    const settings = this.getAiSettings();

    if (settings.provider === 'disabled') {
      this.activeProvider = null;
      return false;
    }

    if (settings.provider === 'auto') {
      // 按优先级检测可用的提供商
      for (const provider of settings.autoDetectPriority) {
        const available = await this.checkProviderAvailable(provider);
        if (available) {
          this.activeProvider = provider;
          return true;
        }
      }
      this.activeProvider = null;
      return false;
    }

    // 指定的提供商
    const available = await this.checkProviderAvailable(settings.provider);
    if (available) {
      this.activeProvider = settings.provider;
      return true;
    }
    this.activeProvider = null;
    return false;
  }

  private async checkProviderAvailable(provider: AiProvider): Promise<boolean> {
    switch (provider) {
      case 'copilotAgent':
        return await CopilotAgentProvider.checkAvailability();
      case 'vscode':
        return await this.checkVsCodeLmAvailable();
      case 'openaiCompatible':
        return await this.checkOpenAiCompatibleAvailable();
      default:
        return false;
    }
  }

  private async checkVsCodeLmAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  private async checkOpenAiCompatibleAvailable(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('gitai.sast.ai');
    return Boolean(
      config.get<string>('apiUrl')?.trim() &&
      config.get<string>('modelName')?.trim()
    );
  }
}
```

---

### P3-003: 首次使用引导

> **优先级**: P0  
> **预计工时**: 8 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现首次使用引导，帮助用户快速了解 GitAI SAST 功能。

---

#### 验收标准

- [ ] 实现 `OnboardingGuide` 类
- [ ] 检测首次使用
- [ ] 显示欢迎消息
- [ ] 展示引导 Webview
- [ ] 记录已显示状态
- [ ] 支持 "Show Me" 和 "Skip" 操作
- [ ] 支持 "Don't show again" 选项

---

#### 子任务列表

##### 1. 设计引导流程 (2h)
- [ ] 设计引导页面内容
- [ ] 设计引导流程（欢迎 → 功能介绍 → 快速上手）
- [ ] 设计 UI 布局

##### 2. 实现 OnboardingGuide (4h)
- [ ] 实现 `checkAndShow` 方法
- [ ] 实现 `showOnboardingWebview` 方法
- [ ] 实现状态记录

##### 3. 集成到扩展激活 (1h)
- [ ] 在 `activate` 中调用引导
- [ ] 处理异步加载

##### 4. 测试引导流程 (1h)
- [ ] 测试首次使用
- [ ] 测试 "Show Me" 和 "Skip"
- [ ] 测试 "Don't show again"

---

#### 技术方案

##### 文件结构

```
src/extension/src/onboarding/
├── OnboardingGuide.ts
└── templates/
    └── welcome.html
```

##### 核心接口

```typescript
// src/onboarding/OnboardingGuide.ts
export class OnboardingGuide {
  private static readonly SHOWN_KEY = 'gitai.sast.onboardingShown';

  /**
   * 检查并显示引导
   */
  static async checkAndShow(context: vscode.ExtensionContext): Promise<void>;

  /**
   * 显示引导 Webview
   */
  private static async showOnboardingWebview(context: vscode.ExtensionContext): Promise<void>;

  /**
   * 生成 HTML 内容
   */
  private static getOnboardingHtml(): string;
}
```

##### 实现逻辑

```typescript
// src/onboarding/OnboardingGuide.ts
export class OnboardingGuide {
  private static readonly SHOWN_KEY = 'gitai.sast.onboardingShown';

  static async checkAndShow(context: vscode.ExtensionContext): Promise<void> {
    // 检查是否已显示过
    const alreadyShown = context.globalState.get<boolean>(OnboardingGuide.SHOWN_KEY);
    if (alreadyShown) {
      return;
    }

    // 显示欢迎消息
    const selection = await vscode.window.showInformationMessage(
      '👋 Welcome to GitAI SAST! Would you like a quick tour?',
      'Show Me',
      'Skip',
      'Don\'t show again'
    );

    if (selection === 'Show Me') {
      await this.showOnboardingWebview(context);
    }

    if (selection !== 'Don\'t show again') {
      // 记录已显示状态（如果用户选择 "Don't show again"，则不记录，下次还会显示）
      await context.globalState.update(OnboardingGuide.SHOWN_KEY, true);
    }
  }

  private static async showOnboardingWebview(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'sast.onboarding',
      'Welcome to GitAI SAST',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'resources')
        ]
      }
    );

    panel.webview.html = this.getOnboardingHtml();

    // 监听面板关闭事件
    panel.onDidDispose(() => {
      console.log('[GitAI SAST] Onboarding closed');
    });
  }

  private static getOnboardingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }

    h1 { color: var(--vscode-textLink-foreground); }

    .feature {
      display: flex;
      margin-bottom: 30px;
      padding: 20px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 10px;
    }

    .feature-icon {
      font-size: 40px;
      margin-right: 20px;
    }

    .feature-content h3 { margin: 0 0 10px 0; }

    .demo {
      background: var(--vscode-textCodeBlock-background);
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }

    .demo code {
      background: var(--vscode-editor-selectionBackground);
      padding: 2px 6px;
      border-radius: 3px;
    }

    ol { line-height: 1.8; }
  </style>
</head>
<body>
  <h1>🚀 Welcome to GitAI SAST!</h1>
  <p>GitAI SAST provides AI-powered static code analysis and intelligent fixes for your code.</p>

  <h2>✨ Key Features</h2>

  <div class="feature">
    <div class="feature-icon">🔍</div>
    <div class="feature-content">
      <h3>Automatic Security Scanning</h3>
      <p>Scan your code automatically on save, or use command palette to scan manually.</p>
    </div>
  </div>

  <div class="feature">
    <div class="feature-icon">🤖</div>
    <div class="feature-content">
      <h3>AI-Powered Fixes</h3>
      <p>Right-click on any security issue to get AI-generated fix suggestions.</p>
    </div>
  </div>

  <div class="feature">
    <div class="feature-icon">💬</div>
    <div class="feature-content">
      <h3>Chat Integration</h3>
      <p>Use <code>@sast</code> in Copilot Chat to explain vulnerabilities, view taint paths, and more.</p>
    </div>
  </div>

  <div class="demo">
    <h3>Try it now!</h3>
    <ol>
      <li>Open any source file (JS, TS, Python, Java, Rust)</li>
      <li>Save the file to trigger automatic scan</li>
      <li>Right-click on any security issue in the Problems panel</li>
      <li>Select "AI Fix" to generate a fix</li>
      <li>Or open Copilot Chat and type <code>@sast explain</code></li>
    </ol>
  </div>

  <p>Need help? Check our documentation or open an issue on GitHub.</p>
</body>
</html>`;
  }
}
```

##### 集成到扩展激活

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  // ... 其他初始化代码

  // 显示首次使用引导
  await OnboardingGuide.checkAndShow(context);

  // ... 其他初始化代码
}
```

---

### P3-004: 状态栏指示器

> **优先级**: P0  
> **预计工时**: 6 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现状态栏指示器，实时显示扫描状态和漏洞数量。

---

#### 验收标准

- [ ] 实现 `StatusBarIndicator` 类
- [ ] 显示扫描状态（空闲、扫描中）
- [ ] 显示漏洞数量（0、1+）
- [ ] 支持点击打开结果面板
- [ ] 使用正确的图标和颜色
- [ ] 集成到扫描流程

---

#### 子任务列表

##### 1. 设计状态栏 UI (1h)
- [ ] 设计图标和文本
- [ ] 设计颜色方案
- [ ] 设计 Tooltip 文本

##### 2. 实现 StatusBarIndicator (4h)
- [ ] 实现 `update` 方法
- [ ] 实现不同状态显示
- [ ] 实现点击事件

##### 3. 集成到扫描流程 (1h)
- [ ] 在扫描开始时更新状态
- [ ] 在扫描完成时更新状态

---

#### 技术方案

##### 文件结构

```
src/extension/src/ui/
└── StatusBarIndicator.ts
```

##### 核心接口

```typescript
// src/ui/StatusBarIndicator.ts
export interface StatusBarState {
  scanning: boolean;
  findingsCount: number;
}

export class StatusBarIndicator {
  private item: vscode.StatusBarItem;

  constructor();

  /**
   * 更新状态栏
   */
  update(state: StatusBarState): void;

  /**
   * 清理资源
   */
  dispose(): void;
}
```

##### 实现逻辑

```typescript
// src/ui/StatusBarIndicator.ts
export class StatusBarIndicator {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'gitai.sast.showResults';
    this.update({ scanning: false, findingsCount: 0 });
  }

  update(state: StatusBarState): void {
    if (state.scanning) {
      this.item.text = '$(sync~spin) Scanning...';
      this.item.tooltip = 'GitAI SAST is scanning your code';
      this.item.show();
      return;
    }

    if (state.findingsCount > 0) {
      this.item.text = `$(alert) ${state.findingsCount}`;
      this.item.tooltip = `GitAI SAST: ${state.findingsCount} vulnerabilities found`;
      this.item.color = new vscode.ThemeColor('errorForeground');
      this.item.show();
      return;
    }

    this.item.text = '$(shield) SAST';
    this.item.tooltip = 'GitAI SAST: No vulnerabilities found';
    this.item.color = undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

##### 集成到扫描流程

```typescript
// src/commands/scan.ts
export function registerScanCommands(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager,
  statusBar: StatusBarIndicator
) {
  // ... 命令注册

  context.subscriptions.push(
    vscode.commands.registerCommand('gitai.sast.scan', async (uri: vscode.Uri) => {
      if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage('No active file to scan');
          return;
        }
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const code = document.getText();

      // 更新状态栏：扫描中
      statusBar.update({ scanning: true, findingsCount: 0 });

      try {
        const response = await scanner.scanFile(
          vscode.workspace.rootPath || '',
          uri.fsPath,
          code
        );

        // 更新诊断信息
        diagnostics.updateDiagnostics(uri, response.findings);

        // 更新状态栏：扫描完成
        statusBar.update({
          scanning: false,
          findingsCount: response.findings.length
        });

        // 显示通知
        const findingCount = response.findings.length;
        if (findingCount > 0) {
          vscode.window.showWarningMessage(
            `Scan completed: ${findingCount} issue(s) found`
          );
        } else {
          vscode.window.showInformationMessage('Scan completed: No issues found');
        }
      } catch (error) {
        console.error('[GitAI SAST] Scan failed:', error);
        vscode.window.showErrorMessage(`Scan failed: ${error}`);

        // 更新状态栏：错误
        statusBar.update({ scanning: false, findingsCount: 0 });
      }
    })
  );
}
```

---

### P3-005: 智能通知

> **优先级**: P0  
> **预计工时**: 6 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现智能通知，仅在发现新问题时通知用户，避免过度打扰。

---

#### 验收标准

- [ ] 实现 `SmartNotifications` 类
- [ ] 检测新问题（相比上次扫描）
- [ ] 显示智能通知
- [ ] 支持操作按钮（View Details、Scan Workspace、Dismiss）
- [ ] 记录历史扫描结果
- [ ] 支持通知配置

---

#### 子任务列表

##### 1. 设计智能通知逻辑 (2h)
- [ ] 设计历史记录存储
- [ ] 设计新问题检测逻辑
- [ ] 设计通知消息格式

##### 2. 实现 SmartNotifications (3h)
- [ ] 实现 `notifyNewFindings` 方法
- [ ] 实现历史记录管理
- [ ] 实现通知显示

##### 3. 更新配置 (1h)
- [ ] 添加通知配置项
- [ ] 集成到扫描流程

---

#### 技术方案

##### 文件结构

```
src/extension/src/notifications/
└── SmartNotifications.ts
```

##### 核心接口

```typescript
// src/notifications/SmartNotifications.ts
export interface ScanHistory {
  uri: string;
  timestamp: number;
  findings: Finding[];
}

export class SmartNotifications {
  private static readonly HISTORY_KEY = 'gitai.sast.scanHistory';

  /**
   * 通知新发现的问题
   */
  static async notifyNewFindings(
    previousCount: number,
    currentCount: number,
    uri: vscode.Uri
  ): Promise<void>;

  /**
   * 记录扫描历史
   */
  private static async recordScanHistory(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    findings: Finding[]
  ): Promise<void>;

  /**
   * 获取上次扫描结果
   */
  private static async getLastScanResults(
    context: vscode.ExtensionContext,
    uri: vscode.Uri
  ): Promise<Finding[]>;

  /**
   * 格式化文件路径
   */
  private static formatPath(uri: vscode.Uri): string;
}
```

##### 配置更新

```json
{
  "gitai.sast.notifications.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable notifications for new findings"
  },
  "gitai.sast.notifications.showOnlyNew": {
    "type": "boolean",
    "default": true,
    "description": "Only notify when new findings are discovered (compared to last scan)"
  }
}
```

##### 实现逻辑

```typescript
// src/notifications/SmartNotifications.ts
export class SmartNotifications {
  private static readonly HISTORY_KEY = 'gitai.sast.scanHistory';

  static async notifyNewFindings(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    currentFindings: Finding[]
  ): Promise<void> {
    // 检查通知是否启用
    const config = vscode.workspace.getConfiguration('gitai.sast.notifications');
    const enabled = config.get<boolean>('enabled', true);
    if (!enabled) {
      return;
    }

    // 获取上次扫描结果
    const previousFindings = await this.getLastScanResults(context, uri);

    // 检测新问题
    const showOnlyNew = config.get<boolean>('showOnlyNew', true);
    const newFindings = this.detectNewFindings(previousFindings, currentFindings);
    const findingCount = showOnlyNew ? newFindings.length : currentFindings.length;

    // 如果没有新问题，不通知
    if (findingCount === 0) {
      return;
    }

    // 记录扫描历史
    await this.recordScanHistory(context, uri, currentFindings);

    // 显示通知
    const message = findingCount === 1
      ? '1 new vulnerability found'
      : `${findingCount} new vulnerabilities found`;

    const selection = await vscode.window.showWarningMessage(
      `🔍 ${message} in ${this.formatPath(uri)}`,
      'View Details',
      'Scan Workspace',
      'Dismiss'
    );

    switch (selection) {
      case 'View Details':
        await vscode.commands.executeCommand('gitai.sast.showResults');
        break;
      case 'Scan Workspace':
        await vscode.commands.executeCommand('gitai.sast.scanWorkspace');
        break;
    }
  }

  private static detectNewFindings(
    previousFindings: Finding[],
    currentFindings: Finding[]
  ): Finding[] {
    if (previousFindings.length === 0) {
      return currentFindings;
    }

    // 使用 Set 记录之前的 findings 指纹
    const previousFingerprints = new Set(
      previousFindings.map(f => this.getFingerprint(f))
    );

    // 过滤出新 findings
    return currentFindings.filter(f => {
      const fingerprint = this.getFingerprint(f);
      return !previousFingerprints.has(fingerprint);
    });
  }

  private static getFingerprint(finding: Finding): string {
    return `${finding.rule_id}:${finding.location.file}:${finding.location.line}:${finding.location.column}`;
  }

  private static async recordScanHistory(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    findings: Finding[]
  ): Promise<void> {
    const history = await this.getScanHistory(context);

    // 更新当前文件的扫描历史
    history[uri.fsPath] = {
      uri: uri.fsPath,
      timestamp: Date.now(),
      findings,
    };

    // 保存到全局状态（限制历史记录数量）
    const maxHistory = 100;
    const historyEntries = Object.entries(history);
    if (historyEntries.length > maxHistory) {
      // 按 timestamp 排序，保留最近的记录
      historyEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const trimmed = historyEntries.slice(0, maxHistory);
      for (const [key, value] of trimmed) {
        history[key] = value;
      }
    }

    await context.globalState.update(SmartNotifications.HISTORY_KEY, history);
  }

  private static async getScanHistory(
    context: vscode.ExtensionContext
  ): Promise<Record<string, ScanHistory>> {
    return (
      context.globalState.get<Record<string, ScanHistory>>(
        SmartNotifications.HISTORY_KEY
      ) || {}
    );
  }

  private static async getLastScanResults(
    context: vscode.ExtensionContext,
    uri: vscode.Uri
  ): Promise<Finding[]> {
    const history = await this.getScanHistory(context);
    const entry = history[uri.fsPath];
    return entry?.findings || [];
  }

  private static formatPath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    return uri.fsPath.replace(workspaceFolder.uri.fsPath, '.');
  }
}
```

##### 集成到扫描流程

```typescript
// src/commands/scan.ts
export function registerScanCommands(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager,
  statusBar: StatusBarIndicator
) {
  // ... 命令注册

  context.subscriptions.push(
    vscode.commands.registerCommand('gitai.sast.scan', async (uri: vscode.Uri) => {
      // ... 扫描逻辑

      // 更新诊断信息
      diagnostics.updateDiagnostics(uri, response.findings);

      // 智能通知
      await SmartNotifications.notifyNewFindings(
        context,
        uri,
        response.findings
      );

      // ... 其他逻辑
    })
  );
}
```

---

### P3-006: 工作区信任检查

> **优先级**: P1  
> **预计工时**: 4 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

实现工作区信任检查，避免意外扫描敏感内容。

---

#### 验收标准

- [ ] 实现 `WorkspaceTrust` 类
- [ ] 检查工作区信任状态
- [ ] 提示用户信任工作区
- [ ] 支持跳过检查（配置项）
- [ ] 集成到扫描流程

---

#### 子任务列表

##### 1. 实现信任检查逻辑 (3h)
- [ ] 实现 `checkBeforeScan` 方法
- [ ] 实现信任提示
- [ ] 实现请求信任逻辑

##### 2. 更新配置 (1h)
- [ ] 添加信任检查配置项
- [ ] 集成到扫描流程

---

#### 技术方案

##### 文件结构

```
src/extension/src/trust/
└── WorkspaceTrust.ts
```

##### 核心接口

```typescript
// src/trust/WorkspaceTrust.ts
export class WorkspaceTrust {
  /**
   * 在扫描前检查工作区信任
   */
  static async checkBeforeScan(): Promise<boolean>;
}
```

##### 配置更新

```json
{
  "gitai.sast.trust.checkBeforeScan": {
    "type": "boolean",
    "default": true,
    "description": "Check workspace trust before scanning (recommended for security)"
  }
}
```

##### 实现逻辑

```typescript
// src/trust/WorkspaceTrust.ts
export class WorkspaceTrust {
  static async checkBeforeScan(): Promise<boolean> {
    // 检查配置
    const config = vscode.workspace.getConfiguration('gitai.sast.trust');
    const checkEnabled = config.get<boolean>('checkBeforeScan', true);
    if (!checkEnabled) {
      return true;
    }

    // 检查工作区信任状态
    const isTrusted = vscode.workspace.isTrusted;
    if (isTrusted) {
      return true;
    }

    // 提示用户信任工作区
    const selection = await vscode.window.showWarningMessage(
      '⚠️ This workspace is not trusted. SAST scanning requires access to your code files.',
      'Trust Workspace',
      'Cancel'
    );

    if (selection === 'Trust Workspace') {
      // 请求用户信任工作区
      await vscode.workspace.requestWorkspaceTrust();
      return vscode.workspace.isTrusted;
    }

    return false;
  }
}
```

##### 集成到扫描流程

```typescript
// src/commands/scan.ts
export function registerScanCommands(
  context: vscode.ExtensionContext,
  scanner: SastScanner,
  diagnostics: DiagnosticManager,
  statusBar: StatusBarIndicator
) {
  // ... 命令注册

  context.subscriptions.push(
    vscode.commands.registerCommand('gitai.sast.scan', async (uri: vscode.Uri) => {
      // 检查工作区信任
      const trusted = await WorkspaceTrust.checkBeforeScan();
      if (!trusted) {
        vscode.window.showInformationMessage('Scan cancelled: Workspace is not trusted');
        return;
      }

      // ... 扫描逻辑
    })
  );
}
```

---

### P3-007: 编写 Phase 3 测试

> **优先级**: P0  
> **预计工时**: 16 小时  
> **负责**: 待定  
> **阶段**: Phase 3

---

#### 任务概述

为 Phase 3 新增功能编写单元测试和集成测试。

---

#### 验收标准

- [ ] 测试首次使用引导
- [ ] 测试状态栏指示器
- [ ] 测试智能通知
- [ ] 测试工作区信任检查
- [ ] 测试覆盖率 > 80%

---

#### 子任务列表

##### 1. 编写引导测试 (4h)
- [ ] 测试 OnboardingGuide
- [ ] 测试 Webview 显示

##### 2. 编写状态栏测试 (3h)
- [ ] 测试 StatusBarIndicator
- [ ] 测试状态更新

##### 3. 编写通知测试 (4h)
- [ ] 测试 SmartNotifications
- [ ] 测试新问题检测

##### 4. 编写信任检查测试 (2h)
- [ ] 测试 WorkspaceTrust
- [ ] 测试信任提示

##### 5. 编写集成测试 (3h)
- [ ] 测试完整工作流（扫描 → 通知 → 状态栏）

---

---

## 总结

### 工期汇总

| 阶段 | 任务数 | 总工时 | 交付物 |
|------|--------|--------|--------|
| **Phase 1** | 4 | 40h | Diff 查看器、增强 Code Actions、忽略管理、E2E 测试 |
| **Phase 2** | 3 | 32h | Chat Participant、Chat 测试、图标资源 |
| **Phase 3** | 7 | 68h | Copilot Agent、自动检测、引导、状态栏、通知、信任检查、测试 |
| **总计** | 14 | 140h | 3.5 周 |

### 关键里程碑

| 周次 | 里程碑 |
|------|--------|
| **第 1 周** | Phase 1 完成：核心 UI/UX 优化 |
| **第 2 周** | Phase 2 完成：Copilot Chat 集成 |
| **第 3-4 周** | Phase 3 完成：AI 服务增强 & 整体交互优化 |

### 风险提示

1. **Copilot Chat API**：当前 GitHub Copilot Chat 没有公开 API，Copilot Agent 提供商的实现需要等待 API 公开
2. **资源设计**：Chat Participant 图标和引导页面需要设计支持
3. **测试覆盖率**：E2E 测试编写耗时较多，需要合理安排时间

### 下一步行动

1. **确认优先级**：与团队确认 Phase 1-3 的任务优先级
2. **分配资源**：为每个任务分配开发者
3. **制定详细计划**：将任务细化为每日工作计划
4. **开始开发**：从 Phase 1 开始逐步实施

---

**创建时间**: 2025-12-31  
**最后更新**: 2025-12-31  
**维护者**: GitAI Team
