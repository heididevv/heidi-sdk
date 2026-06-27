/** Shared types for the Heidi SDK. */

export const HEIDI_DATA_API_BASE_PATH = "/api/data/v1";
export const HEIDI_DATA_WRITE_KEY_HEADER = "x-heidi-data-key";
export const HEIDI_APP_USER_HEADER = "x-heidi-app-user";

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
