import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = [
  "src/components/cerebro/*.tsx",
  "src/components/aurora/personalities-panel.tsx",
];

function findFiles(): string[] {
  const out: string[] = [];
  for (const p of FILES) {
    if (p.includes("*")) {
      const dir = path.join(ROOT, p.split("*")[0].slice(0, -1));
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
      for (const f of files) out.push(path.join(dir, f));
    } else {
      out.push(path.join(ROOT, p));
    }
  }
  return Array.from(new Set(out));
}

describe("textos no cortados en botones", () => {
  it("no usa truncate/line-clamp/whitespace-nowrap en etiquetas de button/Button", () => {
    const files = findFiles();
    const errores: string[] = [];
    const regexTag = /<(button|Button)([^>]*?)>/gs;
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      let m: RegExpExecArray | null;
      while ((m = regexTag.exec(content)) !== null) {
        const open = m[0];
        const attrs = m[2];
        if (/className\s*=\s*\{[^}]*\}/.test(open) || /className="[^"]*"/.test(open)) {
          // extract className string literal or identifier; simple check for keywords in the whole tag
          if (/truncate/.test(open) || /line-clamp-/.test(open) || /whitespace-nowrap/.test(open)) {
            const line = content.substring(0, m.index).split("\n").length;
            errores.push(`${path.relative(ROOT, file)}:${line}`);
          }
        }
      }
    }
    expect(errores).toEqual([]);
  });
});
