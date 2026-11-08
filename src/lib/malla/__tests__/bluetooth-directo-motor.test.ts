/**
 * BLE1108A — el motor del Bluetooth directo con DOS apps en memoria y un puente Bluetooth de mentira que
 * hace lo que hace `ble.rs`: valida la trama (objeto JSON ≤ 16 KiB), la parte en paquetes del MTU
 * negociado (cabecera de 5 B), la rearma al otro lado y la entrega a su web; el «ok» es el acuse.
 * Saludo firmado y ligadura, mensajes, suplantación, caída, cierre del enlace, control del enlace Wi-Fi
 * (con su secreto cifrado) y un archivo de verdad por el motor de archivos con un MTU mínimo (23).
 */
import { createHash, randomFillSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cifrarSecretoEnlace,
  crearRedBle,
  descifrarSecretoEnlace,
  type DepsBle,
  type RedBle,
} from "@/lib/malla/bluetooth-directo-motor";
import { T_OFERTA_WIFI, type ControlEnlaceWifi, type EstadoBleNativo } from "@/lib/malla/bluetooth-directo";
import { crearAlmacenEnMemoria, crearMotorArchivos, type MotorArchivos } from "@/lib/network/archivos-malla";

const MAX_CUERPO = 16 * 1024;
const CLAVE_FARO = "ab".repeat(32);

/** Lo que hace la trama de `ble_trama.rs`: «SSB1» | v | t | largo | cuerpo, en paquetes de [tipo|id|idx]. */
function porElAire(json: string, mtu: number, cuenta: { paquetes: number; maxPaquete: number }): string {
  const cuerpo = new TextEncoder().encode(json);
  const trama = new Uint8Array(10 + cuerpo.length);
  trama.set([0x53, 0x53, 0x42, 0x31, 1, 1]);
  new DataView(trama.buffer).setUint32(6, cuerpo.length);
  trama.set(cuerpo, 10);
  const util = Math.min(mtu - 3, 512) - 5;
  const partes: Uint8Array[] = [];
  for (let i = 0; i < trama.length; i += util) {
    const p = new Uint8Array(5 + Math.min(util, trama.length - i));
    p.set([1, 0, 7, (partes.length >> 8) & 0xff, partes.length & 0xff]);
    p.set(trama.subarray(i, i + util), 5);
    partes.push(p);
    cuenta.maxPaquete = Math.max(cuenta.maxPaquete, p.length);
  }
  cuenta.paquetes += partes.length;
  const junto = new Uint8Array(partes.reduce((s, p) => s + p.length - 5, 0));
  let o = 0;
  for (const p of partes) {
    junto.set(p.subarray(5), o);
    o += p.length - 5;
  }
  return new TextDecoder().decode(junto.subarray(10));
}

interface Lado {
  red: RedBle;
  enlace: string;
  neurona: string;
  huella: string;
  transporte: Array<{ texto: string; enlaceId: string }>;
  control: Array<{ c: ControlEnlaceWifi; neurona: string }>;
  motor?: MotorArchivos;
}

const prueba = (t: string) => createHash("sha256").update(`${CLAVE_FARO}|${t}`).digest("hex").slice(0, 32);

