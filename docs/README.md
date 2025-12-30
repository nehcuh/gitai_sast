# VSCode SAST AI 插件 - 文档中心

> GitAI SAST VSCode Extension - Document Center

**版本**: v1.0  
**更新时间**: 2025-01-29  

---

## 📚 文档导航

### 快速开始
- [项目概述](./00-project-overview.md) - 项目目标、设计原则、核心能力
- [快速安装](./guides/setup.md) - 安装与配置指南
- [使用手册](./guides/usage.md) - 功能使用与最佳实践

### 架构设计
- [整体架构](./01-architecture.md) - 分层架构、核心组件、数据流
- [MCP 工具规范](./02-mcp-spec.md) - MCP 工具定义、请求/响应格式
- [远程 API 集成](./03-remote-api-integration.md) - 远程 SAST 平台对接

### API 参考
- [远程 SAST API](./api/remote-sast-api.md) - 完整的远程接口文档
- [MCP API](./api/mcp-api.md) - MCP 工具 API 规范

### 开发任务
见下方 [任务列表](#任务列表) 部分

### 扩展功能
- [错误处理与降级](./14-error-handling.md)
- [缓存与性能优化](./15-cache-performance.md)
- [可观测性](./16-observability.md)
- [配置向导](./17-config-wizard.md)
- [团队协作](./18-collaboration.md)
- [插件系统](./19-plugin-system.md)
- [版本迁移](./20-version-migration.md)
- [数据安全](./21-data-security.md)
- [国际化](./22-i18n.md)
- [测试策略](./23-testing-strategy.md)

---

## ✅ 任务列表

### 任务统计
- **P0 (阻断性)**: 5 个任务
- **P1 (严重)**: 8 个任务
- **P2 (重要)**: 12 个任务
- **P3 (优化)**: 10 个任务
- **总计**: 35 个任务

### P0 阶段任务 (当前阶段)

| 序号 | 任务名称 | 状态 | 文档链接 |
|------|----------|------|----------|
| P0-001 | 本地扫描引擎实现 | 🔄 进行中 | [查看](./tasks/p0/001-local-scanner.md) |
| P0-002 | MCP Server 框架 | 📝 待开始 | [查看](./tasks/p0/002-mcp-server.md) |
| P0-003 | Extension 基础 UI | 📝 待开始 | [查看](./tasks/p0/003-extension-ui.md) |
| P0-004 | AI 修复功能 | 📝 待开始 | [查看](./tasks/p0/004-ai-fix.md) |
| P0-005 | 远程 SAST 集成 | 📝 待开始 | [查看](./tasks/p0/005-remote-scan.md) |

### P1 阶段任务

| 序号 | 任务名称 | 状态 | 文档链接 |
|------|----------|------|----------|
| P1-001 | 自动扫描系统 | 📝 待开始 | [查看](./tasks/p1/001-auto-scan.md) |
| P1-002 | 提交前阻断 (Commit Gate) | 📝 待开始 | [查看](./tasks/p1/002-commit-gate.md) |
| P1-003 | 配置管理系统 | 📝 待开始 | [查看](./tasks/p1/003-config-system.md) |
| P1-004 | 错误处理与降级 | 📝 待开始 | [查看](./tasks/p1/004-error-handling.md) |
| P1-005 | 缓存与性能优化 | 📝 待开始 | [查看](./tasks/p1/005-cache-performance.md) |
| P1-006 | 可观测性系统 | 📝 待开始 | [查看](./tasks/p1/006-observability.md) |
| P1-007 | 用户配置向导 | 📝 待开始 | [查看](./tasks/p1/007-config-wizard.md) |
| P1-008 | 团队协作功能 | 📝 待开始 | [查看](./tasks/p1/008-collaboration.md) |

### P2 阶段任务

| 序号 | 任务名称 | 状态 | 文档链接 |
|------|----------|------|----------|
| P2-001 | Chat Participant (@sast) | 📝 待开始 | [查看](./tasks/p2/001-chat-participant.md) |
| P2-002 | 忽略管理面板 | 📝 待开始 | [查看](./tasks/p2/002-ignore-panel.md) |
| P2-003 | 污点路径可视化 | 📝 待开始 | [查看](./tasks/p2/003-taint-visualization.md) |
| P2-004 | CodeQL CLI 集成 | 📝 待开始 | [查看](./tasks/p2/004-codeql-integration.md) |
| P2-005 | 插件系统框架 | 📝 待开始 | [查看](./tasks/p2/005-plugin-system.md) |
| P2-006 | 版本迁移策略 | 📝 待开始 | [查看](./tasks/p2/006-version-migration.md) |
| P2-007 | 数据安全设计 | 📝 待开始 | [查看](./tasks/p2/007-data-security.md) |
| P2-008 | 国际化 (i18n) | 📝 待开始 | [查看](./tasks/p2/008-i18n.md) |
| P2-009 | 测试框架搭建 | 📝 待开始 | [查看](./tasks/p2/009-testing-framework.md) |
| P2-010 | 部署与发布流程 | 📝 待开始 | [查看](./tasks/p2/010-deployment.md) |

### P3 阶段任务

| 序号 | 任务名称 | 状态 | 文档链接 |
|------|----------|------|----------|
| P3-001 | Cursor IDE 支持 | 📝 待开始 | [查看](./tasks/p3/001-cursor-support.md) |
| P3-002 | JetBrains 插件 | 📝 待开始 | [查看](./tasks/p3/002-jetbrains-plugin.md) |
| P3-003 | Antigravity 支持 | 📝 待开始 | [查看](./tasks/p3/003-antigravity-support.md) |
| P3-004 | 报告导出增强 | 📝 待开始 | [查看](./tasks/p3/004-report-export.md) |
| P3-005 | 自定义规则编辑器 | 📝 待开始 | [查看](./tasks/p3/005-rule-editor.md) |
| P3-006 | CI/CD 集成 | 📝 待开始 | [查看](./tasks/p3/006-cicd-integration.md) |
| P3-007 | 审核流程 | 📝 待开始 | [查看](./tasks/p3/007-audit-workflow.md) |
| P3-008 | 性能监控面板 | 📝 待开始 | [查看](./tasks/p3/008-perf-dashboard.md) |
| P3-009 | 插件市场 | 📝 待开始 | [查看](./tasks/p3/009-plugin-marketplace.md) |
| P3-010 | 文档站点 | 📝 待开始 | [查看](./tasks/p3/010-docs-site.md) |

---

## 🎯 开发路线图

```
Phase 0: 项目初始化 (Week 1)
├── P0-001: 本地扫描引擎实现
├── P0-002: MCP Server 框架
├── P0-003: Extension 基础 UI
└── P0-004: AI 修复功能

Phase 1: 核心功能 (Week 2-3)
├── P0-005: 远程 SAST 集成
├── P1-001: 自动扫描系统
├── P1-002: 提交前阻断
├── P1-003: 配置管理系统
└── P1-004: 错误处理与降级

Phase 2: 增强功能 (Week 4-5)
├── P1-005: 缓存与性能优化
├── P1-006: 可观测性系统
├── P1-007: 用户配置向导
├── P1-008: 团队协作功能
└── P2-001 ~ P2-004: 高级特性

Phase 3: 扩展功能 (Week 6-8)
├── P2-005 ~ P2-010: 插件系统与集成
└── P3-001 ~ P3-010: 多 IDE 支持与优化
```

---

## 📖 文档规范

### 文档命名规范
- 设计文档: `XX-name.md` (XX: 两位数序号)
- 任务文档: `tasks/pX/YYY-name.md` (X: 优先级, YYY: 三位数序号)
- API 文档: `api/name.md`
- 指南文档: `guides/name.md`

### 文档状态标记
- 📝 待开始
- 🔄 进行中
- ⏸️ 已暂停
- ✅ 已完成
- ❌ 已取消

### 更新日志
- 2025-01-29: 初始文档结构创建
- 2025-01-29: 完成 P0 任务文档拆分

---

## 🔗 相关链接

- [主项目仓库](../README.md)
- [原始需求文档](../sast.md)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [VSCode Extension API](https://code.visualstudio.com/api)

---

**维护者**: GitAI Team  
**最后更新**: 2025-01-29
