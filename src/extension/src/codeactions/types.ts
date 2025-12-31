import * as vscode from 'vscode';

/**
 * SAST Code Action 类型
 */
export enum SastCodeActionKind {
  AiFix = 'gitai.sast.aiFix',
  ExplainInChat = 'gitai.sast.explainInChat',
  ShowDetails = 'gitai.sast.showDetails',
  ViewTaintPath = 'gitai.sast.viewTaintPath',
  IgnoreOccurrence = 'gitai.sast.ignoreOccurrence',
  IgnoreInFile = 'gitai.sast.ignoreInFile',
  IgnoreGlobally = 'gitai.sast.ignoreGlobally',
}

/**
 * SAST Code Action 元数据
 */
export interface SastCodeActionMetadata {
  kind: SastCodeActionKind;
  title: string;
  icon?: string;
  isPreferred?: boolean;
  condition?: (finding: any) => boolean;
}

/**
 * SAST Code Action 配置
 */
export const SAST_CODE_ACTIONS: SastCodeActionMetadata[] = [
  {
    kind: SastCodeActionKind.AiFix,
    title: 'AI Fix: {title}',
    icon: '$(sparkle)',
    isPreferred: true,
  },
  {
    kind: SastCodeActionKind.ExplainInChat,
    title: 'Ask AI to explain vulnerability',
    icon: '$(comment-discussion)',
  },
  {
    kind: SastCodeActionKind.ShowDetails,
    title: 'Show vulnerability details',
    icon: '$(info)',
  },
  {
    kind: SastCodeActionKind.ViewTaintPath,
    title: 'View taint analysis path',
    icon: '$(graph)',
    condition: (finding) => finding.provider === 'remote',
  },
  {
    kind: SastCodeActionKind.IgnoreOccurrence,
    title: 'Ignore this occurrence',
    icon: '$(eye-closed)',
  },
  {
    kind: SastCodeActionKind.IgnoreInFile,
    title: 'Ignore rule in this file',
    icon: '$(file)',
  },
  {
    kind: SastCodeActionKind.IgnoreGlobally,
    title: 'Ignore rule globally',
    icon: '$(globe)',
  },
];
