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
    ],
    coverage: {
      provider: "v8",
      include: ["updater/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "updater/explore/**", "updater/cli.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
