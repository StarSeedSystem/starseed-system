import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("guardias XR", () => {
  it("no pide camera-access en src/", () => {
    const files = walk("src");
    const hits = files.filter(f => {
      try { return readFileSync(join(ROOT, f), "utf8").includes("camera-access"); } catch { return false; }
    });
    expect(hits).toEqual([]);
  });

  it("emulate solo false o condicionado en almacen-xr.ts", () => {
    const src = readFileSync(join(ROOT, "src/components/xr/shell/almacen-xr.ts"), "utf8");
    const lines = src.split("\n").filter(l => /emulate\s*:/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(l => {
      expect(l).toMatch(/false/);
    });
  });

  it("entrada-global no importa motores pesados", () => {
    const src = readFileSync(join(ROOT, "src/components/xr/shell/entrada-global.tsx"), "utf8");
    const banned = ["three", "@react-three", "@pmndrs", "@dimforge", "@pixiv", "@sparkjsdev"];
    banned.forEach(b => expect(src).not.toMatch(new RegExp(b)));
  });

  it("no hay imports node:* en xr", () => {
    const files = [...walk("src/lib/xr"), ...walk("src/components/xr/shell")];
    const bad = files.filter(f => {
      try { return /from\s+["']node:/.test(readFileSync(join(ROOT, f), "utf8")); } catch { return false; }
    });
    expect(bad).toEqual([]);
  });

  it("src/lib/xr/ <=200 líneas", () => {
    const files = walk("src/lib/xr");
    const over = files.filter(f => readFileSync(join(ROOT, f), "utf8").split("\n").length > 200);
    expect(over).toEqual([]);
  });

  it("módulos xr importados fuera de sus tests", () => {
    const targetDirs = ["src/components/xr/shell", "src/lib/xr"];
    const files: string[] = [];
    for (const d of targetDirs) files.push(...walk(d));
    const allSrc = walk("src");
    const imports = new Map<string, Set<string>>();
    for (const f of allSrc) {
      try {
        const txt = readFileSync(join(ROOT, f), "utf8");
        const matches = [...txt.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
        for (const m of matches) {
          imports.set(m, (imports.get(m) || new Set()).add(f));
        }
      } catch {}
    }
    const unimported = files.filter(f => {
      if (f.endsWith("tipos.ts")) return false;
      if (f.includes("__tests__")) return false;
      const base = f.split("/").pop()?.replace(/\.(ts|tsx)$/, "");
      const found = Array.from(imports.entries()).some(([imp, set]) => imp.includes(base!) && Array.from(set).some(s => s !== f));
      return !found;
    });
    expect(unimported).toEqual([]);
  });
});
