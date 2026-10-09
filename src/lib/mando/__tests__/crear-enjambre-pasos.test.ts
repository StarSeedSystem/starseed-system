import { describe, it, expect } from "vitest";
import { validarPaso, resumenEnjambre, type DatosAsistente } from "../crear-enjambre-pasos";

function datosBase(): DatosAsistente {
  return {
    ambitoTipo: "persona",
    ambitoId: "amb-1",
    motor: { tipo: "local" },
    proveedores: ["llm7"],
    directores: { chat: true, optimizador: true },
    plantilla: "vacía",
    limites: {
      presupuestoTokensDia: 5000,
      pagoPermitido: false,
      horario: "24/7",
      visibilidad: "privado",
      alcanceMemoria: "perfil",
    },
  };
}

describe("validarPaso", () => {
  it("paso 1 válido con datos completos", () => {
    const d = datosBase();
    expect(validarPaso(1, d).valido).toBe(true);
  });

  it("paso 1 inválido sin ambitoId", () => {
    const d = datosBase();
    d.ambitoId = "";
    const r = validarPaso(1, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("selecciona un ámbito");
  });

  it("paso 1 inválido sin ambitoTipo", () => {
    const d = datosBase();
    (d as DatosAsistente).ambitoTipo = undefined;
    const r = validarPaso(1, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("falta el tipo de ámbito");
  });

  it("paso 2 válido con motor local", () => {
    expect(validarPaso(2, datosBase()).valido).toBe(true);
  });

  it("paso 2 inválido sin motor", () => {
    const d = datosBase();
    d.motor = undefined;
    const r = validarPaso(2, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("elige un motor");
  });

  it("paso 2 inválido con tipo de motor incorrecto", () => {
    const d = datosBase();
    d.motor = { tipo: "desconocido" as unknown as "local" };
    const r = validarPaso(2, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("elige un motor");
  });

  it("paso 3 válido con proveedores", () => {
    expect(validarPaso(3, datosBase()).valido).toBe(true);
  });

  it("paso 3 inválido sin proveedores", () => {
    const d = datosBase();
    d.proveedores = [];
    const r = validarPaso(3, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("selecciona al menos un proveedor");
  });

  it("paso 4 válido con directores y plantilla", () => {
    expect(validarPaso(4, datosBase()).valido).toBe(true);
  });

  it("paso 4 inválido sin directores activos", () => {
    const d = datosBase();
    d.directores = {};
    const r = validarPaso(4, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("activa al menos un director");
  });

  it("paso 4 inválido sin plantilla", () => {
    const d = datosBase();
    d.plantilla = "";
    const r = validarPaso(4, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("elige una plantilla de ola");
  });

  it("paso 5 completo con valores por defecto es válido", () => {
    expect(validarPaso(5, datosBase()).valido).toBe(true);
  });

  it("paso 5 inválido sin pagoPermitido", () => {
    const d = datosBase();
    const l = d.limites ?? {};
    d.limites = { ...l, pagoPermitido: undefined as unknown as boolean };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("falta Permitir pago");
  });

  it("paso 5 inválido sin horario", () => {
    const d = datosBase();
    const l = d.limites ?? {};
    d.limites = { ...l, horario: "" };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("falta el horario");
  });

  it("paso 5 inválido con presupuesto no positivo", () => {
    const d = datosBase();
    const l = d.limites ?? {};
    d.limites = { ...l, presupuestoTokensDia: 0 };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("presupuesto debe ser mayor que 0");
  });

  it("paso 5 rechaza alcance 'grupo' para persona", () => {
    const d = datosBase();
    d.ambitoTipo = "persona";
    const l = d.limites ?? {};
    d.limites = { ...l, alcanceMemoria: "grupo" };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("una persona no puede elegir alcance 'grupo'");
  });

  it("paso 5 rechaza alcance 'perfil' para entidad", () => {
    const d = datosBase();
    d.ambitoTipo = "entidad";
    const l = d.limites ?? {};
    d.limites = { ...l, alcanceMemoria: "perfil" };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("un grupo no puede elegir alcance 'perfil'");
  });

  it("paso 5 válido con alcance 'publica' para persona", () => {
    const d = datosBase();
    d.ambitoTipo = "persona";
    const l = d.limites ?? {};
    d.limites = { ...l, alcanceMemoria: "publica" };
    expect(validarPaso(5, d).valido).toBe(true);
  });

  it("paso 5 válido con alcance 'grupo' para entidad", () => {
    const d = datosBase();
    d.ambitoTipo = "entidad";
    const l = d.limites ?? {};
    d.limites = { ...l, alcanceMemoria: "grupo" };
    expect(validarPaso(5, d).valido).toBe(true);
  });

  it("paso 5 rechaza alcance de memoria inválido", () => {
    const d = datosBase();
    const l = d.limites ?? {};
    d.limites = { ...l, alcanceMemoria: "inválido" as "perfil" };
    const r = validarPaso(5, d);
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("alcance de memoria inválido");
  });
});

describe("resumenEnjambre", () => {
  it("resume con datos completos", () => {
    const r = resumenEnjambre(datosBase());
    expect(r).toContain("Genesis");
    expect(r).toContain("local");
    expect(r).toContain("llm7");
    expect(r).toContain("vacía");
    expect(r).toContain("5000 tokens/día");
    expect(r).toContain("pago: no");
    expect(r).toContain("24/7");
    expect(r).toContain("perfil");
    expect(r).toContain("privado");
  });

  it("resume con valores mínimos", () => {
    const d: DatosAsistente = {
      motor: { tipo: "nube-propia" },
      proveedores: [],
      directores: {},
    };
    const r = resumenEnjambre(d);
    expect(r).toContain("Genesis");
    expect(r).toContain("nube-propia");
    expect(r).toContain("—");
  });

  it("resumenEnjambre nunca expone un token (fallo del servidor no muestra token)", () => {
    const r = resumenEnjambre(datosBase());
    expect(r).not.toContain("token-demo");
    expect(r).not.toContain("token:");
  });
});
