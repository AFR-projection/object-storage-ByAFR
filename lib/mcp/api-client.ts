/**
 * HTTP client for Storage ByAFR REST API (MCP + integrations).
 */

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export class StorageApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  static fromEnv(): StorageApiClient {
    const baseUrl = (process.env.STORAGE_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
      .trim()
      .replace(/\/$/, "");
    const apiKey = (process.env.STORAGE_API_KEY ?? "").trim();

    if (!baseUrl) throw new Error("STORAGE_API_URL is required");
    if (!apiKey) throw new Error("STORAGE_API_KEY is required");
    if (!apiKey.startsWith("sk_") && !apiKey.startsWith("skm_")) {
      throw new Error("STORAGE_API_KEY must start with sk_ or skm_");
    }

    return new StorageApiClient(baseUrl, apiKey);
  }

  static fromKey(baseUrl: string, apiKey: string): StorageApiClient {
    return new StorageApiClient(baseUrl.replace(/\/$/, ""), apiKey.trim());
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const json = (await res.json()) as ApiResponse<T>;

    if (!res.ok || !json.success) {
      throw new Error(json.error ?? `HTTP ${res.status}`);
    }

    return json.data as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  del<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}

export function toolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}
