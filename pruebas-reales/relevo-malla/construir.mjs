// Empaqueta el banco del relevo con esbuild: `node construir.mjs [raiz-del-repo] [salida.js]` (REL1111I).
// Entra el código REAL de la malla (transporte universal, motor de relevo, motor de archivos, sello de archivos, cifrado por
// destinatario e identidad de malla) y el canal de señalización de llamadas; lo demás (Supabase, la app nativa, React, la
// biblioteca…) se sustituye por un módulo vacío. Con un árbol sin relevo (p. ej. main de antes) el motor de relevo llega vacío.
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
const CARPETAS = ["src/lib/malla/relevo/"].map((f) => path.join(raiz, f));
const ARCHIVOS = [
  "src/lib/malla/transporte-universal.ts",
  "src/lib/malla/eleccion-enlace.ts",
  "src/lib/malla/conectores/planificador-vias.ts",
  "src/lib/malla/conectores/fichas.ts",
  "src/lib/malla/canal-sellado.ts",
  "src/lib/malla/cifrado-archivo.ts",
  "src/lib/malla/recepcion-sellada.ts",
  "src/lib/malla/ajustes-vias-archivo.ts",
  "src/lib/malla/rele-bidireccional.ts",
  "src/lib/malla/rele-archivo.ts",
  "src/lib/network/archivos-malla.ts",
  "src/lib/network/inspeccion-archivos.ts",
  "src/lib/network/archivos-diagnostico.ts",
  "src/ai/astraura/mesh/recipient-crypto.ts",
  "src/ai/astraura/mesh/mesh-identity.ts",
  "src/ai/astraura/mesh/camr/planificador.ts",
  "src/lib/safe-storage.ts",
  "src/lib/malla/preparacion-archivo.ts",
  "src/lib/malla/preparacion-archivo-nucleo.ts",
  "src/lib/malla/cristal/centinela.ts",
  "src/lib/malla/cristal/resonancias.ts",
  "src/lib/malla/cristal/centinela-archivos.ts",
  "src/lib/llamadas/canal-enlace-transporte.ts",
  "src/lib/llamadas/presencia.ts",
  "src/lib/llamadas/negociacion.ts",
  "src/lib/llamadas/tipos.ts",
].map((f) => path.join(raiz, f));
const permitido = (p) => ARCHIVOS.includes(p) || CARPETAS.some((c) => p.startsWith(c));

await esbuild.build({
  entryPoints: [path.join(aqui, "entrada.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: salida,
  logLevel: "error",
  plugins: [
    {
      name: "banco",
      setup(b) {
        b.onResolve({ filter: /^@\// }, (a) => {
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
