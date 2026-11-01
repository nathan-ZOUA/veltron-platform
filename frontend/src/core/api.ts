// Client HTTP VELTRON : sépare strictement les jetons des 3 espaces (passager, agence, supervision).

export type Realm = "passenger" | "agency" | "platform";

const TOKEN_KEYS: Record<Realm, string> = {
  passenger: "veltron-pax-token",
  agency: "veltron-agency-token",
  platform: "veltron-platform-token",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function getToken(realm: Realm = "passenger"): string | null {
  try {
    return localStorage.getItem(TOKEN_KEYS[realm]);
  } catch {
    return null;
  }
}

export function setToken(token: string | null, realm: Realm = "passenger") {
  try {
    if (token) localStorage.setItem(TOKEN_KEYS[realm], token);
    else localStorage.removeItem(TOKEN_KEYS[realm]);
  } catch {
    /* stockage privé indisponible */
  }
}

interface Options {
  method?: string;
  body?: unknown;
  realm?: Realm | null;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const realm: Realm | null =
    options.realm !== undefined
      ? options.realm
      : path.startsWith("/agency") || path.startsWith("/desk")
        ? "agency"
        : path.startsWith("/platform")
          ? "platform"
          : "passenger";

  const token = realm ? getToken(realm) : null;
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "error",
      data?.message ?? "Une erreur est survenue.",
      data ?? {},
    );
  }
  return data as T;
}
