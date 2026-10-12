export interface ServerInfo {
  url: string;
  token?: string;
  port?: number;
}

let cachedServerInfo: ServerInfo | null = null;
let resolvePromise: Promise<ServerInfo> | null = null;

export async function resolveServerInfo(): Promise<ServerInfo> {
  if (cachedServerInfo) {
    return cachedServerInfo;
  }

  if (resolvePromise) {
    return resolvePromise;
  }

  resolvePromise = (async () => {
    if (window.nativeApi?.getServerInfo) {
      try {
        const info = await window.nativeApi.getServerInfo();
        if (info && info.url) {
          cachedServerInfo = {
            url: info.url,
            token: info.token,
            port: info.port,
          };
          return cachedServerInfo;
        }
      } catch (err) {
        console.warn("Failed to get dynamic server info from nativeApi:", err);
      }
    }

    const fallbackUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:38880";
    cachedServerInfo = {
      url: fallbackUrl,
    };
    return cachedServerInfo;
  })();

  return resolvePromise;
}

export async function serverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { url, token } = await resolveServerInfo();
  let pathStr =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  let targetUrl: string;
  if (pathStr.startsWith("http://") || pathStr.startsWith("https://")) {
    try {
      const parsed = new URL(pathStr);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        const dynamicParsed = new URL(url);
        parsed.protocol = dynamicParsed.protocol;
        parsed.hostname = dynamicParsed.hostname;
        parsed.port = dynamicParsed.port;
        targetUrl = parsed.toString();
      } else {
        targetUrl = pathStr;
      }
    } catch {
      targetUrl = pathStr;
    }
  } else {
    targetUrl = `${url}${pathStr.startsWith("/") ? "" : "/"}${pathStr}`;
  }

  const headers = new Headers(
    init?.headers ??
      (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined),
  );
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(targetUrl, {
    ...init,
    headers,
  });
}

export interface AvailableModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

export async function fetchModels(): Promise<AvailableModel[]> {
  try {
    const res = await serverFetch("/models");
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: AvailableModel[] };
    return Array.isArray(data?.models) ? data.models : [];
  } catch (err) {
    console.warn("fetchModels failed:", err);
    return [];
  }
}

export interface PersonaInfo {
  id: string;
  name: string;
}

export async function fetchPersonas(): Promise<PersonaInfo[]> {
  try {
    const res = await serverFetch("/personas");
    if (!res.ok) return [];
    const data = (await res.json()) as { personas?: PersonaInfo[] };
    return Array.isArray(data?.personas) ? data.personas : [];
  } catch (err) {
    console.warn("fetchPersonas failed:", err);
    return [];
  }
}
