// Secrets are not in `wrangler.jsonc`, so `wrangler types` cannot see them.
// These declarations merge with the two `Env` shapes the generated file writes:
// the global one the Worker takes, and `Cloudflare.Env` that `cloudflare:workers`
// hands a test.
interface Secrets {
  /** Signs sessions and tokens. Set it with `wrangler secret put BETTER_AUTH_SECRET --env dev`. */
  BETTER_AUTH_SECRET: string;
  /** The Resend key. Unset means mail goes to the log instead. */
  RESEND_API_KEY?: string;
  /** Guards `POST /api/invite`. Unset means the endpoint answers 404. */
  INVITE_TOKEN?: string;
}

interface Env extends Secrets {}

declare namespace Cloudflare {
  interface Env extends Secrets {}
}
