// Licencias de voz por contexto. Se prueban SOLO funciones puras de la API de
// hoy: `motivoLicencia`/`fichaLicencia` (voz-licencias.tsx) y
// `motorRecomendado` (catalogo-voces.ts). Sin red, disco, procesos ni DOM.
import { describe, expect, it } from "vitest";

import { fichaLicencia, type ContextoVoz } from "@/components/astraura/voz-licencias";
import {
  MOTORES_VOZ,
  motorRecomendado,
  type Plataforma,
} from "@/lib/aurora/catalogo-voces";

const NO_PERSONALES: ContextoVoz[] = ["grupo", "comunidad", "publico", "comercial"];
const PLATAFORMAS: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];

describe("licencias de voz · contexto", () => {
  it("fuera del contexto personal ningún motor personal suena, en ninguna plataforma", () => {
    const personales = MOTORES_VOZ.filter((m) => m.claseLicencia === "personal");
    expect(personales.length).toBeGreaterThan(0);
    for (const contexto of NO_PERSONALES) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(motor.claseLicencia, `${plataforma} · ${contexto} · ${motor.id}`).not.toBe(
          "personal",
        );
      }
      for (const motor of personales) {
        const ficha = fichaLicencia(motor, contexto, true);
        expect(ficha.suena, `${contexto} · ${motor.id}`).toBe(false);
        expect(ficha.motivo ?? "").toMatch(/no comercial|personal/i);
      }
    }
  });

  it("comercial se comporta igual que público, con la condición cumplida o no", () => {
    for (const motor of MOTORES_VOZ) {
      for (const cumplida of [false, true]) {
        expect(fichaLicencia(motor, "comercial", cumplida)).toEqual(
          fichaLicencia(motor, "publico", cumplida),
        );
      }
    }
  });
});

describe("motor recomendado · contexto personal", () => {
  it("en escritorio sigue entrando la voz nativa, no solo en macOS", () => {
    for (const plataforma of ["macos", "windows", "linux"] as const) {
      expect(motorRecomendado(plataforma, 8, "personal").id, plataforma).toBe("voicemorphic");
    }
  });
});
