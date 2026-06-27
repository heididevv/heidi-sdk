import {
  HEIDI_APP_USER_HEADER,
  HEIDI_DATA_API_BASE_PATH,
  HEIDI_DATA_WRITE_KEY_HEADER,
  HeidiError,
  type HeidiAccessTokenProvider,
  type HeidiAggregateResult,
  type HeidiAggregateSpec,
  type HeidiAppUser,
  type HeidiListResult,
  type HeidiQuery,
  type HeidiRecord
} from "./types.js";

export type HeidiDataConfig = {
  /** A signed-in app user's access token (enables per-user policies). */
  accessToken?: HeidiAccessTokenProvider;
  /** An app user asserted by a trusted backend (requires `writeKey`). */
  appUser?: HeidiAppUser;
  /** Heidi origin, e.g. "https://heidi.dev". Default: same origin. */
  baseUrl?: string;
  /** Injectable fetch (SSR / tests). Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** The Heidi project id this app is bound to. */
  projectId: string;
  /** The project data API key (required for writes / non-public reads). */
  writeKey?: string;
};

export type HeidiDataClient = {
  aggregate: (
    collection: string,
    spec: HeidiAggregateSpec,
    query?: HeidiQuery
  ) => Promise<HeidiAggregateResult>;
  collection: (collection: string) => HeidiCollectionClient;
  count: (collection: string, query?: HeidiQuery) => Promise<number>;
  get: (collection: string, recordKey: string) => Promise<HeidiRecord | null>;
  insert: (
    collection: string,
    data: Record<string, unknown>,
    options?: { recordKey?: string }
  ) => Promise<HeidiRecord>;
  list: (collection: string, query?: HeidiQuery) => Promise<HeidiListResult>;
  remove: (collection: string, recordKey: string) => Promise<{ deleted: boolean }>;
  update: (
    collection: string,
    recordKey: string,
    data: Record<string, unknown>
  ) => Promise<HeidiRecord>;
};

export type HeidiCollectionClient = {
  aggregate: (
    spec: HeidiAggregateSpec,
    query?: HeidiQuery
  ) => Promise<HeidiAggregateResult>;
  count: (query?: HeidiQuery) => Promise<number>;
  get: (recordKey: string) => Promise<HeidiRecord | null>;
  insert: (
    data: Record<string, unknown>,
    options?: { recordKey?: string }
  ) => Promise<HeidiRecord>;
  list: (query?: HeidiQuery) => Promise<HeidiListResult>;
  remove: (recordKey: string) => Promise<{ deleted: boolean }>;
  update: (
    recordKey: string,
    data: Record<string, unknown>
  ) => Promise<HeidiRecord>;
};

const seg = encodeURIComponent;

/**
 * Create a Heidi Data client. Reads/writes a project's collections through the
 * Heidi runtime Data API, enforced by Heidi's policy engine.
 *
 * ```ts
 * const heidi = createHeidiData({ projectId: "...", accessToken });
 * const { records } = await heidi.list("Post", { sort: [{ field: "createdAt", direction: "desc" }] });
 * await heidi.insert("Post", { title: "Hello" });
 * ```
 */
export function createHeidiData(config: HeidiDataConfig): HeidiDataClient {
  if (!config.projectId) {
    throw new Error("createHeidiData requires a projectId.");
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("createHeidiData requires a fetch implementation.");
  }
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const root = `${base}${HEIDI_DATA_API_BASE_PATH}/${seg(config.projectId)}`;

  async function request<T>(
    path: string,
    init?: RequestInit & { write?: boolean }
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    const token =
      typeof config.accessToken === "function"
        ? await config.accessToken()
        : config.accessToken;
    const hasToken = token != null && token.trim() !== "";
    const hasKey = config.writeKey != null && config.writeKey.trim() !== "";

    if (init?.write === true && !hasToken && !hasKey) {
      throw new HeidiError("A writeKey or access token is required for writes.", 401);
    }
    if (hasToken) {
      headers.set("authorization", `Bearer ${token as string}`);
    }
    if (hasKey) {
      headers.set(HEIDI_DATA_WRITE_KEY_HEADER, config.writeKey as string);
      if (config.appUser) {
        headers.set(HEIDI_APP_USER_HEADER, JSON.stringify(config.appUser));
      }
    }
    if (init?.body != null) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(`${root}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { error?: string })
      | null;
    if (!response.ok || payload == null || payload.ok !== true) {
      throw new HeidiError(
        (payload?.error as string | undefined) ?? `Heidi Data error (${response.status}).`,
        response.status
      );
    }
    return payload as T;
  }

  function qs(query?: HeidiQuery, extra?: Record<string, string>) {
    const params = new URLSearchParams(extra);
    if (query && Object.keys(query).length > 0) {
      params.set("q", JSON.stringify(query));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  const client: HeidiDataClient = {
    async aggregate(collection, spec, query) {
      return await request<HeidiAggregateResult>(`/${seg(collection)}/aggregate`, {
        body: JSON.stringify({ ...spec, query }),
        method: "POST"
      });
    },
    collection(collection) {
      return {
        aggregate: (spec, query) => client.aggregate(collection, spec, query),
        count: (query) => client.count(collection, query),
        get: (recordKey) => client.get(collection, recordKey),
        insert: (data, options) => client.insert(collection, data, options),
        list: (query) => client.list(collection, query),
        remove: (recordKey) => client.remove(collection, recordKey),
        update: (recordKey, data) => client.update(collection, recordKey, data)
      };
    },
    async count(collection, query) {
      const r = await request<{ total: number }>(
        `/${seg(collection)}${qs(query, { count: "1" })}`
      );
      return r.total;
    },
    async get(collection, recordKey) {
      const r = await request<{ record: HeidiRecord | null }>(
        `/${seg(collection)}/${seg(recordKey)}`
      );
      return r.record;
    },
    async insert(collection, data, options) {
      const r = await request<{ record: HeidiRecord }>(`/${seg(collection)}`, {
        body: JSON.stringify({ data, recordKey: options?.recordKey }),
        method: "POST",
        write: true
      });
      return r.record;
    },
    async list(collection, query) {
      return await request<HeidiListResult>(`/${seg(collection)}${qs(query)}`);
    },
    async remove(collection, recordKey) {
      const r = await request<{ deleted: boolean }>(
        `/${seg(collection)}/${seg(recordKey)}`,
        { method: "DELETE", write: true }
      );
      return { deleted: r.deleted };
    },
    async update(collection, recordKey, data) {
      const r = await request<{ record: HeidiRecord }>(
        `/${seg(collection)}/${seg(recordKey)}`,
        { body: JSON.stringify({ data }), method: "PATCH", write: true }
      );
      return r.record;
    }
  };

  return client;
}
