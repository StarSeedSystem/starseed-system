/**
 * StarSeed OS — Estudio de Apps · plantilla «panel de datos» con Refine (DSN1025H).
 *
 * Genera los archivos de un proyecto Vite + React + Refine (@refinedev/core 5.0.12,
 * @refinedev/react-router 2.0.4, @refinedev/simple-rest 6.0.1) que el Estudio
 * de Apps exporta como carpeta de texto. Pura: ninguna entrada/salida de disco,
 * red ni procesos; sin `node:*` para poder cargarla en el navegador.
 *
 * Telemetría de Refine apagada de serie, de las dos formas: `options={{
 * disableTelemetry: true }}` en `<Refine>` y `REFINE_NO_TELEMETRY=true` en
 * `.env.example` (la CLI manda aparte y aquí no se usa ninguna CLI).
 *
 * Datos reales verificados: ficha `lib-refine` en `config/repos-libreria-1025.json`
 * (versiones comprobadas en npm el 2026-10-25). Dentro del OS los paneles siguen
 * siendo UiSpec; esta plantilla lleva fuera del OS una app completa.
  */

import { languageForPath, type AppFile } from "@/lib/appgen/appgen";

function viteConfigTs(): string {
  return [
    'import { defineConfig } from "vite";',
    'import react from "@vitejs/plugin-react";',
    "",
    "export default defineConfig({",
    "  plugins: [react()],",
    "});",
  ].join("\n");
}

function tsconfigJson(): string {
  const configuracion = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      types: ["vite/client"],
      strict: true,
      isolatedModules: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ["src"],
  };
  return `${JSON.stringify(configuracion, null, 2)}\n`;
}

function gitignoreTxt(): string {
  return ["node_modules/", "dist/", "*.local", ".env", ".DS_Store", ""].join("\n");
}

// La URL de la API se rellena tras activar el proyecto: el archivo de ejemplo
// solo lleva NOMBRES de variables, nunca valores de secreto.
function envExampleTxt(): string {
  return ["VITE_API_URL=", "REFINE_NO_TELEMETRY=true", ""].join("\n");
}

// ─── Código TSX del proyecto ────────────────────────────────────────────────

function mainTsx(): string {
  return [
    'import { StrictMode } from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { BrowserRouter } from "react-router";',
    'import App from "./App";',
    "",
    'const raiz = document.getElementById("root");',
    "if (!raiz) throw new Error(\"No se encontró el elemento #root en index.html.\");",
    "",
    "createRoot(raiz).render(",
    "  <StrictMode>",
    "    <BrowserRouter>",
    "      <App />",
    "    </BrowserRouter>",
    "  </StrictMode>,",
    ");",
    "",
  ].join("\n");
}

/** «pedidos-verde» → «PedidosVerde» (nombres de componente seguros). */
function leemeMd(slug: string): string {
  return [
    `# ${slug} · panel de datos con Refine`,
    "",
    "Proyecto generado por el Estudio de Apps de StarSeed OS: Vite + React +",
    "Refine (`@refinedev/core`) con proveedor de datos REST.",
    "",
    "## Activación manual (no se ejecuta nada dentro del OS)",
    "",
    "Se necesita Node 20 o más (lo pide el núcleo de Refine 5):",
    "",
    "1. `npm install`",
    "2. Copia `.env.example` a `.env` y rellena `VITE_API_URL` con la base del",
    "   proveedor de datos (una API REST que entienda Refine).",
    "3. `npm run dev` para abrirlo en desarrollo; `npm run build` para compilar.",
    "",
    "`versiones fijadas el 2026-10-25: revisar con npm outdated.` El `package.json`",
    "trae versiones exactas comprobadas en npm (`@refinedev/core` 5.0.12,",
    "`@refinedev/react-router` 2.0.4, `@refinedev/simple-rest` 6.0.1) y rangos",
    "para el resto; no añadas dependencias sin revisarlas.",
    "",
    "## Telemetría apagada",
    "",
    "Refine envía telemetría por defecto; este proyecto la lleva apagada de las",
    "dos formas: `options={{ disableTelemetry: true }}` en `<Refine>` (src/App.tsx)",
    "y `REFINE_NO_TELEMETRY=true` en `.env.example` (y en tu `.env`). No hay CLI",
    "de Refine en este proyecto, que también manda su telemetría aparte.",
    "",
    "## Datos",
    "",
    "El proveedor de datos habla con una API REST; los contratos independientes",
    "de la fuente de `src/lib/widget-data/` de StarSeed OS se conectan en esa",
    "API, nunca dentro de este proyecto. Si la API necesita una clave, la lleva",
    "un proxy propio (un servidor que tú controlas), nunca el navegador: las",
    "claves van en variables de entorno, detrás del proxy.",
    "",
    "## Despliegue",
    "",
    "Nada se despliega sin la palabra de Alex.",
    "",
  ].join("\n");
}

