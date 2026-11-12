/**
 * LLA1112B · construye la página del banco del dock y la ventana de llamada (esbuild + Tailwind).
 * Uso: node pruebas-reales/llamadas-video/construir.mjs [carpeta-node_modules]
 * Los paquetes que la página no necesita de verdad (Supabase, Tauri…) se sustituyen por un módulo vacío.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../..");
const nm = resolve(process.argv[2] ?? join(raiz, "node_modules"));
const salida = join(aqui, "salida");
const { build } = createRequire(join(nm, "_"))("esbuild");
mkdirSync(salida, { recursive: true });

const EXT = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
const alias = {
  name: "alias-y-vacios",
  setup(b) {
    b.onResolve({ filter: /^@\/context\/appearance-context$/ }, () => ({ path: join(aqui, "apariencia-falsa.tsx") }));
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = join(raiz, "src", a.path.slice(2));
      for (const e of ["", ...EXT]) if (existsSync(base + e) && !(e === "" && !/\.[a-z]+$/.test(base))) return { path: base + e };
      return { path: a.path, namespace: "vacio" };
    });
    // Ficheros fuera de src/ que el banco no trae (config/*.json…): vacíos.
    b.onResolve({ filter: /^\.\.?\// }, (a) => {
      const base = resolve(a.resolveDir, a.path);
      for (const e of ["", ...EXT]) if (existsSync(base + e)) return undefined;
      return { path: base, namespace: "vacio" };
    });
    // Paquetes que no están instalados en el banco: módulo vacío (nunca se usan en este recorrido).
    b.onResolve({ filter: /^[a-z@][^:]*$/ }, (a) => {
      const nombre = a.path.startsWith("@") ? a.path.split("/").slice(0, 2).join("/") : a.path.split("/")[0];
      if (existsSync(join(nm, nombre))) return undefined;
      return { path: a.path, namespace: "vacio" };
    });
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({
      contents: "const p = new Proxy(function(){}, { get: (t, k) => (k === '__esModule' ? false : k === 'default' ? p : k === 'then' ? undefined : p), apply: () => p, construct: () => p }); module.exports = p;",
      loader: "js",
    }));
  },
};

await build({
  entryPoints: [join(aqui, "entrada.tsx")],
  bundle: true,
  format: "esm",
  outfile: join(salida, "banco.js"),
  plugins: [alias],
  nodePaths: [nm],
  jsx: "automatic",
  loader: { ".module.css": "local-css", ".css": "css" },
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  sourcemap: "inline",
  logLevel: "warning",
  target: "chrome120",
});

const cfg = join(salida, "tailwind.config.cjs");
writeFileSync(cfg, `module.exports = { content: [${JSON.stringify(join(raiz, "src/components/{llamadas,layout}/**/*.tsx"))}, ${JSON.stringify(join(aqui, "*.tsx"))}], theme: { extend: {} }, plugins: [] };`);
writeFileSync(join(salida, "entrada.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
execFileSync(process.execPath, [join(nm, "tailwindcss/lib/cli.js"), "-c", cfg, "-i", join(salida, "entrada.css"), "-o", join(salida, "tw.css")], { stdio: "inherit" });
copyFileSync(join(aqui, "index.html"), join(salida, "index.html"));
console.log("banco construido en", salida);
