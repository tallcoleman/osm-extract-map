import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { type Connect, defineConfig, type Plugin } from "vite";

const repoRoot = path.resolve(import.meta.dirname, "..");
const TYPES: Record<string, string> = { ".json": "application/json", ".geojson": "application/geo+json" };

/**
 * Dev and preview only: serves /data/ from the local release (DATA_DIR/current),
 * the way nginx serves it in production.
 */
function serveData(): Plugin {
  const root = path.resolve(repoRoot, process.env.DATA_DIR || "data", "current");
  const install = (middlewares: Connect.Server) =>
      middlewares.use("/data/", async (req, res, next) => {
        const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
        const file = path.resolve(root, `.${rel}`);
        if (!file.startsWith(root + path.sep)) return next();
        try {
          if (!(await stat(file)).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
  return {
    name: "serve-data",
    configureServer: (server) => void install(server.middlewares),
    configurePreviewServer: (server) => void install(server.middlewares),
  };
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), serveData()],
  // MapLibre loads its worker from a file next to its own module. Pre-bundling
  // moves the module into node_modules/.vite/deps/ without that file.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // MapLibre alone is about 1.1 MB minified (300 KB gzipped).
  build: { chunkSizeWarningLimit: 1200 },
});
