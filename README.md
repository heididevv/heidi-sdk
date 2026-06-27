# heidi-sdk

The official **Heidi SDK** — typed, dependency-free clients for **Heidi Data**
(CMS/data) and **Heidi App Auth** (OAuth 2.1 sign-in) in any app.

- Zero dependencies (uses the platform `fetch` + Web Crypto).
- Works in the browser, in serverless/edge functions, and at build time.
- Talks to the Heidi runtime APIs at your Heidi origin (default `https://heidi.dev`).

```sh
npm install heidi-sdk
```

## Heidi Data

```ts
import { createHeidiData } from "heidi-sdk";

const heidi = createHeidiData({
  projectId: "<your project id>",
  // a signed-in user's token (per-user policies), or a project writeKey for a trusted backend
  accessToken: () => session?.accessToken
});

// Query DSL: filter / sort / search / paginate / include references
const { records, nextCursor, hasMore } = await heidi.list("Post", {
  filters: [{ field: "published", op: "eq", value: true }],
  sort: [{ field: "createdAt", direction: "desc" }],
  limit: 20
});

const post = await heidi.get("Post", "hello-world");
const created = await heidi.insert("Post", { title: "Hello", body: "..." });
await heidi.update("Post", created.recordKey, { title: "Hi" });
await heidi.remove("Post", created.recordKey);
const total = await heidi.count("Post");

// Collection-scoped helper
const posts = heidi.collection("Post");
await posts.list();
```

Access is governed by Heidi's policy engine. `public_read` collections are
readable with no credentials; everything else needs a signed-in user
(`accessToken`) or a project `writeKey`. For `owner` / `team` collections, a
signed-in user's lists are automatically scoped to their own rows.

## Heidi App Auth

Sign your app's **end users** in against Heidi's OAuth 2.1 server (Authorization
Code + PKCE). Get the `projectId`, `clientId`, and `redirectUri` from your Heidi
project's auth settings.

### Email (one-time code)

```ts
import { createHeidiAuth } from "heidi-sdk";

const auth = createHeidiAuth({ projectId, clientId, redirectUri });

await auth.startEmailSignIn("you@example.com");
const tokens = await auth.completeEmailSignIn("you@example.com", code); // HeidiTokenSet
```

### Google / GitHub (redirect)

```ts
// Kick off:
window.location.href = await auth.beginGoogleSignIn(); // or beginGithubSignIn()

// Back on your redirectUri page:
const tokens = await auth.completeRedirectSignIn();
```

### Use the token with Heidi Data

```ts
const heidi = createHeidiData({ projectId, accessToken: tokens.accessToken });
```

Refresh when it expires (15-minute access tokens, rotating refresh):

```ts
const fresh = await auth.refresh(tokens.refreshToken);
```

## Heidi Files

Upload, list, and delete files at runtime. Files are stored by Heidi and served
from a public URL; access is gated like Heidi Data (pass a signed-in user's
`accessToken` or the project `writeKey`).

```ts
import { createHeidiFiles } from "heidi-sdk";

const files = createHeidiFiles({ projectId, accessToken: tokens.accessToken });

const asset = await files.upload(file, { filename: "avatar.png" });
console.log(asset.url); // -> public URL

await files.list();
await files.remove(asset.assetId);
```

## Agents (MCP)

Because Heidi Auth is built on OAuth 2.1 + the discovery RFCs, a Heidi project's
data is also reachable by AI agents over MCP at `/api/mcp/v1/:projectId`,
authenticated with the same tokens. No extra client needed.

## API

- `createHeidiData(config)` → `{ list, get, insert, update, remove, count, collection }`
- `createHeidiAuth(config)` → `{ startEmailSignIn, completeEmailSignIn, completeMagicLink, beginGoogleSignIn, beginGithubSignIn, completeRedirectSignIn, refresh }`
- `createHeidiFiles(config)` → `{ upload, list, remove }`
- Types: `HeidiQuery`, `HeidiRecord`, `HeidiListResult`, `HeidiTokenSet`, `HeidiAsset`, `HeidiError`, …

## License

MIT
