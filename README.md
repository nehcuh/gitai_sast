# VSCode SAST AI 插件

> 集成了 AI 能力的静态代码分析 VSCode 插件

**版本**: v0.1.0  
**状态**: 🚧 开发中

---

## 项目简介

GitAI SAST 是一个强大的静态代码分析工具，提供：

- **智能扫描**: 本地 + 远程双模式扫描
- **AI 修复**: 基于上下文的智能修复建议
- **实时守护**: 打字时实时显示问题提示
- **团队协作**: 忽略列表同步、问题分配追踪

---

## 项目结构

```
gitai/
├── src/
│   ├── mcp-server/      # MCP Server (Rust)
│   ├── extension/       # VSCode Extension (TypeScript)
│   └── shared/          # 共享类型和工具
├── tests/               # 测试文件
├── scripts/             # 构建和部署脚本
├── docs/                # 文档
└── .vscode/             # VSCode 配置
```

---

## 开发指南

### 前置要求

- **Rust**: 1.70+ (用于 MCP Server)
- **Node.js**: 18+ (用于 Extension)
- **Opengrep**: 最新版本
- **VSCode**: 1.80+

### 本地开发

#### 1. 安装依赖

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Node.js
nvm install 18

# 安装 Opengrep
# 见 https://github.com/opengrep/opengrep
```

#### 2. 启动开发环境

```bash
# 启动 MCP Server (开发模式)
cd src/mcp-server
cargo run

# 启动 VSCode Extension (开发模式)
cd src/extension
npm install
npm run watch
```

#### 3. 运行测试

```bash
# MCP Server 测试
cd src/mcp-server
cargo test

# Extension 测试
cd src/extension
npm test
```

---

## 任务进度

见 [docs/README.md](docs/README.md#任务列表)

---

## 许可证

MIT

---

**维护者**: GitAI Team
