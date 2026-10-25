/**
 * StarSeed OS — plantilla de proyecto «panel de datos» con Refine.
 *
 * Para el Estudio de Apps: genera la carpeta de archivos de texto de un panel
 * de datos (vite + react + @refinedev/core con proveedor REST) que el usuario
 * descarga y activa MANUALMENTE (npm install && npm run dev). Nada se ejecuta
 * dentro del OS y dentro del OS los paneles siguen siendo UiSpec.
 *
 * Telemetría de Refine apagada de serie, de las dos formas: `disableTelemetry:
 * true` en las options de <Refine> y `REFINE_NO_TELEMETRY=true` en el entorno
 * (la CLI de Refine envía otra telemetría aparte y no forma parte de la
 * plantilla). Ficha: `config/repos-libreria-1025.json` · `lib-refine`.
 *
 * Módulo PURO: sin `node:*` ni red. Los datos del usuario nunca entran crudos
 * en el código generado: los recursos y campos se validan y se lanzan errores
 * en español si no casan.
 */

import { languageForPath, type AppFile } from "@/lib/appgen/appgen";

/** Recurso del panel: un nombre válido y sus campos de listado. */
export interface RecursoPanel {
  /** Nombre de recurso: minúscula inicial, luego minúsculas, números o guion. */
  nombre: string;
  /** Campos del listado: identifiers válidos en código generado. */
  campos: string[];
}

/** Cómo se llama la operación de generación: nombre del proyecto y recursos. */
export interface PlantillaRefineEntrada {
  nombre: string;
  recursos: RecursoPanel[];
}

