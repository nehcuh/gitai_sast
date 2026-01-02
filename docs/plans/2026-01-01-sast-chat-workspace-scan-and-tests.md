# SAST Chat Workspace Scan + Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete `@sast scan workspace` and add E2E coverage for `@sast fix/taint/scan`.

**Architecture:** Implement Chat `ScanHandler.scanWorkspace()` by reusing the same workspace file collection rules as the existing command palette scan (`src/extension/src/commands/scan.ts`), then wire findings into `DiagnosticManager`. Add a small fixture workspace for VS Code E2E so workspace-dependent handlers (`taint`, `scan workspace`) can run reliably.

**Tech Stack:** VS Code Extension API (`vscode`), `@vscode/test-electron`, TypeScript.

---

### Task 1: Provide a fixture workspace for E2E

**Files:**
- Create: `src/extension/src/test/workspace/hello.ts`
- Create: `src/extension/src/test/workspace/node_modules/ignore.ts`
- Modify: `src/extension/src/test/runTest.ts`

**Step 1: Add minimal workspace files**
- `hello.ts` should be a supported extension file.
- `node_modules/ignore.ts` should exist to assert `**/node_modules/**` is excluded.

**Step 2: Launch VS Code tests with this workspace**
- Pass the workspace folder as the first `launchArgs` entry in `runTests`.

**Step 3: Verify**
- Run: `cd src/extension && npm test`
- Expected: tests run with a workspace folder present (`vscode.workspace.workspaceFolders` non-empty).

---

### Task 2: Add failing E2E test for `@sast scan workspace` (RED)

**Files:**
- Modify: `src/extension/src/test/suite/index.ts`

**Step 1: Write a failing test**
- Create a `SastChatParticipant` with a stub `scanner.scanWorkspace()` and a stub `diagnostics` object.
- Call `(participant as any).handleRequest()` with `{ command: 'scan', prompt: 'scan workspace' }`.
- Assert:
  - `scanWorkspace()` is called once with `root` and a `files` map containing `hello.ts` but not `node_modules/ignore.ts`.
  - diagnostics are cleared and updated with returned findings.

**Step 2: Run test to verify it fails**
- Run: `cd src/extension && npm test`
- Expected: FAIL because `ScanHandler.scanWorkspace()` is currently a placeholder that returns `success: false`.

---

### Task 3: Implement Chat workspace scan (GREEN)

**Files:**
- Modify: `src/extension/src/chat/handlers/ScanHandler.ts`

**Step 1: Implement `scanWorkspace(stream, token)`**
- Determine workspace root via `vscode.workspace.workspaceFolders?.[0]`.
- Collect files via `vscode.workspace.findFiles('**/*', '**/node_modules/**', 1000)` and filter by supported extensions.
- Read contents via `vscode.workspace.fs.readFile` and decode as UTF-8.
- Call `this.scanner.scanWorkspace(root, files)`.
- Update diagnostics:
  - `this.diagnostics.clearAll()`
  - group findings by `finding.location.file` and call `updateDiagnostics(uri, findingsForFile)`
- Stream summary + a short findings list.

**Step 2: Run tests**
- Run: `cd src/extension && npm test`
- Expected: PASS.

---

### Task 4: Add E2E coverage for `@sast fix/taint/scan` (no behavior change)

**Files:**
- Modify: `src/extension/src/test/suite/index.ts`

**Step 1: `@sast fix`**
- Stub `aiFixProvider.generateFix` and patch `FixExplanationPanel.show` to avoid real webview usage.
- Assert markdown includes fix block and provider is called with the finding.

**Step 2: `@sast taint`**
- Provide remote finding (`provider: 'remote'`), stub `mcpClient.ensureConnected` and `mcpClient.callTool`.
- Assert it calls `get_taint_path` with `{ version: 1, root, finding }` and renders steps.

**Step 3: `@sast scan` (file)**
- Stub `scanner.scanFile`, assert diagnostics are updated and output includes finding title.

---

### Task 5: Update merged roadmap statuses

**Files:**
- Modify: `docs/tasks/ROADMAP.md`

**Step 1: Mark progress**
- Update `P2-001` to remove “缺 workspace scan” if implemented.
- Update `PH2-002` to ✅ if all chat tests are covered.

---

### Task 6: Verification

**Commands:**
- Extension: `cd src/extension && npm run compile && npm run lint && npm test`
- MCP server: `cd src/mcp-server && cargo build --locked`

