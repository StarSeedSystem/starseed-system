import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("manifest xr", () => {
  const manifestPath = path.resolve(__dirname, "../../../../public/manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
    start_url: string;
    scope: string;
    display: string;
    shortcuts?: Array<{ url: string; short_name?: string; description?: string; icons?: Array<{ src: string }> }>;
    icons: Array<{ src: string }>;
  };

  it("es JSON válido y start_url dentro de scope", () => {
    expect(manifest).toBeDefined();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("tiene shortcuts VR y AR", () => {
    expect(manifest.shortcuts).toBeDefined();
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts!.length).toBeGreaterThanOrEqual(2);
    const vr = manifest.shortcuts!.find(s => s.url === "/xr/os?modo=vr");
    const ar = manifest.shortcuts!.find(s => s.url === "/xr/os?modo=ar");
    expect(vr).toBeDefined();
    expect(ar).toBeDefined();
    expect(vr?.short_name).toBeDefined();
    expect(ar?.short_name).toBeDefined();
    expect(vr?.description).toBeDefined();
    expect(ar?.description).toBeDefined();
    expect(vr?.icons?.[0]?.src).toBe("/starseed-symbol-192.png");
    expect(ar?.icons?.[0]?.src).toBe("/starseed-symbol-192.png");
  });

  it("iconos referenciados existen en public", () => {
    const icons = manifest.icons.map((i: { src: string }) => i.src);
    const shortcutIcons = manifest.shortcuts?.flatMap(s => s.icons?.map((i: { src: string }) => i.src) || []) || [];
    for (const src of icons.concat(shortcutIcons)) {
      const p = path.resolve(__dirname, "../../../../public", src.replace(/^\//, ""));
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  it("no cambia scope/start_url/display", () => {
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("script empaquetar-quest.sh existe y es válido", () => {
    const scriptPath = path.resolve(__dirname, "../../../../scripts/xr/empaquetar-quest.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content.startsWith("#!/bin/bash")).toBe(true);
    expect(content).toContain("STARSEED_QUEST_PACKAGE");
    expect(content).toContain("STARSEED_QUEST_MANIFEST_URL");
    expect(content).toContain("STARSEED_QUEST_MODE");
    expect(content).toContain("bubblewrap init --manifest");
    expect(content).toContain("bubblewrap build");
    expect(content).toContain("assetlinks.json");
    expect(content).toContain("--ayuda");
    expect(content).not.toContain("password");
  });
});
