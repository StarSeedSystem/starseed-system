import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
const v = process.argv[2];
const base = process.env.VEN_BASE || "/home/claude/ven1111d";
const root = `${base}/${v}`, h = `${base}/harness`, out = `${base}/out/${v}`;
fs.mkdirSync(out, { recursive: true });
let g = fs.readFileSync(`${root}/src/app/globals.css`, "utf8");
const i0 = g.indexOf("@keyframes ss-dialogo-entra {"), i1 = g.indexOf("/* Coreografía al cambiar de página");
let extra = g.slice(i0, i1);
const iv = g.indexOf("/* VEN1111D");
if (iv >= 0) extra += "\n" + g.slice(iv);
fs.writeFileSync(`${out}/in.css`, fs.readFileSync(`${h}/harness.css`, "utf8") + "\n" + extra);
let cfg = fs.readFileSync(`${root}/tailwind.config.ts`, "utf8");
cfg = cfg.replace(/plugins:\s*\[[^\]]*\]/, "plugins: [require('tailwindcss-animate')]")
  .replace(/content:\s*\[[\s\S]*?\],/, `content: ['${root}/src/**/*.{ts,tsx}', '${h}/entry.tsx'],`);
fs.writeFileSync(`${base}/tw-${v}.config.ts`, cfg);
execSync(`cd ${base} && npx tailwindcss -c tw-${v}.config.ts -i ${out}/in.css -o ${out}/tw.css`, { stdio: "inherit" });
await build({
  entryPoints: [`${h}/entry.tsx`], bundle: true, outfile: `${out}/h.js`, format: "iife", jsx: "automatic",
  loader: { ".css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [`${base}/node_modules`],
  alias: {
    "@/context/appearance-context": `${h}/stub-appearance.tsx`,
    "@/lib/nativa/puente": `${h}/stub-puente.ts`,
    "@/lib/nativa/defectos-antenas-aplicar": `${h}/stub-nada.ts`,
    "@/lib/nativa/permisos-inicio-ejecutor": `${h}/stub-nada.ts`,
    "@": `${root}/src`,
  },
  logLevel: "warning",
});
fs.writeFileSync(`${out}/index.html`, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="tw.css"><link rel="stylesheet" href="h.css"></head><body><div id="root"></div><script src="h.js"></script></body></html>`);
console.log("built", v);
