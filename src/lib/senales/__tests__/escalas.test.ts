import { describe, expect, it } from "vitest";
import { ANTENNA_SECTOR, radiusFracForMeters } from "@/ai/astraura/mesh/signals";
import {
  ESCALAS, ESCALA_FAMILIA, anillosDeAlcance, distanciaPorFraccion, factorError, formatoMetros,
  fraccionPorDistancia, haloDeEstimacion, reubicar,
} from "../escalas";
import { AHORA, senal } from "../__fixtures__/vivo";

const rf = (antenna: "lora" | "ble" | "ip", distanceM: number, o = {}) =>
  senal(`${antenna}:${distanceM}`, {
    antenna, quality: 0.5,
    placement: { angleRad: 0.1, radiusFrac: radiusFracForMeters(distanceM), accuracyFrac: 0.1, mode: "rf", distanceM, accuracyM: 10, detail: "Distancia orientativa por RSSI. El rumbo es desconocido." },
    ...o,
  });
const gps = (distanceM: number) =>
  senal(`lora:g${distanceM}`, { placement: { angleRad: -1, radiusFrac: radiusFracForMeters(distanceM), accuracyFrac: 0.02, mode: "gps", distanceM, accuracyM: 35, detail: "gps" } });

describe("escalas de distancia", () => {
  it("la escala larga es exactamente la del radar de siempre", () => {
    for (const m of [30, 100, 1000, 5000, 6000]) expect(fraccionPorDistancia(m, "largo")).toBeCloseTo(radiusFracForMeters(m), 12);
  });

  it("la escala corta va de 1 m (0,16) a 300 m (0,92), crece con la distancia y se acota", () => {
    expect(fraccionPorDistancia(1, "corto")).toBeCloseTo(0.16, 9);
    expect(fraccionPorDistancia(300, "corto")).toBeCloseTo(0.92, 9);
    expect(fraccionPorDistancia(0.2, "corto")).toBeCloseTo(0.16, 9);
    expect(fraccionPorDistancia(9999, "corto")).toBeCloseTo(0.92, 9);
    const f = [3, 10, 30, 100].map((m) => fraccionPorDistancia(m, "corto"));
    expect(f).toEqual([...f].sort((a, b) => a - b));
    expect(fraccionPorDistancia(NaN, "corto")).toBeCloseTo(0.16, 9);
  });

  it("distanciaPorFraccion es la inversa", () => {
    for (const escala of ["largo", "corto"] as const) {
      for (const m of [ESCALAS[escala].minM, 10 * ESCALAS[escala].minM, ESCALAS[escala].maxM]) {
        expect(distanciaPorFraccion(fraccionPorDistancia(m, escala), escala)).toBeCloseTo(m, 6);
      }
    }
  });

  it("solo LoRa, Bluetooth y red IP tienen escala; relé, cuenta y serie no tienen distancia", () => {
    expect(ESCALA_FAMILIA).toEqual({ lora: "largo", ble: "corto", ip: "corto" });
  });

  it("los metros se escriben como los lee una persona", () => {
    expect(formatoMetros(3)).toBe("3 m");
    expect(formatoMetros(3.46)).toBe("3,5 m");
    expect(formatoMetros(120)).toBe("120 m");
    expect(formatoMetros(1200)).toBe("1,2 km");
    expect(formatoMetros(25_000)).toBe("25 km");
    expect(formatoMetros(NaN)).toBe("sin dato");
  });

  it("el error del modelo crece cuando cae la calidad; BLE e IP son más burdos que LoRa", () => {
    expect(factorError("lora", 1)).toBeCloseTo(1.6, 9);
    expect(factorError("lora", 0)).toBeCloseTo(2.6, 9);
    expect(factorError("ble", 1)).toBeCloseTo(2.0, 9);
    expect(factorError("ip", 0.35)).toBeCloseTo(2.65, 9);
    expect(factorError("lora", null)).toBeCloseTo(factorError("lora", 0.35), 9);
    expect(haloDeEstimacion(10, "corto", 3)).toBeGreaterThan(haloDeEstimacion(10, "corto", 1.5));
  });
});