/** «pedidos-verde» → «PedidosVerde» (nombres de componente seguros). */
function nombreComponente(recurso: string): string {
  return recurso
    .split("-")
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join("");
}

function appTsx(recursos: RecursoPanel[]): string {
  const imports = recursos
    .map(
      (r) => `import { Listado${nombreComponente(r.nombre)} } from "./paginas/listado-${r.nombre}";`,
    )
    .join("\n");
  const items = recursos.map((r) => `      <li><a href="/${r.nombre}">${r.nombre}</a></li>`).join("\n");
  const rutas = recursos
    .map(
      (r) => `        <Route path="/${r.nombre}" element={<Listado${nombreComponente(r.nombre)} />} />`,
    )
    .join("\n");
  const listing = recursos
    .map((r) => `        { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  return [
    imports,
    'import { Refine } from "@refinedev/core";',
    'import { dataProvider } from "@refinedev/simple-rest";',
    'import { routerProvider } from "@refinedev/react-router";',
    'import { Route, Routes } from "react-router";',
    "",
    "// La URL de la API se lee de la variable de entorno (ver .env.example):",
    "// nunca una clave en el código; si la API exige autenticación aterriza tras",
    "// un proxy propio del proyecto, nunca en el navegador.",
    'const API_URL: string = import.meta.env.VITE_API_URL ?? "";',
    "",
    "export default function App() {",
    "  return (",
    "    <Refine",
    "      dataProvider={dataProvider(API_URL)}",
    "      routerProvider={routerProvider}",
    "      resources={[",
    listing,
    "      ]}",
    "      options={{ disableTelemetry: true }}",
    "    >",
    "      <Routes>",
    '        <Route path="/" element={<Indice />} />',
    rutas,
    "      </Routes>",
    "    </Refine>",
    "  );",
    "}",
    "",
    "function Indice() {",
    "  return (",
    "    <main>",
    "      <h1>Panel de datos</h1>",
    "      <ul>",
    items,
    "      </ul>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/**
 * Una página de listado por recurso, con `useList` de `@refinedev/core`: en
 * Refine 5 devuelve `{ query, result: { data, total } }` y la carga está en
 * `query.isLoading` (verificado en la rama main del repo de Refine, 2026-10-25).
 */
function listaTsx(recurso: RecursoPanel): string {
  const componente = `Listado${nombreComponente(recurso.nombre)}`;
  const cabecera = recurso.campos.map((c) => `            <th>${c}</th>`).join("\n");
  const celdas = recurso.campos
    .map((c) => `              <td>{String(fila.${c} ?? "")}</td>`)
    .join("\n");
  return [
    'import { useList } from "@refinedev/core";',
    "",
    `const RECURSO = "${recurso.nombre}";`,
    `const CAMPOS: string[] = [${recurso.campos.map((c) => `"${c}"`).join(", ")}];`,
    "",
    "type Registro = Record<string, unknown>;",
    "",
    `export function ${componente}() {`,
    "  const { query, result } = useList({ resource: RECURSO, pagination: { pageSize: 20 } });",
    "  const filas: Registro[] = (result?.data ?? []) as Registro[];",
    "  return (",
    "    <main>",
    `      <h1>${recurso.nombre}</h1>`,
    `      <p>{query.isLoading ? "Cargando…" : \`Total: \${result?.total ?? 0}\`}</p>`,
    "      {query.isError && (",
    '        <p role="alert">No se pudo cargar la lista.',
    "          <button type=\"button\" onClick={() => void query.refetch()}>Reintentar</button>",
    "        </p>",
    "      )}",
    "      <table>",
    "        <thead>",
    "          <tr>",
    cabecera,
    "          </tr>",
    "        </thead>",
    "        <tbody>",
    "          {filas.map((fila, indice) => (",
    "            <tr key={indice}>",
    celdas,
    "            </tr>",
    "          ))}",
    "        </tbody>",
    "      </table>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

// ─── Archivos raíz ───────────────────────────────────────────────────────────

function htmlIndex(slug: string): string {
  return [
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
    "",
  ].join("\n");
}

function paqueteJson(slug: string): string {
  const paquete = {
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
  };
  return `${JSON.stringify(paquete, null, 2)}\n`;
}


/** Reduce un nombre cualquiera a un slug ASCII (`a-z`, `0-9`, guiones). */
function slugAscii(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "panel-datos";
}

function validarRecursos(recursos: RecursoPanel[]): RecursoPanel[] {
  if (!Array.isArray(recursos) || recursos.length === 0) {
    throw new Error("El panel necesita al menos un recurso con campos.");
  }
  return recursos.map((recurso, indice) => {
    const nombre = String(recurso?.nombre ?? "").trim();
    if (!RE_NOMBRE.test(nombre)) {
      throw new Error(
        `Nombre de recurso no válido en la posición ${indice}: «${nombre}». ` +
          "Usa minúsculas (con números y guiones), empieza por letra y no pases de 41 caracteres.",
      );
    }
    const campos = Array.isArray(recurso?.campos) ? recurso.campos : [];
    for (const crudo of campos) {
      const campo = String(crudo ?? "").trim();
      if (!RE_CAMPO.test(campo)) {
        throw new Error(
          `Nombre de campo no válido en el recurso «${nombre}»: «${campo}». ` +
            "Usa letras, guiones bajos y dígitos, empieza por letra o guion bajo y no pases de 41 caracteres.",
        );
      }
    }
    return { nombre, campos: campos.map((campo) => String(campo).trim()) };
  });
}

/** Recurso que pide quien usa el Estudio de Apps. */
export interface RecursoPanel {
  /** Nombre del recurso en la API REST (minúsculas, números y guiones). */
  nombre: string;
  /** Campos que muestra el listado. */
  campos: string[];
}

export interface PlantillaRefineOps {
  /** Nombre del proyecto: se reduce a un slug ASCII antes de usarse. */
  nombre: string;
  /** Recursos del panel: uno genera una página de listado. */
  recursos: RecursoPanel[];
}

const RE_NOMBRE = /^[a-z][a-z0-9-]{0,40}$/;
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/**
 * Genera el conjunto completo de archivos del proyecto. Valida nombres y
 * campos con clases de caracteres cerradas: nada del usuario entra crudo en
 * el código generado; lo que no case, lanza un Error en español.
 */
export function plantillaRefine(operaciones: PlantillaRefineOps): AppFile[] {
  const recursos = validarRecursos(operaciones.recursos);
  const slug = slugAscii(operaciones.nombre || "");

  const pares: { path: string; content: string }[] = [];
  const push = (path: string, content: string): void => {
    pares.push({ path, content });
  };

  push("index.html", htmlIndex(slug));
  push("package.json", paqueteJson(slug));
  push("LEEME.md", leemeMd(slug));
  push("vite.config.ts", viteConfigTs());
  push("tsconfig.json", tsconfigJson());
  push(".gitignore", gitignoreTxt());
  push(".env.example", envExampleTxt());
  push("src/main.tsx", mainTsx());
  push("src/App.tsx", appTsx(recursos));

  for (const recurso of recursos) {
    push(`src/paginas/listado-${recurso.nombre}.tsx`, listaTsx(recurso));
  }

  return pares.map((par) => ({
    path: par.path,
    content: par.content,
    language: languageForPath(par.path),
  }));
}
