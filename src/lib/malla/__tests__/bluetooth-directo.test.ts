/**
 * BLE1108A — Bluetooth directo como enlace del transporte universal: lo puro (ids, estado de la app,
 * límites, ligaduras, a quién saludar, enlaces, velocidad honesta, señales del radar y control Wi-Fi).
 */
import { describe, expect, it } from "vitest";
import {
  LIMITES_BLE_DEFECTO,
  MAX_ARCHIVO_BLE,
  T_OFERTA_WIFI,
  T_RESPUESTA_WIFI,
  duracionArchivoBle,
  enlaceDeIdBle,
  enlacesBle,
  esEnlaceBle,
  idEnlaceBle,
  leerControlEnlace,
  leerEstadoBle,
  ligarBle,
  ligaduraDeEnlace,
  podarLigadurasBle,
  saludosBle,
  senalesBluetoothDirecto,
  textoVelocidadBle,
  trozoArchivoBle,
  type EstadoBleNativo,
  type LigaduraBle,
} from "@/lib/malla/bluetooth-directo";

const T = 1_800_000_000_000;

function estado(p: Partial<EstadoBleNativo> = {}): EstadoBleNativo {
  return {
    disponible: true,
    activo: true,
    radio: "encendida",
    motivo: "",
    plataforma: "android",
    anunciando: true,
    con_cuenta: true,
    vecinos: [],
    enlaces: [],
    ultimo_seq: 0,
    max_cuerpo: 16384,
    limite_mensajes: 120,
    limite_ventana_ms: 10_000,
    paquete_max: 512,
    ...p,
  };
}

const enlace = (id: string, p: Partial<EstadoBleNativo["enlaces"][number]> = {}) => ({
  id,
  rol: "central",
  vecino: null,
  neurona: null,
  rssi: -60,
  paquete: 182,
  rtt_ms: null,
  kbps: null,
  pendientes: 0,
  bytes_enviados: 0,
  bytes_recibidos: 0,
  abierto_hace_ms: 1000,
  ...p,
});

const lig = (enlace: string, neurona: string, at = T): LigaduraBle => ({
  enlace,
  neurona,
  huella: `fp-${neurona}`,
  nombre: `Neurona ${neurona}`,
  limites: { ...LIMITES_BLE_DEFECTO },
  at,
});

