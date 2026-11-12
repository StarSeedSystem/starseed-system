// Empaqueta el banco con esbuild: `node construir.mjs [raiz-del-repo] [salida.js]`.
// Solo entra el código de src/lib/llamadas (motor, voz por datos, negociación…); lo demás (Supabase, la app nativa,
// el registro de aparatos) se sustituye por un módulo vacío: el banco no lo necesita y así no hace falta instalar nada.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(process.argv[2] ?? path.join(aqui, "../.."));
const salida = path.resolve(process.argv[3] ?? path.join(aqui, "salida/banco.js"));
const require = createRequire(import.meta.url);
let esbuild;
for (const c of ["esbuild", "/opt/npm-tools/node_modules/esbuild/lib/main.js"]) {
  try {
    esbuild = require(c);
    break;
  } catch {
    /* siguiente */
  }
}
if (!esbuild) throw new Error("Falta esbuild (npm i -g esbuild)");

const resolverTs = (p) => {
  for (const e of ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".js"]) if (fs.existsSync(p + e) && fs.statSync(p + e).isFile()) return p + e;
  return null;
};
const PERMITIDO = path.join(raiz, "src/lib/llamadas") + path.sep;
// MLL1111C: las dos piezas de la malla que usa el motor (señales de red) y el timbre (cola), y el sustituto del motor de
// permisos de Aurora (no entra en el paquete).
// LLA1112A: y la llamada directa con su registro de enlaces locales (caso `wifi-cae`).
const MALLA_PERMITIDA = ["src/lib/malla/senales-red.ts", "src/lib/malla/cola-timbre.ts", "src/lib/malla/llamada-directa.ts", "src/lib/malla/registro-enlaces-locales.ts"].map((f) => path.join(raiz, f));
const SUSTITUTOS = { "@/lib/aurora/senses/request-permission": path.join(aqui, "shim-permisos.ts") };
const permitido = (p) => (p.startsWith(PERMITIDO) || MALLA_PERMITIDA.includes(p)) && !NO.some((r) => r.test(p));
const NO = [/\/superficie\//, /\/nativa\//];

await esbuild.build({
  entryPoints: [path.join(aqui, "entrada.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: salida,
  logLevel: "warning",
  plugins: [
    {
      name: "banco",
      setup(b) {
        b.onResolve({ filter: /^@\// }, (a) => {
          if (SUSTITUTOS[a.path]) return { path: SUSTITUTOS[a.path] };
          const p = resolverTs(path.join(raiz, "src", a.path.slice(2)));
          if (!p || !permitido(p)) return { path: a.path, namespace: "vacio" };
          return { path: p };
        });
        b.onResolve({ filter: /^\.\.?\// }, (a) => {
          if (a.importer.startsWith(aqui)) return undefined;
          const p = resolverTs(path.resolve(path.dirname(a.importer), a.path));
          if (!p || !permitido(p)) return { path: a.path, namespace: "vacio" };
          return { path: p };
        });
        b.onResolve({ filter: /^[^./@]|^@[^/]/ }, (a) => ({ path: a.path, namespace: "vacio" }));
        b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({
          contents: "module.exports = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : k === 'default' ? undefined : () => undefined });",
          loader: "js",
        }));
      },
    },
  ],
});
console.log("banco listo:", path.relative(process.cwd(), salida), "desde", raiz);
