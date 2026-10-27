/**
 * StarSeed OS — plantilla «panel de datos» con Refine (lib-refine, MIT).
 *
 * Genera un proyecto vite + React 19 autónomo, listo para `npm install &&
 * npm run dev` (activación manual, nodo 20+). La telemetría de Refine va
 * apagada de serie: `options={{ disableTelemetry: true }}` en el componente
 * `<Refine>` y `REFINE_NO_TELEMETRY=true` en el entorno. Sin `node:*`: módulo
 * puro, seguro de importar desde cliente.
 */

import type { AppFile } from "./appgen";
import { languageForPath } from "./appgen";

/** Nombre de recurso: minúsculas, números y guiones, empieza por letra. */
const REGEX_RECURSO = /^[a-z][a-z0-9-]{0,40}$/;
/** Campo TypeScript seguro: empieza por letra o subrayado. */
const REGEX_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export interface RecursoRefine {
  nombre: string;
  campos: string[];
}

export interface OpcionesPlantillaRefine {
  nombre: string;
  recursos: RecursoRefine[];
}

/** Reduce un nombre a slug ASCII (a-z0-9 con guiones). */
function slugAscii(nombre: string): string {
  const base = (nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "panel-de-datos";
}

/** Crea un AppFile deduciendo el lenguaje de la ruta. */
function fichero(path: string, content: string): AppFile {
  return { path, content, language: languageForPath(path) };
}

function validaciones(op: OpcionesPlantillaRefine): string[] {
  const errores: string[] = [];
  if (!Array.isArray(op.recursos) || op.recursos.length === 0) {
    errores.push("Define al menos un recurso para el panel.");
  }
  const vistos = new Set<string>();
  for (const r of op.recursos ?? []) {
    if (!REGEX_RECURSO.test(r?.nombre ?? "")) {
      errores.push(
        `El nombre de recurso «${r?.nombre ?? ""}» no es válido: usa minúsculas, números y guiones (empieza por letra).`,
      );
    }
    if (vistos.has(r?.nombre)) {
      errores.push(`El recurso «${r?.nombre ?? ""}» está repetido.`);
    }
    vistos.add(r?.nombre);
    for (const c of r?.campos ?? []) {
      if (!REGEX_CAMPO.test(c ?? "")) {
        errores.push(
          `El campo «${c ?? ""}» del recurso «${r?.nombre ?? ""}» no es válido: usa letras, números y subrayado (empieza por letra o subrayado).`,
        );
      }
    }
  }
  return errores;
}

const VERSIONES = {
  core: "5.0.12",
  router: "2.0.4",
  rest: "6.0.1",
} as const;

export function plantillaRefine(op: OpcionesPlantillaRefine): AppFile[] {
  const errores = validaciones(op);
  if (errores.length > 0) {
    throw new Error(`Plantilla Refine no generada. ${errores.join(" ")}`);
  }
  const nombre = slugAscii(op.nombre);
  const recursos = op.recursos.map((r) => ({
    nombre: r.nombre,
    campos: [...r.campos],
  }));

  const archivos: AppFile[] = [
    fichero("package.json", CONTENIDO_PACKAGE(nombre)),
    fichero("index.html", CONTENIDO_HTML(nombre)),
    fichero("vite.config.ts", CONTENIDO_CONFIG(nombre)),
    fichero("tsconfig.json", CONTENIDO_TSCONFIG()),
    fichero(".gitignore", CONTENIDO_GITIGNORE),
    fichero(".env.example", CONTENIDO_ENV),
    fichero("LEEME.md", CONTENIDO_LEEME(nombre)),
    fichero("src/main.tsx", CONTENIDO_MAIN(nombre)),
    fichero("src/App.tsx", CONTENIDO_APP(recursos)),
    fichero("src/paginas/listado.tsx", CONTENIDO_LISTADO()),
    ...recursos.map((r) => fichero(`src/paginas/${r.nombre}.tsx`, CONTENIDO_PAGINA(r))),
  ];
  return archivos;
}

const CONTENIDO_CONFIG = (slug: string): string => `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Panel «${slug}» generado por StarSeed OS. Telemetría apagada: mira el LEEME.
export default defineConfig({
  plugins: [react()],
});
`;

const CONTENIDO_ENV = `VITE_API_URL=
REFINE_NO_TELEMETRY=true
`;

const CONTENIDO_GITIGNORE = `node_modules
dist
.env
.env.local
`;

const CONTENIDO_LEEME = (slug: string): string => `# ${slug}

Panel de datos con Refine (React 19 + vite), generado por StarSeed OS.

- Activación manual: pide Node 20 o superior (\`node -v\`), después
  \`npm install\` y \`npm run dev\`.
- Versiones fijadas el 2026-10-25: revisa con \`npm outdated\` antes de
  actualizar nada.
- Telemetría apagada de las dos formas: \`options={{ disableTelemetry: true }}\`
  dentro de \`src/App.tsx\`, y \`REFINE_NO_TELEMETRY=true\` en \`\.env.example\`
  (pásalo a \`.env\`).
- Nada se despliega sin la palabra de Alex.
- El proveedor de datos habla con una API REST (\`dataProvider\` de
  \`@refinedev/simple-rest\`). Si esa API necesita clave, chícala en un
  proxy propio, nunca en el navegador. Los contratos independientes de la
  fuente de \`src/lib/widget-data/\` se conectan en esa API, no aquí dentro.
`;

const CONTENIDO_PACKAGE = (slug: string): string => `{
  "name": "${slug}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@refinedev/core": "${VERSIONES.core}",
    "@refinedev/react-router": "${VERSIONES.router}",
    "@refinedev/simple-rest": "${VERSIONES.rest}",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "react-router": "^7.0.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "typescript": "^5.6.0",
    "vite": "^8.3.5"
  }
}
`;

const CONTENIDO_HTML = (slug: string): string => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${slug}</title>
  </head>
  <body>
    <div id="raiz"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const CONTENIDO_MAIN = (slug: string): string => `import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";

ReactDOM.createRoot(document.getElementById("raiz")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
`;

const CONTENIDO_APP = (recursos: RecursoRefine[]): string => {
  const importsRecursos = recursos
    .map((r) => {
      const pascal = r.nombre.replace(/(^|-)([a-z0-9])/g, (_m, s, c) => c.toUpperCase());
      return `import Pagina${pascal} from "./paginas/${r.nombre}";`;
    })
    .join("\n");
  const entradas = recursos
    .map((r) => {
      return `    { name: "${r.nombre}", list: "/${r.nombre}" },`;
    })
    .join("\n");
  const rutas = recursos
    .map((r) => {
      const pascal = r.nombre.replace(/(^|-)([a-z0-9])/g, (_m, s, c) => c.toUpperCase());
      return `        <Route path="/${r.nombre}" element={<Pagina${pascal} />} />`;
    })
    .join("\n");
  return `import { Refine } from "@refinedev/core";
import { routerProvider } from "@refinedev/react-router";
import dataProvider from "@refinedev/simple-rest";
import { Routes, Route } from "react-router";
${importsRecursos}

const RECURSOS = [
${entradas}
];

// Telemetría de Refine apagada (telemetry.refine.dev): disableTelemetry y
// REFINE_NO_TELEMETRY. No cambies esto.
export default function App() {
  return (
    <Refine
      dataProvider={dataProvider(String(import.meta.env.VITE_API_URL))}
      routerProvider={routerProvider}
      resources={RECURSOS}
      options={{ disableTelemetry: true }}
    >
      <Routes>
${rutas}
        <Route path="*" element={<p>Elige un recurso del panel.</p>} />
      </Routes>
    </Refine>
  );
}
`;
};

const CONTENIDO_TSCONFIG = (): string => `{
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
    "useDefineForClassFields": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`;

const CONTENIDO_LISTADO = (): string => `import { useList } from "@refinedev/core";

/** Tabla de una colección de la API REST. Refine 5: \`{ query, result }\`. */
export function Listado({ recurso, campos }: { recurso: string; campos: string[] }) {
  const { query } = useList<{ [campo: string]: unknown }>({ resource: recurso });
  const filas = query.result?.data ?? [];

  if (query.isLoading) {
    return <p>Cargando «{recurso}»…</p>;
  }
  if (query.isError) {
    return <p>No se pudo cargar «{recurso}»: revisa VITE_API_URL.</p>;
  }

  return (
    <main>
      <h1>{recurso}</h1>
      <table>
        <thead>
          <tr>
            {campos.map((campo) => (
              <th key={campo}>{campo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {campos.map((campo) => (
                <td key={campo}>{String(fila?.[campo] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
`;

const pascalCase = (nombre: string): string =>
  nombre.replace(/(^|-)([a-z0-9])/g, (_m, s: string, c: string) => c.toUpperCase());

const CONTENIDO_PAGINA = (r: RecursoRefine): string => {
  const pascal = pascalCase(r.nombre);
  const campos = r.campos.map((c) => `"${c}"`).join(", ");
  return `import { Listado } from "./listado";

const RECURSO = "${r.nombre}";
const CAMPOS = [${campos}];

export default function Pagina${pascal}() {
  return <Listado recurso={RECURSO} campos={CAMPOS} />;
}
`;
};
