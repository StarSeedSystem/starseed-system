/**
 * StarSeed OS — Plantilla «panel de datos» con Refine (Estudio de Apps).
 *
 * Genera un proyecto vite + react completo (carpeta exportable de texto) con
 * `@refinedev/core` 5.0.12 y proveedor REST. La TELEMETRÍA de Refine queda
 * apagada de serie, de las dos formas: `options={{ disableTelemetry: true }}`
 * en `<Refine>` y `REFINE_NO_TELEMETRY=true` en `.env.example`.
 *
 * Puro: sin `node:*`, sin red, sin disco. Los datos del usuario jamás entran
 * crudos en el código generado: nombres de recurso y campos se validan aquí.
 */

import { languageForPath, type AppFile } from "./appgen";

export interface RecursoPanel {
  /** Nombre del recurso en la API REST (slug: letras minúsculas, números y guiones). */
  nombre: string;
  /** Campos que muestra el listado (identificadores). */
  campos: string[];
}

export interface OpcionesPlantillaRefine {
  /** Nombre del proyecto; se reduce a un slug ASCII. */
  nombre: string;
  /** Recursos del panel (uno por «página» de listado). */
  recursos: RecursoPanel[];
}

// Versiones verificadas en npm el 2026-10-25 (ficha lib-refine). Nada añadir.
const CORE = "5.0.12";

const PATRON_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const PATRON_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

function validarRecursos(recursos: RecursoPanel[]): void {
  if (!Array.isArray(recursos)) {
    throw new Error("La lista de recursos del panel es obligatoria (puede estar vacía).");
  }
  for (const recurso of recursos) {
    if (!PATRON_RECURSO.test(recurso.nombre)) {
      throw new Error(
        `El nombre de recurso «${recurso.nombre}» no es válido: debe empezar por letra minúscula ` +
          `y contener solo letras minúsculas, números o guiones (hasta 41 caracteres).`,
      );
    }
    const vistas: string[] = [];
    for (const campo of recurso.campos) {
      if (!PATRON_CAMPO.test(campo)) {
        throw new Error(
          `El campo «${campo}» del recurso «${recurso.nombre}» no es válido: solo letras, números ` +
            `y guion bajo, empezando por letra o guion bajo (hasta 41 caracteres).`,
        );
      }
      if (vistas.includes(campo)) {
        throw new Error(
          `El campo «${campo}» está repetido en el recurso «${recurso.nombre}».`,
        );
      }
      vistas.push(campo);
    }
  }
}

function archivo(ruta: string, contenido: string): AppFile {
  return { path: ruta, content: contenido, language: languageForPath(ruta) };
}

function slugProyecto(nombre: string): string {
  return (
    (nombre || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "panel-de-datos"
  );
}

function packageJson(slug: string): string {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      type: "module",
      engines: { node: ">=20" },
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        "@refinedev/core": CORE,
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
    2,
  ) + "\n";
}

function indexHtml(slug: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${slug} · panel de datos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración mínima de Vite para el panel de datos.
export default defineConfig({
  plugins: [react()],
});
`;
}

function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["vite/client"],
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noUncheckedSideEffectImports: true,
        noEmit: true,
        skipLibCheck: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
      },
      include: ["src"],
    },
    null,
    2,
  ) + "\n";
}

function gitignore(): string {
  return `node_modules
dist
.env
.env.local
*.local
`;
}

function envEjemplo(): string {
  return `# Plantilla de variables de entorno del panel de datos.
# Copia este archivo a .env.local y rellena SOLO lo que necesites.
# Nada se despliega sin la palabra de Alex.

# URL de la API REST con la que habla el proveedor de datos (dataProvider).
VITE_API_URL=

# Telemetría de Refine apagada y por partida doble: esta variable y
# options={{ disableTelemetry: true }} en <Refine> (src/App.tsx). Sin ella,
# Refine envía datos a telemetry.refine.dev (y su CLI, a refinement/refine/cli).
REFINE_NO_TELEMETRY=true

# Nunca pongas claves aquí: si la API necesita una, va en un proxy propio,
# nunca en el navegador (ver LEEME.md).
`;
}

function mainTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";

// Punto de entrada del panel de datos (vite + react + react-router 7).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
`;
}

interface RecursoGenerado {
  name: string;
  list: string;
  campos: string[];
}

function appTsx(recursos: RecursoPanel[]): string {
  const lista: RecursoGenerado[] = recursos.map((r) => ({
    name: r.nombre,
    list: `/${r.nombre}`,
    campos: r.campos,
  }));
  const recursosLiteral = lista
    .map((r) => `  { name: "${r.name}", list: "${r.list}" },`)
    .join("\n");
  const rutas = lista
    .map(
      (r) =>
        `        <Route key="${r.name}" path="${r.list}" element={<Listado recurso="${r.name}" campos={${JSON.stringify(r.campos)}} />} />`,
    )
    .join("\n");
  const inicio = lista[0]?.list ?? "/sin-recursos";
  return `import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/simple-rest";
import { routerProvider } from "@refinedev/react-router";
import { Routes, Route, Navigate } from "react-router";
import Listado from "./paginas/listado";

// URL de la API REST: se configura con VITE_API_URL (.env.local).
// Si la API necesita una clave, va en un proxy propio, NUNCA en el navegador.
const API_URL: string = import.meta.env.VITE_API_URL ?? "";

// Recursos del panel. La telemetría de Refine queda apagada con
// options={{ disableTelemetry: true }} (además de REFINE_NO_TELEMETRY=true).
const RECURSOS = [
${recursosLiteral}
];

export default function App() {
  return (
    <Refine
      dataProvider={dataProvider(API_URL)}
      routerProvider={routerProvider}
      resources={RECURSOS.map(({ name, list }) => ({ name, list }))}
      options={{ disableTelemetry: true }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="${inicio}" replace />} />
${rutas}
        <Route
          path="*"
          element={
            <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
              <h1>Panel de datos</h1>
              <p>Elige un recurso en la barra de direcciones, por ejemplo ${lista[0]?.list ?? "/"}.</p>
            </main>
          }
        />
      </Routes>
    </Refine>
  );
}
`;
}

