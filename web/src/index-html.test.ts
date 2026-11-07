import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import { PROVIDER_COLORS } from "./lib/providers.ts";
import favicon from "../public/favicon.svg?raw";

const doc = new DOMParser().parseFromString(html, "text/html");
// Files in web/public, which Vite copies to the site root.
const publicFiles = Object.keys(import.meta.glob("../public/*")).map((f) => f.replace("../public", ""));

describe("index.html", () => {
  it("links icons that exist in web/public", () => {
    const hrefs = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"]);
    for (const href of hrefs) expect(publicFiles).toContain(href);
  });

  it("uses the meta description for link previews", () => {
    const content = (selector: string) => doc.querySelector(selector)?.getAttribute("content");
    const description = content('meta[name="description"]');
    expect(description).toBeTruthy();
    expect(content('meta[property="og:description"]')).toBe(description);
    expect(content('meta[property="og:title"]')).toBe(doc.title);
  });

  // docker/web-entrypoint.sh edits these with sed when SITE_URL is set.
  it("has the lines the entrypoint edits for SITE_URL", () => {
    expect(html.split("</head>")).toHaveLength(2);
    expect(html.split('<meta name="twitter:card" content="summary" />')).toHaveLength(2);
    expect(publicFiles).toContain("/og-image.png");
  });

  it("draws the icon in the provider colours", () => {
    for (const color of Object.values(PROVIDER_COLORS)) expect(favicon).toContain(`stroke="${color}"`);
  });
});