const RE_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
const RE_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/** Crea un AppFile con su lenguaje derivado de la ruta (fuente única: appgen). */
function archivo(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

/** Reduce el nombre del proyecto a un slug ASCII (minúsculas y guiones). */
function slugProyecto(nombre: string): string {
  const slug = (nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "panel-datos";
}

/** Convierte el nombre del recurso en PascalCase para el componente generado. */
function pascal(desde: string): string {
  return desde
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/**
 * package.json con las versiones verificadas en npm el 2026-10-25
 * (no añadir otras): se mantienen sin intervalo las de @refinedev/*.
 */
function paqueteJson(slug: string): string {
  return JSON.stringify(
    {
      name: slug,
      private: true,
      version: "0.0.1",
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
    },
    null,
    2,
  ).concat("\n");
}

/** src/App.tsx: monta <Refine> con el proveedor REST y la telemetría apagada. */
function appTsx(recursos: RecursoPanel[]): string {
  const declaraciones = recursos
    .map(
      (r) =>
        `import { Listado${pascal(r.nombre)} } from "./paginas/${r.nombre}/listado";`,
    )
    .join("\n");
  const listaRecursos = recursos
    .map((r) => `  { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  const rutas = recursos
    .map(
      (r) =>
        `          <Route path="/${r.nombre}" element={<Listado${pascal(r.nombre)} />} />`,
    )
    .join("\n");
  const destino = recursos.length ? `/${recursos[0].nombre}` : "/";

  return `import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import dataProvider from "@refinedev/simple-rest";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
${declaraciones}

const recursos = [
${listaRecursos}
];

const apiUrl = import.meta.env.VITE_API_URL;
if (typeof apiUrl !== "string" || !apiUrl) {
  throw new Error(
    "Falta VITE_API_URL: copia .env.example a .env local y escribe ahí la dirección de tu API REST.",
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(apiUrl)}
        routerProvider={routerProvider}
        resources={recursos}
        // Telemetría de Refine apagada de serie: sin peticiones a su servidor.
        options={{ disableTelemetry: true }}
      >
        <Routes>
          <Route index element={<Navigate to="${destino}" replace />} />
${rutas}
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}
`;
}

/**
 * Página de listado por recurso con `useList` de @refinedev/core 5: devuelve
 * `{ query, result: { data, total } }` y la carga está en `query.isLoading`.
 */
function paginaListado(recurso: RecursoPanel): string {
  const listaCampos = JSON.stringify(recurso.campos);
  return `import React from "react";
import { useList } from "@refinedev/core";

type Registro = Record<string, string | number | boolean | null>;

const CAMPOS = ${listaCampos};

const estilo: React.CSSProperties = {
  maxWidth: "61.8%",
  margin: "89px auto 0",
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#1e293b",
};

export function Listado${pascal(recurso.nombre)}() {
  const { query, result } = useList<Registro>({
    resource: "${recurso.nombre}",
    pagination: { pageSize: 25 },
  });

  if (query.isLoading) {
    return <p style={estilo}>Cargando ${recurso.nombre}…</p>;
  }
  if (query.isError) {
    return <p style={estilo}>No se pudieron cargar los ${recurso.nombre}.</p>;
  }

  const filas = result?.data ?? [];
  return (
    <main style={estilo}>
      <h1 style={{ fontSize: "1.618rem" }}>${recurso.nombre}</h1>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {CAMPOS.map((campo) => (
              <th key={campo} style={{ textAlign: "left", padding: "8px" }}>
                {campo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, indice) => (
            <tr key={indice} style={{ borderTop: "1px solid #e2e8f0" }}>
              {CAMPOS.map((campo) => (
                <td key={campo} style={{ padding: "8px" }}>
                  {String(fila[campo] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 ? <p>Sin datos todavía.</p> : null}
    </main>
  );
}
`;
}

/** LEEME.md: activación manual, versiones fijadas y telemetría apagada. */
function leeme(): string {
  return `# Panel de datos · StarSeed OS

Proyecto generado desde el Estudio de Apps de StarSeed OS: un panel de datos
con [Refine](https://github.com/refinedev/refine) y proveedor REST, pensado
para activarse FUERA del OS.

## Qué es

- Vite + React 19 + Refine «sin cabeza» con proveedor de datos REST.
- Proveedor de datos habla con una API REST (\`VITE_API_URL\`): los contratos
  independientes de la fuente de \`src/lib/widget-data/\` del OS se conectan
  en esa API, no dentro de este proyecto.
- Dentro del StarSeed OS los paneles siguen siendo UiSpec; este proyecto es
  para llevar una app completa fuera del OS.

## Telemetría (apagada de serie, de las dos formas)

Refine envía telemetría por defecto (a \`telemetry.refine.dev\`: proveedores
usados, versión, número de recursos, IP, host, navegador y sistema). Esta
plantilla la deja apagada:

1. \`options={{ disableTelemetry: true }}\` en \`src/App.tsx\`.
2. \`REFINE_NO_TELEMETRY=true\` en \`.env.example\` (cópialo a tu \`.env\` local).

La CLI de Refine manda otra telemetría aparte y no forma parte de la
plantilla: no la uses si no te hace falta.

## Activación manual (nada se ejecuta desde el OS)

1. Node 20 o superior (lo que pide el núcleo de Refine).
2. \`npm install\`
3. Copia \`.env.example\` a \`.env\` y escribe tu \`VITE_API_URL\`.
4. \`npm run dev\`

Nada se despliega ni publica sin la palabra de Alex.

## Claves

Si tu API necesita clave, puesta detrás de un proxy propio: NUNCA en el
navegador y NUNCA en este código. Sin claves en variables públicas
(\`VITE_*\`) más allá de la dirección de la API.

## Versiones

Fijadas y verificadas en npm el 2026-10-25: revisarlas con \`npm outdated\`
antes de subir de versión. La fuente de verdad es npm.
`;
}

/** index.html, vite.config.ts, tsconfig.json, .gitignore y .env.example. */
function archivosBase(): AppFile[] {
  return [
    archivo(
      "index.html",
      `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Panel de datos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    ),
    archivo(
      "vite.config.ts",
      `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    ),
    archivo(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            esModuleInterop: true,
            isolatedModules: true,
            verbatimModuleSyntax: true,
          },
          include: ["src"],
        },
        null,
        2,
      ).concat("\n"),
    ),
    archivo(
      ".gitignore",
      `node_modules
dist
.env
.env.local
*.local
`,
    ),
    archivo(
      ".env.example",
      `# Dirección de tu API REST (sin clave: si la API la pide, va en un proxy propio).
VITE_API_URL=
# Deja la telemetría de Refine apagada.
REFINE_NO_TELEMETRY=true
`,
    ),
    archivo(
      "src/main.tsx",
      `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    ),
  ];
}

/** Valida recursos y campos; lanza Error en español si no casan. */
function validarEntrada(op: PlantillaRefineEntrada): void {
  if (!Array.isArray(op.recursos)) {
    throw new Error("La lista de recursos debe ser un arreglo.");
  }
  for (const r of op.recursos) {
    if (!r || !RE_RECURSO.test(r.nombre ?? "")) {
      throw new Error(
        `Nombre de recurso no válido: «${r?.nombre}». Debe empezar por una minúscula y seguir con minúsculas, números o guiones (hasta 40 caracteres).`,
      );
    }
    if (!Array.isArray(r.campos) || r.campos.length === 0) {
      throw new Error(
        `El recurso «${r.nombre}» necesita al menos un campo en su listado.`,
      );
    }
    for (const campo of r.campos) {
      if (!RE_CAMPO.test(campo ?? "")) {
        throw new Error(
          `Campo no válido: «${campo}» en el recurso «${r.nombre}». Debe empezar por una letra o _ y seguir con letras, números o _ (hasta 40 caracteres).`,
        );
      }
    }
  }
}

/**
 * Genera la carpeta de texto del panel de datos con Refine.
 * Determinista: dos llamadas con la misma entrada devuelven lo mismo.
 */
export function plantillaRefine(op: PlantillaRefineEntrada): AppFile[] {
  validarEntrada(op);
  const slug = slugProyecto(op.nombre);
  const proyecto = archivo("package.json", paqueteJson(slug));
  const leemeEntrada = archivo("LEEME.md", leeme());
  const paginas = op.recursos.map((r) =>
    archivo(`src/paginas/${r.nombre}/listado.tsx`, paginaListado(r)),
  );
  return [proyecto, ...archivosBase(), archivo("src/App.tsx", appTsx(op.recursos)), ...paginas, leemeEntrada];
}
