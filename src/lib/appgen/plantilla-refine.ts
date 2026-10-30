/**
 * Plantilla «panel de datos» con Refine para el Estudio de Apps (módulo PURO).
 * Refine 5: `useList` devuelve `{ query, result: { data, total } }`; la carga
 * está en `query.isLoading`. Telemetría apagada por las dos vías.
 */

import type { AppFile } from "./appgen";
import { languageForPath } from "./appgen";

export interface RecursoRefine { nombre: string; campos: string[]; }
export interface OpcionesRefine { nombre: string; recursos: RecursoRefine[]; }

const RE_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

function aSlug(texto: string): string {
  const base = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "panel-de-datos";
}

function aPascal(nombre: string): string {
  return nombre.split("-").filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function archivo(path: string, contenido: string): AppFile {
  return { path, content: contenido.endsWith("\n") ? contenido : `${contenido}\n`, language: languageForPath(path) };
}

function pagina(r: RecursoRefine): string {
  const c = `Listado${aPascal(r.nombre)}`;
  const th = r.campos.map((f) => `<th>${f}</th>`).join("");
  const td = r.campos.map((f) => `<td>{String(fila["${f}"] ?? "")}</td>`).join("");
  return `import { useList } from "@refinedev/core";\n\nexport function ${c}() {\n  const { query, result } = useList({ resource: "${r.nombre}" });\n  const datos = result?.data ?? [];\n  return (\n    <section>\n      <h1>${r.nombre}</h1>\n      {query.isLoading ? <p>Cargando…</p> : (\n        <table>\n          <thead><tr>${th}</tr></thead>\n          <tbody>{datos.map((fila: Record<string, unknown>, i: number) => (\n            <tr key={i}>${td}</tr>\n          ))}</tbody>\n        </table>\n      )}\n      <p>{result?.total ?? 0} registros</p>\n    </section>\n  );\n}\n`;
}

function appTsx(recursos: RecursoRefine[]): string {
  const imports = recursos.map((r) => `import { Listado${aPascal(r.nombre)} } from "./paginas/${r.nombre}";`).join("\n");
  const res = recursos.map((r) => `        { name: "${r.nombre}", list: "/${r.nombre}" },`).join("\n");
  const rutas = recursos.map((r) => `          <Route path="/${r.nombre}" element={<Listado${aPascal(r.nombre)} />} />`).join("\n");
  return `import { Refine } from "@refinedev/core";\nimport { dataProvider } from "@refinedev/simple-rest";\nimport { routerProvider } from "@refinedev/react-router";\nimport { BrowserRouter, Route, Routes } from "react-router";\n${imports}\n\nexport default function App() {\n  return (\n    <BrowserRouter>\n      <Refine\n        dataProvider={dataProvider(import.meta.env.VITE_API_URL)}\n        routerProvider={routerProvider}\n        resources={[\n${res}\n        ]}\n        options={{ disableTelemetry: true }}\n      >\n        <Routes>\n${rutas}\n        </Routes>\n      </Refine>\n    </BrowserRouter>\n  );\n}\n`;
}

function leeme(slug: string, recursos: RecursoRefine[]): string {
  const lista = recursos.map((r) => `- ${r.nombre}: ${r.campos.join(", ")}`).join("\n");
  return `# ${slug}

Panel de datos generado con Refine para el Estudio de Apps de StarSeed OS.

## Recursos declarados

${lista}

## Activación manual
1. Requiere Node 20 o superior (lo pide el núcleo de Refine).
2. \`npm install\` y después \`npm run dev\`.
3. Versiones fijadas el 2026-10-25: revisar con \`npm outdated\`.
4. Nada se despliega sin la palabra de Alex.

## Telemetría apagada
Refine envía telemetría por defecto. Aquí va apagada de las dos formas:
\`options={{ disableTelemetry: true }}\` en \`<Refine>\` y \`REFINE_NO_TELEMETRY=true\` en el entorno.

## Datos y claves
El proveedor de datos habla con una API REST cuya URL va en \`VITE_API_URL\`.
Los contratos independientes de la fuente de \`src/lib/widget-data/\` se conectan en esa API,
no dentro de este proyecto. Si la API necesita una clave, va en un proxy propio del servidor,
nunca en el navegador.
`;
}

export function plantillaRefine(op: OpcionesRefine): AppFile[] {
  const slug = aSlug(op.nombre);
  for (const recurso of op.recursos) {
    if (!RE_RECURSO.test(recurso.nombre)) throw new Error(`Nombre de recurso inválido: «${recurso.nombre}». Usa minúsculas, números y guiones (máximo 41 caracteres y debe empezar por letra).`);
    for (const campo of recurso.campos) {
      if (!RE_CAMPO.test(campo)) throw new Error(`Campo inválido en «${recurso.nombre}»: «${campo}». Usa letras, números y guion bajo (máximo 41 caracteres).`);
    }
  }
  const paquete = { name: slug, private: true, version: "0.1.0", type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { "@refinedev/core": "5.0.12", "@refinedev/react-router": "2.0.4", "@refinedev/simple-rest": "6.0.1", react: "^19.3.1", "react-dom": "^19.3.1", "react-router": "^7.0.2" },
    devDependencies: { "@vitejs/plugin-react": "^6.1.2", typescript: "^5.6.0", vite: "^8.3.5" } };
  const tsconfig = { compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true, types: ["vite/client"] }, include: ["src"] };
  return [
    archivo("package.json", JSON.stringify(paquete, null, 2)),
    archivo("tsconfig.json", JSON.stringify(tsconfig, null, 2)),
    archivo("index.html", `<!doctype html>\n<html lang="es">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${slug}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`),
    archivo("vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});`),
    archivo(".gitignore", "node_modules\ndist\n.env\n.env.local"),
    archivo(".env.example", "VITE_API_URL=\nREFINE_NO_TELEMETRY=true"),
    archivo("src/main.tsx", `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\n\nconst contenedor = document.getElementById("root");\nif (!contenedor) throw new Error("Falta el contenedor #root");\n\ncreateRoot(contenedor).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`),
    archivo("src/App.tsx", appTsx(op.recursos)),
    ...op.recursos.map((r) => archivo(`src/paginas/${r.nombre}.tsx`, pagina(r))),
    archivo("LEEME.md", leeme(slug, op.recursos)),
  ];
}
