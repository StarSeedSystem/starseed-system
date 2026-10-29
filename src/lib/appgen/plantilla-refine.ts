/**
 * StarSeed OS — Estudio de Apps · plantilla «panel de datos» con Refine.
 *
 * Genera (como texto, sin ejecutar nada) un proyecto Vite + React con
 * `@refinedev/core` 5.0.12, una página de listado por recurso y la telemetría
 * de Refine APAGADA por partida doble: `options={{ disableTelemetry: true }}`
 * en `<Refine>` y `REFINE_NO_TELEMETRY=true` en el entorno (la CLI de Refine
 * manda aparte, a /cli, pero aquí no hay CLI: la activación es manual).
 *
 * Puro: no importa `node:*`; de appgen toma solo el TIPO `AppFile` y
 * `languageForPath`. Los datos del usuario nunca entran crudos en el código
 * generado: nombres de recurso y campos se validan (Error en español si no
 * casan) y el nombre del proyecto se reduce a un slug ASCII.
 *
 * Versiones verificadas en npm el 2026-10-25 (ficha `lib-refine` de
 * `config/repos-libreria-1025.json`). No añadir dependencias ni versiones.
 */

import { languageForPath, type AppFile } from "./appgen";

export interface RecursoRefine {
  /** Nombre del recurso en la API y en Refine:^[a-z][a-z0-9-]{0,40}$ */
  nombre: string;
  /** Campos del recurso:^[A-Za-z_][A-Za-z0-9_]{0,40}$ */
  campos: string[];
}

export interface OpPlantillaRefine {
  /** Nombre visible del proyecto; se reduce a slug ASCII. */
  nombre: string;
  recursos: RecursoRefine[];
}

