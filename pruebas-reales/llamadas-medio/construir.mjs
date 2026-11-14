// Empaqueta el banco con esbuild: `node construir.mjs [raiz-del-repo] [salida.js] [raiz-del-lado-B]`.
// LLA1114B: con un tercer árbol, el lado B (la tableta) corre el código de ESE árbol (`@b/…` en `entrada.ts`) y el lado A
// el del primero: dos builds distintas en la misma llamada (escenario de versiones mezcladas). Sin él, `@b/` es el mismo
// árbol (el mismo módulo: el paquete no cambia).
// Solo entra el código de src/lib/llamadas (motor, voz por datos, negociación…); lo demás (Supabase, la app nativa,
// el registro de aparatos) se sustituye por un módulo vacío: el banco no lo necesita y así no hace falta instalar nada.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(process.argv[2] ?? path.join(aqui, "../.."));
const salida = path.resolve(process.argv[3] ?? path.join(aqui, "salida/banco.js"));
const raizB = path.resolve(process.argv[4] ?? raiz); // LLA1114B
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
// LLA1114B: los dos árboles (el de A y el de B) valen igual.
const RAICES = raizB === raiz ? [raiz] : [raiz, raizB];
const PERMITIDOS = RAICES.map((r) => path.join(r, "src/lib/llamadas") + path.sep);
// MLL1111C: las dos piezas de la malla que usa el motor (señales de red) y el timbre (cola), y el sustituto del motor de
// permisos de Aurora (no entra en el paquete).
// LLA1112A: y la llamada directa con su registro de enlaces locales (caso `wifi-cae`).
// LLA1114B: y la build que corre (pura; el sello `web=` y el anuncio de capacidades la leen).
const MALLA_PERMITIDA = RAICES.flatMap((r) => ["src/lib/pwa/build-corriendo.ts", "src/lib/malla/senales-red.ts", "src/lib/malla/cola-timbre.ts", "src/lib/malla/llamada-directa.ts", "src/lib/malla/registro-enlaces-locales.ts"].map((f) => path.join(r, f)));
const SUSTITUTOS = { "@/lib/aurora/senses/request-permission": path.join(aqui, "shim-permisos.ts") };
const permitido = (p) => (PERMITIDOS.some((x) => p.startsWith(x)) || MALLA_PERMITIDA.includes(p)) && !NO.some((r) => r.test(p));
/** LLA1114B: el árbol al que pertenece un archivo que importa (`@/…` dentro del árbol de B se resuelve en el de B). */
const raizDe = (importer) => (raizB !== raiz && importer && !importer.startsWith(aqui + path.sep) && importer.startsWith(raizB + path.sep) && !(raiz.startsWith(raizB + path.sep) && importer.startsWith(raiz + path.sep)) ? raizB : raiz);
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
        // LLA1114B: `@b/…` (solo en `entrada.ts`): el módulo del árbol del lado B.
        b.onResolve({ filter: /^@b\// }, (a) => {
          const p = resolverTs(path.join(raizB, "src", a.path.slice(3)));
          if (!p || !permitido(p)) return { path: a.path, namespace: "vacio" };
          return { path: p };
        });
        b.onResolve({ filter: /^@\// }, (a) => {
          if (SUSTITUTOS[a.path]) return { path: SUSTITUTOS[a.path] };
          const p = resolverTs(path.join(raizDe(a.importer), "src", a.path.slice(2)));
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
        // LLA1113A: los temporizadores de la PÁGINA que usa el motor (setInterval/setTimeout sueltos) pasan por
        // `globalThis.__bancoT` si el banco lo define: así el banco los hace «lentos» (alineados a 1 s, como WebKit con la
        // página oculta o tapada) sin tocar los suyos (el carril simulado, el oído). Los de un Worker no pasan por aquí.
        b.onLoad({ filter: /\.tsx?$/ }, (a) => {
          if (!permitido(a.path)) return undefined;
          const fuente = fs.readFileSync(a.path, "utf8");
          const g = "((globalThis as any).__bancoT ?? globalThis)";
          const cuna =
            `const setInterval = ((f: any, ms?: number, ...x: any[]) => ${g}.setInterval(f, ms, ...x)) as any;` +
            `const setTimeout = ((f: any, ms?: number, ...x: any[]) => ${g}.setTimeout(f, ms, ...x)) as any;` +
            `const clearInterval = ((id: any) => ${g}.clearInterval(id)) as any;` +
            `const clearTimeout = ((id: any) => ${g}.clearTimeout(id)) as any;\n`;
          return { contents: cuna + fuente, loader: a.path.endsWith(".tsx") ? "tsx" : "ts" };
        });
        b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({
          contents: "module.exports = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : k === 'default' ? undefined : () => undefined });",
          loader: "js",
        }));
      },
    },
  ],
});
console.log("banco listo:", path.relative(process.cwd(), salida), "desde", raiz, raizB !== raiz ? `(lado B desde ${raizB})` : "");
