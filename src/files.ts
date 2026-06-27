import {
  HEIDI_DATA_WRITE_KEY_HEADER,
  HEIDI_FILE_NAME_HEADER,
  HEIDI_FILES_API_BASE_PATH,
  HeidiError,
  type HeidiAccessTokenProvider,
  type HeidiAsset
} from "./types.js";

export type HeidiFilesConfig = {
  /** A signed-in app user's access token. */
  accessToken?: HeidiAccessTokenProvider;
  /** Heidi origin, e.g. "https://heidi.dev". Default: same origin. */
  baseUrl?: string;
  /** Injectable fetch (SSR / tests). Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** The Heidi project id this app is bound to. */
  projectId: string;
  /** The project data API key (required for non-public file access). */
  writeKey?: string;
};

export type HeidiFilesClient = {
  /** List the project's uploaded files (most recent first). */
  list: () => Promise<HeidiAsset[]>;
  /** Delete a file by its asset id. */
  remove: (assetId: string) => Promise<{ deleted: boolean }>;
  /** Upload a file; returns the stored asset (including its public `url`). */
  upload: (
    file: Blob | ArrayBuffer | Uint8Array,
    options?: { contentType?: string; filename?: string }
  ) => Promise<HeidiAsset>;
};

/**
 * Create a Heidi Files client for a generated app. Uploads/lists/deletes files
 * through the Heidi Files API; files are stored in R2 and served from a public
 * URL. Access is gated like Heidi Data — pass a signed-in user's `accessToken`
 * or the project `writeKey`; anonymous callers are denied.
 */
export function createHeidiFiles(config: HeidiFilesConfig): HeidiFilesClient {
  if (config.projectId == null || config.projectId.trim() === "") {
    throw new Error("createHeidiFiles requires a projectId.");
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const root = `${base}${HEIDI_FILES_API_BASE_PATH}/${encodeURIComponent(config.projectId)}`;

  async function authHeaders(): Promise<Headers> {
    const headers = new Headers();
    const token =
      typeof config.accessToken === "function"
        ? await config.accessToken()
        : config.accessToken;
    if (token != null && token.trim() !== "") {
      headers.set("authorization", `Bearer ${token}`);
    }
    if (config.writeKey != null && config.writeKey.trim() !== "") {
      headers.set(HEIDI_DATA_WRITE_KEY_HEADER, config.writeKey);
    }
    return headers;
  }

  async function readJson<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { error?: string })
      | null;
    if (!response.ok || payload == null || payload.ok !== true) {
      throw new HeidiError(
        payload?.error ?? `Heidi Files error (${response.status}).`,
        response.status
      );
    }
    return payload as T;
  }

  return {
    async upload(file, options) {
      const headers = await authHeaders();
      const filename =
        options?.filename ?? (file as { name?: string }).name ?? "file";
      headers.set(HEIDI_FILE_NAME_HEADER, filename || "file");
      const contentType =
        options?.contentType ?? (file instanceof Blob ? file.type : "") ?? "";
      if (contentType !== "") {
        headers.set("content-type", contentType);
      }
      const body =
        file instanceof Uint8Array ? new Uint8Array(file) : (file as BodyInit);
      const response = await fetchImpl(`${root}/upload`, {
        body,
        headers,
        method: "POST"
      });
      const result = await readJson<{ asset: HeidiAsset }>(response);
      return result.asset;
    },

    async list() {
      const headers = await authHeaders();
      const response = await fetchImpl(`${root}/assets`, { headers });
      const result = await readJson<{ assets: HeidiAsset[] }>(response);
      return result.assets;
    },

    async remove(assetId) {
      const headers = await authHeaders();
      const response = await fetchImpl(
        `${root}/assets/${encodeURIComponent(assetId)}`,
        { headers, method: "DELETE" }
      );
      const result = await readJson<{ deleted: boolean }>(response);
      return { deleted: result.deleted };
    }
  };
}
