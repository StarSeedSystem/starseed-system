/**
 * StarSeed OS — Estudio de Apps · plantilla «panel de datos» (Refine)
 *
 * Tarea DSN1025H. Genera, de forma PURA y sin `node:*`, el proyecto completo
 * de un panel de datos con Vite + React + Refine (proveedor REST) para que el
 * Estudio de Apps lo exporte como carpeta de texto. Telemetría de Refine
 * APAGADA de serie, de las dos formas: `options={{ disableTelemetry: true }}`
 * en `<Refine>` y `REFINE_NO_TELEMETRY=true` en `.env.example`.
 *
 * Ficha `lib-refine` (config/repos-libreria-1025.json): MIT; núcleo
 * `@refinedev/core` 5.0.12. Versiones verificadas en npm el 2026-10-25.
 * Nada de esto se ejecuta dentro del OS: solo texto exportable.
 */

import type { AppFile } from "@/lib/appgen/appgen";
import { languageForPath } from "@/lib/appgen/appgen";

export interface RecursoPlantillaRefine {
  /** Nombre del recurso (colección) en la API REST, p.ej. «pepitas». */
  nombre: string;
  /** Columnas que muestra el listado del recurso. */
  campos: string[];
}

export interface PlantillaRefineOp {
  /** Nombre del proyecto; se reduce internamente a un slug ASCII. */
  nombre: string;
  /** Recursos del panel: uno por colección de la API. */
  recursos: RecursoPlantillaRefine[];
}

// Versiones fijadas el 2026-10-25 (verificadas en npm; ficha lib-refine).
export const VERSION_NUCLEO_REFINE = "5.0.12";
export const VERSION_REFINE_REACT_ROUTER = "2.0.4";
export const VERSION_REFINE_SIMPLE_REST = "6.0.1";

// Los datos del usuario NUNCA entran crudos en el código generado.
const PATRON_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const PATRON_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export function plantillaRefine(op: PlantillaRefineOp): AppFile[] {
  validarEntrada(op);
  const slug = slugProyecto(op.nombre);
  const archivos = construirArchivos(slug, op.recursos);
  return archivos.map((f) => ({
    ...f,
    language: languageForPath(f.path),
  }));
}

