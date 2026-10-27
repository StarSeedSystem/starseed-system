/**
 * StarSeed OS · Estudio de Apps — plantilla «panel de datos» con Refine (DSN1025H).
 *
 * Genera un proyecto Vite + React 19 + Refine 5.0.12 con proveedor REST
 * (`@refinedev/simple-rest`) y la telemetría de Refine APAGADA de serie
 * (`options={{ disableTelemetry: true }}` en `<Refine>` y `REFINE_NO_TELEMETRY=true`
 * en el entorno; la CLI de Refine manda aparte, a /cli). Pura: sin `node:*`,
 * del texto a `AppFile[]`; la activación (npm install / npm run dev, Node 20+)
 * es manual, fuera del OS. Nada se despliega sin la palabra de Alex.
 */

import { languageForPath, type AppFile } from "./appgen";

/** Recurso REST que la plantilla expone como listado. */
export interface RecursoPanel {
  nombre: string;
  campos: string[];
}

/** Entrada de la plantilla: nombre del proyecto y recursos a listar. */
export interface PlantillaRefineOp {
  nombre: string;
  recursos: RecursoPanel[];
}

/** Nombre de recurso: minúsculas, dígitos y guiones, empezando por letra. */
const RE_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;

/** Nombre de campo usable en el TSX generado: nunca comillas ni símbolos. */
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/** Reduce el nombre del proyecto a un slug ASCII seguro (sin acentos ni símbolos). */
export function slugProyecto(nombre: string): string {
  const limpio = (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio || "panel-de-datos";
}

/** Valida recursos y campos; los datos del usuario nunca entran crudos en el código. */
function validar(op: PlantillaRefineOp): void {
  if (!Array.isArray(op.recursos)) {
    throw new Error("Los recursos del panel deben venir en una lista.");
  }
  for (const r of op.recursos) {
    if (!r || !RE_RECURSO.test(r.nombre || "")) {
      throw new Error(
        `El nombre de recurso «${String(r?.nombre ?? r)}» no es válido: usa solo minúsculas, dígitos y guiones, empezando por letra (hasta 41 caracteres).`,
      );
    }
    if (!Array.isArray(r.campos)) {
      throw new Error(`El recurso «${r.nombre}» debe declarar su lista de campos.`);
    }
    for (const c of r.campos) {
      if (typeof c !== "string" || !RE_CAMPO.test(c)) {
        throw new Error(
          `El campo «${String(c)}» del recurso «${r.nombre}» no es válido: usa solo letras, dígitos y guiones bajos, empezando por letra o guion bajo.`,
        );
      }
    }
  }
}

/** Empaqueta un archivo virtual para el Estudio de Apps. */
function archivo(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

// ────────────────────────────────────────────────────────────────────────────
// Ensamblado
// ────────────────────────────────────────────────────────────────────────────

/** Genera el proyecto completo como árbol de `AppFile`. */
export function plantillaRefine(op: PlantillaRefineOp): AppFile[] {
  validar(op);
  const slug = slugProyecto(op.nombre);
  return [
    archivo("package.json", contenidoPackage(slug)),
    archivo("index.html", contenidoIndex(slug)),
    archivo("vite.config.ts", CONTENIDO_VITE),
    archivo("tsconfig.json", CONTENIDO_TSCONFIG),
    archivo(".gitignore", CONTENIDO_GITIGNORE),
    archivo(".env.example", CONTENIDO_ENVExample),
    archivo("src/main.tsx", CONTENIDO_MAIN),
    archivo("src/App.tsx", contenidoApp(op.recursos)),
    ...op.recursos.map((r) => archivo(`src/paginas/listado-${r.nombre}.tsx`, contenidoListado(r))),
    archivo("LEEME.md", contenidoLeeme(slug)),
  ];
}

const CONTENIDO_ENVExample = `# variables de ejemplo para el panel (valores vacíos a propósito)
VITE_API_URL=
# apaga la telemetría de Refine antes de abrir la app
REFINE_NO_TELEMETRY=true
`;

/**
 * Versiones fijadas y verificadas en npm el 2026-10-25 (no añadir otras ni
 * inventar versiones: la ficha `lib-refine` de `config/repos-libreria-1025.json`
 * es la fuente). `@refinedev/core` 5.0.12 va exacto; el resto como en la ficha.
 */
const PAQUETE = {
  "@refinedev/core": "5.0.12",
  "@refinedev/react-router": "2.0.4",
  "@refinedev/simple-rest": "6.0.1",
  react: "^19.3.1",
  "react-dom": "^19.3.1",
  "react-router": "^7.0.2",
};

function contenidoPackage(slug: string): string {
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
        "@refinedev/core": PAQUETE["@refinedev/core"],
        "@refinedev/react-router": PAQUETE["@refinedev/react-router"],
        "@refinedev/simple-rest": PAQUETE["@refinedev/simple-rest"],
        react: PAQUETE.react,
        "react-dom": PAQUETE["react-dom"],
        "react-router": PAQUETE["react-router"],
      },
      devDependencies: {
        "@vitejs/plugin-react": "^6.1.2",
        typescript: "^5.6.0",
        vite: "^8.3.5",
      },
    },
    null,
    2,
  ) + "\n";
}

