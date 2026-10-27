/**
 * StarSeed OS — Plantilla Refine (Panel de datos con telemetría apagada)
 * Módulo puro que genera los archivos para un proyecto Vite + React + Refine
 * sin telemetría, cumpliendo estrictamente con el contrato.
 */

import type { AppFile } from "./appgen";
import { languageForPath } from "./appgen";

export interface RecursoDef {
  nombre: string;
  campos: string[];
}

export interface PlantillaRefineOpciones {
  nombre: string;
  recursos: RecursoDef[];
}

const RECURSO_REGEX = /^[a-z][a-z0-9-]{0,40}$/;
const CAMPO_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export function validarSlugYRecursos(nombre: string, recursos: RecursoDef[]): { slug: string } {
  if (!nombre || typeof nombre !== "string") {
    throw new Error("El nombre del proyecto es obligatorio y debe ser un texto.");
  }
  const slug = nombre
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "panel-refine";

  if (!recursos || !Array.isArray(recursos) || recursos.length === 0) {
    throw new Error("Se requiere al menos un recurso válido para generar la plantilla Refine.");
  }

  for (const rec of recursos) {
    if (!rec.nombre || !RECURSO_REGEX.test(rec.nombre)) {
      throw new Error(
        `Nombre de recurso inválido "${rec.nombre}". Debe cumplir con ^[a-z][a-z0-9-]{0,40}$.`
      );
    }
    if (!rec.campos || !Array.isArray(rec.campos) || rec.campos.length === 0) {
      throw new Error(`El recurso "${rec.nombre}" debe tener al menos un campo definido.`);
    }
    for (const campo of rec.campos) {
      if (!campo || !CAMPO_REGEX.test(campo)) {
        throw new Error(
          `Nombre de campo inválido "${campo}" en recurso "${rec.nombre}". Debe cumplir con ^[A-Za-z_][A-Za-z0-9_]{0,40}$.`
        );
      }
    }
  }

  return { slug };
}

export function plantillaRefine(op: PlantillaRefineOpciones): AppFile[] {
  const { slug } = validarSlugYRecursos(op.nombre, op.recursos);

  const packageJsonContent = JSON.stringify(
    {
      name: slug,
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview"
      },
      dependencies: {
        "@refinedev/core": "5.0.12",
        "@refinedev/react-router": "2.0.4",
        "@refinedev/simple-rest": "6.0.1",
        react: "^19.3.1",
        "react-dom": "^19.3.1",
        "react-router": "^7.0.2"
      },
      devDependencies: {
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^6.1.2",
        typescript: "^5.6.0",
        vite: "^8.3.5"
      }
    },
    null,
    2
  );

  const indexHtmlContent = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${op.nombre} — Panel Refine</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

  const viteConfigContent = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`;

  const tsConfigContent = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: "force",
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true
      },
      include: ["src"]
    },
    null,
    2
  );

  const gitignoreContent = `node_modules
dist
.env
.env.local
.DS_Store`;

  const envExampleContent = `VITE_API_URL=
