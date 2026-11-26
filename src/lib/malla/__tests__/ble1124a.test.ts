/**
 * BLE1124A — el Bluetooth no se ofrece para datos cuando esa neurona ya va por un enlace directo de la
 * Wi-Fi (la red local va antes y no gasta el aire compartido). El control del enlace Wi-Fi sigue teniendo
 * su camino por Bluetooth. Todo con las dependencias inyectadas: sin red, sin disco y sin `node:*`.
 */
import { describe, expect, it } from "vitest";
import { crearRedBle, filtrarBleConWifiDirecto, type DepsBle, type RedBle } from "@/lib/malla/bluetooth-directo-motor";
import { holaNativa } from "@/lib/malla/red-local-nativa";
import type { EstadoBleNativo } from "@/lib/malla/bluetooth-directo";

const AHORA = 1_800_000_000_000;

function estadoConEnlace(): EstadoBleNativo {
  return {
    disponible: true,
    activo: true,
    radio: "encendida",
    motivo: "",
    plataforma: "macos",
    roles: ["central", "periferico"],
    l2cap: false,
    anunciando: true,
    con_cuenta: true,
    vecinos: [],
    enlaces: [
      { id: "b1", rol: "central", vecino: null, neurona: "n-tab", rssi: -60, paquete: 182, rtt_ms: 80, kbps: 160, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 0 },
    ],
    ultimo_seq: 0,
    max_cuerpo: 16 * 1024,
    limite_mensajes: 120,
    limite_ventana_ms: 10_000,
    paquete_max: 512,
  };
}

function depsConLigadura(wifiDirecto?: (neurona: string) => boolean): DepsBle {
  return {
    ahora: () => AHORA,
    dormir: async () => undefined,
    estado: async () => estadoConEnlace(),
    enviar: async () => ({ ok: true, ms: 40 }),
    yo: async () => ({ neurona: "n-mac", nombre: "MaggaBook" }),
    vinculos: () => [{ neurona: "n-tab", nombre: "Maggaboard", huella: "fp-tab" }],
    firmar: async (cuerpo) => cuerpo,
    verificar: async (sobre) => ({ cuerpo: sobre, huella: "fp-tab", valido: true }),
    entregarTransporte: () => undefined,
    entregarArchivo: () => undefined,
    registroPropio: () => [],
    ...(wifiDirecto ? { wifiDirecto } : {}),
  };
}

/** El saludo firmado de la tableta por el enlace `b1` (lo que la liga al motor). */
async function ligar(red: RedBle): Promise<void> {
  red.aplicarEstado(estadoConEnlace());
  const h = holaNativa({ de: { neurona: "n-tab", nombre: "Maggaboard" }, para: "n-mac", limites: null, webrtc: false, resp: true, ts: AHORA });
  await red.recibir(JSON.stringify({ t: "nl.hola", s: h }), "b1");
}

describe("BLE1124A · Bluetooth y Wi-Fi directo", () => {
  it("no ofrece el enlace Bluetooth si la neurona ya va por Wi-Fi directo (el control sigue)", async () => {
    const conWifi = crearRedBle(depsConLigadura((n) => n === "n-tab"));
    await ligar(conWifi);
    expect(conWifi.enlaces()).toEqual([]);
    // El control del enlace Wi-Fi no se toca: sigue teniendo su camino por Bluetooth.
    expect(conWifi.enlaceHacia("n-tab")).toBe("b1");

    const sinWifi = crearRedBle(depsConLigadura());
    await ligar(sinWifi);
    expect(sinWifi.enlaces().map((e) => e.id)).toEqual(["ble:b1"]);
  });

  it("filtra solo las neuronas con Wi-Fi directo y conserva el resto", () => {
    const enlaces = [
      { id: "ble:b1", alcanza: { neuronDeviceId: "n-tab" } },
      { id: "ble:b2", alcanza: { neuronDeviceId: "n-otra" } },
      { id: "ble:b3", alcanza: {} },
    ];
    expect(filtrarBleConWifiDirecto(enlaces, (n) => n === "n-tab").map((e) => e.id)).toEqual(["ble:b2", "ble:b3"]);
  });

  it("si el gancho de Wi-Fi falla, conserva el enlace (un error no deja sin camino)", () => {
    const enlaces = [{ id: "ble:b1", alcanza: { neuronDeviceId: "n-tab" } }];
    const filtrados = filtrarBleConWifiDirecto(enlaces, () => {
      throw new Error("sin motor");
    });
    expect(filtrados.map((e) => e.id)).toEqual(["ble:b1"]);
  });
});
