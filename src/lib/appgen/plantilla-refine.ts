/**
 * StarSeed OS — Plantilla «panel de datos» con Refine (DSN1025H · Ola 1025R).
 *
 * Ficha lib-refine (config/repos-libreria-1025.json): @refinedev/core 5.0.12 (npm,
 * 2026-04-02), MIT. Refine envía TELEMETRÍA por defecto a telemetry.refine.dev
 * (proveedores usados, versión, número de recursos, IP, host, navegador y sistema)
 * y su CLI otra a /cli: la plantilla la apaga de LAS DOS formas, con
 * `options={{ disableTelemetry: true }}` en `<Refine>` y `REFINE_NO_TELEMETRY=true`
 * en `.env.example`.
 *
 * PURO: sin `node:*`, sin red, sin disco ni reloj. Genera los archivos de un
 * proyecto vite + react (React 19) que el Estudio de Apps exporta como carpeta
 * de texto; lo que ejecuta código (npm install, la CLI de Refine) queda MANUAL,
 * explicado en el LEEME.md generado, y nada se despliega sin la palabra de Alex.
 *
 * Ningún dato del usuario entra CRUDO en el código generado: los nombres de
 * recurso y de campo se validan con regex estrictas y el nombre del proyecto se
 * reduce a un slug ASCII. Versión de `useList` comprobada en Refine 5: devuelve
 * `{ query, result: { data, total } }` y la carga vive en `query.isLoading`.
 */
import { languageForPath, type AppFile } from "./appgen";

export interface RecursoRefine {
  /** Nombre del recurso: minúsculas, números y guiones; ^[a-z][a-z0-9-]{0,40}$. */
  nombre: string;
  /** Campos del listado: ^[A-Za-z_][A-Za-z0-9_]{0,40}$. */
  campos: string[];
}

export interface OpcionesPlantillaRefine {
  /** Nombre del proyecto; se reduce a un slug ASCII para el package.json. */
  nombre: string;
  /** Un listado por recurso. */
  recursos: RecursoRefine[];
}

const RE_NOMBRE = /^[a-z][a-z0-9-]{0,40}$/;
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
/** Fecha en que se fijaron las versiones del package.json (npm, comprobadas). */
const VERSIONES_FIJADAS = "2026-10-25";

