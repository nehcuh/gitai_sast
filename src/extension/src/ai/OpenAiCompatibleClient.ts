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
    throw new Error('Missing gitai.sast.ai.apiUrl');
  }

  const model = options.model.trim();
  if (!model) {
    throw new Error('Missing gitai.sast.ai.modelName');
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiKey?.trim()) {
    headers['Authorization'] = `Bearer ${options.apiKey.trim()}`;
  }

  debugLog?.(`[OpenAI-compatible] POST ${apiUrl}`);
  debugLog?.(
    `[OpenAI-compatible] model=${model} temperature=${options.temperature ?? 'default'} timeoutMs=${options.timeoutMs} stream=${stream}`
  );
  debugLog?.(`[OpenAI-compatible] requestBody=${truncateForLog(JSON.stringify(payload), debugMaxChars)}`);

  if (stream) {
    const { content, thinking } = await postSseChatCompletion(
      apiUrl,
      headers,
      payload,
      options.timeoutMs,
      options.onDelta,
      options.onThinkingDelta,
      debugLog,
      debugMaxChars
    );

    if (thinking?.trim()) {
      debugLog?.(
        `[OpenAI-compatible] responseThinking=${truncateForLog(thinking, debugMaxChars)}`
      );
    }

    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('OpenAI-compatible streaming response missing content');
    }

    return content;
  }

  const response = await postJson(apiUrl, headers, payload, options.timeoutMs, debugLog, debugMaxChars);
  debugLog?.(`[OpenAI-compatible] responseBody=${truncateForLog(JSON.stringify(response), debugMaxChars)}`);
  const content: unknown = response?.choices?.[0]?.message?.content;
  const thinking: unknown =
    response?.choices?.[0]?.message?.reasoning_content ??
    response?.choices?.[0]?.message?.reasoning ??
    response?.choices?.[0]?.message?.thinking ??
    response?.choices?.[0]?.reasoning_content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI-compatible response missing choices[0].message.content');
  }

  if (typeof thinking === 'string' && thinking.trim()) {
    options.onThinkingDelta?.(thinking);
  }

  return content;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  debugLog?: (line: string) => void,
  debugMaxChars = 12000
): Promise<any> {
  const endpoint = new URL(url);
  const requestBody = JSON.stringify(body);

  const requestHeaders: Record<string, string> = {
    ...headers,
    'Content-Length': Buffer.byteLength(requestBody).toString(),
  };

  const isHttps = endpoint.protocol === 'https:';
  const requestFn = isHttps ? https.request : http.request;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        method: 'POST',
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port ? Number(endpoint.port) : undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        headers: requestHeaders,
      },
      (res) => {
        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const bodyText = chunks.join('');
          const statusCode = res.statusCode ?? 0;

          debugLog?.(
            `[OpenAI-compatible] HTTP ${statusCode} responseText=${truncateForLog(bodyText, debugMaxChars)}`
          );

          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`OpenAI-compatible request failed (HTTP ${statusCode}): ${bodyText}`));
            return;
          }

          try {
            resolve(bodyText ? JSON.parse(bodyText) : {});
          } catch (error) {
            reject(new Error(`Failed to parse OpenAI-compatible JSON response: ${String(error)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`OpenAI-compatible request timed out after ${timeoutMs}ms`));
    });

    req.write(requestBody);
    req.end();
  });
}

function truncateForLog(text: string, maxChars: number): string {
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…(truncated, total=${text.length})`;
}

async function postSseChatCompletion(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  onDelta?: (text: string) => void,
  onThinkingDelta?: (text: string) => void,
  debugLog?: (line: string) => void,
  debugMaxChars = 12000
): Promise<{ content: string; thinking: string }> {
  const endpoint = new URL(url);
  const requestBody = JSON.stringify(body);

  const requestHeaders: Record<string, string> = {
    ...headers,
    Accept: 'text/event-stream',
    'Content-Length': Buffer.byteLength(requestBody).toString(),
  };

  const isHttps = endpoint.protocol === 'https:';
  const requestFn = isHttps ? https.request : http.request;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        method: 'POST',
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port ? Number(endpoint.port) : undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        headers: requestHeaders,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');

        // Some OpenAI-compatible backends may ignore `stream=true` and still return JSON.
        if (contentType.includes('application/json')) {
          const chunks: string[] = [];
          res.setEncoding('utf8');
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const bodyText = chunks.join('');
            debugLog?.(
              `[OpenAI-compatible] HTTP ${statusCode} responseText=${truncateForLog(bodyText, debugMaxChars)}`
            );

            if (statusCode < 200 || statusCode >= 300) {
              reject(new Error(`OpenAI-compatible request failed (HTTP ${statusCode}): ${bodyText}`));
              return;
            }

            try {
              const json = bodyText ? JSON.parse(bodyText) : {};
              const content: unknown = json?.choices?.[0]?.message?.content;
              const thinking: unknown =
                json?.choices?.[0]?.message?.reasoning_content ??
                json?.choices?.[0]?.message?.reasoning ??
                json?.choices?.[0]?.message?.thinking ??
                json?.choices?.[0]?.reasoning_content;

              if (typeof thinking === 'string' && thinking.trim()) {
                onThinkingDelta?.(thinking);
              }

              resolve({
                content: typeof content === 'string' ? content : '',
                thinking: typeof thinking === 'string' ? thinking : '',
              });
            } catch (error) {
              reject(new Error(`Failed to parse OpenAI-compatible JSON response: ${String(error)}`));
            }
          });
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          const chunks: string[] = [];
          res.setEncoding('utf8');
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const bodyText = chunks.join('');
            reject(new Error(`OpenAI-compatible request failed (HTTP ${statusCode}): ${bodyText}`));
          });
          return;
        }

        res.setEncoding('utf8');

        let buffer = '';
        let rawBody = '';
        let content = '';
        let thinking = '';
        let done = false;

        const finish = () => {
          if (done) {
            return;
          }
          done = true;

          // Fallback: some backends may return JSON even when `stream=true` (and without JSON content-type).
          if (!content.trim() && !thinking.trim()) {
            const trimmedBody = rawBody.trim();
            if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
              try {
                const json = trimmedBody ? JSON.parse(trimmedBody) : {};
                const jsonContent: unknown = json?.choices?.[0]?.message?.content;
                const jsonThinking: unknown =
                  json?.choices?.[0]?.message?.reasoning_content ??
                  json?.choices?.[0]?.message?.reasoning ??
                  json?.choices?.[0]?.message?.thinking ??
                  json?.choices?.[0]?.reasoning_content;

                if (typeof jsonThinking === 'string' && jsonThinking.trim()) {
                  thinking = jsonThinking;
                  onThinkingDelta?.(jsonThinking);
                }
                if (typeof jsonContent === 'string' && jsonContent) {
                  content = jsonContent;
                  onDelta?.(jsonContent);
                }
              } catch {
                // Ignore JSON fallback failures; we'll return whatever we've accumulated.
              }
            }
          }
          resolve({ content, thinking });
        };

        const processEvent = (rawEvent: string) => {
          const lines = rawEvent.split(/\r?\n/);
          for (const line of lines) {
            if (!line.startsWith('data:')) {
              continue;
            }
            const data = line.slice('data:'.length).trim();
            if (!data) {
              continue;
            }
            if (data === '[DONE]') {
              finish();
              return;
            }

            let chunk: any;
            try {
              chunk = JSON.parse(data);
            } catch {
              // Some backends may emit non-JSON lines; ignore.
              continue;
            }

            const choice = chunk?.choices?.[0];
            const delta = choice?.delta ?? {};

            const deltaThinking: unknown =
              delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking ?? delta?.analysis;
            if (typeof deltaThinking === 'string' && deltaThinking) {
              thinking += deltaThinking;
              onThinkingDelta?.(deltaThinking);
            }

            const deltaContent: unknown = delta?.content ?? delta?.text;
            if (typeof deltaContent === 'string' && deltaContent) {
              content += deltaContent;
              onDelta?.(deltaContent);
            }

            if (choice?.finish_reason) {
              finish();
              return;
            }
          }
        };

        res.on('data', (chunk: string) => {
          if (done) {
            return;
          }
          rawBody += chunk;
          buffer += chunk;

          // SSE events are separated by a blank line.
          while (true) {
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
              return;
            }
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + sepLength);
            if (rawEvent.trim()) {
              processEvent(rawEvent);
              if (done) {
                return;
              }
            }
          }
        });

        res.on('end', () => {
          if (done) {
            return;
          }
          if (buffer.trim()) {
            processEvent(buffer);
          }
          finish();
        });

        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`OpenAI-compatible request timed out after ${timeoutMs}ms`));
    });

    req.write(requestBody);
    req.end();
  });
}
