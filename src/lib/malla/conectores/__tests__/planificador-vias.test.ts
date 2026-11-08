import { describe, expect, it } from "vitest";
import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import { fichaDeTipo } from "../fichas";
import { planificarVias, type ContextoVias, type DatoVia } from "../planificador-vias";
import type { ViaViva } from "../tipos";

const MB = 1024 * 1024;
function via(p: Partial<EnlaceDisponible> & Pick<EnlaceDisponible, "id" | "tipo">): ViaViva {
  const enlace: EnlaceDisponible = {
    etiqueta: p.id, alcanza: { syncDeviceId: "B" }, abierto: true, sinInternet: true,
    admite: { mensaje: true, archivo: true, flujo: false }, ...p,
  };
  return { conectorId: enlace.tipo, enlace, ficha: fichaDeTipo(enlace.tipo, enlace) };
}
const ctx: ContextoVias = { bateria: null, coste: "libre" };
const dato = (o: Partial<DatoVia> = {}): DatoVia => ({ tipo: "mensaje", bytes: 100, urgencia: "normal", privacidad: "interno", destino: { syncDeviceId: "B" }, ...o });

const local = via({ id: "local:1", tipo: "local", rttMs: 5, capacidadKbps: 20_000, admite: { mensaje: true, archivo: true, flujo: true } });
const nativo = via({ id: "nativo:1", tipo: "nativo", capacidadKbps: 4400, ruta: "misma-red-local" });
const ble = via({ id: "ble:1", tipo: "ble", capacidadKbps: 300, maxBytes: 20 * MB });
const lora = via({ id: "lora", tipo: "lora", alcanza: { difusion: true }, maxBytes: 200, admite: { mensaje: true, archivo: false, flujo: false } });
const rele = via({ id: "rele", tipo: "rele", alcanza: { difusion: true }, sinInternet: false, admite: { mensaje: true, archivo: false, flujo: false } });

describe("planificarVias", () => {
  it("ordena como elegirEnlaces y da el motivo de cada paso y rechazo", () => {
    const p = planificarVias(dato({ destino: { syncDeviceId: "B", identidadRele: "fp", nodoLora: 1 } }), [rele, lora, ble, local], ctx);
    expect(p.pasos.map((x) => x.enlaceId)).toEqual(["local:1", "ble:1", "rele", "lora"]);
    expect(p.pasos.every((x) => x.motivo.length > 5)).toBe(true);
    expect(p.escalon).toBe("completo");
    expect(p.proponer).toBe(false);
  });

  it("LoRa ≤ 200 B: un mensaje más largo solo sale como aviso", () => {
    const p = planificarVias(dato({ bytes: 900, destino: { nodoLora: 1 } }), [lora], ctx);
    expect(p.escalon).toBe("aviso");
    expect(p.pasos.map((x) => x.enlaceId)).toEqual(["lora"]);
    expect(p.resumen).toMatch(/200 B/);
  });

  it("sin ninguna vía el dato espera y se propone abrir un medio", () => {
    const p = planificarVias(dato({ destino: { syncDeviceId: "Z" } }), [local, ble], ctx);
    expect(p.escalon).toBe("ninguno");
    expect(p.pasos).toEqual([]);
    expect(p.rechazadas.find((r) => r.enlaceId === "ble:1")?.motivo).toBe("no llega a ese destino");
    expect(p.proponer).toBe(true);
  });

  it("escalera de vídeo: baja a voz por Bluetooth y a paramétrico por radio", () => {
    const d = dato({ tipo: "flujo-video", bytes: 0 });
    expect(planificarVias(d, [local], ctx).escalon).toBe("video");
    const porBle = planificarVias(d, [ble], ctx);
    expect(porBle.escalon).toBe("audio");
    expect(porBle.pasos[0].enlaceId).toBe("ble:1");
    expect(porBle.proponer).toBe(true);
    const porRadio = planificarVias({ ...d, destino: { nodoLora: 2 } }, [lora], ctx);
    expect(porRadio.escalon).toBe("parametrico");
    expect(porRadio.resumen).toMatch(/t0/);
  });

  it("archivo pequeño por Bluetooth: miniatura primero; grande: propone Wi‑Fi directo", () => {
    const p = planificarVias(dato({ tipo: "archivo", bytes: 5 * MB }), [ble], ctx);
    expect(p.miniaturaPrimero).toBe(true);
    expect(p.escalon).toBe("miniatura");
    expect(p.propuestas[0].medio).toBe("wifi-directo");
    expect(p.proponer).toBe(true);
  });

  it("archivo grande con dos enlaces del mismo aparato: reparto multitrayecto por capacidad", () => {
    const b = via({ id: "cuenta:B", tipo: "cuenta", capacidadKbps: 1000, ruta: "misma-red-local" });
    const p = planificarVias(dato({ tipo: "archivo", bytes: 8 * MB }), [local, b], ctx);
    expect(p.reparto).toBeDefined();
    const suma = Object.values(p.reparto!.porEnlace).reduce((a, c) => a + c, 0);
    expect(suma).toBe(p.reparto!.trozos);
    expect(p.reparto!.porEnlace["local:1"]).toBeGreaterThan(p.reparto!.porEnlace["cuenta:B"]);
    expect(planificarVias(dato({ tipo: "archivo", bytes: 100 }), [local, b], ctx).reparto).toBeUndefined();
  });

  it("el contexto rechaza con motivo: coste, cifrado exigido y prohibidos", () => {
    const p = planificarVias(dato(), [rele, local], { bateria: null, coste: "evitar-datos" });
    expect(p.rechazadas.find((r) => r.enlaceId === "rele")?.motivo).toMatch(/servidor/);
    const sc = via({ id: "nativo:2", tipo: "nativo", cifrado: "sin-cifrar" });
    const q = planificarVias(dato(), [sc, local], { ...ctx, ajustes: { exigirCifrado: true, prohibidos: ["local:1"] } });
    expect(q.pasos).toEqual([]);
    expect(q.rechazadas.map((r) => r.enlaceId).sort()).toEqual(["local:1", "nativo:2"]);
  });

  it("es pura: la misma entrada da el mismo plan y no toca las vías", () => {
    const vias = [local, nativo, ble];
    const antes = JSON.stringify(vias);
    const a = planificarVias(dato({ tipo: "archivo", bytes: 3 * MB }), vias, ctx);
    const b = planificarVias(dato({ tipo: "archivo", bytes: 3 * MB }), vias, ctx);
    expect(a).toEqual(b);
    expect(JSON.stringify(vias)).toBe(antes);
  });
});
