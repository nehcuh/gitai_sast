# P0-002: MCP Server 框架

> **优先级**: P0  
> **状态**: 📝 待开始  
> **预计工时**: 32 小时  
> **负责**: 待定  
> **阶段**: Phase 0

---

## 任务概述

实现 MCP Server 框架，提供 JSON-RPC 通信能力，定义核心工具接口（scan、get_context、get_taint_path 等）。

---

## 验收标准

- [ ] 实现 JSON-RPC 2.0 协议处理
- [ ] 支持 SSE/stdio 传输
- [ ] 支持工具注册和调用
- [ ] 实现 scan 工具
- [ ] 实现 get_context 工具
- [ ] 实现 get_taint_path 工具
- [ ] 实现错误处理和重试机制
- [ ] 编写集成测试

---

## 子任务列表

### 1. 设计 MCP Server 架构 (4h)
### 2. 实现 JSON-RPC 协议处理器 (6h)
### 3. 实现工具注册机制 (4h)
### 4. 实现 scan 工具 (4h)
### 5. 实现 get_context 工具 (4h)
### 6. 实现 get_taint_path 工具 (4h)
### 7. 实现错误处理和重试机制 (4h)
### 8. 编写集成测试 (2h)

---

## 技术方案

### 架构设计

```
McpServer
├── Transport (SSE/stdio)
├── JsonRpcHandler
├── ToolRegistry
└── Tools
    ├── ScanTool
    ├── GetContextTool
    └── GetTaintPathTool
```

### 核心接口

```rust
pub trait Tool {
    fn name(&self) -> &str;
    async fn call(&self, args: Value) -> Result<Value>;
}

pub struct McpServer {
    transport: Box<dyn Transport>,
    tools: HashMap<String, Box<dyn Tool>>,
}
```

---

## 参考资料

- [MCP 协议规范](https://modelcontextprotocol.io/)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- [MCP 工具规范](../02-mcp-spec.md)

---

**创建时间**: 2025-01-29
