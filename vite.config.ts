import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { sandbox } from "./sandbox/vite-plugin";

// The sandbox builds static files and no Worker, so the Cloudflare plugin is
// gone. `sandbox()` comes before React Router, which reads what it rewrites.
export default defineConfig({
  plugins: [sandbox(), tailwindcss(), reactRouter(), tsconfigPaths()],
});
