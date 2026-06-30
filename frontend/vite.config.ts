// @lovable.dev/vite-tanstack-config already provides TanStack Start, React,
// Tailwind, tsconfig paths, Nitro, env injection, and app aliases.
// Keep extra config scoped to runtime stability only.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    optimizeDeps: {
      force: true,
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
  },
});
