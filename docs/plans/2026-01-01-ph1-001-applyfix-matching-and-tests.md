# PH1-001 Apply Fix Matching + Regression Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix `FixDiffViewer.applyFix` matching so it replaces the vulnerable snippet (not the replacement code), and add regression tests for partial-line and multi-line replacements.

**Architecture:** Drive changes via VS Code E2E tests (`src/extension/src/test/suite/index.ts`). Implement snippet-based matching in `FixDiffViewer` using `finding.code_snippet` + `finding.location` (closest match), with safe fallbacks when snippet cannot be located.

**Tech Stack:** VS Code Extension API (`vscode`), `@vscode/test-electron`, TypeScript.

---

### Task 1: Add failing regression tests (RED)

**Files:**
- Modify: `src/extension/src/test/suite/index.ts`

**Step 1: Partial-line replacement test**
- Create a document where the vulnerable snippet is a substring of a larger line.
- Create a `Finding` with `code_snippet` set to that substring and `location.line` pointing at the line.
- Call `FixDiffViewer.applyFix(editor, finding, fixCode)` and assert only the substring is replaced.

**Step 2: Multi-line replacement test**
- Create a document where `code_snippet` spans multiple lines.
- Call `FixDiffViewer.applyFix` with a multi-line replacement and assert the original multi-line snippet is replaced (not duplicated).

**Step 3: Run tests and verify failure**
- Run: `cd src/extension && npm test`
- Expected: FAIL with mismatch caused by current line-replacement fallback.

---

### Task 2: Implement matching strategy (GREEN)

**Files:**
- Modify: `src/extension/src/ui/FixDiffViewer.ts`

**Step 1: Replace “search fixCode in original” with snippet-based matching**
- Use `finding.code_snippet` (normalized to document EOL) to find candidate match(es) in `document.getText()`.
- If exactly one match: replace that range.
- If multiple matches: choose the match closest to `finding.location` (best-effort).
- If no match: fall back to replacing `finding.location.line` range (existing behavior).

**Step 2: Keep diff preview consistent**
- Apply the same matching logic to `applyFixToContent` so the diff preview reflects what Apply Fix would do.

**Step 3: Run tests**
- Run: `cd src/extension && npm test`
- Expected: PASS.

---

### Task 3: Update task status (optional but recommended)

**Files:**
- Modify: `docs/tasks/ROADMAP.md`

**Step 1: Mark `PH1-001`**
- If acceptance is met (matching fixed + tests added), set `PH1-001` back to ✅ and update “关键缺口” accordingly.

