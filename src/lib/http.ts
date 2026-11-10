/**
 * Small fetch wrappers that parse JSON and turn non-2xx responses into
 * errors carrying the platform's own error body (invaluable when debugging).
 */
export async function requestJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${new URL(url).pathname} → ${res.status}: ${text.slice(0, 600)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** POST application/x-www-form-urlencoded (what every OAuth token endpoint expects). */
export function postForm<T = any>(url: string, params: Record<string, string>): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

/** POST a JSON body with a bearer token. */
export function postJson<T = any>(url: string, accessToken: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
