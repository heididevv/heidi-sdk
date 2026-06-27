import { HeidiError, type HeidiTokenSet } from "./types.js";

export type HeidiAuthConfig = {
  /** Heidi origin, e.g. "https://heidi.dev". Default: same origin. */
  baseUrl?: string;
  /** The OAuth client id registered for this app (operator-provisioned). */
  clientId: string;
  /** Injectable fetch (SSR / tests). Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** The Heidi project id this app is bound to. */
  projectId: string;
  /** The app's registered redirect URI (where social sign-in returns). */
  redirectUri: string;
};

const PKCE_KEY = "heidi_pkce_verifier";

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(48);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64Url(new Uint8Array(digest));
}

/**
 * Create a Heidi App Auth client to sign in your app's end users against Heidi's
 * OAuth 2.1 server. Email OTP flow:
 *
 * ```ts
 * const auth = createHeidiAuth({ projectId, clientId, redirectUri });
 * await auth.startEmailSignIn(email);
 * const tokens = await auth.completeEmailSignIn(email, code); // -> HeidiTokenSet
 * ```
 *
 * Social (Google/GitHub) uses a redirect:
 *
 * ```ts
 * window.location.href = await auth.beginGoogleSignIn();
 * // on return to redirectUri:
 * const tokens = await auth.completeRedirectSignIn();
 * ```
 */
export function createHeidiAuth(config: HeidiAuthConfig) {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");

  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { error?: string; error_description?: string })
      | null;
    if (!response.ok || payload == null) {
      throw new HeidiError(
        (payload?.error_description as string | undefined) ??
          (payload?.error as string | undefined) ??
          `Heidi Auth error (${response.status}).`,
        response.status
      );
    }
    return payload as T;
  }

  function toTokenSet(raw: Record<string, unknown>): HeidiTokenSet {
    return {
      accessToken: String(raw.access_token),
      expiresIn: Number(raw.expires_in ?? 0),
      refreshToken: String(raw.refresh_token),
      scope: String(raw.scope ?? "")
    };
  }

  async function exchange(loginTicket: string): Promise<HeidiTokenSet> {
    const verifier = randomVerifier();
    const codeChallenge = await challengeFor(verifier);
    const authorized = await call<{ code: string }>("/api/auth/authorize", {
      clientId: config.clientId,
      codeChallenge,
      codeChallengeMethod: "S256",
      loginTicket,
      projectId: config.projectId,
      redirectUri: config.redirectUri
    });
    const tokens = await call<Record<string, unknown>>("/api/auth/token", {
      client_id: config.clientId,
      code: authorized.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    });
    return toTokenSet(tokens);
  }

  async function socialUrl(provider: "google" | "github"): Promise<string> {
    const verifier = randomVerifier();
    const codeChallenge = await challengeFor(verifier);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(PKCE_KEY, verifier);
    }
    const params = new URLSearchParams({
      client_id: config.clientId,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      project_id: config.projectId,
      redirect_uri: config.redirectUri
    });
    return `${base}/api/auth/oauth/${provider}/start?${params.toString()}`;
  }

  return {
    /** Email a sign-in code (and magic link) to the address. */
    async startEmailSignIn(email: string): Promise<{ ok: true }> {
      await call("/api/auth/email/start", { email, projectId: config.projectId });
      return { ok: true };
    },
    /** Complete email sign-in with the emailed OTP code. */
    async completeEmailSignIn(email: string, code: string): Promise<HeidiTokenSet> {
      const verified = await call<{ login_ticket: string }>("/api/auth/email/verify", {
        code,
        email,
        projectId: config.projectId
      });
      return await exchange(verified.login_ticket);
    },
    /** Complete email sign-in from a magic-link token. */
    async completeMagicLink(token: string): Promise<HeidiTokenSet> {
      const verified = await call<{ login_ticket: string }>("/api/auth/email/verify", {
        projectId: config.projectId,
        token
      });
      return await exchange(verified.login_ticket);
    },
    /** URL to redirect to for Google sign-in. */
    beginGoogleSignIn: () => socialUrl("google"),
    /** URL to redirect to for GitHub sign-in. */
    beginGithubSignIn: () => socialUrl("github"),
    /**
     * On return from a social redirect, exchange the `?code` on the current URL
     * using the stashed PKCE verifier. Returns null if there is no code.
     */
    async completeRedirectSignIn(): Promise<HeidiTokenSet | null> {
      if (typeof window === "undefined") return null;
      const code = new URL(window.location.href).searchParams.get("code");
      if (code == null) return null;
      const verifier =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem(PKCE_KEY)
          : null;
      if (verifier == null) {
        throw new HeidiError("Missing PKCE verifier for redirect.", 400);
      }
      const tokens = await call<Record<string, unknown>>("/api/auth/token", {
        client_id: config.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri
      });
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(PKCE_KEY);
      return toTokenSet(tokens);
    },
    /** Rotate a refresh token for a fresh access token. */
    async refresh(refreshToken: string): Promise<HeidiTokenSet> {
      const tokens = await call<Record<string, unknown>>("/api/auth/token", {
        grant_type: "refresh_token",
        refresh_token: refreshToken
      });
      return toTokenSet(tokens);
    }
  };
}
