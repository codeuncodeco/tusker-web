import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

/**
 * Four layouts, one per kind of page: the signed-out pages, the person axis,
 * the org axis and one task. The tree carries the model, so the header is
 * drawn once and the org is loaded once. See ADR-0011.
 */
export default [
  layout("layouts/signed-out.tsx", [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("bootstrap", "routes/bootstrap.tsx"),
    route("reset-password", "routes/reset-password.tsx"),
  ]),

  layout("layouts/person.tsx", [
    route("me", "routes/me.tsx"),
    route("me/focus", "routes/me.focus.tsx"),
    route("me/week", "routes/me.week.tsx"),
    // The same page for a named week, so a person can read back a week they
    // planned. A key no calendar holds is a 404.
    route("me/week/:week", "routes/me.week.tsx", { id: "me-week-week" }),
    route("me/plan", "routes/me.plan.tsx"),
    // The same page for a named day, so a person can read back the day they
    // planned. One file, because two lists that sort differently go wrong.
    route("me/plan/:day", "routes/me.plan.tsx", { id: "me-plan-day" }),
    route("account", "routes/account.tsx"),
    route("orgs", "routes/orgs.tsx"),
    route("orgs/new", "routes/orgs.new.tsx"),
  ]),

  route("o/:slug", "layouts/org.tsx", [
    route("board", "routes/board.tsx"),
    route("fields", "routes/fields.tsx"),
    route("decisions", "routes/decisions.tsx"),
    route("archive", "routes/archive.tsx"),
    route("members", "routes/members.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),

  // One task, named by its number and no org, so a rename breaks no link to
  // it. The layout finds the org from the task. See ADR-0030.
  route("t/:n", "layouts/task.tsx", [index("routes/task.tsx")]),

  // The org select's road with no script: a GET form that redirects to the
  // board it names. See ADR-0029.
  route("go", "routes/go.ts"),

  route("api/auth/*", "routes/api.auth.ts"),
  route("api/tasks", "routes/api.tasks.ts"),
  route("api/invite", "routes/invite.ts"),
] satisfies RouteConfig;
