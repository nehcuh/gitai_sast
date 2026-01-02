import * as vscode from 'vscode';
import { Finding } from '../core/types';

/**
 * Get code snippet for a finding
 * Attempts to use the cached snippet first, then falls back to reading from the document
 */
export function getCodeSnippet(document: vscode.TextDocument, finding: Finding): string {
    const snippet = finding.code_snippet?.trim();
    if (snippet) {
        return snippet;
    }

    // Fallback: Read from document based on location
    // Ensure line number is within bounds (1-indexed input)
    const lineIndex = clamp((finding.location?.line ?? 1) - 1, 0, document.lineCount - 1);

    // Context lines
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

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
