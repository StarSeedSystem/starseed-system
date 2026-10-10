// Pruebas del kit StarSeed Link. Desde la raíz del OS:
//   npx vitest run --config integraciones-de-codigo/starseed-link/vitest.config.ts
// Incluye la prueba de COMPATIBILIDAD con el OS (importa los módulos del OS por el alias «@»).
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 20_000,
    env: { NODE_ENV: "test", TZ: "UTC" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "../../src") },
  },
});
