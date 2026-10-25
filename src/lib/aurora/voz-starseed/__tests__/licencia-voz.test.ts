// Prueba de la regla de licencia de los motores de voz (Adenda 218 y voz-voicestudio.md
// §4: fuera del contexto personal nunca suena un motor de clase personal). Pura: solo
// lee `src/lib/aurora/catalogo-voces.ts`, sin red, sin disco y sin procesos.
import { describe, it, expect } from "vitest";

import { motorRecomendado, type Plataforma } from "../../catalogo-voces";

const PLATAFORMAS: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];
const FUERA_DE_LO_PERSONAL = ["grupo", "comunidad", "publico", "comercial"] as const;

describe("licencia de los motores recomendados", () => {
  it("en grupo, comunidad, público y comercial nunca recomienda un motor personal", () => {
    for (const contexto of FUERA_DE_LO_PERSONAL) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(
          motor.claseLicencia,
          `${plataforma} · ${contexto} → ${motor.id}`
        ).toBe("libre");
      }
    }
  });

  it("es determinista: mismas entradas, mismo motor", () => {
    for (const plataforma of PLATAFORMAS) {
      for (const contexto of FUERA_DE_LO_PERSONAL) {
        expect(motorRecomendado(plataforma, 16, contexto)).toEqual(
          motorRecomendado(plataforma, 16, contexto)
        );
      }
    }
  });
});
