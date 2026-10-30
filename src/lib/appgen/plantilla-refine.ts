/**
 * StarSeed OS — plantilla «panel de datos» con Refine (DSN1025H · ficha lib-refine).
 *
 * Función PURA: entrada → AppFile[] del proyecto completo, sin red ni reloj
 * (dos llamadas con la misma entrada devuelven lo mismo). La telemetría de
 * Refine viaja apagada de serie y sin ninguna clave. Validación honesta:
 * nombre de recurso en minúsculas y campos sin comillas ni espacios.
 */
import type { AppFile } from "./appgen";
import { languageForPath } from "./appgen";

export interface RecursoPlantilla {
  nombre: string;
  campos: string[];
}
export interface EntradaPlantillaRefine {
  nombre: string;
  recursos: RecursoPlantilla[];
}

const PATRON_RECURSO = /^[a-z][a-z0-9_-]*$/;
const PATRON_CAMPO = /^[a-z_][a-z0-9_]*$/;

function validar(entrada: EntradaPlantillaRefine): void {
  if (!entrada.recursos?.length) {
    throw new Error("La plantilla necesita al menos un recurso.");
  }
  for (const recurso of entrada.recursos) {
    if (!PATRON_RECURSO.test(recurso.nombre ?? "")) {
      throw new Error(
        `El recurso «${String(recurso.nombre)}» no es válido: usa minúsculas, números o guion bajo (p. ej. «clientes»).`,
      );
    }
    for (const campo of recurso.campos ?? []) {
      if (!PATRON_CAMPO.test(campo ?? "")) {
        throw new Error(`El campo «${String(campo)}» del recurso «${recurso.nombre}» no es válido: evita comillas y espacios.`);
      }
    }
  }
}

function archivar(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

function archivoPaquete(nombre: string): AppFile {
  return archivar(
    "package.json",
    JSON.stringify(
      {
        name: nombre,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview" },
        // Versiones exactas verificadas en npm el 2026-10-25 (ficha lib-refine);
        // el resto, de rango según el contrato.
        dependencies: {
          "@refinedev/core": "5.0.12",
          "@refinedev/react-router": "2.0.4",
          "@refinedev/simple-rest": "6.0.1",
          react: "^19.3.1",
          "react-dom": "^19.3.1",
          "react-router": "^7.0.2",
        },
        devDependencies: {
          vite: "^8.3.5",
          "@vitejs/plugin-react": "^6.1.2",
          typescript: "^5.6.0",
        },
      },
      null,
      2,
    ) + "\n",
  );
}

function archivoConfig(nombre: string): AppFile[] {
  return [
    archivar(
      "vite.config.ts",
      `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Panel de datos «${nombre}» con Refine; telemetría apagada en src/App.tsx.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
`,
    ),
    archivar(
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
            noEmit: true,
            skipLibCheck: true,
          },
          include: ["src"],
        },
        null,
        2,
      ) + "\n",
    ),
  ];
}

function archivoHtml(nombre: string): AppFile {
  return archivar(
    "index.html",
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${nombre}</title>
  </head>
  <body>
    <div id="raiz"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );
}

function archivoMain(): AppFile {
  return archivar(
    "src/main.tsx",
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@refinedev/react-router";
import { BrowserRouter } from "react-router";
import { App } from "./App";

createRoot(document.getElementById("raiz") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={BrowserRouter}>
      <App />
    </RouterProvider>
  </StrictMode>,
);
`,
  );
}

function archivoApp(nombre: string, recursos: RecursoPlantilla[]): AppFile {
  const listas = recursos.map((r) => `    <Route path="/${r.nombre}" element={<Listado${capital(r.nombre)} />} />`).join("\n");
  const imports = recursos.map((r) => `import { Listado${capital(r.nombre)} } from "./paginas/listado-${r.nombre}";`).join("\n");
  const fichas = recursos
    .map((r) => `    { name: "${r.nombre}", list: "/${r.nombre}" },`)
    .join("\n");
  return archivar(
    "src/App.tsx",
    `import { Refine } from "@refinedev/core";
import { Routes, Route } from "react-router";
import dataProvider from "@refinedev/simple-rest";
${imports}

const API_URL = import.meta.env.VITE_API_URL;

// Panel «${nombre}». Telemetría de Refine apagada de serie (ficha lib-refine):
// disableTelemetry en nivel superior y sin ninguna clave; la API solo llega
// por VITE_API_URL (ver .env.example).
export function App() {
  return (
    <Refine
      routerProvider={RouterProvider}
      dataProvider={dataProvider(API_URL)}
      options={{ disableTelemetry: true }}
    >
      <div>
        <h1>${nombre}</h1>
        <nav>
          {recursos.map((r) => (
            <a key={r} href={"/" + r}>{r}</a>
          ))}
        </nav>
        <Routes>
${listas}
        </Routes>
      </div>
    </Refine>
  );
}

const recursos = [
${fichas}
];
`,
  );
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function archivoListado(recurso: RecursoPlantilla): AppFile {
  const nombre = capital(recurso.nombre);
  const ths = recurso.campos.map((c) => `<th>${c}</th>`).join("");
  const tds = recurso.campos
    .map((c) => `                <td>{String((elemento as Record<string, unknown>)[\"${c}\"] ?? \"—\")}</td>`)
    .join("\n");
  return archivar(
    `src/paginas/listado-${recurso.nombre}.tsx`,
    `import { useList } from "@refinedev/core";

// Listado de «${recurso.nombre}» con useList; sin librería de UI: tabla plana.
export function Listado${nombre}() {
  const query = useList({ resource: "${recurso.nombre}" });

  if (query.isLoading) return <p>Cargando ${recurso.nombre}…</p>;
  if (query.isError) return <p>No se pudo listar ${recurso.nombre}.</p>;

  return (
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>
        {(query.data ?? []).map((elemento) => (
          <tr key={elemento.id}>
${tds}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`,
  );
}

function archivoEnvEjemplo(): AppFile {
  return archivar(
    ".env.example",
    `# Panel de datos con Refine (ficha lib-refine): sin ninguna clave.
# Corrige la URL de la API y quita las comillas manuscritas.
VITE_API_URL=
# Telemetría de Refine apagada de serie.
REFINE_NO_TELEMETRY=true
`,
  );
}

/** Genera el proyecto Refine completo (puro, determinista). */
export function plantillaRefine(entrada: EntradaPlantillaRefine): AppFile[] {
  validar(entrada);
  const { nombre, recursos } = entrada;
  const archivos = [
    archivoPaquete(nombre),
    ...archivoConfig(nombre),
    archivoHtml(nombre),
    archivoMain(),
    archivoApp(nombre, recursos),
    ...recursos.map(archivoListado),
    archivoEnvEjemplo(),
  ];
  return archivos;
}
