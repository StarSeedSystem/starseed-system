import { defineConfig } from "vitest/config";
import path from "node:path";

// StarSeed OS — configuración de Vitest.
//
// La lógica bajo prueba (motor de gobernanza, delegaciones, clasificación
// SSRF) es TypeScript puro sin dependencias del DOM, así que el entorno
// `node` es suficiente y más rápido que `jsdom` (que no se instala aquí —
// no hace falta hasta que existan tests de componentes React).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "src/**/__tests__/**/*.ts"],
    exclude: ["node_modules", ".next", "dist"],
    globals: false,
  },
  resolve: {
    alias: {
      // Espeja el alias `@/*` -> `src/*` de tsconfig.json para que los
      // módulos bajo test (que importan con `@/...`) resuelvan igual que en
      // Next.js.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
