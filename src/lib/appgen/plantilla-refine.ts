/**
 * StarSeed OS — plantilla «panel de datos» del Estudio de Apps (Refine, DSN1025H).
 *
 * Genera un proyecto Vite + React «sin cabeza» con proveedor de datos REST
 * (`@refinedev/simple-rest`) y telemetría de Refine APAGADA de serie (Refine la
 * envía por defecto a telemetry.refine.dev: proveedores, versión, recursos, IP,
 * host, navegador y sistema; su CLI manda otra aparte). Aquí se apaga de dos
 * formas: `options={{ disableTelemetry: true }}` en `<Refine>` y
 * `REFINE_NO_TELEMETRY=true` en `.env.example`.
 *
 * Módulo PURO: sin `node:*`, sin red y sin disco; misma entrada, misma salida.
 * Los datos del usuario (nombre del proyecto, recursos, campos) se validan o se
 * reducen a slug antes de entrar en el código generado.
 */

import { languageForPath, type AppFile } from "./appgen";

/** Nombre de recurso admitido por la plantilla: minúsculas, números y guiones. */
const RE_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
/** Nombre de campo admitido: guion bajo inicial y letras, números y guion bajo. */
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export interface RecursoPlantilla {
  nombre: string;
  campos: string[];
}

export interface OpcionesPlantillaRefine {
  nombre: string;
  recursos: RecursoPlantilla[];
}

/** Valida un nombre de recurso; lanza un Error en español si no casa. */
function validarRecurso(nombre: string): string {
  if (!RE_RECURSO.test(nombre)) {
    throw new Error(
      `Nombre de recurso no válido: «${nombre}». Debe empezar por minúscula y traer solo ` +
        `letras en minúscula, números y guiones (hasta 41 caracteres).`,
    );
  }
  return nombre;
}

/** Valida un campo; lanza un Error en español si no casa. */
function validarCampo(nombre: string, recurso: string): string {
  if (typeof nombre !== "string" || !RE_CAMPO.test(nombre)) {
    throw new Error(
      `Campo no válido en el recurso «${recurso}»: «${String(nombre)}». Debe empezar por letra o ` +
        `guion bajo y traer solo letras, números y guiones bajos (hasta 41 caracteres).`,
    );
  }
  return nombre;
}

