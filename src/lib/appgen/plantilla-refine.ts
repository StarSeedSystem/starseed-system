import type { AppFile } from "./appgen";
import { languageForPath } from "./appgen";

const RECURSO_REGEX = /^[a-z][a-z0-9-]{0,40}$/;
const CAMPO_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function validarRecurso(nombre: string): void {
  if (!RECURSO_REGEX.test(nombre)) {
    throw new Error(
      `Nombre de recurso inválido: "${nombre}". Debe empezar por minúscula y contener solo letras minúsculas, números y guiones (máx. 41 caracteres).`
    );
  }
}

function validarCampo(nombre: string): void {
  if (!CAMPO_REGEX.test(nombre)) {
    throw new Error(
      `Nombre de campo inválido: "${nombre}". Debe empezar por letra o guión bajo y contener solo letras, números y guiones bajos (máx. 41 caracteres).`
    );
  }
}

export interface RecursoDef {
  nombre: string;
  campos: string[];
}

export interface PlantillaRefineOptions {
  nombre: string;
  recursos: RecursoDef[];
}

export function plantillaRefine(op: PlantillaRefineOptions): AppFile[] {
  const { nombre, recursos } = op;

  for (const r of recursos) {
    validarRecurso(r.nombre);
    for (const c of r.campos) {
      validarCampo(c);
    }
  }

  const slug = slugify(nombre);
  const files: AppFile[] = [];

  files.push(
    { path: "package.json", content: generarPackageJson(slug), language: languageForPath("package.json") },
    { path: "index.html", content: generarIndexHtml(slug), language: languageForPath("index.html") },
    { path: "vite.config.ts", content: generarViteConfig(), language: languageForPath("vite.config.ts") },
    { path: "tsconfig.json", content: generarTsConfig(), language: languageForPath("tsconfig.json") },
    { path: ".gitignore", content: generarGitignore(), language: languageForPath(".gitignore") },
    { path: ".env.example", content: generarEnvExample(), language: languageForPath(".env.example") },
    { path: "src/main.tsx", content: generarMainTsx(), language: languageForPath("src/main.tsx") },
    { path: "src/App.tsx", content: generarAppTsx(recursos), language: languageForPath("src/App.tsx") },
    { path: "LEEME.md", content: generarLeeme(slug, recursos), language: languageForPath("LEEME.md") }
  );

  for (const r of recursos) {
    files.push({
      path: `src/paginas/listado-${r.nombre}.tsx`,
      content: generarListadoTsx(r),
      language: languageForPath("src/paginas/listado.tsx"),
    });
  }

  return files;
}

function generarPackageJson(nombre: string): string {
  return JSON.stringify(
    {
      name: nombre,
      version: "0.0.1",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        "@refinedev/core": "5.0.12",
        "@refinedev/react-router": "2.0.4",
        "@refinedev/simple-rest": "6.0.1",
        react: "^19.3.1",
        "react-dom": "^19.3.1",
        "react-router": "^7.0.2",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^6.1.2",
        typescript: "^5.6.0",
        vite: "^8.3.5",
      },
    },
    null,
    2
  );
}

function generarIndexHtml(nombre: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${nombre}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

function generarViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
`;
}

function generarTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }],
    },
    null,
    2
  );
}

function generarGitignore(): string {
  return `# Dependencias
node_modules/

# Build
dist/
build/

# Entorno
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
}

function generarEnvExample(): string {
  return `VITE_API_URL=
REFINE_NO_TELEMETRY=true
`;
}

function generarMainTsx(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function generarAppTsx(recursos: RecursoDef[]): string {
  const recursosRefine = recursos
    .map(
      (r) => `  {
    name: "${r.nombre}",
    list: "/${r.nombre}",
  }`
    )
    .join(",\n");

  return `import { Refine } from "@refinedev/core";
import { routerProvider } from "@refinedev/react-router";
import { dataProvider } from "@refinedev/simple-rest";
import { BrowserRouter, Routes, Route } from "react-router";
${recursos
  .map(
    (r) => `import { Listado${capitalize(r.nombre)} } from "./paginas/listado-${r.nombre}";`
  )
  .join("\n")}

function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(import.meta.env.VITE_API_URL)}
        routerProvider={routerProvider}
        resources={[
${recursosRefine}
        ]}
        options={{
          disableTelemetry: true,
        }}
      >
        <Routes>
${recursos
  .map(
    (r) => `          <Route path="/${r.nombre}" element={<Listado${capitalize(r.nombre)} />} />`
  )
  .join("\n")}
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}

export default App;
`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generarListadoTsx(recurso: RecursoDef): string {
  const campos = recurso.campos.map((c) => `      <td>{item.${c} ?? "-"}</td>`).join("\n");
  const encabezados = recurso.campos.map((c) => `      <th>${c}</th>`).join("\n");

  return `import { useList } from "@refinedev/core";
import { useDataGrid } from "@refinedev/core";

export function Listado${capitalize(recurso.nombre)}() {
  const { dataGridProps } = useDataGrid({
    resource: "${recurso.nombre}",
  });

  const { query, result } = useList({
    resource: "${recurso.nombre}",
  });

  if (query.isLoading) {
    return <div>Cargando...</div>;
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h1>${capitalize(recurso.nombre)}</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ddd" }}>
${encabezados}
          </tr>
        </thead>
        <tbody>
          {result.data?.map((item: any) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
${campos}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
}

function generarLeeme(nombre: string, recursos: RecursoDef[]): string {
  const listaRecursos = recursos.map((r) => `- ${r.nombre}: ${r.campos.join(", ")}`).join("\n");

  return `# ${nombre}

Panel de datos generado con Refine (vite + react), telemetría apagada.

## Activación MANUAL

\`\`\`bash
npm install
npm run dev
\`\`\`

**Requisitos:** Node 20+ (el núcleo de Refine lo pide).

## Versiones fijadas el 2026-10-25

Revisar con \`npm outdated\` antes de actualizar:

- \`@refinedev/core\` 5.0.12
- \`@refinedev/react-router\` 2.0.4
- \`@refinedev/simple-rest\` 6.0.1
- \`react\` y \`react-dom\` ^19.3.1
- \`react-router\` ^7.0.2
- \`vite\` ^8.3.5
- \`@vitejs/plugin-react\` ^6.1.2
- \`typescript\` ^5.6.0

## Telemetría

Apagada de dos formas:

1. En \`src/App.tsx\`: \`options={{ disableTelemetry: true }}\` en \`<Refine>\`.
2. En \`.env.example\` (y tu \`.env\` local): \`REFINE_NO_TELEMETRY=true\`.

## Despliegue

**Nada se despliega sin la palabra de Alex.**

## Proveedor de datos

El proveedor de datos (\`@refinedev/simple-rest\`) habla con una API REST en \`VITE_API_URL\`.
Los contratos independientes de la fuente de \`src/lib/widget-data/\` se conectan en esa API, **no dentro de este proyecto**.

## Recursos incluidos

${listaRecursos}
`;
}