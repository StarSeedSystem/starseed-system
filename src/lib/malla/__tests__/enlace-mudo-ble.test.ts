/**
 * AUD1117 · F4 — un enlace Bluetooth que envía latidos y no recibe ni un byte se marca «mudo».
 *   · Puro: a los 60 s con envío y recepción en 0; un byte lo despierta.
 *   · En el motor: deja de contar como alcanzable (enlaces() y enlaceHacia), la línea de estado lo dice
 *     con «mudo=si» y nada se cierra por la fuerza.
 *   NODE_ENV=test npx vitest run src/lib/malla/__tests__/enlace-mudo-ble.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  ESPERA_MUDO_BLE_MS,
  MUDEZ_ENLACE_BLE_INICIAL,
  crearRedBle,
  detalleMudezBle,
  pasoMudezBle,
  type DepsBle,
  type RedBle,
} from "@/lib/malla/bluetooth-directo-motor";
import type { EstadoBleNativo } from "@/lib/malla/bluetooth-directo";

describe("pasoMudezBle (puro, reloj inyectado)", () => {
  it("no marca nada mientras no haya latidos enviados o hasta que pasen los 60 s", () => {
    let v = pasoMudezBle(MUDEZ_ENLACE_BLE_INICIAL, { ahora: 0, bytesEnviados: 0, bytesRecibidos: 0 });
    expect(v.cambio).toBe("nada");
    expect(v.mudez.mudo).toBe(false);
    v = pasoMudezBle(v.mudez, { ahora: 1_000, bytesEnviados: 1_200, bytesRecibidos: 0 });
    expect(v.mudez).toEqual({ desde: 1_000, mudo: false });
    v = pasoMudezBle(v.mudez, { ahora: 1_000 + ESPERA_MUDO_BLE_MS - 1, bytesEnviados: 2_400, bytesRecibidos: 0 });
    expect(v.mudez.mudo).toBe(false);
  });

  it("a los 60 s con envío y 0 B recibidos queda mudo una sola vez; un byte lo despierta", () => {
    const desde = 10_000;
    let v = pasoMudezBle({ desde, mudo: false }, { ahora: desde + ESPERA_MUDO_BLE_MS, bytesEnviados: 4_800, bytesRecibidos: 0 });
    expect(v).toMatchObject({ cambio: "mudo", mudez: { mudo: true } });
    expect(detalleMudezBle({ mudo: true, segundos: 60, bytesEnviados: 4_800, bytesRecibidos: 0 })).toContain("mudo=si");
    v = pasoMudezBle(v.mudez, { ahora: desde + 120_000, bytesEnviados: 9_600, bytesRecibidos: 0 });
    expect(v.cambio).toBe("nada");
    expect(v.mudez.mudo).toBe(true);
    v = pasoMudezBle(v.mudez, { ahora: desde + 121_000, bytesEnviados: 9_600, bytesRecibidos: 1 });
    expect(v).toEqual({ cambio: "vuelve", mudez: MUDEZ_ENLACE_BLE_INICIAL });
    expect(detalleMudezBle({ mudo: false, segundos: 0, bytesEnviados: 9_600, bytesRecibidos: 1 })).toContain("mudo=no");
  });
});

function motor(): { red: RedBle; reloj: { ahora: number }; estado: EstadoBleNativo } {
  const reloj = { ahora: 1_800_000_000_000 };
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
    enviar: async () => ({ ok: true, ms: 10 }),
    yo: async () => ({ neurona: "n-yo", nombre: "Yo" }),
    vinculos: () => [{ neurona: "n-otro", nombre: "Otro", huella: "fp-otro" }],
    firmar: async (c) => ({ v: 2, fp: "fp-yo", body: c }),
    verificar: async (s) => {
      const o = s as { fp?: string; body?: unknown };
      return { cuerpo: o.body, huella: o.fp, valido: true };
    },
    entregarTransporte: () => undefined,
    entregarArchivo: () => undefined,
  };
  return { red: crearRedBle(deps), reloj, estado };
}

async function ligar(red: RedBle, estado: EstadoBleNativo, ahora: number): Promise<void> {
  await red.refrescar();
  const hola = { t: "nl.hola", v: 1, de: { neurona: "n-otro", nombre: "Otro" }, para: "n-yo", webrtc: false, ts: ahora };
  await red.recibir(JSON.stringify({ t: "nl.hola", s: { v: 2, fp: "fp-otro", body: hola } }), "b1");
  estado.enlaces[0].bytes_enviados = 3_000;
  red.aplicarEstado(estado);
}

describe("el motor deja de contar el enlace mudo como alcanzable", () => {
  it("a los 60 s de latidos sin recepción: mudo=si, enlaceHacia null y sigue abierto; un byte lo despierta", async () => {
    const { red, reloj, estado } = motor();
    await ligar(red, estado, reloj.ahora);
    expect(red.enlaces()).toHaveLength(1);
    expect(red.enlaceHacia("n-otro")).toBe("b1");

    reloj.ahora += ESPERA_MUDO_BLE_MS;
    red.aplicarEstado(estado);
    expect(red.enlaces()).toEqual([]);
    expect(red.enlaceHacia("n-otro")).toBeNull();
    expect(red.registro().lista().some((e) => e.tipo === "mudo" && e.detalle.includes("mudo=si"))).toBe(true);
    // Nada se cierra por la fuerza: la ligadura sigue y el enlace sigue pudiendo enviar.
    expect(red.instantanea().ligaduras).toHaveLength(1);
    expect((await red.enviarTexto("b1", '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":"sigue"}')).ok).toBe(true);

    estado.enlaces[0].bytes_recibidos = 1;
    red.aplicarEstado(estado);
    expect(red.enlaces()).toHaveLength(1);
    expect(red.enlaceHacia("n-otro")).toBe("b1");
    expect(red.registro().lista().some((e) => e.tipo === "mudo" && e.detalle.includes("mudo=no"))).toBe(true);
  });

  it("si el enlace se cierra estando mudo, la línea de estado lo dice con mudo=si", async () => {
    const { red, reloj, estado } = motor();
    await ligar(red, estado, reloj.ahora);
    reloj.ahora += ESPERA_MUDO_BLE_MS;
    red.aplicarEstado(estado);
    red.aplicarEstado({ ...estado, enlaces: [] });
    const cierre = red.registro().lista().find((e) => e.tipo === "perdido");
    expect(cierre?.detalle).toContain("mudo=si");
  });
});
