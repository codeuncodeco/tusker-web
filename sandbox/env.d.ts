// The sandbox's Wrangler config binds no D1, so `wrangler types` writes an
// `Env` with no `DB`. The browser database stands in for it, as the same type.
// The tests' `Cloudflare.Env` takes it too: Vitest's Workers pool still binds
// a real D1 there.
interface SandboxBindings {
  DB: D1Database;
  /** A plain variable on `main`. The sandbox sends no mail, but the mailer names it. */
  MAIL_FROM: string;
}

interface Env extends SandboxBindings {}

declare namespace Cloudflare {
  interface Env extends SandboxBindings {}
}
