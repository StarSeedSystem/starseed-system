/**
 * StarSeed OS — Plantilla «panel de datos» (Refine) del Estudio de Apps.
 *
 * Genera un proyecto completo (vite + react + Refine 5 con proveedor REST) como
 * lista de AppFile, lista para exportarse como carpeta de texto y activarse
 * MANUALMENTE fuera del OS (`npm install` + `npm run dev`): la plantilla no se
 * ejecuta dentro del OS (ficha «lib-refine», `config/repos-libreria-1025.json`).
 *
 * TELEMETRÍA APAGADA DE SERIE: Refine la envía por defecto a
 * `telemetry.refine.dev` (proveedores, versión, número de recursos, IP, host,
 * navegador y sistema), y su CLI otra aparte a `/cli`. La plantilla la apaga de
 * las dos formas: `options={{ disableTelemetry: true }}` en `<Refine>` y
 * `REFINE_NO_TELEMETRY=true` en `.env.example`.
 *
 * Pura: no importa `node:*`, no toca red ni disco. Los datos del usuario
 * (nombres de recurso y campos) se VALIDAN antes de entrar en el código
 * generado (nada crudo llega a los archivos); el nombre del proyecto se
 * reduce a slug ASCII.
 *
 * Honestidad: la forma de `useList` de Refine (`{ query, result: { data, total } }`
 * y la carga en `query.isLoading`) se verificó en la rama `main` del paquete;
 * las plantillas del OS no se compilan aquí — la activación manual lo dirá.
 */

import { languageForPath, type AppFile } from "./appgen";

/** Nombre de recurso: minúsculas al inicio, minúsculas, dígitos y guiones. */
const PATRON_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
/** Nombre de campo: identificador TypeScript seguro. */
const PATRON_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export interface RecursoRefine {
  /** Nombre del recurso en la API REST (máx. 41, minúsculas + dígitos + guiones). */
  nombre: string;
  /** Campos que enseña el listado (identificadores, máx. 41). */
  campos: string[];
}

export interface OpcionesRefine {
  /** Nombre del proyecto; se reduce a slug ASCII para «package.json». */
  nombre: string;
  /** Un listado por recurso. */
  recursos: RecursoRefine[];
}

/** Versión exacta del núcleo (npm; fecha de verificación: 2026-10-25). */
export const VERSION_REFINE_CORE = "5.0.12";

