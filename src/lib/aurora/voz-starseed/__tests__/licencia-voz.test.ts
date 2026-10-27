// Prueba del filtro de licencia por contexto del catálogo de voces — módulo puro,
// sin red ni disco. Adapta los casos de la rama VPU1019X a la API de hoy:
// `motorRecomendado` excluye la clase `personal` fuera del contexto personal.
import { describe, it, expect } from "vitest";

import { motorRecomendado, type Plataforma } from "../../catalogo-voces";

const PLATAFORMAS: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];
const CONTEXTOS_NO_PERSONALES = ["grupo", "comunidad", "publico", "comercial"] as const;

describe("motorRecomendado · licencia por contexto", () => {
  it("nunca recomienda clase personal fuera del contexto personal", () => {
    for (const contexto of CONTEXTOS_NO_PERSONALES) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(motor.claseLicencia, `${plataforma} · ${contexto}`).not.toBe("personal");
      }
    }
  });

  it("comercial se comporta igual que público", () => {
    for (const plataforma of PLATAFORMAS) {
      expect(motorRecomendado(plataforma, 16, "comercial")).toEqual(
        motorRecomendado(plataforma, 16, "publico")
      );
    }
  });
});
