/**
 * Puerta de conexión (2026-10-30): `plantillaRefine` quedó integrada pero sin llamador
 * fuera de sus pruebas; la conexión vive en `ai-app-generator.tsx` (componente de cliente,
 * no importable desde vitest sin jsdom y con el enjambre costando memoria). Esta prueba
 * lee el código fuente y garantiza que la plantilla SIGUE llamada desde el Estudio de Apps.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const RUTA = path.join(process.cwd(), "src/components/appgen/ai-app-generator.tsx");

describe("conexión de plantillaRefine en el Estudio de Apps", () => {
  const codigo = readFileSync(RUTA, "utf8");

  it("importa plantillaRefine de la plantilla real", () => {
    expect(codigo).toContain(
      'import { plantillaRefine, type RecursoPlantilla } from "@/lib/appgen/plantilla-refine";',
    );
  });

  it("la llama dentro de la acción del botón «Panel de datos»", () => {
    const llamada = codigo.indexOf("plantillaRefine({");
    expect(llamada).toBeGreaterThan(-1);
    expect(codigo).toContain("onPlantillaRefine");
    expect(codigo).toContain("onClick={onPlantillaRefine}");
  });

  it("los datos malos NO se cuelan: el Error de la plantilla sale en un toast", () => {
    expect(codigo).toContain('toast.error("La plantilla rechazó los datos"');
    expect(codigo).toContain("(err as Error)?.message");
  });
});
