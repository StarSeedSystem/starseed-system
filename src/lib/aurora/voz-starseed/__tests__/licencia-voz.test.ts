// Licencia de voz por contexto (Ola 1018V · tarea C).
// Solo funciones puras: nada de red, disco, reloj, micrófono, altavoz ni procesos.
import { describe, expect, it } from "vitest";

import { motoresPermitidos, type ContextoLicenciaVoz, type MotorInfo, type ResultadoPermisos } from "../licencia-voz";

const MOTORES: MotorInfo[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

// Capas que habilitan lo personal y lo condicionado (lo libre va siempre).
const CAPAS_AMPLIAS = { persona: "personal", comunidad: "condicionada" } as const;

const CONTEXTOS: ContextoLicenciaVoz[] = ["personal", "grupo", "comunidad", "publico", "comercial"];

const CONTEXTOS_NO_PERSONALES: ContextoLicenciaVoz[] = ["grupo", "comunidad", "publico", "comercial"];

function ids(lista: readonly { id: string }[]): string[] {
  return lista.map((motor) => motor.id);
}

function motivoDe(resultado: ResultadoPermisos, id: string): string | undefined {
  return resultado.excluidos.find((e) => e.id === id)?.motivo;
}

describe("motoresPermitidos · los cuatro motores en los cinco contextos", () => {
  it("personal: entran el personal habilitado, las libres y las condiciones cumplidas", () => {
    const resultado = motoresPermitidos(MOTORES, "personal", CAPAS_AMPLIAS);
    expect(ids(resultado.permitidos)).toEqual(["omnivoice", "supertonic", "kokoro"]);
    expect(ids(resultado.excluidos)).toEqual(["indextts"]);
    expect(motivoDe(resultado, "indextts")).toMatch(/condición/);
  });

  it.each(CONTEXTOS_NO_PERSONALES)(
    "%s: solo libres y condiciones cumplidas; el personal queda fuera",
    (contexto) => {
      const resultado = motoresPermitidos(MOTORES, contexto, CAPAS_AMPLIAS);
      expect(ids(resultado.permitidos)).toEqual(["supertonic", "kokoro"]);
      expect(ids(resultado.excluidos)).toEqual(["omnivoice", "indextts"]);
      expect(motivoDe(resultado, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
      expect(motivoDe(resultado, "indextts")).toMatch(/condición/);
    },
  );
});

describe("motoresPermitidos · herencia de capas y reglas duras", () => {
  it.each(CONTEXTOS)(
    "%s: sin capas que lo habiliten, nada no libre suena por defecto",
    (contexto) => {
      const resultado = motoresPermitidos(MOTORES, contexto, {});
      expect(ids(resultado.permitidos)).toEqual(["kokoro"]);
      expect(resultado.excluidos).toHaveLength(3);
    },
  );

  it("comercial se trata como público aunque la persona declare uso personal", () => {
    const resultado = motoresPermitidos(MOTORES, "comercial", {
      persona: "personal",
      comunidad: "condicionada",
    });
    expect(ids(resultado.permitidos)).toEqual(["supertonic", "kokoro"]);
    expect(motivoDe(resultado, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("una condicionada sin condición explícita no entra (ausente no es cumplida)", () => {
    const resultado = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada" }],
      "grupo",
      { comunidad: "condicionada" },
    );
    expect(resultado.permitidos).toEqual([]);
    expect(motivoDe(resultado, "supertonic")).toMatch(/condición/);
  });

  it("la capa neurona puede retirar la condicionada aunque la comunidad la permita", () => {
    const resultado = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true }],
      "grupo",
      { comunidad: "condicionada", neurona: "libre" },
    );
    expect(resultado.permitidos).toEqual([]);
    expect(motivoDe(resultado, "supertonic")).toMatch(/no habilitada/);
  });

  it("en personal, una capa restrictiva puede negar el uso personal", () => {
    const resultado = motoresPermitidos(
      [{ id: "omnivoice", claseLicencia: "personal" }],
      "personal",
      { neurona: "libre" },
    );
    expect(resultado.permitidos).toEqual([]);
    expect(motivoDe(resultado, "omnivoice")).toMatch(/capas/);
  });

  it("es determinista y conserva el orden de entrada", () => {
    const desordenados: MotorInfo[] = [
      MOTORES[3],
      MOTORES[2],
      MOTORES[0],
      MOTORES[1],
    ];
    const primera = motoresPermitidos(desordenados, "grupo", CAPAS_AMPLIAS);
    const segunda = motoresPermitidos(desordenados, "grupo", CAPAS_AMPLIAS);
    expect(primera).toEqual(segunda);
    expect(ids(primera.permitidos)).toEqual(["kokoro", "supertonic"]);
    expect(ids(primera.excluidos)).toEqual(["indextts", "omnivoice"]);
  });
});
