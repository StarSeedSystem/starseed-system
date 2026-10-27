// StarSeed OS — plantilla «panel de datos» con Refine (ficha lib-refine, MIT).
// Módulo puro, sin `node:*`: devuelve archivos de texto para el Estudio de Apps.
import { languageForPath } from "./appgen";
import type { AppFile } from "./appgen";

type Recurso = { nombre: string; campos: string[] };

const RE_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

const GITIGNORE = "node_modules\ndist\n.env\n.env.*\n!.env.example\n*.local";

const ENV_EXAMPLE = "VITE_API_URL=\nREFINE_NO_TELEMETRY=true";

const INDEX_HTML =
  '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8" />\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
  "  <title>Panel de datos</title>\n</head>\n<body>\n  <div id=\"root\"></div>\n" +
  '  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>\n';

const VITE_CONFIG =
  'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n' +
  "export default defineConfig({ plugins: [react()] });\n";

const MAIN_TSX =
  'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n' +
  '\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n' +
  "    <App />\n  </React.StrictMode>,\n);\n";

const TS_CONFIG = {
  compilerOptions: {
    target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext",
    moduleResolution: "bundler", jsx: "react-jsx", strict: true, noEmit: true,
    isolatedModules: true, esModuleInterop: true, skipLibCheck: true,
    types: ["vite/client"],
  },
  include: ["src", "vite.config.ts"],
};

const PAQUETE = (nombre: string) => ({
  name: nombre, private: true, type: "module",
  scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
  dependencies: {
    "@refinedev/core": "5.0.12", "@refinedev/react-router": "2.0.4",
    "@refinedev/simple-rest": "6.0.1", react: "^19.3.1",
    "react-dom": "^19.3.1", "react-router": "^7.0.2",
  },
  devDependencies: { "@vitejs/plugin-react": "^6.1.2", typescript: "^5.6.0", vite: "^8.3.5" },
});

const titulo = (r: Recurso): string =>
  r.nombre.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

const APP_TSX = (recursos: Recurso[]): string =>
  `import { BrowserRouter, Route, Routes } from "react-router";
import { Refine } from "@refinedev/core";
import { routerProvider } from "@refinedev/react-router";
import dataProvider from "@refinedev/simple-rest";
${recursos.map((r) => `import { Listado${titulo(r)} } from "./paginas/${r.nombre}/listado";`).join("\n")}

// Recursos declarados para Refine: nombres y rutas validados, nunca crudos.
const RECURSOS = [
${recursos.map((r) => `  { name: "${r.nombre}", list: "/${r.nombre}" },`).join("\n")}
];

export default function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(import.meta.env.VITE_API_URL)}
        routerProvider={routerProvider}
        resources={RECURSOS}
        options={{ disableTelemetry: true }}
      >
        <Routes>
${recursos.map((r) => `          <Route path="/${r.nombre}" element={<Listado${titulo(r)} />} />`).join("\n")}
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}
`;

const PAGINA = (r: Recurso): string =>
  `import { useList } from "@refinedev/core";

const RECURSO = "${r.nombre}";
const CAMPOS = [${r.campos.map((c) => `"${c}"`).join(", ")}];

export function Listado${titulo(r)}() {
  const { query, result } = useList<Record<string, unknown>>({ resource: RECURSO });
  if (query.isLoading) return <p>Cargando…</p>;
  const filas = result?.data ?? [];
  return (
    <main style={{ padding: "1.25rem", fontFamily: "system-ui" }}>
      <h1>{RECURSO}</h1>
      <p>{result?.total ?? 0} registros</p>
      <table><thead><tr>{CAMPOS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{CAMPOS.map((c) => <td key={c}>{String(f[c] ?? "—")}</td>)}</tr>)}</tbody></table>
    </main>
  );
}
`;

const LEEME =
  "# Panel de datos (Refine)\n\n## Activación manual\n" +
  "1. Node 20 o más nuevo (lo pide el núcleo de Refine).\n" +
  "2. `npm install`\n3. `npm run dev` y abre la URL local de vite.\n\n" +
  "## Telemetría apagada\n" +
  "Refine envía telemetría por defecto. La plantilla la apaga de dos formas: " +
  "`options={{ disableTelemetry: true }}` en `<Refine>` (src/App.tsx) y " +
  "`REFINE_NO_TELEMETRY=true` en `.env.example` (cópialo a `.env` para cubrir también la CLI, que manda aparte). " +
  "Nada de esto se despliega ni se publica sin la palabra de Alex.\n\n" +
  "## Datos\n" +
  "El proveedor de datos (`@refinedev/simple-rest`) habla con una API REST: apunta " +
  "`VITE_API_URL` donde la montes. Los contratos independientes de la fuente de " +
  "`src/lib/widget-data/` (StarSeed OS) se conectan en esa API, no dentro del proyecto. " +
  "Si la API necesita clave, sirve un proxy propio y pónla ahí: nunca en el navegador. " +
  "Versiones fijadas el 2026-10-25: revisarlas con `npm outdated`.\n";

function slug(nombre: string): string {
  return nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function validar(recursos: Recurso[]): Recurso[] {
  for (const r of recursos) {
    if (!RE_RECURSO.test(r.nombre))
      throw new Error(`Nombre de recurso «${r.nombre}» inválido: minúsculas, números y guiones, empezando por letra.`);
    for (const c of r.campos)
      if (!RE_CAMPO.test(c))
        throw new Error(`Campo «${c}» del recurso «${r.nombre}» inválido: letra o guion bajo al inicio, letras, números y «_» después.`);
  }
  return recursos;
}

export function plantillaRefine(op: { nombre: string; recursos: Recurso[] }): AppFile[] {
  const nombre = slug(op.nombre) || "panel-de-datos";
  const recursos = validar(Array.isArray(op.recursos) ? op.recursos : []);
  const pares: [string, string][] = [
    ["package.json", JSON.stringify(PAQUETE(nombre), null, 2)],
    ["index.html", INDEX_HTML], ["vite.config.ts", VITE_CONFIG],
    ["tsconfig.json", JSON.stringify(TS_CONFIG, null, 2)],
    [".gitignore", GITIGNORE], [".env.example", ENV_EXAMPLE],
    ["src/main.tsx", MAIN_TSX],
    ["src/App.tsx", APP_TSX(recursos)],
    ["LEEME.md", LEEME],
    ...recursos.map((r) => [`src/paginas/${r.nombre}/listado.tsx`, PAGINA(r)] as [string, string]),
  ];
  return pares.map(([path, content]) => ({ path, content, language: languageForPath(path) }));
}
