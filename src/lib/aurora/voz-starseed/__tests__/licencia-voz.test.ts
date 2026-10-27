// Prueba de la recomendación de motor por licencia y contexto
// (src/lib/aurora/catalogo-voces.ts). Módulo puro: entrada → salida, sin red
// ni disco. El contexto decide qué clases de licencia pueden entrar.
import { describe, it, expect } from "vitest";

import {
  motorRecomendado,
  type Plataforma,
} from "../../catalogo-voces";

const CONTEXTOS_NO_PERSONALES = [
  "grupo",
  "comunidad",
  "publico",
  "comercial",
] as const;

const PLATAFORMAS: Plataforma[] = [
  "macos",
  "windows",
  "linux",
  "android",
  "ios",
  "web",
];

describe("motorRecomendado · licencia por contexto", () => {
  it("en grupo, comunidad, público y comercial nunca recomienda clase personal", () => {
    for (const contexto of CONTEXTOS_NO_PERSONALES) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(motor.claseLicencia, `${plataforma} · ${contexto}`).not.toBe(
          "personal"
        );
      }
    }
  });

  it("comercial se comporta igual que público en cualquier plataforma", () => {
    for (const plataforma of PLATAFORMAS) {
      expect(motorRecomendado(plataforma, 16, "comercial")).toEqual(
        motorRecomendado(plataforma, 16, "publico")
      );
    }
  });
});
