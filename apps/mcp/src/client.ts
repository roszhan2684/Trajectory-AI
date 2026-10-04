/** Thin typed client for the Trajectory REST API — the MCP server holds no business logic. */
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function createClient(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): ApiClient {
  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": "trajectory-mcp/0.1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      ok: boolean;
      data?: T;
      error?: { code: string; message: string };
    } | null;
    if (!json)
      throw new ApiError(
        "BAD_RESPONSE",
        `Trajectory API returned ${res.status} with no JSON body`,
        res.status,
      );
    if (!json.ok)
      throw new ApiError(json.error?.code ?? "ERROR", json.error?.message ?? "Request failed", res.status);
    return json.data as T;
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}
