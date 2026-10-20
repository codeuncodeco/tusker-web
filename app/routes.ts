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
    // A task opens over the board or the view it was opened from, as a
    // modal, and the page behind stays drawn. See ADR-0039.
    route("me", "routes/me.tsx", [route("t/:n", "routes/task.tsx", { id: "me-task" })]),
    route("me/focus", "routes/me.focus.tsx", [route("t/:n", "routes/task.tsx", { id: "focus-task" })]),
    route("me/week", "routes/me.week.tsx", [route("t/:n", "routes/task.tsx", { id: "week-task" })]),
    // The same page for a named week, so a person can read back a week they
    // planned. A key no calendar holds is a 404.
    route("me/week/:week", "routes/me.week.tsx", { id: "me-week-week" }),
    route("me/plan", "routes/me.plan.tsx", [route("t/:n", "routes/task.tsx", { id: "plan-task" })]),
    // The same page for a named day, so a person can read back the day they
    // planned. One file, because two lists that sort differently go wrong.
    route("me/plan/:day", "routes/me.plan.tsx", { id: "me-plan-day" }),
    route("account", "routes/account.tsx"),
    route("orgs", "routes/orgs.tsx"),
    route("orgs/new", "routes/orgs.new.tsx"),
  ]),

  // Every page of an org opens over its board, as a modal, and the board stays
  // drawn behind it. See ADR-0039.
  route("o/:slug", "layouts/org.tsx", [
    route("board", "routes/board.tsx", [
      route("t/:n", "routes/task.tsx", { id: "board-task" }),
      // The org's clients, and one client's notes and links. See ADR-0036.
      route("clients", "routes/clients.tsx"),
      route("clients/:client", "routes/client.tsx"),
      route("decisions", "routes/decisions.tsx"),
      route("archive", "routes/archive.tsx"),
      route("fields", "routes/fields.tsx"),
      route("members", "routes/members.tsx"),
      route("settings", "routes/settings.tsx"),
    ]),
    // The pages' old addresses, sent on to the board they now open over, so
    // a mailed link and a bookmark still land.
    route("*", "routes/org-page.ts"),
  ]),

  // One task, named by its number and no org, so a rename breaks no link to
  // it. The layout finds the org from the task. See ADR-0030.
  route("t/:n", "layouts/task.tsx", [index("routes/task.tsx")]),

  // The org select's road with no script: a GET form that redirects to the
  // board it names. See ADR-0029.
  route("go", "routes/go.ts"),

  // What the global search answers as a person types. See ADR-0038.
  route("search", "routes/search.ts"),

  // Where the colour scheme control sends a pick. See #223.
  route("colour-scheme", "routes/colour-scheme.ts"),

  route("api/auth/*", "routes/api.auth.ts"),
  route("api/tasks", "routes/api.tasks.ts"),
  route("api/invite", "routes/invite.ts"),
] satisfies RouteConfig;