/** Reduce el nombre del proyecto a un slug ASCII (npm name); nunca vacío. */
function slug(nombre: string): string {
  const base = (nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "panel-de-datos";
}

/** Nombre de componente React a partir de un recurso «foo-bar» → «FooBar». */
function componenteRecurso(rec: string): string {
  return rec
    .split("-")
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join("");
}

/** Empaqueta un archivo con su `language` derivado de `languageForPath`. */
function archivo(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

/**
 * Genera el proyecto completo. Por recurso produce una página de listado con
 * `useList` (en Refine 5 devuelve `{ query, result: { data, total } }` y la
 * carga está en `query.isLoading`).
 */
export function plantillaRefine(op: OpcionesPlantillaRefine): AppFile[] {
  const recursos = (op.recursos ?? []).map((r) => ({
    nombre: validarRecurso(r.nombre),
    campos: (r.campos ?? []).map((c) => validarCampo(c, r.nombre)),
  }));
  const slugProyecto = slug(op.nombre);

  const archivos: AppFile[] = [
    archivo("package.json", JSON.stringify(paquete(slugProyecto), null, 2) + "\n"),
    archivo("index.html", INDEX_HTML.replace("__PROYECTO__", slugProyecto) + "\n"),
    archivo("vite.config.ts", VITE_CONFIG + "\n"),
    archivo("tsconfig.json", TSCONFIG + "\n"),
    archivo(".gitignore", GITIGNORE + "\n"),
    archivo(".env.example", ENV_EXAMPLE + "\n"),
    archivo("src/main.tsx", MAIN_TSX + "\n"),
    archivo("src/App.tsx", appTsx(recursos) + "\n"),
  ];
  for (const recurso of recursos) {
    archivos.push(
      archivo(
        `src/paginas/listado-${recurso.nombre}.tsx`,
        paginaListado(recurso) + "\n",
      ),
    );
  }
  archivos.push(archivo("LEEME.md", leeme(recursos) + "\n"));
  return archivos;
}

// ────────────────────────────────────────────────────────────────────────────
// Contenidos fijos
// ────────────────────────────────────────────────────────────────────────────

/**
 * `package.json` del proyecto: versiones verificadas en npm el 2026-10-25
 * (ficha `lib-refine` de `config/repos-libreria-1025.json`). No añadir otras ni
 * inventar versiones.
 */
function paquete(nombre: string) {
  return {
    name: nombre,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
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
}

const INDEX_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>__PROYECTO__ · panel de datos</title>
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
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
`;

const GITIGNORE = `node_modules/
dist/
.env
.env.local
*.log
.DS_Store
`;

const ENV_EXAMPLE = `# Copia este archivo a .env.local y rellena lo que falte.
# Sin valores secretos: la clave de la API nunca va aquí (y menos en el navegador).
VITE_API_URL=
REFINE_NO_TELEMETRY=true
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("No se encontró el elemento #root en index.html.");

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
`;

/** «src/App.tsx»: monta Refine con el proveedor REST y la telemetría apagada. */
function appTsx(recursos: RecursoPlantilla[]): string {
  const importaciones = recursos
    .map(
      (r) =>
        `import { Listado${componenteRecurso(r.nombre)} } from "./paginas/listado-${r.nombre}";`,
    )
    .join("\n");
  const definidos = recursos
    .map((r) => `  { name: "${r.nombre}", list: "${r.nombre}" },`)
    .join("\n");
  const rutas = recursos
    .map(
      (r) =>
        `        <Route path="/${r.nombre}" element={<Listado${componenteRecurso(r.nombre)} />} />`,
    )
    .join("\n");
  const enlaces = recursos
    .map((r) => `      <Link to="/${r.nombre}">${r.nombre}</Link>`)
    .join("\n");

  return `import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/simple-rest";
import { routerProvider } from "@refinedev/react-router";
import { Link, Route, Routes } from "react-router";
${importaciones}

const RECURSOS = [
${definidos}
];

export function App() {
  return (
    <Refine
      dataProvider={dataProvider(import.meta.env.VITE_API_URL ?? "")}
      routerProvider={routerProvider}
      resources={RECURSOS}
      options={{ disableTelemetry: true }}
    >
      <nav>
${enlaces}
      </nav>
      <Routes>
        <Route path="/" element={<p>Elige un recurso en el menú de arriba.</p>} />
${rutas}
      </Routes>
    </Refine>
  );
}
`;
}

/** Página de listado por recurso: `useList` de Refine 5 con carga visible. */
function paginaListado(recurso: RecursoPlantilla): string {
  const nombre = recurso.nombre;
  const componente = `Listado${componenteRecurso(nombre)}`;
  const camposJson = JSON.stringify(recurso.campos);

  return `import { useList } from "@refinedev/core";

const CAMPOS: string[] = ${camposJson};

export function ${componente}() {
  const lista = useList({ resource: "${nombre}", pagination: { pageSize: 25 } });
  const filas = lista.result?.data ?? [];
  const total = lista.result?.total ?? 0;

  return (
    <main style={{ padding: 21, maxWidth: 880, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>${nombre} · listado</h1>
      {lista.query.isLoading ? (
        <p>Cargando ${nombre}…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>id</th>
              {CAMPOS.map((campo) => (
                <th key={campo}>{campo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const registro = fila as Record<string, unknown>;
              return (
                <tr key={String(registro.id)}>
                  <td>{String(registro.id)}</td>
                  {CAMPOS.map((campo) => (
                    <td key={campo}>
                      {registro[campo] === undefined || registro[campo] === null
                        ? "—"
                        : String(registro[campo])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p>{total} registros</p>
    </main>
  );
}
`;
}

/** «LEEME.md»: activación manual, versiones fijadas y telemetría apagada. */
function leeme(recursos: RecursoPlantilla[]): string {
  const lista = recursos.map((r) => `"${r.nombre}"`).join(", ");
  const conCampos = recursos
    .map((r) => `- ${r.nombre}: campos ${JSON.stringify(r.campos)}`)
    .join("\n");

  return `# LEEME · panel de datos con Refine

Proyecto generado por el Estudio de Apps de StarSeed OS. **Nada se despliega sin la palabra de
Alex** (2026-10-25): la activación es MANUAL y sucede FUERA del OS, por escrito en el código,
y tampoco implica que esta plantilla se ejecute dentro del OS.

## Recursos
La plantilla trae ${recursos.length} recurso(s): ${lista}
${conCampos}
Cada recurso tiene su página de listado en \`src/paginas/\` con el gancho \`useList\`.

## Activación manual
- Necesitas Node 20 o más (lo pide el núcleo).
- Copia \`.env.example\` a \`.env.local\` y pon la dirección de tu API REST en \`VITE_API_URL\`.
- \`npm install\`
- \`npm run dev\` para desarrollo, \`npm run build\` para compilar.

## Versiones fijadas
Fijadas el 2026-10-25 y verificadas en npm (\`@refinedev/core\` 5.0.12, \`@refinedev/react-router\`
2.0.4, \`@refinedev/simple-rest\` 6.0.1): revisar con \`npm outdated\` antes de tocar el
\`package.json\`; no añadir dependencias ni versiones inventadas.

## Telemetría apagada
Refine envía telemetría por defecto (proveedores usados, versión, número de recursos, IP, host,
navegador y sistema; su CLI manda otra aparte). Aquí está apagada de las DOS formas:
1. \`options={{ disableTelemetry: true }}\` en el componente \`Refine\` de \`src/App.tsx\`.
2. \`REFINE_NO_TELEMETRY=true\` en el entorno (\`.env.example\`; cópialo a \`.env.local\`).

## Datos
El proveedor de datos (\`dataProvider\`, de \`@refinedev/simple-rest\` en \`src/App.tsx\`) habla con
una API REST cualquiera: los contratos independientes de la fuente de \`src/lib/widget-data/\` del
OS se conectan EN ESA API, no dentro de este proyecto. La dirección va en \`VITE_API_URL\`; si está
vacía, el panel carga (queda con la carga visible) hasta que la pongas.

## Claves
Si la API necesita clave, la clave va en un PROXY PROPIO (un servidor tuyo que la añada a las
peticiones); nunca en este proyecto ni en el navegador: las variables \`VITE_\` llegan al navegador
tal cual, sin ofuscar.
`;
}
