import { defineConfig } from "vitest/config";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";

// AISLAMIENTO DEL ENJAMBRE VIVO (2026-09-22).
//
// `colas-decidir.test.ts` escribía sus colas de mentira en `starseed_memory_root/olas/`
// —la carpeta del enjambre de VERDAD— y el vigilante las recogía: un agente real pasó 86
// minutos en `tReintento`, una tarea inventada por una prueba, y acabó parado esperando el
// visto bueno de Alex. Todo lo del Puente resuelve su raíz con `raizDelProyecto()`, que
// respeta STARSEED_ROOT, así que aquí se apunta a un temporal ANTES de que corra nada.
//
// Se hace en la configuración y no en un setupFile porque el entorno jsdom shimea
// `node:fs` y `node:os`: allí no se puede crear el temporal (`os.tmpdir is not a function`
// tumbó 28 archivos al montar). Esto corre en Node, una sola vez, y llega a las pruebas
// como una variable de entorno más.
const raizDePruebas = mkdtempSync(
  path.join(process.env.TMPDIR || "/tmp", "starseed-pruebas-"),
);
for (const sub of ["starseed_memory_root/olas", "starseed_memory_root/mando", "enjambre/colas"]) {
  mkdirSync(path.join(raizDePruebas, sub), { recursive: true });
}

// StarSeed OS — configuración de Vitest.
//
// Entorno `node` por defecto: la lógica bajo prueba (motor de gobernanza,
// delegaciones, clasificación SSRF) es TypeScript puro sin dependencias del
// DOM, así que es más rápido que jsdom. Los tests de COMPONENTES React
// (`*.test.tsx`) corren en jsdom vía `environmentMatchGlobs`, sin tocar el
// entorno de los tests existentes.
//
// ⚠️ `NODE_ENV=test` explícito: la shell del Mac exporta `NODE_ENV=production`
// (ver memory/state.md §«TRAMPA DEL ENTORNO»), y con ese valor vitest deja a
// React en su build de producción, donde `act()` no existe y todo test de
// componente muere con «act(...) is not supported in production builds».
export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    include: ["src/**/*.{test,spec}.ts", "src/**/__tests__/**/*.ts", "src/**/*.{test,spec}.tsx", "src/**/__tests__/**/*.tsx"],
    exclude: ["node_modules", ".next", "dist"],
    globals: false,
    // (2026-09-22) Aísla las pruebas del enjambre vivo: apunta STARSEED_ROOT a un
    // temporal antes de que corra nada. Ver el porqué, con nombres y minutos, en
    // vitest.setup.ts — una prueba llegó a poner a un agente de verdad a trabajar
    // 86 minutos en una tarea inventada.
    env: {
      NODE_ENV: "test",
      // Ver el comentario de arriba: ninguna prueba puede tocar las colas del enjambre.
      STARSEED_ROOT: raizDePruebas,
    },
    // ⚠️ VERSIÓN DE NODE (2026-09-14). Esta suite necesita Node ≥ 20.19 — está
    // en `.nvmrc` y en `engines` de package.json. Con el Node v20.17 que había
    // primero en el PATH de este Mac, jsdom y su cadena de CSS (`@csstools/*`,
    // `@asamuzakjp/css-color`, `@exodus/bytes`) mueren con ERR_REQUIRE_ESM al
    // MONTAR el entorno, antes de ejecutar nada.
    //
    // Y lo peor no era el error: era que vitest resumía «1734 passed» mientras
    // NUEVE archivos de prueba de componentes no llegaban ni a cargarse. 65
    // pruebas que nadie estaba corriendo desde el 2026-09-09, con la puerta de
    // publicación en rojo por una causa que no era ninguna prueba mal escrita.
    // Con 20.20.2: 153 archivos, 1799 pruebas, salida 0.
    //
    // Probado y descartado: inlinear los paquetes en Vite (jsdom los carga por
    // la vía de Node, no por Vite) y `--experimental-require-module` (en 20.17
    // ese flag muere con «Maximum call stack size exceeded»).
  },
  resolve: {
    alias: {
      // Espeja el alias `@/*` -> `src/*` de tsconfig.json para que los
      // módulos bajo test (que importan con `@/...`) resuelvan igual que en
      // Next.js.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // tsconfig usa `jsx: "preserve"` (lo exige Next.js), pero vitest no pasa
  // por SWC: sin esto, el JSX de los `.tsx` queda sin transformar y muere
  // con «React is not defined». El runtime automático de React 19 es el
  // mismo que usa el compilador de Next.
  esbuild: {
    jsx: "automatic",
  },
});
