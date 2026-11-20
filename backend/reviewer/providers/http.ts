// One POST to an AI provider's API, shared by the providers. Throws on
// anything but a successful JSON answer, so the reviewer counts it as a
// failure and moves on (reviewer.ts). The key goes in a header only, and
// error messages never include it or the student's text.
export class ProviderError extends Error {
  // The HTTP status, when the API answered with one: 429 means out of free
  // requests for now, 401/403 a wrong key or one without permission. And
  // whether the API answered, but not in the form asked for (`invalid`).
  readonly status?: number;
  readonly invalid: boolean;
  constructor(message: string, status?: number, invalid = false) {
    super(message);
    this.status = status;
    this.invalid = invalid;
  }
}

export const postJson = async (
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal
): Promise<unknown> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    // 429: out of free requests for now; 401/403: the key is wrong or lacks
    // permission. The status is all that's logged.
    throw new ProviderError(`HTTP ${response.status}`, response.status);
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
