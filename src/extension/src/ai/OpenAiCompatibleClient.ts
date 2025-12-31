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

  const payload = {
    model,
    messages,
    temperature: options.temperature,
    stream: false,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiKey?.trim()) {
    headers['Authorization'] = `Bearer ${options.apiKey.trim()}`;
  }

  debugLog?.(`[OpenAI-compatible] POST ${apiUrl}`);
  debugLog?.(
    `[OpenAI-compatible] model=${model} temperature=${options.temperature ?? 'default'} timeoutMs=${options.timeoutMs}`
  );
  debugLog?.(`[OpenAI-compatible] requestBody=${truncateForLog(JSON.stringify(payload), debugMaxChars)}`);

  const response = await postJson(apiUrl, headers, payload, options.timeoutMs, debugLog, debugMaxChars);
  debugLog?.(`[OpenAI-compatible] responseBody=${truncateForLog(JSON.stringify(response), debugMaxChars)}`);
  const content: unknown = response?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI-compatible response missing choices[0].message.content');
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
