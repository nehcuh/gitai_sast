/**
 * Chat 命令处理器接口
 */
export interface ChatCommandHandler {
  /**
   * 处理命令
   */
  handle(
    request: any,
    context: any,
    stream: any,
    token: any
  ): Promise<any>;
}
