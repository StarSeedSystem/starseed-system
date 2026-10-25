// Licencias de voz por contexto. Se prueban SOLO funciones puras de la API de
// hoy: `motivoLicencia`/`fichaLicencia` (voz-licencias.tsx) y
// `motorRecomendado` (catalogo-voces.ts). Sin red, disco, procesos ni DOM.
import { describe, expect, it } from "vitest";

import {
  fichaLicencia,
  motivoLicencia,
  type ContextoVoz,
} from "@/components/astraura/voz-licencias";
import {
  MOTORES_VOZ,
  motorRecomendado,
  type MotorVozCatalogo,
  type Plataforma,
} from "@/lib/aurora/catalogo-voces";

const NO_PERSONALES: ContextoVoz[] = ["grupo", "comunidad", "publico", "comercial"];
const PLATAFORMAS: Plataforma[] = ["macos", "windows", "linux", "android", "ios", "web"];

function idsQueSuenan(contexto: ContextoVoz, condicionCumplida = false): string[] {
  return MOTORES_VOZ.filter((m) => fichaLicencia(m, contexto, condicionCumplida).suena).map((m) => m.id);
}

function primeraLibre(): MotorVozCatalogo {
  const motor = MOTORES_VOZ.find((m) => m.claseLicencia === "libre");
  if (!motor) throw new Error("el catálogo tiene que traer al menos un motor libre");
  return motor;
}

describe("licencias de voz · contexto", () => {
  it("en personal no se excluye ninguna clase: libre, condicionada cumplida y personal", () => {
    expect(motivoLicencia("libre", "personal", false)).toBeNull();
    expect(motivoLicencia("condicionada", "personal", true)).toBeNull();
    expect(motivoLicencia("personal", "personal", false)).toBeNull();
    expect(idsQueSuenan("personal", true)).toEqual(MOTORES_VOZ.map((m) => m.id));
  });

  it("en grupo, comunidad y público entran libres y condicionadas cumplidas; ningún personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico"] as const) {
      const esperados = MOTORES_VOZ.filter((m) => m.claseLicencia !== "personal").map((m) => m.id);
      expect(idsQueSuenan(contexto, true), contexto).toEqual(esperados);
      for (const motor of MOTORES_VOZ.filter((m) => m.claseLicencia === "personal")) {
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

  it("sin capas ni condición explícita, una condicionada no entra; solo con true", () => {
    const condicionada: MotorVozCatalogo = { ...primeraLibre(), claseLicencia: "condicionada" };
    const sinCumplir = fichaLicencia(condicionada, "grupo");
    expect(sinCumplir.suena).toBe(false);
    expect(sinCumplir.motivo ?? "").toMatch(/condiciones/i);
    const cumplida = fichaLicencia(condicionada, "grupo", true);
    expect(cumplida.suena).toBe(true);
    expect(cumplida.motivo).toBeNull();
  });
});

describe("motor recomendado · contexto", () => {
  it("nunca recomienda clase personal fuera del contexto personal, en ninguna plataforma", () => {
    for (const contexto of NO_PERSONALES) {
      for (const plataforma of PLATAFORMAS) {
        const motor = motorRecomendado(plataforma, 16, contexto);
        expect(motor.claseLicencia, `${plataforma} · ${contexto} · ${motor.id}`).not.toBe("personal");
      }
    }
  });
});