/** Monta `<Refine>` con la telemetría apagada y una vista de listado por recurso. */
function contenidoApp(recursos: RecursoPanel[]): string {
  const imports = recursos
    .map((r) => {
      const c = capitalizar(r.nombre);
      return `import Listado${c} from "./paginas/listado-${r.nombre}";`;
    })
    .join("\n");
  const rutas = recursos
    .map((r) => {
      const c = capitalizar(r.nombre);
      return `        <Route path="/${r.nombre}" element={<Listado${c} />} />`;
    })
    .join("\n");
  const recursosConfig = recursos
    .map(
      (r) =>
        `      { name: "${r.nombre}", list: "/${r.nombre}", meta: { campos: [${r.campos
          .map((c) => `"${c}"`)
          .join(", ")}] } },`,
    )
    .join("\n");

  return `import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/simple-rest";
import routerProvider from "@refinedev/react-router";
import { BrowserRouter, Routes, Route } from "react-router";
${imports}

export default function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(import.meta.env.VITE_API_URL ?? "")}
        routerProvider={routerProvider}
        resources={[
${recursosConfig}
        ]}
        options={{
          // Telemetría de Refine apagada de serie (DSN1025H).
          disableTelemetry: true,
          syncWithLocation: true,
        }}
      >
        <Routes>
          <Route path="/" element={<p>Panel de datos</p>} />
${rutas}
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}
`;
}

/** «lineas-bases» → «LineasBases»: identificador TSX válido a partir del recurso. */
function capitalizar(nombre: string): string {
  return (nombre || "")
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
}

/** Página de listado para un recurso, con `useList` de Refine 5. */
function contenidoListado(r: RecursoPanel): string {
  const c = capitalizar(r.nombre);

  return `import { useList } from "@refinedev/core";

type Registro = Record<string, unknown>;

const campos = [${r.campos.map((c) => `"${c}"`).join(", ")}];

export default function Listado${c}() {
  const { query, result } = useList({ resource: "${r.nombre}" });
  if (query.isLoading) {
    return <p>Cargando ${r.nombre}…</p>;
  }
  const registros: unknown[] = Array.isArray(result.data) ? result.data : [];
  return (
    <main style={{ padding: "1.5rem" }}>
      <h1>${r.nombre}</h1>
      <p>{result.total} registros</p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {campos.map((c) => <th key={c} style={{ textAlign: "left" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {registros.map((registro, i) => (
            <tr key={i}>
              {campos.map((c) => (
                <td key={c} style={{ padding: "0.25rem 0.5rem", borderTop: "1px solid #ccc" }}>
                  {String((registro as Registro)?.[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
`;
}

/** LEEME de activación manual: nada se despliega sin la palabra de Alex. */
function contenidoLeeme(slug: string): string {
  return `# ${slug}

Panel de datos con Vite + React 19 + Refine 5 (proveedor REST de \`@refinedev/simple-rest\`).
Generado por el Estudio de Apps de StarSeed OS (DSN1025H).

## Activación manual (fuera del OS)

1. Node 20+ (lo pide \`@refinedev/core\` 5.0.12).
2. \`npm install\`
3. \`npm run dev\`

## Telemetría

Refine envía telemetría a \`telemetry.refine.dev\` por defecto (proveedores usados, versión,
número de recursos, IP, host, navegador y sistema) y su CLI manda otra a \`/cli\`.
Aquí está apagada DE LAS DOS FORMAS: \`disableTelemetry: true\` en \`options\` del componente
\`<Refine>\` (\`src/App.tsx\`) y \`REFINE_NO_TELEMETRY=true\` en \`.env.example\`.

\`\`\`bash
npm outdated   # versiones fijadas el 2026-10-25: revisar con esto antes de actualizar
\`\`\`

## Datos y claves

El proveedor de datos (\`dataProvider\`) habla con una API REST: su URL va en
\`VITE_API_URL\` (\`.env.example\`). Los contratos independientes de la fuente de
\`src/lib/widget-data/\` del OS se conecta EN esa API, no dentro de este proyecto.
Si la API necesita clave, pónsela a un PROXY propio delante: nunca va la clave en el
navegador ni en este código.

## Despliegue

Nada se despliega ni se publica sin la palabra de Alex.
`;
}

const CONTENIDO_GITIGNORE = `node_modules/
dist/
*.local
.env
`;

const CONTENIDO_VITE = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

const CONTENIDO_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ["src"],
  },
  null,
  2,
) + "\n";

function contenidoIndex(slug: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Panel de datos · ${slug}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const CONTENIDO_MAIN = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
