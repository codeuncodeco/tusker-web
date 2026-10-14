import type { Config } from "@react-router/dev/config";

export default {
  // The sandbox runs every loader and action in the browser. See `sandbox/`.
  ssr: false,
  // React Router picks a route's split chunks from the file on disk, before
  // `sandbox/vite-plugin.ts` adds the client exports, so a split route would
  // lose its loader. One chunk per route keeps them.
  splitRouteModules: false,
} satisfies Config;