function dosApps(opts: { mtu?: number; conClave?: boolean; fallar?: () => boolean; firmaAjena?: boolean } = {}) {
  const mtu = opts.mtu ?? 185;
  const reloj = { ahora: 1_800_000_000_000 };
  const aire = { tramas: 0, paquetes: 0, maxPaquete: 0, maxTrama: 0, rechazadas: 0 };
  const lados: Record<string, Lado> = {};
  const otro: Record<string, string> = { mac: "tab", tab: "mac" };
  const app = (nombre: string, neurona: string, enlace: string, rol: string, reconoce: string | null): Lado => {
    const estado: EstadoBleNativo = {
      disponible: true,
      activo: true,
      radio: "encendida",
      motivo: "",
      plataforma: nombre === "mac" ? "macos" : "android",
      anunciando: true,
      con_cuenta: true,
      vecinos: [],
      enlaces: [{ id: enlace, rol, vecino: null, neurona: reconoce, rssi: -60, paquete: mtu - 3, rtt_ms: 80, kbps: 160, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 0 }],
      ultimo_seq: 0,
      max_cuerpo: MAX_CUERPO,
      limite_mensajes: 120,
      limite_ventana_ms: 10_000,
      paquete_max: 512,
    };
    const lado = { enlace, neurona, huella: `fp-${nombre}`, transporte: [], control: [] } as unknown as Lado;
    const deps: DepsBle = {
      ahora: () => reloj.ahora,
      dormir: async (ms) => {
        reloj.ahora += ms;
        await new Promise((r) => setTimeout(r, 0));
      },
      estado: async () => estado,
      enviar: async (_enlace, json) => {
        const t = json.trim();
        if (new TextEncoder().encode(json).length > MAX_CUERPO || !t.startsWith("{") || !t.endsWith("}")) {
          aire.rechazadas++;
          return { ok: false, motivo: "Bluetooth directo: no se envía (trama no válida)" };
        }
        if (opts.fallar?.()) return { ok: false, motivo: "sin acuse por Bluetooth tras 4 intentos" };
        aire.tramas++;
        aire.maxTrama = Math.max(aire.maxTrama, new TextEncoder().encode(json).length);
        const llega = porElAire(json, mtu, aire);
        const destino = lados[otro[nombre]];
        setTimeout(() => void destino.red.recibir(llega, destino.enlace), 0);
        return { ok: true, ms: 40 };
      },
      yo: async () => ({ neurona, nombre: nombre === "mac" ? "MaggaBook" : "Maggaboard" }),
      vinculos: () => [],
      neuronasCuenta: () => ["n-mac", "n-tab"],
      firmar: async (cuerpo) => ({ v: 2, fp: opts.firmaAjena && nombre === "mac" ? "fp-intruso" : lado.huella, body: cuerpo }),
      verificar: async (s) => {
        const o = s as { fp?: string; body?: unknown };
        return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
      },
      entregarTransporte: (texto, origen) => lado.transporte.push({ texto, enlaceId: origen.enlaceId }),
      entregarArchivo: (canal, texto, etiquetaOrigen, quien) =>
        lado.motor?.manejarMensaje(canal, texto, {
          mismaCuenta: false,
          etiquetaOrigen,
          verificarPermiso: () => true,
          via: "Bluetooth directo (app nativa, sin router)",
          ...(quien ? { verificacion: { tipo: "firma" as const, huella: quien.huella, texto: "Saludo firmado" } } : {}),
        }),
      pruebaCuenta: async (t) => (opts.conClave === false ? null : prueba(t)),
      huellaPropia: async () => lado.huella,
    };
    lado.red = crearRedBle(deps);
    lado.red.alControlEnlace((c, o) => lado.control.push({ c, neurona: o.neurona }));
    return lado;
  };
  // La Mac conectó (central) y su anuncio le dijo que es la tableta; la tableta no sabe quién es (periférico).
  lados.mac = app("mac", "n-mac", "b1", "central", "n-tab");
  lados.tab = app("tab", "n-tab", "b7", "periferico", null);
  return { lados, aire, reloj };
}

async function esperarHasta(fn: () => boolean, ms = 5_000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("esperarHasta: se agotó el tiempo");
    await new Promise((r) => setTimeout(r, 2));
  }
}

async function ligar(l: Record<string, Lado>): Promise<void> {
  await l.tab.red.refrescar();
  await l.mac.red.refrescar();
  await esperarHasta(() => l.mac.red.enlaces().length > 0 && l.tab.red.enlaces().length > 0);
}

