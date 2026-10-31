/**
 * Pruebas de rescate de la rama de la nube nube/41190364956 (tarea FSH1018G), adaptadas a la
 * API de HOY: lo único que main implementa y no tenía probado es que con menos de 30 casos
 * manda el umbral DEL CATÁLOGO POR PUNTO — no el de defecto —: `umbralRecalibrado` devuelve
 * el del punto (`privacidad.subir` 0,5 · `habilidad.elegir` 0,6) hasta alcanzar
 * `MIN_CASOS_UMBRAL`. La huella de lo privado ya está probada en `aprendizaje-laya.test.ts`
 * y lo demás de la rama (`decisionesVisibles`, `medioPanel`, `umbralRecalibrado` con 30 casos,
 * `leerInterruptores`, `<PanelDecisionesLaya/>`) no existe en main: casos descartados.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_CASOS_UMBRAL, umbralDeCatalogo, umbralRecalibrado,
  type CasoLaya, type RegistroAprendizaje,
} from "@/lib/astraura/laya/aprendizaje-laya";

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "privacidad.subir", ambito: "os", p: 0.9, donde: "mac", ms: 10,
  resultado: "aceptada", estado: "estado de ejemplo", privado: false, ...extra,
});

describe("umbrales efectivos por punto (menos de 30 casos manda el catálogo)", () => {
  it("cada punto conserva SU umbral del catálogo sin casos", () => {
    expect(MIN_CASOS_UMBRAL).toBe(30);
    expect(umbralDeCatalogo("privacidad.subir")).toBe(0.5);
    expect(umbralDeCatalogo("habilidad.elegir")).toBe(0.6);
    expect(umbralRecalibrado([], "privacidad.subir", "os")).toBe(0.5);
  });

  it("29 casos NO recalibran: siguen mandando 0,5 aunque otros puntos sumen más", () => {
    const registro: RegistroAprendizaje = [
      ...Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => caso()),
      ...Array.from({ length: 10 }, () => caso({ punto: "habilidad.elegir" })),
    ];
    expect(umbralRecalibrado(registro, "privacidad.subir", "os")).toBe(0.5);
    expect(umbralRecalibrado(registro, "habilidad.elegir", "os")).toBe(0.6);
  });
});
