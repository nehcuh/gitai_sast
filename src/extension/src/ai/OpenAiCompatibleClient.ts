import * as http from 'http';
import * as https from 'https';

export interface OpenAiCompatibleChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiCompatibleChatOptions {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  timeoutMs: number;
  stream?: boolean;
  onDelta?: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
  debugLog?: (line: string) => void;
  debugMaxChars?: number;
}

export async function createChatCompletion(
  options: OpenAiCompatibleChatOptions,
  messages: OpenAiCompatibleChatMessage[]
): Promise<string> {
  const apiUrl = options.apiUrl.trim();
  if (!apiUrl) {
    throw new Error('Missing gitai.sast.ai.apiUrl - please configure the API URL in settings.');
  }

  const model = options.model.trim();
  if (!model) {
    throw new Error('Missing gitai.sast.ai.modelName - please configure the model name in settings.');
  }

  const debugLog = typeof options.debugLog === 'function' ? options.debugLog : undefined;
  const debugMaxChars =
    typeof options.debugMaxChars === 'number' && Number.isFinite(options.debugMaxChars) && options.debugMaxChars > 0
      ? Math.floor(options.debugMaxChars)
      : 12000;

  const stream = options.stream === true;

  const payload = {
    model,
    messages,
    temperature: options.temperature,
    stream,
  };

  if (stream && options.onThinkingDelta) {
    (payload as any).include_reasoning = true;
  }

  const body = JSON.stringify(payload);
  const url = new URL(apiUrl);

  const requestFn = url.protocol === 'https:' ? https.request : http.request;

  let buffer = '';
  let rawBody = '';

  return new Promise<string>((resolve, reject) => {
    const request = requestFn(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'Authorization': options.apiKey ? `Bearer ${options.apiKey}` : '',
        },
        timeout: options.timeoutMs,
      },
      (response) => {
        let data = '';

        if (response.statusCode !== 200) {
          let errorBody = '';
          response.on('data', (chunk: Buffer) => {
            errorBody += chunk.toString();
          });
          response.on('end', () => {
            let errorMessage = `HTTP ${response.statusCode}: ${response.statusMessage}`;
            if (errorBody) {
              try {
                const parsed = JSON.parse(errorBody);
                if (parsed.error && parsed.error.message) {
                  errorMessage += ` - ${parsed.error.message}`;
                }
              } catch {
                // Ignore malformed JSON error body.
              }
            }
            reject(new Error(errorMessage));
          });
          return;
        }

        if (stream) {
          let buffer = '';
          let fullResponse = '';

          response.on('data', (chunk: Buffer) => {
            buffer += chunk;
            rawBody += chunk;

            // SSE events are separated by a blank line.
            // eslint-disable-next-line no-constant-condition
            for (;;) {
              const lfIndex = buffer.indexOf('\n\n');
              const crlfIndex = buffer.indexOf('\r\n\r\n');

              let sepIndex = -1;
              let sepLength = 0;

              if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
                sepIndex = crlfIndex;
                sepLength = 4;
              } else if (lfIndex !== -1) {
                sepIndex = lfIndex;
                sepLength = 2;
              }

              if (sepIndex === -1) {
                break;
              }

              const eventText = buffer.slice(0, sepIndex);
              buffer = buffer.slice(sepIndex + sepLength);

              for (const line of eventText.split('\n')) {
                if (!line.startsWith('data:')) {
                  continue;
                }

                const dataText = line.slice(5).trim();
                if (dataText === '[DONE]') {
                  if (debugLog) {
                    debugLog(
                      `[AI] Final response (streamed, length=${fullResponse.length}): ${truncateForLog(
                        fullResponse,
                        debugMaxChars
                      )}`
                    );
                  }
                  resolve(fullResponse);
                  return;
                }

                try {
                  const data = JSON.parse(dataText);
                  if (data.choices && data.choices[0]) {
                    const delta = data.choices[0].delta;
                    if (delta.content) {
                      fullResponse += delta.content;
                      if (options.onDelta) {
                        options.onDelta(delta.content);
                      }
                    }
                    if (delta.reasoning && options.onThinkingDelta) {
                      options.onThinkingDelta(delta.reasoning);
                    }
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          });

          response.on('end', () => {
            if (fullResponse.length > 0 && !options.onDelta) {
              // Resolve if not already resolved
              resolve(fullResponse);
            }
          });

          response.on('error', (error) => {
            reject(error);
          });
        } else {
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          response.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]) {
                const content = parsed.choices[0].message.content;
                if (debugLog) {
                  debugLog(
                    `[AI] Final response (non-stream, length=${content.length}): ${truncateForLog(
                      content,
                      debugMaxChars
                    )}`
                  );
                }
                resolve(content);
              } else {
                reject(new Error('Invalid response format'));
              }
            } catch (error) {
              reject(error);
            }
          });
        }
      }
    );

    request.on('error', (error) => {
      // Improve error message for socket hang up
      if (error instanceof Error && error.message === 'socket hang up') {
        reject(new Error(`Connection failed: Could not reach AI API at ${apiUrl}. Please check the API URL and network connection.`));
      } else {
        reject(error);
      }
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Request timeout (${options.timeoutMs}ms) - the AI API did not respond in time.`));
    });

    request.write(body);
    request.end();
  });
}

function truncateForLog(text: string, maxChars: number): string {
  const normalized = text ?? '';
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}…(truncated, total=${normalized.length})`;
}
