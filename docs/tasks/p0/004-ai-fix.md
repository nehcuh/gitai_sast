# P0-004: AI 修复功能

> **优先级**: P0  
> **状态**: 🔄 进行中（以 `docs/tasks/ROADMAP.md` 为准）  
> **预计工时**: 32 小时  
> **负责**: 待定  
> **阶段**: Phase 0

---

## 任务概述

集成 VSCode LanguageModel API，实现基于上下文的智能修复建议生成，支持污点路径、CFG、依赖等上下文注入。

---

## 依赖关系

- **前置依赖**: 
  - P0-002: MCP Server 框架
  - P0-003: Extension 基础 UI
- **后续依赖**: 
  - P2-001: Chat Participant (@sast)

---

## 验收标准

- [ ] 支持调用 VSCode AI 模型（vscode.lm）
- [ ] 支持基于污点路径的上下文注入
- [ ] 支持 Prompt 模板配置（.vscode/sast.prompts.json）
- [ ] 支持修复结果验证（通过 MCP patch_validate）
- [ ] 支持应用到编辑器（增量修改）
- [ ] 支持修复结果展示（diff 预览）
- [ ] 编写单元测试

---

## 子任务列表

### 1. 设计 Prompt 架构 (4h)
### 2. 实现 PromptBuilder (6h)
- [ ] 实现模板加载
- [ ] 实现模板插值
- [ ] 实现上下文注入
- [ ] 实现规则映射

### 3. 实现 LanguageModelBridge (6h)
- [ ] 实现 VSCode AI 模型调用
- [ ] 实现响应解析
- [ ] 实现错误处理

### 4. 实现上下文提取 (6h)
- [ ] 实现污点路径提取（来自 MCP）
- [ ] 实现代码片段提取
- [ ] 实现依赖分析
- [ ] 实现 CFG 提取（可选）

### 5. 实现修复结果解析和应用 (4h)
- [ ] 实现修复结果解析
- [ ] 实现增量修改应用
- [ ] 实现 diff 预览

### 6. 实现修复验证 (4h)
- [ ] 实现 MCP patch_validate 调用
- [ ] 实现验证结果展示

### 7. 编写单元测试 (2h)

---

## 技术方案

### 架构设计

```
AI Fix Pipeline
├── Context Extraction
│   ├── TaintPathExtractor
│   ├── CodeSnippetExtractor
│   └── DependencyAnalyzer
├── Prompt Building
│   ├── PromptBuilder
│   └── TemplateManager
├── AI Model Call
│   └── LanguageModelBridge
├── Result Processing
│   ├── FixParser
│   └── FixValidator
└── Application
    └── DiffApplier
```

### Prompt 模板结构

```json
{
  "version": 1,
  "semgrepRuleMapping": {
    "sqlalchemy-sql-injection": {
      "template": "sql-injection",
      "requiredContext": ["taint_path", "sqlalchemy_api"]
    }
  },
  "templates": {
    "sql-injection": {
      "systemMessage": "你是 SQLAlchemy 安全专家...",
      "userMessage": "检测到 SQL 注入漏洞。\n\n## 污点路径\n{taint_path}\n\n## 代码片段\n{code_snippet}\n\n请提供使用 bind params 的修复方案。",
      "modelParams": {
        "temperature": 0.2,
        "maxTokens": 3000
      }
    }
  }
}
```

### 核心接口

```typescript
// src/ai/PromptBuilder.ts
class PromptBuilder {
  buildFixPrompt(finding: Finding, context: FixContext): string;
  buildExplainPrompt(finding: Finding, context: FixContext): string;
}

// src/ai/LanguageModelBridge.ts
class LanguageModelBridge {
  async generateFix(finding: Finding, context: FixContext): Promise<Fix>;
  async explainVulnerability(finding: Finding, context: FixContext): Promise<string>;
}

// src/ai/FixValidator.ts
class FixValidator {
  async validateFix(fix: Fix, originalFinding: Finding): Promise<ValidationResult>;
}
```

---

## 参考资料

- [VSCode LanguageModel API](https://code.visualstudio.com/api/extension-guides/ai)
- [Prompt 工程设计](../05-prompt-engineering.md)
- [上下文结构化](../05-prompt-engineering.md)

---

**创建时间**: 2025-01-29
