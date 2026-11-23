// One POST to an AI provider's API, shared by the providers. Throws on
// anything but a successful JSON answer, so the reviewer counts it as a
// failure and moves on (reviewer.ts). The key goes in a header only, and
// error messages never include it or the student's text.
export class ProviderError extends Error {
  // The HTTP status, when the API answered with one: 429 means out of free
  // requests for now, 401/403 a wrong key or one without permission. And
  // whether the API answered, but not in the form asked for (`invalid`).
  // `detail` is the API's own error codes and messages, for the logs (never
  // the key or the student's text).
  readonly status?: number;
  readonly invalid: boolean;
  readonly detail?: string;
  constructor(message: string, status?: number, invalid = false, detail?: string) {
    super(message);
    this.status = status;
    this.invalid = invalid;
    this.detail = detail;
  }
}

export const postJson = async (
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal,
  // A provider whose error answers say more than their status can read
  // them here, and give the status to count it as (cloudflare.ts reads an
  // "out of free requests" answer as 429 whatever its status), and say what
  // the error was, for the logs (detailOf)
  {
    statusOf,
    detailOf,
  }: { statusOf?: (errorBody: unknown, status: number) => number; detailOf?: (errorBody: unknown) => string | undefined } = {}
): Promise<unknown> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    // 429: out of free requests for now; 401/403: the key is wrong or lacks
    // permission. Only the status and the provider's own error codes and
    // messages (detailOf) are logged, nothing else from the answer.
    const errorBody = statusOf || detailOf ? await response.json().catch(() => null) : null;
    const status = statusOf ? statusOf(errorBody, response.status) : response.status;
    throw new ProviderError(`HTTP ${status}`, status, false, detailOf?.(errorBody));
  }
  return response.json();
};

// A model's text answer, read as JSON if it is JSON (some APIs hand back the
// structured answer as an object, some as text)
export const asJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
