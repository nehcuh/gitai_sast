import * as vscode from 'vscode';
import { AiFixProvider } from '../ai/AiFixProvider';
import { Finding } from '../core/types';

export function registerAiFixCommand(
  context: vscode.ExtensionContext,
  aiFixProvider: AiFixProvider
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
      const extraContext = {
        file: uri.fsPath,
        languageId: document.languageId,
      };

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating AI fix...',
            cancellable: false,
          },
          async () => aiFixProvider.generateFix(finding, codeSnippet, extraContext)
        );

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
          await openSuggestion(uri, finding, result.suggestion, result.code);
          return;
        }

        if (selection === 'Apply (best effort)') {
          const applied = await applyBestEffort(editor, finding, codeSnippet, result.code);
          if (applied) {
            vscode.window.showInformationMessage('AI fix applied');
          } else {
            await openSuggestion(uri, finding, result.suggestion, result.code);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`AI Fix failed: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

function getCodeSnippet(document: vscode.TextDocument, finding: Finding): string {
  const snippet = finding.code_snippet?.trim();
  if (snippet) {
    return snippet;
  }

  const lineIndex = clamp((finding.location?.line ?? 1) - 1, 0, document.lineCount - 1);
  const before = 6;
  const after = 6;

  const startLine = Math.max(0, lineIndex - before);
  const endLine = Math.min(document.lineCount - 1, lineIndex + after);
  const endChar = document.lineAt(endLine).text.length;

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, endChar)
  );

  return document.getText(range);
}

async function openSuggestion(
  uri: vscode.Uri,
  finding: Finding,
  suggestion: string,
  code: string
) {
  const markdown = buildSuggestionMarkdown(uri, finding, suggestion, code);
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
  code: string
): string {
  const languageHint = guessCodeFenceLanguage(uri.fsPath);
  const codeBlock = code.trim()
    ? `\n\n## Fix Code\n\n\`\`\`${languageHint}\n${code}\n\`\`\`\n`
    : '';

  return (
    `# AI Fix Suggestion\n\n` +
    `- File: \`${uri.fsPath}\`\n` +
    `- Rule ID: \`${finding.rule_id}\`\n` +
    `- Severity: \`${finding.severity}\`\n` +
    `- Title: ${finding.title}\n\n` +
    `## Suggestion\n\n${suggestion.trim()}\n` +
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
