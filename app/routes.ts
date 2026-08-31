import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("bootstrap", "routes/bootstrap.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("me", "routes/me.tsx"),
  route("orgs/new", "routes/orgs.new.tsx"),
  route("o/:slug/board", "routes/board.tsx"),
  route("o/:slug/fields", "routes/fields.tsx"),
  route("o/:slug/t/:taskId", "routes/task.tsx"),
  route("o/:slug/members", "routes/members.tsx"),
  route("o/:slug/settings", "routes/settings.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("api/invite", "routes/invite.ts"),
] satisfies RouteConfig;
