import { describe, expect, it } from "vitest";
import { capacidadCarril, esperaReintentoIce, MARGEN_CAPACIDAD, ordenPorCapacidad, REGLAS, SelectorCarriles, SILENCIO_WEBRTC_MS, type MuestraCarril } from "@/lib/llamadas/carriles";


const web = (arriba: boolean): MuestraCarril => ({ carril: "webrtc", arriba, rttMs: 20 });
const ble: MuestraCarril = { carril: "ble-l2cap", arriba: true, rttMs: 80, kbps: 165 };

describe("paso de carril al instante (MLL1111C)", () => {
  it("la voz deja un carril CAÍDO en el primer tic si el otro ya estaba abierto (antes: 3 s)", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "webrtc", 0);
    expect(s.actualizar([web(true), ble], 1_000, () => true, ["voz"])).toEqual([]);
    const c = s.actualizar([web(false), ble], 1_500, () => true, ["voz"]);
    expect(c.find((x) => x.flujo === "voz")).toMatchObject({ de: "webrtc", a: "ble-l2cap", motivo: "webrtc-caido" });
  });

  it("degradado (no caído) sigue pidiendo la evidencia entera: la voz se queda donde funciona", () => {
    const s = new SelectorCarriles();
    s.fijar("voz", "webrtc", 0);
    const mala: MuestraCarril = { carril: "webrtc", arriba: true, rttMs: 20, perdidaPct: 30 };
    expect(s.actualizar([mala, ble], 1_000).filter((x) => x.flujo === "voz")).toEqual([]);
    expect(s.actualizar([mala, ble], 1_000 + REGLAS.voz.evidenciaMs - 1).filter((x) => x.flujo === "voz")).toEqual([]);
    expect(s.actualizar([mala, ble], 1_000 + REGLAS.voz.evidenciaMs).filter((x) => x.flujo === "voz")).toHaveLength(1);
  });

  it("el vídeo cae al Bluetooth en 1 s y vuelve a WebRTC con histéresis", () => {
    const s = new SelectorCarriles();
    s.actualizar([web(true), ble], 0, () => true, ["video"]);
    expect(s.carril("video")).toBe("webrtc");
    s.actualizar([web(false), ble], 10_000, () => true, ["video"]);
    expect(s.carril("video")).toBe("webrtc");
    s.actualizar([web(false), ble], 11_000, () => true, ["video"]);
    expect(s.carril("video")).toBe("ble-l2cap");
  });

  it("comprobación de vida y reintentos de ICE: constantes del contrato", () => {
    expect(SILENCIO_WEBRTC_MS).toBeLessThanOrEqual(1_000);
    // LLA1112A: la escala sigue hasta 120 s (antes se quedaba en 15 s para siempre: prueba 39, ocho intentos por llamada).
    expect([0, 1, 2, 3, 4, 10].map(esperaReintentoIce)).toEqual([3_000, 6_000, 12_000, 30_000, 60_000, 120_000]);
  });
});

describe("Wi-Fi directo frente a la red local por capacidad (MLL1111C, petición 8)", () => {
  const lan = (kbps: number, rtt: number): MuestraCarril => ({ carril: "lan-tcp", arriba: true, kbps, rttMs: rtt });
  const directo = (kbps: number, rtt: number): MuestraCarril => ({ carril: "wifi-direct", arriba: true, kbps, rttMs: rtt });

  it("capacidad = kb/s penalizados por el retardo", () => {
    expect(capacidadCarril({ carril: "lan-tcp", arriba: true, kbps: 1000, rttMs: 100 })).toBe(500);
    expect(capacidadCarril({ carril: "lan-tcp", arriba: true })).toBeNull();
  });

  it("los datos toman el directo si mide más (antes: siempre la red local primero)", () => {
    const s = new SelectorCarriles();
    s.actualizar([ble, lan(40_000, 6), directo(200_000, 2)], 0, () => true, ["datos"]);
    expect(s.carril("datos")).toBe("wifi-direct");
  });

  it("el vídeo toma el router si el directo mide menos (antes: siempre el directo por el orden fijo)", () => {
    const s = new SelectorCarriles();
    s.actualizar([ble, lan(90_000, 3), directo(15_000, 20)], 0, () => true, ["video"]);
    expect(s.carril("video")).toBe("lan-tcp");
  });

  it("sin medidas, el orden de siempre; con una sola medida, también", () => {
    const pref = REGLAS.video.preferencia;
    expect(ordenPorCapacidad(pref, new Map(), null)).toEqual([...pref]);
    expect(ordenPorCapacidad(pref, new Map([["lan-tcp", lan(1, 1)]]), null)).toEqual([...pref]);
  });

  it("histéresis: dentro del margen no se mueve; fuera, sube con motivo «más capacidad»", () => {
    const s = new SelectorCarriles();
    let t = 0;
    const paso = (m: MuestraCarril[], ms: number) => {
      const out = [];
      for (const fin = t + ms; t < fin; t += 500) out.push(...s.actualizar(m, t, () => true, ["datos"]));
      return out;
    };
    paso([ble, lan(100_000, 3)], 2_000);
    expect(s.carril("datos")).toBe("lan-tcp");
    // El directo mide un 10 % más: no basta.
    expect(paso([ble, lan(100_000, 3), directo(110_000, 3)], 20_000)).toEqual([]);
    // Mide el doble: sube tras la evidencia, y lo dice.
    const c = paso([ble, lan(100_000, 3), directo(100_000 * MARGEN_CAPACIDAD * 1.6, 3)], 6_000);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ de: "lan-tcp", a: "wifi-direct", motivo: "wifi-direct-mas-capacidad" });
    // Ahora el router oscila +10 % por encima: se queda en el directo.
    expect(paso([ble, lan(176_000, 3), directo(160_000, 3)], 20_000)).toEqual([]);
  });
});