REFINE_NO_TELEMETRY=true`;

  const mainTsxContent = `import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

  const indexCssContent = `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
}`;

  const files: AppFile[] = [
    { path: "package.json", content: packageJsonContent, language: languageForPath("package.json") },
    { path: "index.html", content: indexHtmlContent, language: languageForPath("index.html") },
    { path: "vite.config.ts", content: viteConfigContent, language: languageForPath("vite.config.ts") },
    { path: "tsconfig.json", content: tsConfigContent, language: languageForPath("tsconfig.json") },
    { path: ".gitignore", content: gitignoreContent, language: languageForPath(".gitignore") },
    { path: ".env.example", content: envExampleContent, language: languageForPath(".env.example") },
    { path: "src/main.tsx", content: mainTsxContent, language: languageForPath("src/main.tsx") },
    { path: "src/index.css", content: indexCssContent, language: languageForPath("src/index.css") },
  ];

  for (const rec of op.recursos) {
    const listadoPath = `src/paginas/${rec.nombre}-listado.tsx`;
    const listadoContent = `import React from "react";
import { useList } from "@refinedev/core";

export function ${rec.nombre.replace(/-/g, "_")}Listado() {
  const { query } = useList({
    resource: "${rec.nombre}",
  });

  const { data, isLoading } = query;

  if (isLoading) {
    return <div style={{ padding: "2rem" }}>Cargando ${rec.nombre}...</div>;
  }

  const items = data?.data ?? [];

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Listado de ${rec.nombre}</h1>
      <p>Total de registros: {data?.total ?? 0}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr style={{ background: "#e2e8f0", textAlign: "left" }}>
            <th style={{ padding: "0.75rem", border: "1px solid #cbd5e1" }}>ID</th>
            ${rec.campos.map((c) => `<th style={{ padding: "0.75rem", border: "1px solid #cbd5e1" }}>${c}</th>`).join("\n            ")}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id}>
              <td style={{ padding: "0.75rem", border: "1px solid #cbd5e1" }}>{item.id}</td>
              ${rec.campos.map((c) => `<td style={{ padding: "0.75rem", border: "1px solid #cbd5e1" }}>{String(item.${c} ?? "")}</td>`).join("\n              ")}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}`;
    files.push({
      path: listadoPath,
      content: listadoContent,
      language: languageForPath(listadoPath),
    });
  }

  const resourcesListProp = op.recursos
    .map(
      (r) => `    {
      name: "${r.nombre}",
      list: "/${r.nombre}",
    }`
    )
    .join(",\n");

  const resourcesImports = op.recursos
    .map((r) => `import { ${r.nombre.replace(/-/g, "_")}Listado } from "./paginas/${r.nombre}-listado";`)
    .join("\n");

  const appTsxContent = `import React from "react";
import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import dataProvider from "@refinedev/simple-rest";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router";
${resourcesImports}

const API_URL = import.meta.env.VITE_API_URL || "https://api.fake-rest.refine.dev";

export function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(API_URL)}
        routerProvider={routerProvider}
        resources={[
${resourcesListProp}
        ]}
        options={{
          disableTelemetry: true,
        }}
      >
        <Routes>
          <Route
            element={
              <div style={{ display: "flex", minHeight: "100vh" }}>
                <aside style={{ width: "250px", background: "#1e293b", color: "#f8fafc", padding: "1.5rem" }}>
                  <h2>${op.nombre}</h2>
                  <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                    ${op.recursos.map((r) => `<a href="/${r.nombre}" style={{ color: "#38bdf8", textDecoration: "none" }}>${r.nombre}</a>`).join("\n                    ")}
                  </nav>
                </aside>
                <main style={{ flex: 1, background: "#f8fafc" }}>
                  <Outlet />
                </main>
              </div>
            }
          >
            <Route path="/" element={<Navigate to="/${op.recursos[0].nombre}" replace />} />
            ${op.recursos.map((r) => `<Route path="/${r.nombre}" element={<${r.nombre.replace(/-/g, "_")}Listado />} />`).join("\n            ")}
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}

export default App;`;

  files.push({
    path: "src/App.tsx",
    content: appTsxContent,
    language: languageForPath("src/App.tsx"),
  });

  const leemeContent = `# ${op.nombre} — Panel de Datos (Refine)

Proyecto generado con la plantilla Refine de StarSeed OS.

## Activación Manual
1. Asegurar Node 20+ instalado.
2. Ejecutar \`npm install\` para instalar las dependencias.
3. Ejecutar \`npm run dev\` para iniciar el servidor de desarrollo.

## Notas Técnicas y Versiones
- Versiones fijadas el 2026-10-25: revisar con \`npm outdated\`.
- La telemetría de Refine se ha desactivado por completo de dos formas:
  1. Mediante la opción \`options={{ disableTelemetry: true }}\` en el componente \`<Refine>\`.
  2. Mediante la variable de entorno \`REFINE_NO_TELEMETRY=true\` en el archivo \`.env.example\` / \`.env\`.
- Ningún despliegue se realiza sin la palabra explícita de Alex.
- El proveedor de datos habla con una API REST y los contratos independientes de la fuente de \`src/lib/widget-data/\` se conectan en esa API, nunca dentro del proyecto.
- Si la API necesita clave, se configura en un proxy propio o en variables de entorno del servidor, nunca en el código cliente ni expuesta en el navegador.
`;

  files.push({
    path: "LEEME.md",
    content: leemeContent,
    language: languageForPath("LEEME.md"),
  });

  return files;
}

