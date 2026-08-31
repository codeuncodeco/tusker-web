import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("bootstrap", "routes/bootstrap.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("me", "routes/me.tsx"),
  route("o/:slug/board", "routes/board.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("api/invite", "routes/invite.ts"),
] satisfies RouteConfig;
