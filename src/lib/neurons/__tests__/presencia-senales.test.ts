/** Presencia en vivo y señales medidas (2026-10-09). */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { mediosDeEstado, presentesPorNeurona, type PresenciaMedio } from "../presencia";
import { firmaSenales, resumirSenales, MOTIVO_RETICULUM } from "../senales-medio";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";

const s = resumirSenales({ enLinea: true, conexion: { type: "wifi", effectiveType: "4g", downlink: 9.87 }, malla: { propios: 2, otrasCuentas: 1 }, mesh: null, bluetooth: null, serie: { api: true, puertos: 0 } });

describe("oferta en presencia (AQ07)", () => {
  const baseMedio = (overrides: Partial<PresenciaMedio> = {}): PresenciaMedio => ({
    n: "neurona-1",
    m: "medio-1",
    t: Date.now(),
    tipo: "navegador",
    etiqueta: "Chrome",
    visible: true,
    desde: new Date().toISOString(),
    s,
    ...overrides,
  });

  it("un medio sin oferta no tiene campo o", () => {
    const medio = baseMedio();
    expect("o" in medio).toBe(false);
  });

  it("un medio con oferta de cómputo y almacenamiento incluye el campo o", () => {
    const medio = baseMedio({
      o: { computo: true, almacenamiento: true, internet: false },
    });
    expect(medio.o).toEqual({ computo: true, almacenamiento: true, internet: false });
  });

  it("un medio con oferta de internet incluye el campo o", () => {
    const medio = baseMedio({
      o: { computo: false, almacenamiento: false, internet: true },
    });
    expect(medio.o).toEqual({ computo: false, almacenamiento: false, internet: true });
  });

  it("la oferta solo incluye lo que la persona tiene encendido", () => {
    const medio = baseMedio({
      o: { computo: true, almacenamiento: false, internet: true },
    });
    expect(medio.o?.computo).toBe(true);
    expect(medio.o?.almacenamiento).toBe(false);
    expect(medio.o?.internet).toBe(true);
  });
});

describe("resumirSenales", () => {
  it("dice lo medido y lo que no se puede medir como tal", () => {
    expect(s.internet).toEqual({ enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 9.9 });
    expect(s.malla).toEqual({ pares: 2, otrasCuentas: 1 });
    expect(s.lora).toEqual({ estado: "sin-radio", nodos: 0 });
    expect(s.bluetooth.disponible).toBeNull();
    expect(s.reticulum).toEqual({ disponible: false, motivo: MOTIVO_RETICULUM });
  });
  it("con radio Meshtastic conectada cuenta sus nodos", () => {
    const r = resumirSenales({ enLinea: false, mesh: { status: "ready", transport: "ble", nodes: [1, 2, 3] }, bluetooth: true, serie: { api: false, puertos: 5 } });
    expect(r.lora).toEqual({ estado: "ready", transporte: "ble", nodos: 3 });
    expect(r.serie).toEqual({ disponible: false, puertos: 0 });
    expect(firmaSenales(r)).not.toBe(firmaSenales(s));
  });
});

describe("mediosDeEstado", () => {
  const base = (n: string, m: string, t: number): PresenciaMedio => ({ n, m, t, tipo: "navegador", etiqueta: m, visible: true, desde: "x", s });
  it("se queda con el anuncio más nuevo de cada medio y agrupa por neurona", () => {
    const medios = mediosDeEstado({ m1: [base("mac", "m1", 1), base("mac", "m1", 5)], m2: [base("mac", "m2", 3)], m3: [base("movil", "m3", 2)], basura: [{ x: 1 }] });
    expect(medios.map((m) => `${m.n}:${m.m}:${m.t}`)).toEqual(["mac:m1:5", "mac:m2:3", "movil:m3:2"]);
    const por = presentesPorNeurona(medios);
    expect(por.get("mac")?.length).toBe(2);
    expect(por.get("movil")?.length).toBe(1);
  });
});

describe("esPeticionDeEstaMaquina", () => {
  const req = (h: Record<string, string>) => new Request("http://localhost:9002/api/dispositivo/maquina", { headers: h });
  it("solo la propia máquina: localhost sin cabeceras de túnel ni IPs ajenas", () => {
    expect(esPeticionDeEstaMaquina(req({ host: "localhost:9002" }))).toBe(true);
    expect(esPeticionDeEstaMaquina(req({ host: "localhost:9002", "x-forwarded-for": "::1" }))).toBe(true);
    expect(esPeticionDeEstaMaquina(req({ host: "maggasukha.local:9002" }))).toBe(false);
    expect(esPeticionDeEstaMaquina(req({ host: "192.168.1.20:9002" }))).toBe(false);
    expect(esPeticionDeEstaMaquina(req({ host: "localhost:9002", "x-forwarded-for": "192.168.1.33" }))).toBe(false);
    expect(esPeticionDeEstaMaquina(req({ host: "localhost:9002", "cf-connecting-ip": "1.2.3.4" }))).toBe(false);
    expect(esPeticionDeEstaMaquina(req({ host: "localhost:9002", "x-forwarded-host": "abc.trycloudflare.com" }))).toBe(false);
  });
});