/** Reduce el nombre del proyecto a un slug ASCII seguro para npm y rutas. */
export function slugProyecto(nombre: string): string {
  const slug = (nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "panel-de-datos";
}

function validarEntrada(op: PlantillaRefineOp): void {
  if (!op || !Array.isArray(op.recursos) || op.recursos.length === 0) {
    throw new Error(
      "La plantilla necesita al menos un recurso de datos (colección de la API).",
    );
  }
  const vistos = new Set<string>();
  for (const recurso of op.recursos) {
    if (!recurso || typeof recurso.nombre !== "string" || !PATRON_RECURSO.test(recurso.nombre)) {
      throw new Error(
        `Nombre de recurso no válido: «${String(recurso?.nombre ?? "")}». Debe ser minúsculas, ` +
          "números y guiones, empezando por letra (como mucho 41 caracteres), para que el " +
          "nombre nunca entre crudo en el código generado.",
      );
    }
    if (vistos.has(recurso.nombre)) {
      throw new Error(`Recurso repetido: «${recurso.nombre}». Cada recurso necesita un nombre único.`);
    }
    vistos.add(recurso.nombre);
    validarCampos(recurso);
  }
}

function validarCampos(recurso: RecursoPlantillaRefine): void {
  const campos = Array.isArray(recurso.campos) ? recurso.campos : [];
  for (const campo of campos) {
    if (typeof campo !== "string" || !PATRON_CAMPO.test(campo)) {
      throw new Error(
        `Campo no válido en el recurso «${recurso.nombre}»: «${String(campo)}». Debe empezar por ` +
          "letra o guion bajo y usar solo letras, números y guiones bajos (como mucho 41 caracteres).",
      );
    }
  }
}

function construirArchivos(slug: string, recursos: RecursoPlantillaRefine[]): AppFile[] {
  return [
    archivo("package.json", paqueteJson(slug)),
    archivo("index.html", htmlIndex(slug)),
    archivo("vite.config.ts", configVite()),
    archivo("tsconfig.json", tsconfigJson()),
    archivo(".gitignore", gitignore()),
    archivo(".env.example", envEjemplo()),
    archivo("src/main.tsx", principalTsx()),
    archivo("src/App.tsx", appTsx(recursos)),
    ...recursos.map((r) => archivo(`src/paginas/listado-${r.nombre}.tsx`, listadoTsx(r))),
    archivo("LEEME.md", leeme()),
  ];
}

function archivo(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

function paqueteJson(slug: string): string {
  return JSON.stringify(
    {
      name: slug,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        "@refinedev/core": VERSION_NUCLEO_REFINE,
        "@refinedev/react-router": VERSION_REFINE_REACT_ROUTER,
        "@refinedev/simple-rest": VERSION_REFINE_SIMPLE_REST,
        react: "^19.3.1",
        "react-dom": "^19.3.1",
        "react-router": "^7.0.2",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^6.1.2",
        typescript: "^5.6.0",
        vite: "^8.3.5",
      },
      engines: { node: ">=20" },
    },
    null,
    2,
  ) + "\n";
}

function gitignore(): string {
  // `.env.example` NO se ignora: los patrones solo cubren archivos con valor.
  return `node_modules
dist
.env
.env.local
*.local
`;
}

function envEjemplo(): string {
  return `# Copia este archivo como .env. La plantilla no trae claves: si tu API exige una,
# ponla en un proxy propio (véase LEEME.md), nunca en el navegador.
VITE_API_URL=
# Telemetría de Refine apagada por el entorno, además de disableTelemetry: true
# en src/App.tsx (las dos formas que exige la ficha del OS).
REFINE_NO_TELEMETRY=true
`;
}

function leeme(): string {
  return `# Panel de datos (Refine, telemetría apagada)

Proyecto generado por el Estudio de Apps de StarSeed OS: un panel de datos con
Vite + React + Refine y un proveedor de datos REST. La telemetría de Refine va
APAGADA de las dos formas:

    options={{ disableTelemetry: true }} en src/App.tsx (componente <Refine>);
    REFINE_NO_TELEMETRY=true en el entorno (.env / variables)

## Activación (manual, todo en tu equipo)

1. Requisitos: Node 20 o superior (el núcleo de Refine lo pide).
2. \`npm install\`
3. Copia \`.env.example\` a \`.env\` y escribe en \`VITE_API_URL\` la URL de tu API REST.
4. \`npm run dev\` para desarrollar; \`npm run build\` y \`npm run preview\` para la build.

## Proveedor de datos

El \`dataProvider\` de \`@refinedev/simple-rest\` y el \`routerProvider\` de
\`@refinedev/react-router\` hablan con una API REST: los contratos independientes
de la fuente de \`src/lib/widget-data/\` de StarSeed OS se conectan EN ESA API,
no dentro de este proyecto.

## Claves

Si la API necesita clave, la clave va en un PROXY propio en el servidor, nunca
en el navegador: el \`dataProvider\` habla con tu proxy y el proxy guarda la
clave en una variable de entorno (solo el NOMBRE en el código). Este proyecto
no trae ninguna clave y no debe llevarla jamás.

## Versiones

Versiones fijadas el 2026-10-25 (verificadas en npm): revisar con
\`npm outdated\` antes de actualizar. La versión del núcleo de Refine se sigue
por npm: las etiquetas de un monorepo pueden ir a destiempo.

## Despliegue

Nada se despliega ni se publica sin la palabra de Alex.
`;
}

function principalTsx(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
`;
}

/**
 * Nombre de componente React (ASCII pascal-case) para el listado de un recurso.
 * El nombre ya viene validado por PATRON_RECURSO: nunca entra crudo.
 */
export function componenteListado(nombre: string): string {
  return (
    "Listado" +
    nombre
      .split("-")
      .map((parte) => parte[0].toUpperCase() + parte.slice(1))
      .join("")
  );
}

function listadoTsx(recurso: RecursoPlantillaRefine): string {
  const campos = JSON.stringify(recurso.campos);
  return `import { useList } from "@refinedev/core";

// Refine 5: useList devuelve { query, result: { data, total } } y la carga
// está en query.isLoading (ficha lib-refine de StarSeed OS).
interface RegistroPanel {
  id: number | string;
  [campo: string]: unknown;
}

const campos = ${campos};

export function ${componenteListado(recurso.nombre)}() {
  const { query, result } = useList<RegistroPanel>({ resource: "${recurso.nombre}" });
  const registros = result?.data ?? [];
  const total = result?.total ?? registros.length;

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", margin: 0 }}>Listado · ${recurso.nombre}</h1>
      <p style={{ color: "#64748b" }}>{total} registro(s)</p>
      {query.isLoading ? (
        <p>Cargando…</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {campos.map((campo) => (
                <th key={campo} style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
                  {campo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.map((registro, fila) => (
              <tr key={String(registro.id ?? fila)}>
                {campos.map((campo) => (
                  <td key={campo} style={{ borderBottom: "1px solid #e2e8f0", padding: "0.25rem 0.5rem" }}>
                    {registro[campo] === undefined || registro[campo] === null
                      ? "—"
                      : String(registro[campo])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
`;
}

function appTsx(recursos: RecursoPlantillaRefine[]): string {
  const imports = recursos
    .map((r) => `import { ${componenteListado(r.nombre)} } from "./paginas/listado-${r.nombre}";`)
    .join("\n");
  const objetosRecursos = recursos
    .map((r) => `  { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  const rutas = recursos
    .map((r) => `        <Route path="/${r.nombre}" element={<${componenteListado(r.nombre)} />} />`)
    .join("\n");
  const principal = componenteListado(recursos[0].nombre);
  return `import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/simple-rest";
import { routerProvider } from "@refinedev/react-router";
import { Routes, Route } from "react-router";
${imports}

const recursos = [
${objetosRecursos}
];

// La telemetría de Refine va APAGADA: options={{ disableTelemetry: true }}
// aquí, y REFINE_NO_TELEMETRY=true en el entorno (.env). Doble apagado.
export default function App() {
  return (
    <Refine
      dataProvider={dataProvider(import.meta.env.VITE_API_URL)}
      routerProvider={routerProvider}
      resources={recursos}
      options={{ disableTelemetry: true }}
    >
      <Routes>
        <Route path="/" element={<${principal} />} />
${rutas}
      </Routes>
    </Refine>
  );
}
`;
}

function htmlIndex(slug: string): string {
  const titulo = slug.replace(/-/g, " ");
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function configVite(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;
}

function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        moduleDetection: "force",
        jsx: "react-jsx",
        types: ["vite/client"],
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
        noEmit: true,
        isolatedModules: true,
        forceConsistentCasingInFileNames: true,
        esModuleInterop: true,
      },
      include: ["src"],
    },
    null,
    2,
  ) + "\n";
}
