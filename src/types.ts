/** Shared types for the Heidi SDK. */

export const HEIDI_DATA_API_BASE_PATH = "/api/data/v1";
export const HEIDI_FILES_API_BASE_PATH = "/api/files/v1";
export const HEIDI_DATA_WRITE_KEY_HEADER = "x-heidi-data-key";
export const HEIDI_APP_USER_HEADER = "x-heidi-app-user";
export const HEIDI_FILE_NAME_HEADER = "x-heidi-file-name";

export type HeidiFilterOperator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "in";

export type HeidiFilter = {
  field: string;
  op: HeidiFilterOperator;
  value?: unknown;
};

export type HeidiSort = {
  direction: "asc" | "desc";
  field: string;
};

/** The Heidi Data query DSL. */
export type HeidiQuery = {
  cursor?: string;
  filters?: HeidiFilter[];
  include?: string[];
  limit?: number;
  search?: string;
  sort?: HeidiSort[];
};

/** A stored record envelope. `data` is the validated payload. */
export type HeidiRecord = {
  createdAt: string;
  data: Record<string, unknown>;
  recordKey: string;
  revision?: number;
  updatedAt: string;
};

export type HeidiListResult = {
  hasMore: boolean;
  included?: Record<string, Record<string, HeidiRecord | null>>;
  nextCursor: string | null;
  records: HeidiRecord[];
  total: number;
};

export type HeidiAggregateOp = "count" | "sum" | "avg" | "min" | "max";

export type HeidiAggregateSpec = {
  field?: string;
  groupBy?: string;
  op: HeidiAggregateOp;
};

export type HeidiAggregateResult = {
  field: string | null;
  groupBy: string | null;
  groups: { count: number; key: string | null; value: number }[] | null;
  op: HeidiAggregateOp;
  value: number | null;
};

/** A stored file asset. `url` is the world-readable public URL. */
export type HeidiAsset = {
  assetId: string;
  contentType: string;
  createdAt?: string;
  key: string;
  sizeBytes: number | null;
  url: string;
};

/** A signed-in app user's OAuth 2.1 token set. */
export type HeidiTokenSet = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scope: string;
};

/** An app end-user identity asserted by a trusted backend (requires a write key). */
export type HeidiAppUser = {
  id: string;
  roles?: string[];
  teamIds?: string[];
};

export type HeidiAccessTokenProvider =
  | string
  | (() => string | null | undefined | Promise<string | null | undefined>);

export class HeidiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "HeidiError";
  }
}
