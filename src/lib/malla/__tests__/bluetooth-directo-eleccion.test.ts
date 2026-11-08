/**
 * BLE1108A — el Bluetooth directo dentro de la elección de enlace, el transporte universal, los medios
 * del chat (la pastilla «Bluetooth directo · N ms») y el multitrayecto.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVO_BLE_PREFERENTE_BYTES,
  elegirEnlaces,
  enlacesParaReparto,
  ordenEnRango,
  rangoEnlace,
  rangoParaEnvio,
  type EnlaceDisponible,
} from "@/lib/malla/eleccion-enlace";
import { crearEnviador, type DepsEnvio } from "@/lib/malla/transporte-universal";
import { candidatosDesdeEnlaces, etiquetaVia, medioDeEnlace, mediosParaEnviar } from "@/lib/mensajeria/medios/medios";
import { MAX_ARCHIVO_BLE } from "@/lib/malla/bluetooth-directo";
import { viaDeOrigen } from "@/lib/malla/sincronizacion-neuronas";

const base = { abierto: true, admite: { mensaje: true, archivo: true, flujo: false } };
const ble: EnlaceDisponible = {
  ...base,
  id: "ble:b1",
  tipo: "ble",
  etiqueta: "Maggaboard · Bluetooth",
  alcanza: { neuronDeviceId: "N-TAB", syncDeviceId: "S-TAB" },
  sinInternet: true,
  ruta: null,
  rttMs: 84,
  capacidadKbps: 160,
  maxBytes: MAX_ARCHIVO_BLE,
  consentido: true,
};
const nativo: EnlaceDisponible = { ...base, id: "nativo:192.168.1.20", tipo: "nativo", etiqueta: "Maggaboard · red local", alcanza: { neuronDeviceId: "N-TAB", syncDeviceId: "S-TAB" }, sinInternet: true, rttMs: 30 };
const localNativo: EnlaceDisponible = { ...base, id: "local:nativo-x", tipo: "local", etiqueta: "Maggaboard", alcanza: { neuronDeviceId: "N-TAB", syncDeviceId: "S-TAB" }, sinInternet: true, admite: { mensaje: true, archivo: true, flujo: true } };
const internet: EnlaceDisponible = { ...base, id: "cuenta:S-TAB", tipo: "cuenta", etiqueta: "Maggaboard (cuenta)", alcanza: { syncDeviceId: "S-TAB", neuronDeviceId: "N-TAB" }, sinInternet: false, ruta: "internet-directo", rttMs: 60 };
const rele: EnlaceDisponible = { ...base, id: "rele", tipo: "rele", etiqueta: "Relé", alcanza: { difusion: true }, sinInternet: false, admite: { mensaje: true, archivo: false, flujo: false } };
const destino = { neuronDeviceId: "N-TAB" };

describe("Bluetooth directo · elección de enlace (BLE1108A)", () => {
  it("rango 0, el último de su rango: sin router es el que queda, antes que internet y el relé", () => {
    expect(rangoEnlace(ble)).toBe(0);
    expect(ordenEnRango(ble)).toBeGreaterThan(ordenEnRango(nativo));
    expect(ordenEnRango(nativo)).toBeGreaterThan(ordenEnRango(localNativo));
    const todos = elegirEnlaces([rele, internet, ble, nativo, localNativo], destino, "mensaje");
    expect(todos.elegidos.map((e) => e.enlace.id)).toEqual(["local:nativo-x", "nativo:192.168.1.20", "ble:b1", "cuenta:S-TAB"]);
    // Sin red local (sin router): el Bluetooth va primero, por delante de internet.
    const sinRouter = elegirEnlaces([rele, internet, ble], destino, "mensaje");
    expect(sinRouter.elegidos[0].enlace.id).toBe("ble:b1");
    expect(sinRouter.elegidos[0].motivo).toMatch(/Bluetooth directo/);
  });

  it("archivos: los pequeños por Bluetooth; los grandes detrás de cualquier P2P más rápido; > 20 MB fuera", () => {
    expect(rangoParaEnvio(ble, "archivo", ARCHIVO_BLE_PREFERENTE_BYTES)).toBe(0);
    expect(rangoParaEnvio(ble, "archivo", ARCHIVO_BLE_PREFERENTE_BYTES + 1)).toBeGreaterThan(rangoEnlace({ ...internet, ruta: "reenviado-turn" }));
    expect(rangoParaEnvio(ble, "mensaje", 10 ** 9)).toBe(0);
    const pequeno = elegirEnlaces([internet, ble], destino, "archivo", 100_000);
    expect(pequeno.elegidos[0].enlace.id).toBe("ble:b1");
    const grande = elegirEnlaces([internet, ble], destino, "archivo", 5_000_000);
    expect(grande.elegidos.map((e) => e.enlace.id)).toEqual(["cuenta:S-TAB", "ble:b1"]);
    expect(grande.elegidos[1].motivo).toMatch(/archivo grande/);
    // Solo Bluetooth: va por él aunque sea grande (≤ 20 MB).
    expect(elegirEnlaces([ble], destino, "archivo", 5_000_000).elegidos[0].enlace.id).toBe("ble:b1");
    const enorme = elegirEnlaces([ble], destino, "archivo", MAX_ARCHIVO_BLE + 1);
    expect(enorme.elegidos).toEqual([]);
    expect(enorme.descartados[0].motivo).toMatch(/supera lo que lleva el Bluetooth directo/);
  });

  it("ni llamadas ni transmisiones en vivo por Bluetooth (y se dice por qué)", () => {
    const r = elegirEnlaces([ble], destino, "flujo");
    expect(r.elegidos).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/no lleva audio, vídeo ni transmisiones/);
  });

  it("el Bluetooth nunca reparte un archivo con otros enlaces (multitrayecto)", () => {
    expect(enlacesParaReparto(elegirEnlaces([ble, internet], destino, "archivo", 100_000)).map((e) => e.id)).toEqual(["ble:b1"]);
    expect(enlacesParaReparto(elegirEnlaces([ble, internet, localNativo], destino, "archivo", 100_000)).map((e) => e.id)).toEqual(["local:nativo-x", "cuenta:S-TAB"]);
    expect(enlacesParaReparto(elegirEnlaces([ble, internet], destino, "archivo", 5_000_000)).map((e) => e.id)).toEqual(["cuenta:S-TAB"]);
  });
});

describe("Bluetooth directo · transporte universal y medios del chat (BLE1108A)", () => {
  const deps = (p: Partial<DepsEnvio> = {}): DepsEnvio => ({
    listar: async () => [rele, ble],
    enviarP2P: () => false,
    enviarRele: async () => ({ ok: true, detalle: "relé" }),
    enviarLora: async () => ({ ok: false, detalle: "sin radio" }),
    esperarAcuse: async () => false,
    nuevoId: () => "id-1",
    origen: () => ({ s: "S-MAC" }),
    ...p,
  });

  it("un mensaje por Bluetooth queda CONFIRMADO con el acuse de la otra app", async () => {
    const enviarBle = vi.fn(async () => ({ ok: true, detalle: "entregado por Bluetooth directo: la app del otro aparato acusó recibo (84 ms)" }));
    const r = await crearEnviador(deps({ enviarBle }))(destino, "chat", { txt: "hola" });
    expect(r).toMatchObject({ ok: true, confirmado: true, enlace: { id: "ble:b1", tipo: "ble" } });
    expect(enviarBle).toHaveBeenCalledTimes(1);
  });

  it("si el Bluetooth no acusa, prueba el siguiente y lo dice", async () => {
    const r = await crearEnviador(deps({ enviarBle: async () => ({ ok: false, detalle: "Bluetooth directo: sin acuse por Bluetooth tras 4 intentos" }) }))(
      { ...destino, identidadRele: "fp" },
      "chat",
      1,
    );
    expect(r.enlace?.id).toBe("rele");
    expect(r.intentos[0]).toMatchObject({ enlaceId: "ble:b1", ok: false });
    const sinMotor = await crearEnviador(deps())({ ...destino, identidadRele: "fp" }, "chat", 1);
    expect(sinMotor.intentos[0].detalle).toMatch(/Bluetooth directo de la app nativa no está activo/);
  });

  it("medio «Bluetooth» y pastilla «Bluetooth directo · 84 ms ✓»; vía de sincronización «bluetooth»", () => {
    expect(medioDeEnlace({ tipo: "ble", ruta: null })).toBe("bluetooth");
    const c = candidatosDesdeEnlaces([ble], () => true);
    expect(c[0]).toMatchObject({ medio: "bluetooth", enlaceId: "ble:b1", rttMs: 84 });
    const plan = mediosParaEnviar({ modo: "auto", elegidos: [], siNinguno: "esperar" }, c, { tipo: "neurona" });
    expect(plan.pasos[0]).toMatchObject({ medio: "bluetooth", motivo: expect.stringMatching(/sin router/) });
    expect(
      etiquetaVia({
        medio: "bluetooth",
        direccion: "sale",
        enlace: ble.etiqueta,
        enlaceId: ble.id,
        servidor: null,
        ruta: null,
        latenciaMs: 84,
        latenciaFuente: "acuse",
        confirmado: true,
        confirmadoPor: "destino",
        motivo: "",
        en: 0,
      } as Parameters<typeof etiquetaVia>[0]),
    ).toBe("Bluetooth directo · 84 ms ✓");
    expect(viaDeOrigen({ tipo: "ble", enlaceId: "ble:b1" })).toBe("bluetooth");
  });
});
