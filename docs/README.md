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

统一追踪入口（已合并 `docs/tasks/*` 与 `docs/implementation-roadmap.md`）：

- `docs/tasks/ROADMAP.md`

> 提示：这里不再维护重复/过时的任务表格与链接，避免出现编号冲突与断链；请以 `docs/tasks/ROADMAP.md` 为准。

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
