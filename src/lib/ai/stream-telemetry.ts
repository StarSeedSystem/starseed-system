export interface SseTelemetryState {
  fullText: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SseLineResult {
  delta: string;
  inputTokens?: number;
  outputTokens?: number;
  done: boolean;
}

interface SseUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface SseChoiceDelta {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: SseUsagePayload | null;
  error?: { message?: string };
}

export function parseSseLine(
  raw: string,
  opts: { ignoreComments?: boolean; errorPrefix?: string },
): SseLineResult | null {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("data:")) {
    if (opts.ignoreComments && trimmed.startsWith(":")) return null;
    return null;
  }
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return { delta: "", done: true };
  let obj: SseChoiceDelta;
  try {
    obj = JSON.parse(payload);
  } catch {
    return null;
  }
  if (opts.errorPrefix && obj?.error?.message) {
    throw new Error(`${opts.errorPrefix}: ${obj.error.message}`);
  }
  const delta = obj?.choices?.[0]?.delta?.content ?? "";
  const inputTokens = obj?.usage?.prompt_tokens ?? undefined;
  const outputTokens = obj?.usage?.completion_tokens ?? undefined;
  return { delta, inputTokens, outputTokens, done: false };
}

export function applySseChunk(state: SseTelemetryState, result: SseLineResult): void {
  if (result.delta) state.fullText += result.delta;
  if (result.inputTokens != null) state.inputTokens = result.inputTokens;
  if (result.outputTokens != null) state.outputTokens = result.outputTokens;
}

export function telemetryToResponse(state: SseTelemetryState): {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
} {
  return state.inputTokens != null || state.outputTokens != null
    ? { text: state.fullText, usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens } }
    : { text: state.fullText };
}

export function createTelemetryState(): SseTelemetryState {
  return { fullText: "" };
}