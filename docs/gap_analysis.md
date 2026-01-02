# Gap Analysis Report

**Date**: 2026-01-01
**Version**: v1.0

## 1. Overview

This document compares the project requirements and roadmap (as defined in `docs/00-project-overview.md` and `docs/implementation-roadmap.md`) with the current code implementation (as of 2026-01-01).

**Summary of Status**:
- **Core Framework**: ✅ Extension activation, MCP Client, and Basic UI are in place.
- **Local Scanner**: ⚠️ Implemented but lacks advanced features (Concurrency control, internal incremental logic).
- **Chat Integration**: 🔄 Partially implemented. `Fix` command works with real AI, but `Explain` command is currently **MOCKED**.
- **UI/UX**: ⚠️ `FixDiffViewer` and `CodeActions` are present but rely on regex-based matching which may be fragile.

---

## 2. Detailed Gap Analysis

### 2.1 Chat Participant (`@sast`)

| Feature | Requirement | Current Implementation | Gap |
| :--- | :--- | :--- | :--- |
| **Explain Command** | `@sast explain` should use AI to explain vulnerabilities with context. | **MOCKED**. `ExplainHandler.ts` returns a hardcoded markdown string using the finding title and description. It does NOT call `AiFixProvider`. | **CRITICAL**. The AI explanation feature is non-functional. |
| **Fix Command** | `@sast fix` should use AI to generate fixes. | **IMPLEMENTED**. `FixHandler.ts` correctly calls `AiFixProvider.generateFix` and streams results. | None. |
| **Taint Command** | `@sast taint` should show taint paths. | **PARTIAL**. Delegates to `TaintHandler` (assumed similar to Fix, need verification if fully wired to MCP). | Needs verification of MCP wiring. |
| **Context** | AI should be aware of file context and dependencies. | **BASIC**. `AiFixProvider` sends the code snippet and simple context. Full `get_context` tool in MCP is marked as TODO in roadmap. | Context is limited to local file snippet. |

### 2.2 Local Scanner (`OpengrepScanner`)

| Feature | Requirement | Current Implementation | Gap |
| :--- | :--- | :--- | :--- |
| **Scanning** | High-performance local scan. | **IMPLEMENTED**. Uses `opengrep` CLI with `tempfile` mapping for buffer scanning. | None. |
| **Incremental** | Only scan changed files. | **MISSING** (Internal). `opengrep.rs` scans whatever is passed to it. Incremental logic is likely missing or external. | Performance risk for large repos. |
| **Concurrency** | Limit concurrent scans. | **MISSING**. `scan` uses `tokio::task::spawn_blocking` without a semaphore/limit. | Potential resource exhaustion. |

### 2.3 UI Components

| Feature | Requirement | Current Implementation | Gap |
| :--- | :--- | :--- | :--- |
| **Diff Viewer** | Show AI fix diff with "Apply" capability. | **SIMPLIFIED**. `FixDiffViewer` uses `findSnippetMatch` (regex-like) to locate code to replace. | Fragile matching. "Best Effort" might fail if code changed slightly. |
| **Code Actions** | Quick fixes for vulnerabilities. | **IMPLEMENTED**. `AiFix` code action exists. | None. |

### 2.4 AI Provider

| Feature | Requirement | Current Implementation | Gap |
| :--- | :--- | :--- | :--- |
| **Flexibility** | Support VSCode LM, OpenAI, Copilot. | **IMPLEMENTED**. `AiFixProvider.ts` supports `vscode`, `openaiCompatible`, `copilotAgent`. | None. |

---

## 3. Recommendations

1.  **Implement `ExplainHandler`**: Priority P0. Connect `ExplainHandler` to `AiFixProvider` similar to `FixHandler`.
2.  **Enhance Scanner**: Add concurrency limits (e.g., `Semaphore`) to `OpengrepScanner` or its caller.
3.  **Improve Diff Matching**: Improve `applyFix` logic to be robust against minor whitespace/formatting differences, or use a proper AST/Diff patching library if possible.
4.  **Verify MCP Taint**: Ensure `get_taint_path` in MCP server is fully functional (Roadmap says it exists but "formatting/edge cases" missing).

---

## 4. Conclusion

The project has a solid foundation (`AiFixProvider` and Basic Scanner are good). The most immediate functional gap for the user (who is debugging Copilot Chat) is the **mocked `Explain` handler**. This explains why they might feel the feature is "missing" or "not working" as expected.
