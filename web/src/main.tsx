import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import "./maplibre-worker.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
