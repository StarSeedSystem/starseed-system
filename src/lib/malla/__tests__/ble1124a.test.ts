/**
 * BLE1124A · d2 — no mandar por Bluetooth lo que ya tiene enlace directo por Wi-Fi.
 *   · Puro: `filtrarSaludosConWifiDirecto` quita solo los saludos de neuronas con Wi-Fi directo; si la
 *     consulta falla, saluda igual (un error nunca deja un enlace sin ligar).
 *   · En el motor: con `enlaceWifiDirecto` en true, `refrescar()` NO manda `nl.hola` por el enlace
 *     Bluetooth; con false, sí lo manda (el enlace se liga como siempre).
 *   NODE_ENV=test npx vitest run src/lib/malla/__tests__/ble1124a.test.ts
 */
import { describe, expect, it } from "vitest";
import { crearRedBle, filtrarSaludosConWifiDirecto, type DepsBle } from "@/lib/malla/bluetooth-directo-motor";
import type { EstadoBleNativo } from "@/lib/malla/bluetooth-directo";

function escenario(conWifi: boolean) {
  const reloj = { ahora: 1_800_000_000_000 };
  const enviados: string[] = [];
  const estado: EstadoBleNativo = {
    disponible: true,
    activo: true,
    radio: "encendida",
    motivo: "",
    plataforma: "macos",
    roles: ["central", "periferico"],
    l2cap: true,
    anunciando: true,
    con_cuenta: false,
    vecinos: [],
    enlaces: [{ id: "b1", rol: "central", vecino: null, neurona: "n-otro", rssi: -60, paquete: 182, rtt_ms: 40, kbps: 160, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 0 }],
    ultimo_seq: 0,
    max_cuerpo: 16 * 1024,
    limite_mensajes: 120,
    limite_ventana_ms: 10_000,
    paquete_max: 512,
  };
  const deps: DepsBle = {
    ahora: () => reloj.ahora,
    dormir: async () => undefined,
    estado: async () => estado,
    enviar: async (_enlace, json) => {
      enviados.push(json);
      return { ok: true, ms: 10 };
    },
    yo: async () => ({ neurona: "n-yo", nombre: "Yo" }),
    vinculos: () => [{ neurona: "n-otro", nombre: "Otro", huella: "fp-otro" }],
    firmar: async (c) => ({ v: 2, fp: "fp-yo", body: c }),
    verificar: async (s) => {
      const o = s as { fp?: string; body?: unknown };
      return { cuerpo: o.body, huella: o.fp, valido: true };
    },
    entregarTransporte: () => undefined,
    entregarArchivo: () => undefined,
    enlaceWifiDirecto: () => conWifi,
  };
  return { red: crearRedBle(deps), enviados };
}

describe("filtrarSaludosConWifiDirecto (puro)", () => {
  it("quita solo los saludos hacia neuronas con Wi-Fi directo y deja el resto", () => {
    const destinos = [
      { enlace: "b1", para: "n-wifi" },
      { enlace: "b2", para: "n-solo-ble" },
    ];
    expect(filtrarSaludosConWifiDirecto(destinos, (n) => n === "n-wifi")).toEqual([{ enlace: "b2", para: "n-solo-ble" }]);
  });

  it("si la consulta falla, saluda igual: un error nunca deja un enlace sin ligar", () => {
    const destinos = [{ enlace: "b1", para: "n-x" }];
    const r = filtrarSaludosConWifiDirecto(destinos, () => {
      throw new Error("sin datos de Wi-Fi");
    });
    expect(r).toEqual(destinos);
  });
});

/** Deja correr el saludo que el motor lanza al ver un enlace nuevo (no bloquea el refresco). */
async function asentar(): Promise<void> {
  await new Promise((listo) => setTimeout(listo, 0));
}

describe("el motor no saluda por Bluetooth lo que ya va por Wi-Fi directo", () => {
  it("con Wi-Fi directo activo no manda ningún nl.hola por el enlace", async () => {
    const { red, enviados } = escenario(true);
    await red.refrescar();
    await asentar();
    expect(enviados.filter((j) => j.includes('"nl.hola"'))).toHaveLength(0);
  });

  it("sin Wi-Fi directo sí saluda (el enlace se liga como siempre)", async () => {
    const { red, enviados } = escenario(false);
    await red.refrescar();
    await asentar();
    expect(enviados.some((j) => j.includes('"nl.hola"'))).toBe(true);
  });
});