function fichero(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

/** Slug ASCII del nombre del proyecto (lo que entra en package.json): sin acentos ni símbolos. */
function slug(nombre: string): string {
  const base = (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "panel-de-datos";
}

/** Nombre del componente React del listado de un recurso (ya validado). */
function nombreComponente(nombre: string): string {
  return nombre
    .split("-")
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join("");
}

/** Título humano del recurso (ya validado; solo para textos de la interfaz). */
function titulo(nombre: string): string {
  const t = nombre.split("-").filter(Boolean).join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** package.json del proyecto: SOLO las versiones verificadas el 2026-10-25, nada más. */
function packageJson(nombreProyecto: string): string {
  return JSON.stringify(
    {
      name: nombreProyecto,
      private: true,
      version: "0.1.0",
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
    2,
  );
}

function indexHtml(nombreProyecto: string): string {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${nombreProyecto}</title>`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.tsx"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

const VITE_CONFIG = [
  'import { defineConfig } from "vite";',
  'import react from "@vitejs/plugin-react";',
  "",
  "export default defineConfig({",
  "  plugins: [react()],",
  "});",
  "",
].join("\n");

/** tsconfig mínimo del proyecto generado (strict, noEmit: typecheck del propio panel). */
function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        isolatedModules: true,
        skipLibCheck: true,
        types: ["vite/client"],
      },
      include: ["src"],
    },
    null,
    2,
  );
}

const GITIGNORE = ["node_modules", "dist", ".env", ""].join("\n");

/** .env.example: sin valores secretos, solo NOMBRES de variables (dos, con vacía la URL). */
const ENV_EJEMPLO = [
  "# URL base de la API REST que consulta el proveedor de datos (déjala vacía y escríbela en .env).",
  "# Si la API exige credenciales, van detrás de un proxy propio: nunca en el navegador.",
  "VITE_API_URL=",
  "",
  "# Telemetría de Refine apagada también por entorno (su CLI envía otra si no).",
  "REFINE_NO_TELEMETRY=true",
  "",
].join("\n");

const MAIN_TSX = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { App } from "./App";',
  "",
  'createRoot(document.getElementById("root")!).render(',
  "  <React.StrictMode>",
  "    <App />",
  "  </React.StrictMode>,",
  ");",
  "",
].join("\n");

/** src/App.tsx del proyecto: monta <Refine> con telemetría apagada y rutas por recurso. */
function appTsx(recursos: RecursoRefine[]): string {
  const importaciones = recursos
    .map(
      (r) =>
        `import { Listado${nombreComponente(r.nombre)} } from "./paginas/listado-${r.nombre}";`,
    )
    .join("\n");
  const recursosJsx = recursos
    .map((r) => `        { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  const rutas = recursos
    .map(
      (r) =>
        `        <Route path="/${r.nombre}" element={<Listado${nombreComponente(r.nombre)} />} />`,
    )
    .join("\n");
  const [primerRecurso] = recursos;
  const inicio = primerRecurso
    ? `        <Route path="/" element={<Navigate to="/${primerRecurso.nombre}" replace />} />`
    : "";
  return [
    'import { Refine } from "@refinedev/core";',
    'import dataProvider from "@refinedev/simple-rest";',
    'import routerProvider from "@refinedev/react-router";',
    'import { BrowserRouter, Navigate, Route, Routes } from "react-router";',
    importaciones,
    "",
    "// La URL de la API va por entorno (.env). Si la API exige credenciales, se",
    "// consultan desde un proxy propio: nunca en el navegador (ver LEEME.md).",
    "const API_URL = import.meta.env.VITE_API_URL as string;",
    "",
    "export const App = () => (",
    "  <BrowserRouter>",
    "    <Refine",
    "      dataProvider={dataProvider(API_URL)}",
    "      routerProvider={routerProvider}",
    "      resources={[",
    recursosJsx,
    "      ]}",
    "      // Telemetría apagada: Refine la envía a un tercero si no se le quita.",
    "      options={{ disableTelemetry: true }}",
    "    >",
    "      <Routes>",
    inicio,
    rutas,
    "      </Routes>",
    "    </Refine>",
    "  </BrowserRouter>",
    ");",
    "",
  ].join("\n");
}

/** src/paginas/listado-<recurso>.tsx: el listado del recurso con useList de Refine 5. */
function paginaListado(recurso: RecursoRefine): string {
  const componente = `Listado${nombreComponente(recurso.nombre)}`;
  const campos = recurso.campos.map((c) => `  "${c}",`).join("\n");
  return [
    'import { useList } from "@refinedev/core";',
    "",
    `// Campos del recurso validados por la plantilla del Estudio de Apps (StarSeed OS).`,
    "const CAMPOS = [",
    campos,
    "] as const;",
    "",
    "type Fila = Record<string, string | number | boolean | null>;",
    "",
    `export function ${componente}() {`,
    `  const { query, result } = useList({ resource: "${recurso.nombre}" });`,
    "",
    "  // En Refine 5 la carga vive en query.isLoading y los datos en result: { data, total }.",
    "  if (query.isLoading) return <p>Cargando…</p>",
    "  if (query.isError) return <p>No se pudo cargar la lista.</p>",
    "",
    "  const datos = (result?.data ?? []) as Fila[];",
    "",
    "  return (",
    '    <main style={{ maxWidth: "60rem", margin: "0 auto", padding: "1rem", fontFamily: "system-ui" }}>',
    `      <h1>${titulo(recurso.nombre)}</h1>`,
    '      <table style={{ borderCollapse: "collapse", width: "100%" }}>',
    "        <thead>",
    "          <tr>",
    "            {CAMPOS.map((campo) => (",
    '              <th key={campo} style={{ textAlign: "left", borderBottom: "1px solid #d4d4d4", padding: "0.5rem" }}>',
    "                {campo}",
    "              </th>",
    "            ))}",
    "          </tr>",
    "        </thead>",
    "        <tbody>",
    "          {datos.map((fila, i) => (",
    '            <tr key={i}>',
    "              {CAMPOS.map((campo) => (",
    '                <td key={campo} style={{ borderBottom: "1px solid #e5e5e5", padding: "0.5rem" }}>',
    '                  {String(fila[campo] ?? "")}',
    "                </td>",
    "              ))}",
    "            </tr>",
    "          ))}",
    "        </tbody>",
    "      </table>",
    "      {datos.length === 0 && <p>Sin registros.</p>}",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/** LEEME.md del proyecto: texto de activación manual, nunca despliegue automático. */
function leemeMd(): string {
  return [
    "# Panel de datos con Refine · LEEME",
    "",
    "Proyecto generado por el Estudio de Apps de StarSeed OS (tarea DSN1025H):",
    "Vite + React 19 + `@refinedev/core` 5.0.12 con proveedor de datos REST.",
    "",
    "## Activación (MANUAL, en tu equipo, nunca automática)",
    "",
    "1. Node 20 o más nuevo (el núcleo de Refine lo pide).",
    "2. `npm install`",
    "3. Copia `.env.example` a `.env` y escribe ahí tu `VITE_API_URL`.",
    "4. `npm run dev`",
    "",
    "Su CLI (`@refinedev/cli`) y `create-refine-app` instalan paquetes y ejecutan",
    "código: no se usan nada más que a mano y leyéndolos antes.",
    "",
    "## Versiones",
    "",
    `Versiones fijadas el ${VERSIONES_FIJADAS} y comprobadas en npm:`,
    "`@refinedev/core` 5.0.12, `@refinedev/react-router` 2.0.4,",
    "`@refinedev/simple-rest` 6.0.1, react y react-dom ^19.3.1, react-router",
    "^7.0.2, vite ^8.3.5, @vitejs/plugin-react ^6.1.2 y typescript ^5.6.0. Revisa",
    "con `npm outdated` antes de actualizar: si el núcleo cambia de versión,",
    "comprueba que `options.disableTelemetry` sigue existiendo.",
    "",
    "## Telemetría (apagada)",
    "",
    "Refine envía telemetría a telemetry.refine.dev (proveedores usados, versión,",
    "número de recursos, IP, host, navegador y sistema) y su CLI otra a un punto",
    "/cli (comando, versiones de Node y del sistema, paquetes instalados). Aquí",
    "está apagada de LAS DOS formas:",
    "- `options={{ disableTelemetry: true }}` en `<Refine>` (src/App.tsx).",
    "- `REFINE_NO_TELEMETRY=true` en `.env.example` (cópialo a tu `.env`).",
    "",
    "## Claves",
    "",
    "Nada de claves en este código ni en el navegador. Si la API REST exige",
    "credenciales, ponlas detrás de un proxy propio (un servidor que añada la",
    "clave) y apunta `VITE_API_URL` a ese proxy.",
    "",
    "## Datos",
    "",
    "El proveedor de datos (`@refinedev/simple-rest`) habla con una API REST. Los",
    "contratos independientes de la fuente de `src/lib/widget-data/` de StarSeed",
    "OS se conectan EN ESA API (adaptadores allí), nunca dentro de este proyecto.",
    "",
    "## Publicación",
    "",
    "Nada se despliega ni publica sin la palabra de Alex: ni este panel ni la API",
    "a la que habla.",
    "",
  ].join("\n");
}

/**
 * Genera los archivos del proyecto «panel de datos» (vite + react + Refine con
 * proveedor REST). PURA y determinista: dos llamadas con la misma entrada
 * devuelven el mismo array. Los datos del usuario nunca entran crudos en el
 * código generado: recurso y campos se validan y el nombre del proyecto se
 * pasa a slug ASCII.
 */
export function plantillaRefine(op: OpcionesPlantillaRefine): AppFile[] {
  if (!Array.isArray(op?.recursos)) {
    throw new Error("Los recursos del panel deben ir en una lista.");
  }
  const vistos = new Set<string>();
  const recursos: RecursoRefine[] = op.recursos.map((r) => {
    if (!r || typeof r?.nombre !== "string" || !RE_NOMBRE.test(r.nombre)) {
      throw new Error(
        "El nombre de recurso no es válido: minúsculas, números y guiones, empezando por letra (p. ej. «clientes»), máx. 41 caracteres.",
      );
    }
    if (vistos.has(r.nombre)) {
      throw new Error(`El recurso «${r.nombre}» está repetido: cada recurso va una sola vez.`);
    }
    vistos.add(r.nombre);
    return {
      nombre: r.nombre,
      campos: (Array.isArray(r?.campos) ? r.campos : []).map((c) => {
        if (typeof c !== "string" || !RE_CAMPO.test(c)) {
          throw new Error(
            "Hay un campo no válido: letras, números y guion bajo, empezando por letra o _ (p. ej. «nombre»), máx. 41 caracteres.",
          );
        }
        return c;
      }),
    };
  });
  const nombreProyecto = slug(typeof op?.nombre === "string" ? op.nombre : "");
  return [
    fichero("package.json", packageJson(nombreProyecto)),
    fichero("index.html", indexHtml(nombreProyecto)),
    fichero("vite.config.ts", VITE_CONFIG),
    fichero("tsconfig.json", tsconfigJson()),
    fichero(".gitignore", GITIGNORE),
    fichero(".env.example", ENV_EJEMPLO),
    fichero("src/main.tsx", MAIN_TSX),
    fichero("src/App.tsx", appTsx(recursos)),
    ...recursos.map((r) =>
      fichero(`src/paginas/listado-${r.nombre}.tsx`, paginaListado(r)),
    ),
    fichero("LEEME.md", leemeMd()),
  ];
}
