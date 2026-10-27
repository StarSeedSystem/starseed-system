// Prueba de src/lib/aurora/catalogo-voces.ts — módulo puro, sin red ni disco.
// La licencia por contexto ya se aplica motor a motor en la UI; aquí se fija
// la invariante de `motorRecomendado` para TODAS las plataformas, no solo macOS.
import { describe, it, expect } from "vitest";

import { motorRecomendado, type Plataforma } from "../../catalogo-voces";

const PLATAFORMAS: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];
const CONTEXTOS_NO_PERSONALES = ["grupo", "comunidad", "publico", "comercial"] as const;

describe("motorRecomendado · licencia por contexto", () => {
  it("en grupo, comunidad, público y comercial nunca recomienda clase personal", () => {
    for (const contexto of CONTEXTOS_NO_PERSONALES) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(motor.claseLicencia, `${plataforma} · ${contexto}`).not.toBe("personal");
      }
    }
  });
});