function listadoTsx(): string {
  return `import { useList } from "@refinedev/core";

interface ListadoProps {
  /** Nombre del recurso en la API REST. */
  recurso: string;
  /** Campos que muestra el listado. */
  campos: string[];
}

// Listado de datos: en Refine 5, useList devuelve { query, result },
// y la carga vive en query.isLoading; en result van { data, total }.
export default function Listado({ recurso, campos }: ListadoProps) {
  const { query, result } = useList({ resource: recurso });
  const registros: Record<string, unknown>[] = result?.data ?? [];

  if (query.isLoading) {
    return <p>Cargando ${"${"}recurso}…</p>;
  }
  if (query.isError) {
    return <p>No se pudo leer ${"${"}recurso}: ${"{"}String((query.error as Error)?.message ?? "error")}</p>;
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
      <h1>${"${"}recurso}</h1>
      <p>{registros.length} registro(s)</p>
      <table style={{ borderCollapse: "collapse", minWidth: "60%" }}>
        <thead>
          <tr>
            ${"${"}campos.map((campo) => (
              <th
                key={campo}
                style={{ textAlign: "left", borderBottom: "1px solid #999", padding: "0.25rem 0.75rem" }}
              >
                {campo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((registro, indice) => (
            <tr key={indice}>
              {campos.map((campo) => (
                <td key={campo} style={{ borderBottom: "1px solid #ddd", padding: "0.25rem 0.75rem" }}>
                  {String(registro[campo] ?? "")}
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

function leeme(genesisDeFecha: string): string {
  return `# Panel de datos (vite + react + Refine)

Proyecto generado por el Estudio de Apps de StarSeed OS el ${genesisDeFecha}.

## Activación MANUAL (nada se ejecuta dentro del OS, nada se despliega sin la palabra de Alex)

1. Node 20+ (lo pide el núcleo \`@refinedev/core\`).
2. \`npm install\`
3. \`npm run dev\` (Vite) y abrir la URL local que imprime.
4. \`npm run build\` compila; \`npm run preview\` sirve el build.

## Configuración

- \`VITE_API_URL\`: URL de la API REST con la que habla el proveedor de datos
  (\`dataProvider\`, de \`@refinedev/simple-rest\`). Va en \`.env.local\` (copia
  \`.env.example\`). Sin valor, el panel monta pero no leerá datos.
- **Si la API necesita una clave: NUNCA en el navegador.** Ponla en un proxy
  propio (un pequeño servidor tuyo al frente de la API) y apunta \`VITE_API_URL\`
  a ese proxy. El navegador solo ve la URL del proxy.
- Los contratos independientes de la fuente de \`src/lib/widget-data/\` del OS se
  conectan en ESA API REST, no dentro de este proyecto: este panel solo consume.

## Telemetría: apagada de serie, de las dos formas

1. \`options={{ disableTelemetry: true }}\` en el componente \`<Refine>\` (\`src/App.tsx\`).
2. \`REFINE_NO_TELEMETRY=true\` en \`.env.example\` / \`.env.local\`.

Sin esas dos, Refine envía datos a \`telemetry.refine.dev\` (y su CLI, a
\`refinement/refine/cli\`): proveedores usados, versión, número de recursos, IP,
host, navegador y sistema. No los compartimos.

## Versiones fijadas

Versiones fijadas el 2026-10-25: revisar con \`npm outdated\`. No actualizar sin
comprobar que \`disableTelemetry\` de \`<Refine>\` y la forma de \`useList\`
(\`{ query, result: { data, total } }\`, carga en \`query.isLoading\`) siguen igual.

## Estructura

- \`src/main.tsx\`: punto de entrada (BrowserRouter).
- \`src/App.tsx\`: \`<Refine>\` con los recursos, rutas y \`disableTelemetry: true\`.
- \`src/paginas/listado.tsx\`: página de listado por recurso con \`useList\`.
`;
}

/**
 * Genera los archivos del proyecto «panel de datos» (vite + react + Refine).
 * Lanza un `Error` en español si algún nombre de recurso o campo no cumple
 * su patrón: los datos del usuario nunca entran crudos en el código generado.
 */
export function plantillaRefine(op: OpcionesPlantillaRefine): AppFile[] {
  validarRecursos(op?.recursos ?? []);
  const slug = slugProyecto(op?.nombre ?? "");
  return [
    archivo("package.json", packageJson(slug)),
    archivo("index.html", indexHtml(slug)),
    archivo("vite.config.ts", viteConfig()),
    archivo("tsconfig.json", tsconfig()),
    archivo(".gitignore", gitignore()),
    archivo(".env.example", envEjemplo()),
    archivo("src/main.tsx", mainTsx()),
    archivo("src/App.tsx", appTsx(op.recursos)),
    archivo("src/paginas/listado.tsx", listadoTsx()),
    archivo("LEEME.md", leeme("2026-10-25")),
  ];
}

