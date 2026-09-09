import { defineConfig } from "vitest/config";
import path from "node:path";

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
    env: {
      NODE_ENV: "test",
    },
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