describe("Bluetooth directo · motor (BLE1108A)", () => {
  it("se ligan con el saludo firmado y la prueba de cuenta, y los mensajes llegan con acuse", async () => {
    const { lados, aire } = dosApps();
    expect(lados.mac.red.enlaces()).toEqual([]);
    await ligar(lados);
    const [e] = lados.mac.red.enlaces();
    expect(e).toMatchObject({ id: "ble:b1", tipo: "ble", sinInternet: true, rttMs: 80, capacidadKbps: 160, alcanza: { neuronDeviceId: "n-tab" } });
    expect(lados.tab.red.enlaces()[0]).toMatchObject({ id: "ble:b7", alcanza: { neuronDeviceId: "n-mac" } });
    expect(lados.mac.red.enlaceHacia("n-tab")).toBe("b1");
    const r = await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":"hola sin router"}');
    expect(r).toEqual({ ok: true, ms: 40 });
    await esperarHasta(() => lados.tab.transporte.length === 1);
    expect(lados.tab.transporte[0]).toEqual({ texto: '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":"hola sin router"}', enlaceId: "ble:b7" });
    expect(aire.rechazadas).toBe(0);
    expect(aire.maxPaquete).toBeLessThanOrEqual(185 - 3);
  });

  it("sin prueba de cuenta ni vínculo no hay ligadura: nada de lo que llega se atiende", async () => {
    const { lados } = dosApps({ conClave: false });
    await lados.tab.red.refrescar();
    await lados.mac.red.refrescar();
    await new Promise((r) => setTimeout(r, 20));
    expect(lados.mac.red.enlaces()).toEqual([]);
    await lados.tab.red.recibir('{"t":"tu.msg","v":1,"id":"x","c":"chat","b":"cuela"}', "b7");
    await lados.tab.red.recibir('{"t":"archivo.oferta","id":"x"}', "b7");
    expect(lados.tab.transporte).toEqual([]);
  });

  it("la trama que no cabe en 16 KiB no sale (y se dice); tras 6 fallos el enlace se da por caído", async () => {
    let fallar = false;
    const { lados } = dosApps({ fallar: () => fallar });
    await ligar(lados);
    const grande = await lados.mac.red.enviarTexto("b1", JSON.stringify({ t: "tu.msg", b: "x".repeat(20_000) }));
    expect(grande.ok).toBe(false);
    expect(grande.motivo).toMatch(/no cabe/);
    fallar = true;
    const r = await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","b":1}');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no acusa recibo por Bluetooth/);
    expect(lados.mac.red.enlaces()[0].abierto).toBe(false);
    expect((await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","b":2}')).motivo).toMatch(/no acusa recibo/);
  });

  it("si el enlace se cierra, lo pendiente falla con el motivo y la ligadura se va", async () => {
    const { lados } = dosApps();
    await ligar(lados);
    lados.mac.red.aplicarEstado({ disponible: true, activo: true, radio: "encendida", motivo: "", vecinos: [], enlaces: [] });
    expect(lados.mac.red.enlaces()).toEqual([]);
    expect((await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg"}')).motivo).toMatch(/ya no está abierto/);
  });

  it("control del enlace Wi-Fi: firmado, solo de la neurona ligada, y el secreto solo con la clave de la cuenta", async () => {
    const { lados, reloj } = dosApps();
    await ligar(lados);
    const s = "sesion-wifi-0001";
    const secreto = await cifrarSecretoEnlace(CLAVE_FARO, { de: "n-mac", para: "n-tab", s }, "contraseña-del-punto");
    expect(secreto).not.toBeNull();
    const r = await lados.mac.red.enviarControlEnlace("n-tab", {
      t: T_OFERTA_WIFI,
      s,
      modo: "hotspot",
      ssid: "DIRECT-StarSeed",
      caduca: reloj.ahora + 5 * 60_000,
      ...(secreto ? { secreto } : {}),
    });
    expect(r.ok).toBe(true);
    await esperarHasta(() => lados.tab.control.length === 1);
    const { c, neurona } = lados.tab.control[0];
    expect(neurona).toBe("n-mac");
    expect(c).toMatchObject({ t: T_OFERTA_WIFI, de: "n-mac", para: "n-tab", ssid: "DIRECT-StarSeed" });
    if (c.t !== T_OFERTA_WIFI || !c.secreto) throw new Error("sin secreto");
    expect(await descifrarSecretoEnlace(CLAVE_FARO, c, c.secreto)).toBe("contraseña-del-punto");
    expect(await descifrarSecretoEnlace("cd".repeat(32), c, c.secreto)).toBeNull();
    expect(await descifrarSecretoEnlace(CLAVE_FARO, { ...c, para: "n-otra" }, c.secreto)).toBeNull();
    // Sin ligadura con esa neurona no sale.
    expect((await lados.mac.red.enviarControlEnlace("n-nadie", { t: T_OFERTA_WIFI, s, modo: "hotspot", ssid: "x", caduca: reloj.ahora + 1000 })).ok).toBe(false);
  });

  it("un control firmado por otra identidad en el mismo enlace se ignora", async () => {
    const { lados, reloj } = dosApps();
    await ligar(lados);
    // Un tercero que comparta el enlace no puede colar una oferta: la firma no es la de la ligadura.
    await lados.tab.red.recibir(
      JSON.stringify({ t: T_OFERTA_WIFI, s: { v: 2, fp: "fp-intruso", body: { t: T_OFERTA_WIFI, v: 1, s: "sesion-mala-01", de: "n-mac", para: "n-tab", modo: "hotspot", ssid: "TRAMPA", caduca: reloj.ahora + 1000, ts: reloj.ahora } } }),
      "b7",
    );
    expect(lados.tab.control).toEqual([]);
  });

  it("un archivo de verdad por el motor de archivos con MTU 23: trozos de 10 KiB, tramas ≤ 16 KiB, SHA-256 igual", async () => {
    const { lados, aire } = dosApps({ mtu: 23 });
    const recibidos = new Map<string, Blob>();
    lados.mac.motor = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const motorTab: MotorArchivos = crearMotorArchivos({
      almacen: crearAlmacenEnMemoria(),
      onOfertaEntrante: (o) => motorTab.aceptarOferta(o.id),
      onCompletado: (e, blob) => recibidos.set(e.id, blob),
    });
    lados.tab.motor = motorTab;
    await ligar(lados);
    const canal = lados.mac.red.canalArchivos("b1");
    expect(canal.tamanoTrozo?.()).toBe(10 * 1024);
    const datos = new Uint8Array(150_000);
    randomFillSync(datos);
    const r = await lados.mac.motor.enviarArchivo(canal, new Blob([datos]), "foto.bin", { tipo: "dispositivo", id: "n-tab" }, { tipoMime: "application/octet-stream" });
    expect(r.ok).toBe(true);
    await esperarHasta(() => ["completada", "error"].includes(lados.mac.motor?.estadoDe(r.id)?.fase ?? ""), 20_000);
    expect(lados.mac.motor.estadoDe(r.id)?.fase).toBe("completada");
    const blob = recibidos.get(r.id);
    expect(blob).toBeDefined();
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(sha(new Uint8Array(await blob!.arrayBuffer()))).toBe(sha(datos));
    expect(aire.rechazadas).toBe(0);
    expect(aire.maxTrama).toBeLessThanOrEqual(MAX_CUERPO);
    expect(aire.maxPaquete).toBeLessThanOrEqual(20);
    expect(aire.paquetes).toBeGreaterThan(150_000 / 15);
  }, 30_000);
});