describe("Bluetooth directo · lo puro (BLE1108A)", () => {
  it("ids de enlace `ble:<id>` y nada más", () => {
    expect(idEnlaceBle("b3")).toBe("ble:b3");
    expect(enlaceDeIdBle("ble:b3")).toBe("b3");
    for (const no of ["ble:", "ble:x3", "ble:b", "nativo:192.168.1.2", "local:ble:b3", null, undefined, "ble:b1;rm"]) {
      expect(esEnlaceBle(no as string)).toBe(false);
    }
  });

  it("el estado de la app se sanea: lo raro se descarta, nunca se inventa", () => {
    expect(leerEstadoBle(null)).toBeNull();
    expect(leerEstadoBle({ radio: "encendida" })).toBeNull();
    const e = leerEstadoBle({
      disponible: true,
      activo: true,
      radio: "encendida",
      motivo: "ok",
      vecinos: [
        { id: "v0a1b2c3d", rssi: -500, propia: true, neurona: "n-1", tipo: "android", servidor: true, visto_hace_ms: 300, enlace: "b1" },
        { id: "malo", rssi: -40 },
        { id: "v00000000", rssi: -40, enlace: "b1; DROP" },
      ],
      enlaces: [{ id: "b1", rol: "jefe", rtt_ms: 42, kbps: "rápido" }, { id: "../b2" }],
    })!;
    expect(e.vecinos.map((v) => v.id)).toEqual(["v0a1b2c3d", "v00000000"]);
    expect(e.vecinos[0].rssi).toBe(-127);
    expect(e.vecinos[1].enlace).toBeNull();
    expect(e.enlaces).toHaveLength(1);
    expect(e.enlaces[0]).toMatchObject({ id: "b1", rol: "periferico", rtt_ms: 42, kbps: null });
    expect(e.max_cuerpo).toBe(LIMITES_BLE_DEFECTO.maxCuerpo);
  });

  it("trozos de archivo de 10 KiB: en base64 caben en una trama de 16 KiB", () => {
    expect(trozoArchivoBle()).toBe(10 * 1024);
    const b64 = Math.ceil(trozoArchivoBle() / 3) * 4;
    const chunk = JSON.stringify({ t: "archivo.chunk", id: "f".repeat(36), index: 99_999, datosB64: "A".repeat(b64) });
    expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(LIMITES_BLE_DEFECTO.maxCuerpo - 512);
  });

  it("ligaduras: una por enlace y una por neurona; caducan y se van con su enlace", () => {
    let l = ligarBle([], lig("b1", "n-1"));
    l = ligarBle(l, lig("b2", "n-2"));
    l = ligarBle(l, lig("b3", "n-1"));
    expect(l.map((x) => `${x.enlace}:${x.neurona}`).sort()).toEqual(["b2:n-2", "b3:n-1"]);
    expect(ligaduraDeEnlace(l, "b3", T)?.neurona).toBe("n-1");
    expect(ligaduraDeEnlace(l, "b3", T + 6 * 60_000)).toBeNull();
    expect(podarLigadurasBle(l, new Set(["b3"]), T).map((x) => x.enlace)).toEqual(["b3"]);
  });

  it("saludosBle: a la reconocida por el anuncio; a ciegas, solo a las de la cuenta o vinculadas (≤ 6)", () => {
    const enlaces = [enlace("b1", { neurona: "n-tab" }), enlace("b2", { rol: "periferico" })];
    const base = { enlaces, ligaduras: [], vinculos: [{ neurona: "n-amiga", nombre: "Amiga", huella: "fp" }], cuenta: ["n-mac", "n-tab", "n-movil"], conClave: true, yo: "n-mac", ultimoHola: {}, ahora: T };
    const s = saludosBle(base);
    expect(s).toContainEqual({ enlace: "b1", para: "n-tab" });
    expect(s.filter((x) => x.enlace === "b2").map((x) => x.para).sort()).toEqual(["n-amiga", "n-movil", "n-tab"]);
    // Sin clave de faro: a ciegas solo las vinculadas (la reconocida por anuncio no lleva prueba de cuenta).
    expect(saludosBle({ ...base, conClave: false }).map((x) => `${x.enlace}:${x.para}`)).toEqual(["b2:n-amiga"]);
    // Recién saludado o recién ligado: nada.
    expect(saludosBle({ ...base, ultimoHola: { b1: T - 1000, b2: T - 1000 } })).toEqual([]);
    expect(saludosBle({ ...base, ligaduras: [lig("b1", "n-tab", T - 1000)] }).some((x) => x.enlace === "b1")).toBe(false);
    // Muchas neuronas: como mucho 6 saludos por enlace sin reconocer.
    const muchas = Array.from({ length: 20 }, (_, i) => `n-${i}`);
    expect(saludosBle({ ...base, cuenta: muchas }).filter((x) => x.enlace === "b2")).toHaveLength(6);
  });

  it("enlacesBle: solo los ligados, con lo MEDIDO y los límites honestos", () => {
    const e = estado({ enlaces: [enlace("b1", { rtt_ms: 84, kbps: 160 }), enlace("b2")] });
    const out = enlacesBle({ estado: e, ligaduras: [{ ...lig("b1", "n-tab"), sync: "s-tab", cuenta: "u1" }], ahora: T, caidas: {} });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "ble:b1",
      tipo: "ble",
      abierto: true,
      sinInternet: true,
      rttMs: 84,
      capacidadKbps: 160,
      maxBytes: MAX_ARCHIVO_BLE,
      admite: { mensaje: true, archivo: true, flujo: false },
      alcanza: { neuronDeviceId: "n-tab", syncDeviceId: "s-tab", uid: "u1" },
    });
    expect(enlacesBle({ estado: e, ligaduras: [lig("b1", "n-tab")], ahora: T, caidas: { b1: T + 1 } })[0].abierto).toBe(false);
    expect(enlacesBle({ estado: { ...e, radio: "apagada" }, ligaduras: [lig("b1", "n-tab")], ahora: T, caidas: {} })).toEqual([]);
  });

  it("velocidad y duración: lo medido o una horquilla que dice «sin medir»", () => {
    expect(textoVelocidadBle(160)).toBe("≈ 20 KB/s (medido)");
    expect(textoVelocidadBle(null)).toContain("sin medir");
    expect(duracionArchivoBle(20 * 1024 * 1024, 160)).toMatch(/^≈ \d+ min$/);
    expect(duracionArchivoBle(1_000_000, null)).toMatch(/^entre .* y .* \(sin medir\)$/);
  });

  it("señales del radar: cada vecino con su RSSI; de quién es, solo si es de tu cuenta", () => {
    const e = estado({
      vecinos: [
        { id: "v0a1b2c3d", rssi: -55, propia: true, neurona: "n-tab", tipo: "android", servidor: true, visto_hace_ms: 2000, enlace: "b1" },
        { id: "v11111111", rssi: -80, propia: false, neurona: null, tipo: "escritorio", servidor: true, visto_hace_ms: 500, enlace: null },
      ],
      enlaces: [enlace("b1", { rtt_ms: 90, kbps: 200 })],
    });
    const s = senalesBluetoothDirecto(e, T, new Map([["n-tab", "Maggaboard"]]));
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ id: "ble-directo:v0a1b2c3d", antenna: "ble", label: "Maggaboard", compatible: true, simulated: false });
    expect(s[0].starseed).toMatchObject({ via: "direct-link", neuronId: "n-tab", ownAccount: true });
    expect(s[0].metrics.find((m) => m.label === "Señal")?.value).toBe("-55 dBm");
    expect(s[0].placement.detail).toContain("RSSI");
    expect(s[1].starseed).toBeNull();
    expect(s[1].compatible).toBe(false);
    expect(s[0].quality!).toBeGreaterThan(s[1].quality!);
    expect(senalesBluetoothDirecto(estado({ radio: "sin-permiso", vecinos: e.vecinos }), T)).toEqual([]);
    expect(senalesBluetoothDirecto(null, T)).toEqual([]);
  });

  it("control del enlace Wi-Fi (WFD1108A): oferta y respuesta saneadas, caducadas fuera", () => {
    const oferta = {
      t: T_OFERTA_WIFI,
      v: 1,
      s: "sesion-0001",
      de: "n-tab",
      para: "n-mac",
      modo: "hotspot",
      ssid: "DIRECT-StarSeed",
      banda: "5",
      ip: "192.168.49.1",
      puerto: 47071,
      secreto: { iv: "AAAAAAAAAAAAAAAA", ct: "c2VjcmV0bw==" },
      caduca: T + 5 * 60_000,
      ts: T,
    };
    expect(leerControlEnlace(oferta, T)).toEqual(oferta);
    expect(leerControlEnlace({ ...oferta, ip: "8.8.8.8" }, T)).not.toHaveProperty("ip");
    expect(leerControlEnlace({ ...oferta, caduca: T - 1 }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, caduca: T + 60 * 60_000 }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, modo: "bluetooth" }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, s: "x" }, T)).toBeNull();
    expect(leerControlEnlace(oferta, T + 11 * 60_000)).toBeNull();
    const r = { t: T_RESPUESTA_WIFI, v: 1, s: "sesion-0001", de: "n-mac", para: "n-tab", k: "unido", ip: "192.168.49.23", ts: T };
    expect(leerControlEnlace(r, T)).toEqual(r);
    expect(leerControlEnlace({ ...r, k: "quizá" }, T)).toBeNull();
    expect(leerControlEnlace({ t: "otra.cosa", v: 1 }, T)).toBeNull();
  });
});
