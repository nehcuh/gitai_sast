import * as vscode from 'vscode';
import { AiFixProvider, GenerateFixOptions } from '../ai/AiFixProvider';
import { McpClient } from '../core/McpClient';
import { Finding } from '../core/types';

export function registerAiFixCommand(
  context: vscode.ExtensionContext,
  aiFixProvider: AiFixProvider,
  mcpClient: McpClient
) {
  const disposable = vscode.commands.registerCommand(
    'gitai.sast.aiFix',
    async (uri: vscode.Uri, finding: Finding) => {
      if (!uri || !finding) {
        vscode.window.showErrorMessage('AI Fix failed: missing vulnerability context');
        return;
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, { preview: true });

      const codeSnippet = getCodeSnippet(document, finding);
      const extraContext: any = {
        file: uri.fsPath,
        languageId: document.languageId,
      };

      if (finding.provider === 'remote' && typeof finding.issue_content === 'string' && finding.issue_content.trim()) {
        try {
          const root = getWorkspaceRoot(uri);
          if (root) {
            await mcpClient.ensureConnected();
            const taintResponse = await mcpClient.callTool('get_taint_path', {
              version: 1,
              root,
              finding,
            });
            if (taintResponse?.taint_path?.steps?.length) {
              extraContext.taint_path = taintResponse.taint_path;
            }
          }
        } catch (error) {
          console.warn('[GitAI SAST] Failed to fetch taint path context:', error);
        }
      }

      const aiConfig = vscode.workspace.getConfiguration('gitai.sast.ai');
      const streamEnabled = aiConfig.get<boolean>('stream', true);
      const enableThinking = aiConfig.get<boolean>('enableThinking', false);

      const streamPreview = streamEnabled
        ? await createStreamingPreview(uri, finding, enableThinking)
        : null;

      const fixOptions: GenerateFixOptions | undefined = streamPreview
        ? {
          onDelta: (delta) => streamPreview.append(delta.kind, delta.text),
        }
        : undefined;

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating AI fix...',
            cancellable: false,
          },
          async () => aiFixProvider.generateFix(finding, codeSnippet, extraContext, fixOptions)
        );

        if (streamPreview) {
          await streamPreview.finalize(result.suggestion, result.thinking);
        }

        const selection = await vscode.window.showInformationMessage(
          'AI fix generated',
          'Apply (best effort)',
          'Open Suggestion',
          'Copy Code'
        );

        if (selection === 'Copy Code') {
          await vscode.env.clipboard.writeText(result.code);
          vscode.window.showInformationMessage('AI fix code copied to clipboard');
          return;
        }

        if (selection === 'Open Suggestion') {
          await openSuggestion(uri, finding, result.suggestion, result.code, result.thinking);
          return;
        }

        if (selection === 'Apply (best effort)') {
          const applied = await applyBestEffort(editor, finding, codeSnippet, result.code);
          if (applied) {
            vscode.window.showInformationMessage('AI fix applied');
          } else {
            await openSuggestion(uri, finding, result.suggestion, result.code, result.thinking);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (streamPreview) {
          await streamPreview.setError(message);
        }
        vscode.window.showErrorMessage(`AI Fix failed: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function createStreamingPreview(uri: vscode.Uri, finding: Finding, enableThinking: boolean) {
  const state = {
    thinking: '',
    content: '',
    status: 'Streaming...',
    lastRendered: '',
    lastRenderedThinking: '',
    lastRenderedStatus: '',
    renderTimer: undefined as NodeJS.Timeout | undefined,
    renderPromise: Promise.resolve(),
  };

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: buildStreamingMarkdown(uri, finding, enableThinking, '', '', state.status),
  });

  const textEditor = await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });

  try {
    await vscode.commands.executeCommand('markdown.showPreviewToSide', doc.uri);
  } catch {
    // Ignore if the markdown extension/preview is unavailable.
  }

  const scheduleRender = (status: string) => {
    state.status = status;
    if (state.renderTimer) {
      return;
    }
    state.renderTimer = setTimeout(() => {
      state.renderTimer = undefined;
      void render();
    }, 80);
  };

  const render = async () => {
    if (
      enableThinking &&
      state.thinking === state.lastRenderedThinking &&
      state.content === state.lastRendered &&
      state.status === state.lastRenderedStatus
    ) {
      return;
    }
    if (!enableThinking && state.content === state.lastRendered && state.status === state.lastRenderedStatus) {
      return;
    }

    state.lastRendered = state.content;
    state.lastRenderedThinking = state.thinking;
    state.lastRenderedStatus = state.status;

    const nextMarkdown = buildStreamingMarkdown(
      uri,
      finding,
      enableThinking,
      state.thinking,
      state.content,
      state.status
    );

    state.renderPromise = state.renderPromise.then(async () => {
      await replaceEditorDocument(textEditor, nextMarkdown);
    });

    await state.renderPromise;
  };

  return {
    append: (kind: 'thinking' | 'content', text: string) => {
      if (!text) {
        return;
      }
      if (kind === 'thinking') {
        if (!enableThinking) {
          return;
        }
        state.thinking += text;
        scheduleRender('Streaming (thinking)...');
        return;
      }
      state.content += text;
      scheduleRender('Streaming...');
    },
    finalize: async (fullSuggestion: string, thinking?: string) => {
      if (enableThinking && typeof thinking === 'string' && thinking.trim()) {
        state.thinking = thinking;
      }
      state.content = fullSuggestion;
      state.status = 'Done';
      await render();
    },
    setError: async (message: string) => {
      state.status = `Error: ${message}`;
      await render();
    },
  };
}

async function replaceEditorDocument(editor: vscode.TextEditor, text: string): Promise<void> {
  const document = editor.document;
  const current = document.getText();
  if (current === text) {
    return;
  }

  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(current.length));

  await editor.edit(
    (editBuilder) => {
      editBuilder.replace(fullRange, text);
    },
    { undoStopBefore: false, undoStopAfter: false }
  );
}

function buildStreamingMarkdown(
  uri: vscode.Uri,
  finding: Finding,
  enableThinking: boolean,
  thinking: string,
  content: string,
  status: string
): string {
  const safeThinking = (thinking || '').trim();
  const safeContent = (content || '').trim();

  const thinkingSection =
    enableThinking && safeThinking
      ? `\n\n## Thinking\n\n\`\`\`\n${safeThinking}\n\`\`\`\n`
      : '';

  return (
    `# AI Fix (Streaming)\n\n` +
    `- Status: ${status}\n` +
    `- File: \`${uri.fsPath}\`\n` +
    `- Rule ID: \`${finding.rule_id}\`\n` +
    `- Severity: \`${finding.severity}\`\n` +
    `- Title: ${finding.title}\n` +
    `- Provider: \`${finding.provider}\`\n` +
    thinkingSection +
    `\n\n## Output\n\n${safeContent}\n`
  );
}

function getWorkspaceRoot(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    return folder.uri.fsPath;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || vscode.workspace.rootPath || '';
}

function getCodeSnippet(document: vscode.TextDocument, finding: Finding): string {
  const { getCodeSnippet } = require('../utils/fileUtils');
  return getCodeSnippet(document, finding);
}

async function openSuggestion(
  uri: vscode.Uri,
  finding: Finding,
  suggestion: string,
  code: string,
  thinking?: string
) {
  const markdown = buildSuggestionMarkdown(uri, finding, suggestion, code, thinking);
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: markdown,
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function buildSuggestionMarkdown(
  uri: vscode.Uri,
  finding: Finding,
  suggestion: string,
  code: string,
  thinking?: string
): string {
  const languageHint = guessCodeFenceLanguage(uri.fsPath);
  const safeThinking = (thinking || '').trim();
  const thinkingBlock = safeThinking ? `\n\n## Thinking\n\n\`\`\`\n${safeThinking}\n\`\`\`\n` : '';
  const codeBlock = code.trim()
    ? `\n\n## Fix Code\n\n\`\`\`${languageHint}\n${code}\n\`\`\`\n`
    : '';

  return (
    `# AI Fix Suggestion\n\n` +
    `- File: \`${uri.fsPath}\`\n` +
    `- Rule ID: \`${finding.rule_id}\`\n` +
    `- Severity: \`${finding.severity}\`\n` +
    `- Title: ${finding.title}\n\n` +
    thinkingBlock +
    `\n\n## Suggestion\n\n${suggestion.trim()}\n` +
    codeBlock
  );
}

function guessCodeFenceLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'typescript';
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) {
    return 'javascript';
  }
  if (lower.endsWith('.py')) {
    return 'python';
  }
  if (lower.endsWith('.rs')) {
    return 'rust';
  }
  if (lower.endsWith('.java')) {
    return 'java';
  }
  return '';
}

async function applyBestEffort(
  editor: vscode.TextEditor,
  finding: Finding,
  originalSnippet: string,
  replacement: string
): Promise<boolean> {
  const document = editor.document;
  const fixedCode = normalizeReplacement(replacement);
  if (!fixedCode) {
    vscode.window.showWarningMessage('AI fix did not return code. Opening suggestion instead.');
    return false;
  }

  const confirmed = await vscode.window.showWarningMessage(
    'Apply AI fix by replacing code in the editor? (Best effort; please review before saving)',
    { modal: true },
    'Apply'
  );
  if (confirmed !== 'Apply') {
    return false;
  }

  const fullText = document.getText();
  const snippet = originalSnippet.trim();

  let replaceRange: vscode.Range | null = null;
  if (snippet) {
    const index = fullText.indexOf(snippet);
    if (index !== -1 && fullText.indexOf(snippet, index + snippet.length) === -1) {
      replaceRange = new vscode.Range(
        document.positionAt(index),
        document.positionAt(index + snippet.length)
      );
    }
  }

  if (!replaceRange) {
    const lineIndex = clamp((finding.location?.line ?? 1) - 1, 0, document.lineCount - 1);
    replaceRange = document.lineAt(lineIndex).range;
  }

  const applied = await editor.edit((editBuilder) => {
    editBuilder.replace(replaceRange!, fixedCode);
  });

  if (!applied) {
    return false;
  }

  // Best-effort formatting: try to format only the inserted range first, then fall back to full document.
  try {
    const startOffset = document.offsetAt(replaceRange!.start);
    const endOffset = startOffset + fixedCode.length;
    const insertedRange = new vscode.Range(replaceRange!.start, document.positionAt(endOffset));
    await formatBestEffort(editor, insertedRange);
  } catch (error) {
    console.warn('[GitAI SAST] Failed to format AI fix:', error);
  }

  return true;
}

function normalizeReplacement(replacement: string): string {
  let code = replacement ?? '';
  // Keep leading indentation (don't use trim()), but remove accidental leading blank lines and trailing whitespace.
  code = code.replace(/^\n+/, '');
  code = code.replace(/\s+$/, '');
  return code;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getFormattingOptions(editor: vscode.TextEditor): vscode.FormattingOptions {
  const tabSizeRaw = editor.options.tabSize;
  const tabSize = typeof tabSizeRaw === 'number' && Number.isFinite(tabSizeRaw) ? tabSizeRaw : 2;
  const insertSpaces = editor.options.insertSpaces === true;

  return {
    tabSize,
    insertSpaces,
  };
}

async function formatBestEffort(editor: vscode.TextEditor, range: vscode.Range): Promise<void> {
  const uri = editor.document.uri;
  const options = getFormattingOptions(editor);

  const rangeEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    'vscode.executeFormatRangeProvider',
    uri,
    range,
    options
  );

  if (Array.isArray(rangeEdits) && rangeEdits.length > 0) {
    const edit = new vscode.WorkspaceEdit();
    edit.set(uri, rangeEdits);
    await vscode.workspace.applyEdit(edit);
    return;
  }

  const docEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    'vscode.executeFormatDocumentProvider',
    uri,
    options
  );

  if (Array.isArray(docEdits) && docEdits.length > 0) {
    const edit = new vscode.WorkspaceEdit();
    edit.set(uri, docEdits);
    await vscode.workspace.applyEdit(edit);
  }
}
