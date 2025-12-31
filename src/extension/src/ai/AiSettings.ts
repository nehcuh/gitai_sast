/**
 * AI 配置项扩展
 *
 * 这个文件定义了 package.json 中需要的 AI 配置项
 * 使用方法：复制配置对象到 package.json 的 configuration.properties 中
 */

export const AI_CONFIG_PROPERTIES = {
  'gitai.sast.ai.provider': {
    type: 'string',
    enum: ['auto', 'disabled', 'vscode', 'openaiCompatible', 'copilotAgent'],
    default: 'auto',
    description:
      'AI provider for generating fix suggestions (default: auto)',
  },
  'gitai.sast.ai.autoDetectPriority': {
    type: 'array',
    items: {
      type: 'string',
      enum: ['copilotAgent', 'vscode', 'openaiCompatible'],
    },
    default: ['copilotAgent', 'vscode', 'openaiCompatible'],
    description:
      'Priority order for auto-detecting AI providers (default: copilotAgent, vscode, openaiCompatible)',
  },
  // ... 其他配置项与 package.json 保持一致
};

/**
 * 更新 package.json 的辅助函数
 *
 * 使用方法：
 * const config = getAiConfigJson();
 * // 将 config 合并到 package.json 的 configuration.properties 中
 */
export function getAiConfigJson(): string {
  return JSON.stringify(AI_CONFIG_PROPERTIES, null, 2);
}