describe("reubicar: la distancia dibujada y la escrita dicen lo mismo", () => {
  it("un BLE a 4 m cae en el radio de 4 m de la escala corta (no en el de 30 m de la larga)", () => {
    const s = rf("ble", 4);
    expect(s.placement.radiusFrac).toBeCloseTo(0.16, 9); // la escala larga lo deja pegado al mínimo
    const r = reubicar(s);
    expect(r.placement.radiusFrac).toBeCloseTo(fraccionPorDistancia(4, "corto"), 9);
    expect(r.placement.radiusFrac).toBeGreaterThan(0.3);
    expect(r.placement.distanceM).toBe(4);
    expect(r.placement.angleRad).toBe(s.placement.angleRad);
    expect(r.placement.accuracyM).toBe(Math.round(4 * (factorError("ble", 0.5) - 1)));
    expect(r.placement.detail).toContain("Rango del modelo: entre 1,6 m y 10 m");
    expect(r.placement.detail).not.toContain("±50");
  });

  it("no muta la entrada y es estable si se aplica dos veces", () => {
    const s = rf("ip", 12);
    const copia = JSON.parse(JSON.stringify(s));
    const r = reubicar(s);
    expect(s).toEqual(copia);
    expect(reubicar(r).placement.radiusFrac).toBeCloseTo(r.placement.radiusFrac, 12);
  });

  it("todo lo demás vuelve idéntico (misma referencia): LoRa, GPS, sin posición, sin distancia", () => {
    const sector = senal("ble:s", { antenna: "ble", placement: { ...rf("ble", 4).placement, mode: "sector", distanceM: null } });
    for (const s of [rf("lora", 800), gps(500), sector, rf("ble", 4, { placement: { ...rf("ble", 4).placement, distanceM: null } })]) {
      expect(reubicar(s)).toBe(s);
    }
  });

  it("la distancia mínima de la escala es 1 m", () => {
    expect(reubicar(rf("ble", 0)).placement.distanceM).toBe(1);
  });
});

describe("anillos de alcance: solo donde la distancia existe", () => {
  it("sin ninguna distancia no hay ningún anillo", () => {
    expect(anillosDeAlcance([])).toEqual([]);
    const sector = senal("ble:s", { antenna: "ble", placement: { ...rf("ble", 4).placement, mode: "sector", distanceM: null } });
    expect(anillosDeAlcance([sector, senal("neuron:1", { antenna: "account" }), senal("beacon:1", { antenna: "relay" })])).toEqual([]);
  });

  it("con GPS: círculos completos y REALES de esa escala, hasta la primera marca que cubre al más lejano", () => {
    const a = anillosDeAlcance([gps(250)]);
    expect(a.map((x) => x.metros)).toEqual([100, 1000]);
    expect(a.every((x) => x.real && x.familia === null && x.desdeRad === null && x.hastaRad === null && x.escala === "largo")).toBe(true);
    expect(a[0].etiqueta).toBe("100 m");
    expect(a[1].etiqueta).toBe("1 km");
    expect(a[1].fraccion).toBeCloseTo(radiusFracForMeters(1000), 9);
  });

  it("solo con RF: arcos ESTIMADOS (≈) limitados al sector de su familia", () => {
    const a = anillosDeAlcance([rf("ble", 4), rf("ble", 20)]);
    expect(a.map((x) => x.metros)).toEqual([3, 10, 30]);
    const sec = ANTENNA_SECTOR.ble;
    for (const x of a) {
      expect(x).toMatchObject({ real: false, familia: "ble", escala: "corto" });
      expect(x.desdeRad).toBeCloseTo(sec.center - sec.half, 9);
      expect(x.hastaRad).toBeCloseTo(sec.center + sec.half, 9);
      expect(x.etiqueta.startsWith("≈")).toBe(true);
    }
  });

  it("un círculo real de una escala no se duplica con arcos de la misma escala, pero la otra escala sí tiene los suyos", () => {
    const a = anillosDeAlcance([gps(250), rf("lora", 700), rf("ble", 4)]);
    expect(a.filter((x) => x.escala === "largo").every((x) => x.real)).toBe(true);
    expect(a.filter((x) => x.escala === "corto").every((x) => !x.real && x.familia === "ble")).toBe(true);
    expect(a.filter((x) => x.escala === "corto").length).toBeGreaterThan(0);
  });

  it("BLE e IP comparten escala pero cada una tiene su arco en su sector", () => {
    const a = anillosDeAlcance([rf("ble", 4), rf("ip", 4)]);
    expect(new Set(a.map((x) => x.familia))).toEqual(new Set(["ble", "ip"]));
  });
});

void AHORA;
