import { describe, expect, it } from "vitest";
import { construirVivo } from "../aparatos";
import { anonimizarAjenas } from "../cuentas";
import { reubicar } from "../escalas";
import { construirModeloMapa } from "../modelo";
import type { FiltrosMapa } from "../mapa-3d";
import { AHORA, aparato, contexto, fila, medioPresencia, senal } from "../__fixtures__/vivo";

const sin: FiltrosMapa = { ocultas: [], cuenta: "todas", ocultarDesconectados: false };
const ble4 = senal("ble:1", { antenna: "ble", placement: { angleRad: 0, radiusFrac: 0.16, accuracyFrac: 0.1, mode: "rf", distanceM: 4, accuracyM: 4, detail: "BLE. El rumbo es desconocido." } });
const gpsLora = senal("lora:7", { antenna: "lora", placement: { angleRad: -1, radiusFrac: 0.4, accuracyFrac: 0.02, mode: "gps", distanceM: 250, accuracyM: 35, detail: "gps" } });
const ajena = senal("beacon:x", { antenna: "relay", label: "Casa de María", starseed: { via: "relay-beacon", sourceId: "s", name: "Casa de María", ownAccount: false, capabilities: [] } });

function modelo(filtros = sin, extra: ReturnType<typeof aparato>[] = []) {
  const base = [ble4, gpsLora, ajena, aparato("a"), aparato("b"), ...extra];
  const vivo = construirVivo(base, contexto({
    filas: [fila("a", { enlace: { estado: "conectado", latenciaMs: 20 } }), fila("b", { online: false })],
    presencia: { conectado: true, medios: [medioPresencia("a", "m1")] },
  }));
  const senales = anonimizarAjenas([...base, ...vivo.extras]).map(reubicar);
  return construirModeloMapa({ senales, vivo, filtros, altura: "calidad", ahora: AHORA });
}

describe("modelo único del mapa", () => {
  it("junta marcadores, medios, sectores y anillos honestos del mismo conjunto de señales", () => {
    const m = modelo();
    expect(m.marcadores.map((x) => x.id).sort()).toEqual(["beacon:x", "ble:1", "lora:7", "neuron:a", "neuron:b"]);
    expect(m.medios.map((x) => x.id)).toEqual(["medio:m1"]);
    expect(m.anillos.some((a) => a.real && a.escala === "largo")).toBe(true);
    expect(m.anillos.some((a) => !a.real && a.familia === "ble")).toBe(true);
    expect(m.sectores).toHaveLength(6);
    expect(m.resumen.total).toBe(5);
    expect(m.vivoVisible).toMatchObject({ aparatos: 2, conCanal: 1, medios: 1 });
  });

  it("la señal ajena sale anónima en el modelo", () => {
    expect(JSON.stringify(modelo().marcadores.map((x) => x.senal.label))).not.toContain("María");
  });

  it("filtrar quita marcadores, anillos y medios que ya no tienen a qué colgarse, pero los recuentos totales no cambian", () => {
    const m = modelo({ ...sin, ocultas: ["lora", "ble"], cuenta: "propia" });
    expect(m.marcadores.map((x) => x.id).sort()).toEqual(["neuron:a", "neuron:b"]);
    expect(m.anillos).toEqual([]); // sin LoRa ni BLE visibles no hay ninguna distancia que acotar
    expect(m.resumen.total).toBe(5);
    expect(m.resumenVisible.total).toBe(2);
    const sinA = modelo({ ...sin, ocultarDesconectados: true });
    expect(sinA.marcadores.some((x) => x.id === "neuron:b")).toBe(false);
    const sinAparatoA = modelo({ ...sin, ocultas: ["account"] });
    expect(sinAparatoA.medios).toEqual([]);
  });

  it("es determinista", () => {
    expect(modelo()).toEqual(modelo());
  });
});