function fichero(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

/** Reduce el nombre del proyecto a slug ASCII (sin acentos ni símbolos). */
export function slugProyecto(nombre: string): string {
  const limpio = (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio || "panel-de-datos";
}

/**
 * Valida los recursos ANTES de meterlos en texto de código: nunca se genera
 * código con datos crudos del usuario (Error en español si no casan).
 */
function validarRecursos(recursos: RecursoRefine[]): RecursoRefine[] {
  if (!Array.isArray(recursos) || recursos.length === 0) {
    throw new Error(
      "La plantilla del panel de datos necesita al menos un recurso " +
        "(con su nombre y sus campos) en «recursos».",
    );
  }
  for (const recurso of recursos) {
    if (!recurso || typeof recurso.nombre !== "string" || !PATRON_RECURSO.test(recurso.nombre)) {
      throw new Error(
        `Nombre de recurso no válido: «${String(recurso && recurso.nombre)}». ` +
          "Debe empezar por minúscula y llevar solo minúsculas, dígitos y guiones (1 a 41).",
      );
    }
    validarCampos(recurso);
  }
  return recursos;
}

function validarCampos(recurso: RecursoRefine): void {
  if (!Array.isArray(recurso.campos) || recurso.campos.length === 0) {
    throw new Error(`El recurso «${recurso.nombre}» necesita al menos un campo en «campos».`);
  }
  for (const campo of recurso.campos) {
    if (typeof campo !== "string" || !PATRON_CAMPO.test(campo)) {
      throw new Error(
        `Campo no válido en el recurso «${recurso.nombre}»: «${String(campo)}». ` +
          "Debe ser un identificador (letras o «_» al inicio, luego letras, dígitos o «_»; 1 a 41).",
      );
    }
  }
}

/** Versiones verificadas en npm el 2026-10-25: no añadir otras ni inventar. */
const VERSIONES = {
  core: VERSION_REFINE_CORE,
  reactRouter: "2.0.4",
  simpleRest: "6.0.1",
  react: "^19.3.1",
  reactDom: "^19.3.1",
  reactRouter7: "^7.0.2",
  vite: "^8.3.5",
  pluginReact: "^6.1.2",
  typescript: "^5.6.0",
} as const;

function archivoManifest(slug: string): AppFile {
  const manifiesto = {
    name: slug,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      "@refinedev/core": VERSIONES.core,
      "@refinedev/react-router": VERSIONES.reactRouter,
      "@refinedev/simple-rest": VERSIONES.simpleRest,
      react: VERSIONES.react,
      "react-dom": VERSIONES.reactDom,
      "react-router": VERSIONES.reactRouter7,
    },
    devDependencies: {
      "@vitejs/plugin-react": VERSIONES.pluginReact,
      typescript: VERSIONES.typescript,
      vite: VERSIONES.vite,
    },
  };
  return fichero("package.json", JSON.stringify(manifiesto, null, 2) + "\n");
}

function archivoHtml(slug: string): AppFile {
  const lineas = [
    "<!doctype html>",
    '<html lang="es">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${slug}</title>`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.tsx"></script>',
    "  </body>",
    "</html>",
  ];
  return fichero("index.html", lineas.join("\n") + "\n");
}

function archivoViteConfig(): AppFile {
  const lineas = [
    'import { defineConfig } from "vite";',
    'import react from "@vitejs/plugin-react";',
    "",
    "// Configuración mínima: React sobre Vite. Sin analíticas ni telemetría.",
    "export default defineConfig({",
    "  plugins: [react()],",
    "});",
  ];
  return fichero("vite.config.ts", lineas.join("\n") + "\n");
}

function archivoTsconfig(): AppFile {
  const config = {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      moduleDetection: "force",
      types: ["vite/client"],
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ["src"],
  };
  return fichero("tsconfig.json", JSON.stringify(config, null, 2) + "\n");
}

function archivoGitignore(): AppFile {
  const lineas = [
    "node_modules",
    "dist",
    // Se ignoran las copias locales: el ejemplo queda versionado.
    ".env",
    ".env.local",
    "*.log",
  ];
  return fichero(".gitignore", lineas.join("\n") + "\n");
}

function archivoEnvEjemplo(): AppFile {
  const lineas = [
    "# Copia este archivo a .env y pon ahí la dirección base de TU API REST (la tuya).",
    "VITE_API_URL=",
    "",
    "# La telemetría de Refine ya va apagada en el código (options={{ disableTelemetry: true }}",
    "# en src/App.tsx); esta variable refuerza el apagado a nivel de entorno.",
    "REFINE_NO_TELEMETRY=true",
  ];
  return fichero(".env.example", lineas.join("\n") + "\n");
}

function archivoMain(): AppFile {
  const lineas = [
    'import React from "react";',
    'import ReactDOM from "react-dom/client";',
    'import App from "./App";',
    "",
    "// Arranque mínimo con React 19: sin rastreadores ni analíticas de ningún tipo.",
    'ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(',
    "  <React.StrictMode>",
    "    <App />",
    "  </React.StrictMode>,",
    ");",
  ];
  return fichero("src/main.tsx", lineas.join("\n") + "\n");
}

/** Importa «useList» y pinta una tabla con los campos del recurso. */
function archivoListado(): AppFile {
  const lineas = [
    'import { useList } from "@refinedev/core";',
    "",
    "/** Registro genérico: por id y con los campos que pida el recurso. */",
    "interface Registro {",
    "  id?: string | number;",
    "  [campo: string]: unknown;",
    "}",
    "",
    "export interface ListadoProps {",
    "  titulo: string;",
    "  recurso: string;",
    "  campos: string[];",
    "}",
    "",
    "/**",
    " * Listado genérico de un recurso REST.",
    " * Refine 5: «useList» devuelve «{ query, result }»; la carga vive en",
    " * «query.isLoading» y los datos en «result.data».",
    " */",
    "export function Listado({ titulo, recurso, campos }: ListadoProps) {",
    "  const { query, result } = useList<Registro>({ resource: recurso });",
    "  const registros = result?.data ?? [];",
    "",
    "  return (",
    "    <section>",
    "      <h2>{titulo}</h2>",
    "      {query.isLoading ? <p>Cargando…</p> : null}",
    "      {query.isError ? (",
    "        <p>No se pudo cargar «{recurso}». Revisa VITE_API_URL y tu API REST.</p>",
    "      ) : null}",
    '      {!query.isLoading && registros.length === 0 ? <p>Sin registros todavía.</p> : null}',
    "      {registros.length > 0 ? (",
    "        <table>",
    "          <thead>",
    "            <tr>",
    "              {campos.map((campo) => (",
    '                <th key={campo}>{campo}</th>',
    "              ))}",
    "            </tr>",
    "          </thead>",
    "          <tbody>",
    "            {registros.map((registro, indice) => (",
    '              <tr key={String(registro.id ?? `registro-${indice}`)}>',
    "                {campos.map((campo) => (",
    "                  <td key={campo}>{String(registro[campo] ?? \"\")}</td>",
    "                ))}",
    "              </tr>",
    "            ))}",
    "          </tbody>",
    "        </table>",
    "      ) : null}",
    "    </section>",
    "  );",
    "}",
  ];
  return fichero("src/paginas/listado.tsx", lineas.join("\n") + "\n");
}

/** «sitios-capas» → «ListadoSitiosCapas» (los nombres de recurso ya están validados). */
function nombreComponenteRecurso(nombre: string): string {
  return (
    "Listado" +
    nombre
      .split("-")
      .filter(Boolean)
      .map((parte) => parte[0].toUpperCase() + parte.slice(1))
      .join("")
  );
}

/** Una página envolvente por recurso: fija título, recurso y campos. */
function archivoListadoRecurso(recurso: RecursoRefine): AppFile {
  const componente = nombreComponenteRecurso(recurso.nombre);
  // Los campos ya están validados como identificadores: entran como literales.
  const camposLiteral = JSON.stringify(recurso.campos);
  const lineas = [
    'import { Listado } from "./listado";',
    "",
    `// Página del recurso «${recurso.nombre}»: usa el listado genérico.`,
    `export default function ${componente}() {`,
    "  return (",
    "    <Listado",
    `      titulo="Panel · ${recurso.nombre}"`,
    `      recurso="${recurso.nombre}"`,
    `      campos={${camposLiteral}}`,
    "    />",
    "  );",
    "}",
  ];
  return fichero(`src/paginas/listado-${recurso.nombre}.tsx`, lineas.join("\n") + "\n");
}

function archivoLeeme(slug: string, recursos: RecursoRefine[]): AppFile {
  const listaRecursos = recursos.map((r) => `- \`${r.nombre}\`: campos ${r.campos.join(", ")}`).join("\n");
  const lineas = [
    `# Panel de datos — ${slug}`,
    "",
    "Panel de datos con React, Refine y Vite, generado por el Estudio de Apps de StarSeed OS.",
    "Ficha del paquete: «lib-refine» en `config/repos-libreria-1025.json` (MIT).",
    "",
    "## Activación (manual, fuera del OS)",
    "",
    "Nada aquí lo ejecuta el OS: requiere Node 20 o superior (el núcleo de Refine lo pide).",
    "",
    "1. Copia `.env.example` a `.env` y pon ahí la dirección base de TU API REST en",
    "   `VITE_API_URL` (vacío por defecto: nada sale de este proyecto hasta que tú la pongas).",
    "2. `npm install`",
    "3. `npm run dev`",
    "",
    "## Telemetría: apagada de las dos formas",
    "",
    "- En código: `options={{ disableTelemetry: true }}` en `src/App.tsx`.",
    "- En entorno: `REFINE_NO_TELEMETRY=true` (la CLI de Refine manda su propia telemetría;",
    "  esta plantilla NO incluye la CLI ni scripts de Refine).",
    "",
    "## Claves y datos",
    "",
    "- Si tu API necesita una clave, NUNCA va en el navegador ni en este código: pon un",
    "  proxy propio y dale al panel la dirección del proxy en `VITE_API_URL`.",
    "- El proveedor de datos (`@refinedev/simple-rest`) habla con una API REST: los",
    "  contratos independientes de la fuente de `src/lib/widget-data/` se conectan en",
    "  ESA API, no dentro de este proyecto.",
    "",
    "## Recursos incluidos",
    "",
    listaRecursos,
    "",
    "## Versiones y despliegue",
    "",
    "- Versiones fijadas el 2026-10-25 (comprobadas en npm ese día); revisar con",
    "  `npm outdated` antes de actualizar.",
    "- Nada se despliega sin la palabra de Alex.",
    "- Honestidad: la forma de `useList` de Refine 5 se comprobó en la rama `main` del",
    "  paquete; estas plantillas no se compilan dentro del OS — `npm run build` lo dirá.",
  ];
  return fichero("LEEME.md", lineas.join("\n") + "\n");
}

/** Ensambla el proyecto completo: validación primero, luego los archivos. */
export function plantillaRefine(op: OpcionesRefine): AppFile[] {
  if (!op || typeof op.nombre !== "string") {
    throw new Error("La plantilla del panel de datos necesita un «nombre» de proyecto.");
  }
  const recursos = validarRecursos(op.recursos);
  const slug = slugProyecto(op.nombre);
  return [
    archivoManifest(slug),
    archivoHtml(slug),
    archivoViteConfig(),
    archivoTsconfig(),
    archivoGitignore(),
    archivoEnvEjemplo(),
    archivoMain(),
    archivoApp(recursos),
    archivoListado(),
    ...recursos.map(archivoListadoRecurso),
    archivoLeeme(slug, recursos),
  ];
}

function archivoApp(recursos: RecursoRefine[]): AppFile {
  const lineas: string[] = [
    'import { BrowserRouter, Route, Routes } from "react-router";',
    'import { Refine } from "@refinedev/core";',
    'import { routerProvider } from "@refinedev/react-router";',
    'import { dataProvider } from "@refinedev/simple-rest";',
  ];
  for (const recurso of recursos) {
    const componente = nombreComponenteRecurso(recurso.nombre);
    lineas.push(`import ${componente} from "./paginas/listado-${recurso.nombre}";`);
  }
  lineas.push(
    "",
    "// Recursos del panel: un listado por recurso. Para editar, crear o borrar añade",
    "// los ganchos de `@refinedev/core` (useForm, useCreate, useDelete…) y las rutas.",
    "const recursos = [",
  );
  for (const recurso of recursos) {
    const componente = nombreComponenteRecurso(recurso.nombre);
    lineas.push(`  { name: "${recurso.nombre}", list: ${componente} },`);
  }
  lineas.push("];", "");
  lineas.push(
    "// Telemetría de Refine APAGADA de serie (ficha «lib-refine» del catálogo del OS);",
    "// también queda `REFINE_NO_TELEMETRY=true` en el entorno (.env.example).",
    "export default function App() {",
    "  return (",
    "    <BrowserRouter>",
    "      <Refine",
    "        dataProvider={dataProvider(import.meta.env.VITE_API_URL)}",
    "        routerProvider={routerProvider}",
    "        resources={recursos}",
    "        options={{ disableTelemetry: true }}",
    "      >",
    "        <Routes>",
  );
  recursos.forEach((recurso, indice) => {
    const componente = nombreComponenteRecurso(recurso.nombre);
    // El primer recurso sirve también de portada («/»).
    if (indice === 0) {
      lineas.push(`          <Route path="/" element={<${componente} />} />`);
    }
    lineas.push(`          <Route path="/${recurso.nombre}" element={<${componente} />} />`);
  });
  lineas.push(
    "        </Routes>",
    "      </Refine>",
    "    </BrowserRouter>",
    "  );",
    "}",
  );
  return fichero("src/App.tsx", lineas.join("\n") + "\n");
}
