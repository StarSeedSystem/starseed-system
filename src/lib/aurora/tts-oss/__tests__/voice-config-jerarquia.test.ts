import { describe, it, expect } from "vitest";
import {
  esMotorVozPin,
  resolverMotorVozJerarquia,
  sanitizarMapaMotorVoz,
  type ContextoVozEntidad,
  type MapaMotorVoz,
} from "@/lib/aurora/tts-oss/voice-config";

describe("jerarquía del motor de voz (VOZ1024D · parte 1)", () => {
  it("esMotorVozPin: pin real sí; 'browser', 'auto' y basura no", () => {
    expect(esMotorVozPin("vibevoice")).toBe(true);
    expect(esMotorVozPin("openvoice2")).toBe(true);
    expect(esMotorVozPin("omnivoice")).toBe(true);
    expect(esMotorVozPin("browser")).toBe(false);
    expect(esMotorVozPin("auto")).toBe(false);
    expect(esMotorVozPin("")).toBe(false);
    expect(esMotorVozPin(undefined)).toBe(false);
    expect(esMotorVozPin("motor-inexistente")).toBe(false);
  });

  it("la capa más específica gana: agente › personalidad › cerebro › neurona › cuenta", () => {
    expect(verdict(mapaCompleto(), { agentId: "ag-1", personaId: "per-1", brainId: "br-1", deviceId: "dev-1" })).toMatchObject({
      motor: "vibevoice",
      procedencia: "agente",
      ambitoId: "ag-1",
    });
    expect(verdict(mapaCompleto(), { agentId: null, personaId: "per-1", brainId: "br-1", deviceId: "dev-1" })).toMatchObject({
      motor: "omnivoice",
      procedencia: "personalidad",
      ambitoId: "per-1",
    });
    expect(verdict(mapaCompleto(), { personaId: null, brainId: "br-1", deviceId: "dev-1" })).toMatchObject({
      motor: "chatterbox",
      procedencia: "cerebro",
      ambitoId: "br-1",
    });
    expect(verdict(mapaCompleto(), { brainId: null, deviceId: "dev-1" })).toMatchObject({
      motor: "voice158",
      procedencia: "neurona",
      ambitoId: "dev-1",
    });
    expect(verdict(mapaCompleto(), { deviceId: null })).toMatchObject({
      motor: "voxcpm",
      procedencia: "cuenta",
    });
  });

  it("un pin 'auto', 'browser' o inválido NO fija nada: la resolución hereda hacia abajo", () => {
    const mapa: MapaMotorVoz = {
      porAgente: { "ag-9": { motor: "auto" } },
      porPersonalidad: { "per-9": { motor: "browser" } },
      porCerebro: { "br-9": { motor: "otra-cosa" } },
      porNeurona: { "dev-9": { motor: "bark" } },
      cuenta: { motor: "gpt-sovits" },
    };
    const ctx: ContextoVozEntidad = { agentId: "ag-9", personaId: "per-9", brainId: "br-9", deviceId: "dev-9" };
    expect(verdict(mapa, ctx)).toMatchObject({ motor: "bark", procedencia: "neurona" });
    expect(verdict(mapa, { agentId: "ag-9", personaId: "per-9", brainId: "br-9", deviceId: null })).toMatchObject({
      motor: "gpt-sovits",
      procedencia: "cuenta",
    });
  });

  it("el pin PREDETERMINADO (openvoice2 de fábrica → 'auto') no pisa la cuenta", () => {
    const mapa: MapaMotorVoz = {
      porAgente: { "ag-1": { motor: "auto" } },
      porPersonalidad: { "per-1": { motor: "auto" } },
      porNeurona: { "dev-1": { motor: "auto" } },
      cuenta: { motor: "vibevoice" },
    };
    expect(verdict(mapa, { agentId: "ag-1", personaId: "per-1", deviceId: "dev-1" })).toMatchObject({
      motor: "vibevoice",
      procedencia: "cuenta",
    });
  });

  it("sin nada fijado → null: manda la cadena de voz (elección explícita + AUTO)", () => {
    expect(verdict({ cuenta: { motor: "browser" } }, { personaId: "per-1" })).toBeNull();
    expect(verdict({ porNeurona: { "dev-1": { motor: "openvoice2" } } }, { deviceId: "dev-x" })).toBeNull();
    expect(verdict(undefined, undefined)).toBeNull();
  });

  it("sanitizarMapaMotorVoz: deja pasar lo válido, fuera basura, límites y nunca lanza", () => {
    const limpio = sanitizarMapaMotorVoz({
      porAgente: { " ag-1 ": { motor: " vibevoice ", ruido: 5 } },
      porNeurona: { "dev-1": { motor: "x".repeat(200) } },
      cuenta: { motor: "voxcpm" },
      porCerebro: "no-es-objeto",
    });
    expect(limpio.porAgente).toEqual({ "ag-1": { motor: "vibevoice" } });
    expect(limpio.cuenta).toEqual({ motor: "voxcpm" });
    expect(limpio.porNeurona?.["dev-1"]?.motor).toHaveLength(60);
    expect(limpio.porCerebro).toBeUndefined();
    expect(sanitizarMapaMotorVoz(null)).toEqual({});
    expect(sanitizarMapaMotorVoz("basura")).toEqual({});
  });
});

function mapaCompleto(): MapaMotorVoz {
  return {
    porAgente: { "ag-1": { motor: "vibevoice" } },
    porPersonalidad: { "per-1": { motor: "omnivoice" } },
    porCerebro: { "br-1": { motor: "chatterbox" } },
    porNeurona: { "dev-1": { motor: "voice158" } },
    cuenta: { motor: "voxcpm" },
  };
}

function verdict(mapa: MapaMotorVoz | undefined, ctx: ContextoVozEntidad | undefined) {
  return resolverMotorVozJerarquia(mapa, ctx);
}
