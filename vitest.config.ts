import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "updater",
          environment: "node",
          include: ["updater/**/*.test.ts", "shared/**/*.test.ts"],
          setupFiles: ["test/network-guard.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          // Lets contrast.test.ts read styles.css (vitest stubs CSS otherwise).
          css: { include: [/styles\.css/] },
          include: ["web/src/**/*.test.{ts,tsx}"],
          setupFiles: ["test/network-guard.ts", "web/src/test/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["updater/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "updater/explore/**", "updater/cli.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
