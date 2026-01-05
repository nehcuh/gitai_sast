# GitAI SAST - 智能静态代码分析插件

> 集成了 AI 修复能力的静态代码分析 VSCode 插件，支持本地 Opengrep 引擎和远程大规模扫描。

**版本**: v0.1.0  
**状态**: 🚧 开发中 (Beta)

---

## ✨ 核心特性

- **🚀 双模式扫描**:
    - **本地模式**: 使用内置/本地 Opengrep 引擎，快速扫描，无需联网。
    - **远程模式**: 连接企业级 SAST 平台，支持大规模项目和污点分析。
- **🤖 AI 智能修复**: 基于 LLM (DeepSeek/Claude/GPT) 提供上下文感知的代码修复建议。
- **🔍 污点分析可视化**: 在远程模式下，直观展示漏洞的来源 (Source) 到执行点 (Sink) 的完整路径。
- **⚡️ 实时守护**: 编码过程中实时检测安全隐患。

---

## 🛠️ 快速开始

### 1. 配置指南

本插件需要依赖 **Opengrep** 扫描引擎和 **Semgrep Rules** 规则集。请按照以下步骤进行手动配置：

#### 前置要求
*   **Opengrep**: [下载地址](https://github.com/opengrep/opengrep/releases) (根据您的系统下载对应版本)
*   **Semgrep Rules**: [下载地址](https://github.com/semgrep/semgrep-rules) (推荐下载 ZIP 或 Clone 仓库)

#### 配置步骤
1.  **安装 Opengrep**:
    *   下载并解压 Opengrep 二进制文件。
    *   (可选) 将其添加到环境变量 PATH 中，或者记下其绝对路径。

2.  **准备规则集**:
    *   下载并解压规则集。
    *   记下规则集文件夹的绝对路径（例如 `/path/to/semgrep-rules`）。

3.  **在 VSCode 中配置**:
    *   打开 VSCode 设置 (`Cmd/Ctrl + ,`)。
    *   搜索 `gitai.sast`。
    *   设置 **Opengrep Path** (`gitai.sast.opengrepPath`):
        *   填入 Opengrep 可执行文件的绝对路径。
    *   设置 **Opengrep Rules** (`gitai.sast.opengrepRules`):
        *   填入规则集文件夹的绝对路径。

> **注意**: 如果您不配置这些路径，插件将无法正常执行扫描任务。

---

## ⚙️ 详细配置项

| 配置项 ID | 说明 | 默认值 | 可选值 |
| :--- | :--- | :--- | :--- |
| `gitai.sast.scannerProvider` | 扫描引擎提供方 | `"local"` | `"local"` (本地), `"remote"` (远程), `"both"` (混合) |
| `gitai.sast.scanMode` | 自动扫描触发范围 | `"currentFile"` | `"currentFile"` (当前文件), `"workspace"` (全项目) |
| `gitai.sast.opengrepPath` | 本地 Opengrep 路径 | `""` | 绝对路径 |
| `gitai.sast.opengrepRules` | 本地规则集路径 | `""` | 绝对路径 |
| `gitai.sast.mcpServerPath` | MCP Server (Rust) 路径 | `""` | 绝对路径 (用于远程通讯) |
| `gitai.sast.aiProvider` | AI 修复模型提供商 | `"deepseek"` | `"deepseek"`, `"openai"`, `"anthropic"` |
| `gitai.sast.aiModel` | AI 模型名称 | `"deepseek-chat"` | e.g. `gpt-4`, `claude-3-opus` |

---

## 🖥️ 开发指南

如果您是插件开发者，请遵循以下构建步骤：

### 环境要求
- **Node.js**: 18+
- **Rust**: 1.70+ (如果不修改 MCP Server 可选)
- **vsce**: `npm install -g vsce`

### 构建步骤

```bash
# 1. 安装依赖
cd src/extension
npm install

# 2. 编译 TypeScript
npm run compile

# 3. 打包插件 (.vsix)
npx vsce package
```

### 调试
按 `F5` 启动 "Extension Development Host" 进行调试。

---

## 📝 常见问题

**Q: 为什么看不到污点路径 (Taint Path)?**  
A: 污点路径仅在 **远程模式 (`remote`)** 下可用。请确保 `gitai.sast.scannerProvider` 设置为 `remote` 或 `both`，并且连接的 MCP Server 支持污点分析。

**Q: 自动安装下载慢怎么办?**  
A: 自动安装依赖 GitHub Releases。网络受限时，请尝试手动下载二进制文件并配置路径。

---

## 许可证
MIT
