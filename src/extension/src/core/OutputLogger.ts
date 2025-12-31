import * as vscode from 'vscode';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

let channel: vscode.OutputChannel | undefined;

export function initOutputLogger(context: vscode.ExtensionContext): void {
  if (channel) {
    return;
  }

  channel = vscode.window.createOutputChannel('GitAI SAST');
  context.subscriptions.push(channel);
}

export function showOutputLogger(preserveFocus = true): void {
  ensureChannel().show(preserveFocus);
}

export function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toISOString();
  ensureChannel().appendLine(`[${timestamp}] [${level}] ${message}`);
}

export function debug(message: string): void {
  log('DEBUG', message);
}

export function info(message: string): void {
  log('INFO', message);
}

export function warn(message: string): void {
  log('WARN', message);
}

export function error(message: string): void {
  log('ERROR', message);
}

function ensureChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('GitAI SAST');
  }
  return channel;
}