const PATRON_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const PATRON_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/** Reduce un nombre libre a slug ASCII seguro (o slug de reserva). */
export function slugAscii(valor: string): string {
  const base = (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "panel-de-datos";
}

/** «mis-clientes» → «MisClientes» (nombre de componente generado). */
export function aPascalCase(recurso: string): string {
  return recurso
    .split("-")
    .map((trozo) => trozo.charAt(0).toUpperCase() + trozo.slice(1))
    .join("");
}

function validar(op: OpPlantillaRefine): void {
  if (!Array.isArray(op.recursos) || op.recursos.length === 0) {
    throw new Error("La plantilla necesita al menos un recurso.");
  }
  const vistos = new Set<string>();
  for (const recurso of op.recursos) {
    if (!PATRON_RECURSO.test(recurso.nombre)) {
      throw new Error(
        `Nombre de recurso no válido: «${recurso.nombre}». Usa minúsculas, dígitos y guiones, empezando por letra (máximo 41 caracteres), p. ej. «clientes».`,
      );
    }
    if (vistos.has(recurso.nombre)) {
      throw new Error(`Nombre de recurso repetido: «${recurso.nombre}».`);
    }
    vistos.add(recurso.nombre);
    if (!Array.isArray(recurso.campos) || recurso.campos.length === 0) {
      throw new Error(`El recurso «${recurso.nombre}» necesita al menos un campo.`);
    }
    for (const campo of recurso.campos) {
      if (!PATRON_CAMPO.test(campo)) {
        throw new Error(
          `Campo no válido en el recurso «${recurso.nombre}»: «${campo}». Usa letras, dígitos y guiones bajos, empezando por letra o guion bajo (máximo 41 caracteres).`,
        );
      }
    }
  }
}

function archivo(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

// ────────────────────────────────────────────────────────────────────────────
// Archivos de base del proyecto (versiones verificadas el 2026-10-25)
// ────────────────────────────────────────────────────────────────────────────

function archivoPackage(nombreProyecto: string): string {
  return (
    JSON.stringify(
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
    ) + "\n"
  );
}

const INDEX_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Panel de datos · Refine</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      main { margin: 0 auto; padding: 2rem; max-width: 60rem; }
      table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
      th, td { border-bottom: 1px solid #d4d4d8; padding: 0.5rem; text-align: left; }
      th { background: #f4f4f5; }
      .vacio { color: #71717a; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`;

const GITIGNORE = `node_modules/
dist/
*.local
.env
.env.local
`;

const ENV_EXAMPLE = `# Dirección de la API REST que atiende los recursos del panel (p. ej. el proxy propio).
# Sin valor aquí: se fija en .env.local, nunca con claves dentro del proyecto.
VITE_API_URL=
# Apaga la telemetría de la CLI de Refine (telemetry.refine.dev y su canal /cli).
# La propia app ya la lleva apagada de fábrica con disableTelemetry: true en <Refine>.
REFINE_NO_TELEMETRY=true
`;

// ────────────────────────────────────────────────────────────────────────────
// src/ de la app generada: main.tsx y App.tsx (telemetría apagada aquí)
// ────────────────────────────────────────────────────────────────────────────

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
`;

function archivoApp(op: OpPlantillaRefine): string {
  const imports = op.recursos
    .map((r) => {
      const n = r.nombre;
      return `import { Pagina${aPascalCase(n)} } from "./paginas/${n}";`;
    })
    .join("\n");
  const resourceDefs = op.recursos
    .map((r) => `  { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  const routes = op.recursos
    .map((r) => {
      const n = aPascalCase(r.nombre);
      return `        <Route path="/${r.nombre}" element={<Pagina${n} />} />`;
    })
    .join("\n");
  const primera = op.recursos[0].nombre;

  return `import { Refine } from "@refinedev/core";
import { Navigate, Route, Routes } from "react-router";
import { routerProvider } from "@refinedev/react-router";
import { dataProvider } from "@refinedev/simple-rest";
${imports}

// La dirección de la API REST llega por entorno (ver .env.example).
const apiUrl: string = import.meta.env.VITE_API_URL;

// Telemetría de Refine: APAGADA. Refine envía por defecto una petición a
// telemetry.refine.dev (proveedores, versión, recursos, IP, host, navegador y
// sistema); con disableTelemetry: true no sale ninguna petición.
export default function App() {
  return (
    <Refine
      dataProvider={dataProvider(apiUrl)}
      routerProvider={routerProvider}
      resources={[
${resourceDefs}
      ]}
      options={{ disableTelemetry: true }}
    >
      <Routes>
${routes}
        <Route path="/" element={<Navigate to="/${primera}" replace />} />
      </Routes>
    </Refine>
  );
}
`;
}

// ────────────────────────────────────────────────────────────────────────────
// Página de listado por recurso (useList de @refinedev/core 5)
// ────────────────────────────────────────────────────────────────────────────

function archivoPagina(recurso: RecursoRefine): string {
  const componente = `Pagina${aPascalCase(recurso.nombre)}`;
  const cabeceras = recurso.campos
    .map((c) => `            <th>${c}</th>`)
    .join("\n");
  const celdas = recurso.campos
    .map((c) => `                <td>{String(fila.${c} ?? "")}</td>`)
    .join("\n");

  return `import { useList } from "@refinedev/core";

// Listado del recurso «${recurso.nombre}» con useList de Refine 5:
// devuelve { query, result: { data, total } } y la carga vive en query.isLoading.
export default function ${componente}() {
  const { query, result } = useList({ resource: "${recurso.nombre}" });
  const datos = (result?.data ?? []) as Record<string, unknown>[];
  const total = result?.total ?? 0;

  if (query.isLoading) {
    return <main><p>Cargando ${recurso.nombre}…</p></main>;
  }

  return (
    <main>
      <h1>${recurso.nombre}</h1>
      <p>{total} registros</p>
      <table>
        <thead>
          <tr>
${cabeceras}
          </tr>
        </thead>
        <tbody>
          {datos.map((fila, indice) => (
            <tr key={"fila-" + indice}>
${celdas}
            </tr>
          ))}
        </tbody>
      </table>
      {datos.length === 0 ? <p className="vacio">Sin registros todavía.</p> : null}
    </main>
  );
}
`;
}

// ────────────────────────────────────────────────────────────────────────────
// LEEME.md (manual, honesto, sin claves)
// ────────────────────────────────────────────────────────────────────────────

const LEEME = `# Panel de datos con Refine

Proyecto exportado por el Estudio de Apps de StarSeed OS: un panel de datos en
React con Refine (\`@refinedev/core\`) que lista recursos de una API REST.
Solo es texto exportado: nada se instala, ejecuta ni consulta desde el OS.

## Activación manual

1. Node.js 20 o superior (lo que pide el núcleo de Refine).
2. \`npm install\`
3. \`npm run dev\` para desarrollo; \`npm run build\` + \`npm run preview\` para la
   versión compilada. Nada se despliega sin la palabra de Alex.

## Versiones

Fijadas en npm el 2026-10-25: \`@refinedev/core\` en su versión exacta 5.0.12,
junto a \`@refinedev/react-router\`, \`@refinedev/simple-rest\`, React 19,
react-router, Vite y TypeScript en rangos compatibles. Antes de tocar nada,
revisa con \`npm outdated\` qué ha cambiado y actualiza con intención.

## Telemetría apagada (de las dos formas)

Refine envía telemetría por defecto: la app manda una petición a
telemetry.refine.dev (proveedores usados, versión, número de recursos, IP,
nombre de host, navegador y sistema) y su CLI manda aparte, a /cli, el comando
y su entorno. Esta plantilla la apaga por partida doble y NINGUNA manda nada:

- \`options={{ disableTelemetry: true }}\` en el componente \`<Refine>\` de
  \`src/App.tsx\` (la petición de la app no sale).
- \`REFINE_NO_TELEMETRY=true\` en \`.env.example\` (la CLI no manda su parte).

## La clave de la API

El proveedor de datos (\`@refinedev/simple-rest\`) habla con una API REST que
apunta con \`VITE_API_URL\` en \`.env.local\`. Si esa API necesita una clave,
la clave va en un proxy propio (un servidor pequeño que la inyecta del lado
servidor), nunca dentro de este proyecto ni en el navegador: el navegador es
área abierta y lo que lleve claves termina filtrado.

## Encaje con StarSeed OS

Los contratos independientes de la fuente de \`src/lib/widget-data/\` del OS
se conectan EN ESA API (la que apunta \`VITE_API_URL\`), no dentro de este
proyecto: aquí solo se consumen vía REST, que es donde se decide de verdad el
acceso a los datos.
`;

/**
 * Genera los archivos del proyecto. Lanza `Error` (en español) con nombres de
 * recurso o campos no válidos, recursos vacíos o repetidos, o sin recursos.
 */
export function plantillaRefine(op: OpPlantillaRefine): AppFile[] {
  validar(op);
  const nombreProyecto = slugAscii(op.nombre);

  const archivos: AppFile[] = [
    archivo("package.json", archivoPackage(nombreProyecto)),
    archivo("index.html", INDEX_HTML),
    archivo("vite.config.ts", VITE_CONFIG),
    archivo("tsconfig.json", TSCONFIG),
    archivo(".gitignore", GITIGNORE),
    archivo(".env.example", ENV_EXAMPLE),
    archivo("LEEME.md", LEEME),
    archivo("src/main.tsx", MAIN_TSX),
    archivo("src/App.tsx", archivoApp(op)),
  ];
  for (const recurso of op.recursos) {
    archivos.push(archivo(`src/paginas/${recurso.nombre}.tsx`, archivoPagina(recurso)));
  }
  return archivos;
}
