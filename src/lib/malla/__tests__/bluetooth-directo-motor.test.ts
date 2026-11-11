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
import { crearSesionesCifradas } from "@/lib/malla/sesion-cifrada";
import { T_OFERTA_WIFI, leerEstadoBle, senalesBluetoothDirecto, textoCanalBle, textoPausaCanalBle, type ControlEnlaceWifi, type EstadoBleNativo } from "@/lib/malla/bluetooth-directo";
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
  /** (BLE1109A) El estado nativo que ve la app, para cambiarle el carril. */
  estado: EstadoBleNativo;
  /** (BLE1109B) Enlaces que la app marcó como ligados ante la app nativa, y las líneas que anexó al archivo de registro. */
  ligados: string[];
  anexadas: string[];
}

const prueba = (t: string) => createHash("sha256").update(`${CLAVE_FARO}|${t}`).digest("hex").slice(0, 32);

function dosApps(opts: { mtu?: number; conClave?: boolean; fallar?: () => boolean; firmaAjena?: boolean; cifra?: boolean | "mac"; exigirMac?: boolean; lentoMs?: number } = {}) {
  const mtu = opts.mtu ?? 185;
  const reloj = { ahora: 1_800_000_000_000 };
  const aire = { tramas: 0, paquetes: 0, maxPaquete: 0, maxTrama: 0, rechazadas: 0, jsons: [] as string[] };
  const lados: Record<string, Lado> = {};
  const otro: Record<string, string> = { mac: "tab", tab: "mac" };
  const app = (nombre: string, neurona: string, enlace: string, rol: string, reconoce: string | null): Lado => {
    const estado: EstadoBleNativo = {
      disponible: true,
      activo: true,
      radio: "encendida",
      motivo: "",
      plataforma: nombre === "mac" ? "macos" : "android",
      roles: ["central", "periferico"],
      l2cap: true,
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
    const lado = { enlace, neurona, huella: `fp-${nombre}`, transporte: [], control: [], estado, ligados: [], anexadas: [] } as unknown as Lado;
    const deps: DepsBle = {
      ahora: () => reloj.ahora,
      dormir: async (ms) => {
        // (CIF1108A) La espera larga (el acuerdo de sesión) deja correr al otro lado antes de adelantar el reloj.
        if (ms >= 1000) for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
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
        // (BLE1108C) Una radio lenta con los mensajes de datos (los trozos de archivo; los de control pasan al ritmo normal).
        if (opts.lentoMs && json.startsWith('{"t":"archivo.')) await new Promise((r) => setTimeout(r, opts.lentoMs));
        aire.tramas++;
        aire.jsons.push(json);
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
      marcarLigado: (e) => void lado.ligados.push(e),
      anexarRegistro: (l) => void lado.anexadas.push(...l),
      // (CIF1108A) Con `cifra`, las dos apps (o solo la Mac) llevan sesiones cifradas.
      ...(opts.cifra === true || (opts.cifra === "mac" && nombre === "mac")
        ? { sesiones: crearSesionesCifradas({ ahora: () => reloj.ahora, firmar: async (c) => ({ v: 2, fp: lado.huella, body: c }) }) }
        : {}),
      ...(opts.exigirMac && nombre === "mac" ? { exigirCifrado: () => true } : {}),
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

  it("(CIF1108A) con cifrado: el mensaje viaja cifrado, el saludo en claro, y el enlace se marca «cifrado»", async () => {
    const { lados, aire } = dosApps({ cifra: true });
    await ligar(lados);
    expect(lados.mac.red.cifradoDe?.("n-tab")).toBe("pendiente");
    const r = await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":"secreto por el aire"}');
    expect(r.ok).toBe(true);
    await esperarHasta(() => lados.tab.transporte.length === 1);
    expect(lados.tab.transporte[0].texto).toBe('{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":"secreto por el aire"}');
    expect(aire.jsons.some((j) => j.includes("secreto por el aire"))).toBe(false);
    expect(aire.jsons.some((j) => j.startsWith('{"t":"nl.cif"'))).toBe(true);
    expect(lados.mac.red.cifradoDe?.("n-tab")).toBe("cifrado");
    expect(lados.tab.red.enlaces()[0].cifrado).toBe("cifrado");
  });

  it("(CIF1108A) un archivo de verdad cifrado con MTU 23: trozo más pequeño, tramas ≤ 16 KiB, SHA-256 igual, sin datos en claro", async () => {
    const { lados, aire } = dosApps({ mtu: 23, cifra: true });
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
    const trozo = canal.tamanoTrozo?.() ?? 0;
    expect(trozo).toBeGreaterThan(5 * 1024);
    expect(trozo).toBeLessThan(10 * 1024);
    const datos = new Uint8Array(100_000);
    randomFillSync(datos);
    const r = await lados.mac.motor.enviarArchivo(canal, new Blob([datos]), "foto.bin", { tipo: "dispositivo", id: "n-tab" }, { tipoMime: "application/octet-stream" });
    expect(r.ok).toBe(true);
    await esperarHasta(() => ["completada", "error"].includes(lados.mac.motor?.estadoDe(r.id)?.fase ?? ""), 20_000);
    expect(lados.mac.motor.estadoDe(r.id)?.fase).toBe("completada");
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(sha(new Uint8Array(await recibidos.get(r.id)!.arrayBuffer()))).toBe(sha(datos));
    expect(aire.rechazadas).toBe(0);
    expect(aire.maxTrama).toBeLessThanOrEqual(MAX_CUERPO);
    expect(aire.jsons.some((j) => j.includes("datosB64"))).toBe(false);
    // eslint-disable-next-line no-console
    console.log(`[CIF1108A] BLE: trozo ${(trozo / 1024).toFixed(1)} KiB con cifrado (10 KiB sin él); trama máxima ${aire.maxTrama} B de ${MAX_CUERPO}`);
  }, 30_000);

  it("(CIF1108A) con una app anterior (sin cifrado) todo sigue en claro y se marca «sin cifrar»; con «exigir», se bloquea", async () => {
    const claro = dosApps({ cifra: "mac" });
    await ligar(claro.lados);
    expect(claro.lados.mac.red.cifradoDe?.("n-tab")).toBe("sin-cifrar");
    expect((await claro.lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","b":"en claro"}')).ok).toBe(true);
    await esperarHasta(() => claro.lados.tab.transporte.length === 1);
    expect(claro.aire.jsons.some((j) => j.includes("en claro"))).toBe(true);
    const bloq = dosApps({ cifra: "mac", exigirMac: true });
    await ligar(bloq.lados);
    const r = await bloq.lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","b":"no sale"}');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Exigir cifrado/);
  });

  it("(CIF1108A) una trama cifrada alterada cierra el enlace y lo que llega en claro de quien cifra se descarta", async () => {
    const { lados } = dosApps({ cifra: true });
    await ligar(lados);
    await lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","b":"uno"}');
    await esperarHasta(() => lados.tab.transporte.length === 1);
    await lados.tab.red.recibir('{"t":"tu.msg","b":"colado"}', "b7");
    expect(lados.tab.transporte).toHaveLength(1);
    const cif = lados.tab.red.instantanea();
    expect(cif.ultimoRechazo).toContain("sin cifrar");
    const falsa = JSON.stringify({ t: "nl.cif", s: "AAAAAAAAAAA=", n: 0, c: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    await lados.tab.red.recibir(falsa, "b7"); // sesión desconocida: se vuelve a acordar, no se entrega
    expect(lados.tab.transporte).toHaveLength(1);
  });

  it("(BLE1108C) con la cola de datos llena y la radio lenta, el canal de archivos no espera «listo» para siempre y un control sale por delante", async () => {
    const { lados, reloj, aire } = dosApps({ lentoMs: 250 });
    await ligar(lados);
    const grande = (i: number) => JSON.stringify({ t: "archivo.chunk", id: "t1", index: i, datosB64: "x".repeat(9_000) });
    const trozosEnElAire = () => aire.jsons.filter((j) => j.startsWith('{"t":"archivo.chunk"')).length;
    const envios = [1, 2, 3, 4, 5, 6].map((i) => lados.mac.red.enviarTexto("b1", grande(i)));
    await esperarHasta(() => lados.mac.red.colaBytes("b1") > 32 * 1024);
    const canal = lados.mac.red.canalArchivos("b1");
    expect(canal.enlaceArriba?.()).toBe(true);
    const antes = reloj.ahora;
    // El enlace está arriba: la contrapresión espera como mucho ~500 ms (reloj del motor) y sigue.
    expect(await canal.esperarListo?.()).toBe(true);
    expect(reloj.ahora - antes).toBeGreaterThanOrEqual(500);
    expect(reloj.ahora - antes).toBeLessThan(5_000);
    expect(lados.mac.red.registro().exportar()).toContain("listo-tarde");
    // Un control del enlace sale sin pasar por esa contrapresión: llega antes de que acabe la cola de datos.
    const s = "sesion-wifi-0002";
    const r = await lados.mac.red.enviarControlEnlace("n-tab", { t: T_OFERTA_WIFI, s, modo: "hotspot", ssid: "DIRECT-StarSeed", caduca: reloj.ahora + 60_000 });
    expect(r.ok).toBe(true);
    await esperarHasta(() => lados.tab.control.length === 1);
    expect(trozosEnElAire()).toBeLessThan(6);
    expect((await Promise.all(envios)).every((x) => x.ok)).toBe(true);
    expect(trozosEnElAire()).toBe(6);
  }, 20_000);
  it("(LLA1108H) el vídeo ligero tiene cola propia: sale DESPUÉS de la voz y, si se llena, se tira lo más viejo del vídeo (nunca la voz)", async () => {
    const { lados, aire } = dosApps();
    await ligar(lados);
    const mac = lados.mac.red;
    const frag = (q: number) => JSON.stringify({ t: "voz.v", s: "s1", q, d: "A".repeat(1500) });
    const voz = (q: number) => JSON.stringify({ t: "voz.p", s: "s1", q, d: "B".repeat(300) });
    const antes = aire.jsons.length;
    // Un segundo de vídeo se acumula (más de 24 KiB) y, EN EL MISMO INSTANTE, llega la voz.
    const r: string[] = [];
    for (let q = 0; q < 24; q++) r.push(mac.enviarVideo("b1", frag(q)));
    expect(r.slice(0, 10).every((x) => x === "ok")).toBe(true);
    expect(r).toContain("descartado"); // la cola de vídeo tiene tope
    expect(mac.colaVideoBytes("b1")).toBeLessThanOrEqual(24 * 1024);
    expect(mac.enviarVoz("b1", voz(0))).toBe("ok");
    expect(mac.enviarVoz("b1", voz(1))).toBe("ok");
    expect(mac.colaVozBytes("b1")).toBeGreaterThan(0);
    await esperarHasta(() => mac.colaVideoBytes("b1") === 0 && mac.colaVozBytes("b1") === 0);
    const enAire = aire.jsons.slice(antes).filter((j) => j.includes("voz."));
    const iVoz = enAire.findIndex((j) => j.includes("voz.p"));
    const iVid = enAire.findIndex((j) => j.includes("voz.v"));
    expect(iVoz).toBeGreaterThanOrEqual(0);
    expect(iVid).toBeGreaterThanOrEqual(0);
    expect(iVoz).toBeLessThan(iVid); // el audio va primero
    const junto = enAire.join("");
    // La voz llegó entera.
    expect((junto.match(/voz\.p/g) ?? []).length).toBe(2);
    // Del vídeo se tiraron los más viejos: el fragmento 0 no salió y el último sí.
    const qs = Array.from(junto.matchAll(/\\?"q\\?":(\d+),\\?"d\\?":\\?"A/g), (m) => Number(m[1]));
    expect(qs.length).toBeGreaterThan(0);
    expect(qs).not.toContain(0);
    expect(qs).toContain(23);
    expect(lados.tab.red.colaVideoBytes("b7")).toBe(0);
  });
  // (BLE1109A) El carril rápido L2CAP: el enlace es el mismo; solo cambian la capacidad y el registro.
  function conCarril(l: Lado, carril: "rapido" | "gatt", kbps: number | null): void {
    const e = l.estado.enlaces[0];
    const nuevo = { ...l.estado, enlaces: [{ ...e, carril, canal_rapido: carril === "rapido" ? "abierto" : "disponible", psm: 133, kbps, kbps_rapido: carril === "rapido" ? kbps : null, kbps_gatt: carril === "gatt" ? kbps : null }] } as EstadoBleNativo;
    l.estado = nuevo;
    l.red.aplicarEstado(nuevo);
  }

  it("(BLE1109A) el canal rápido sube la capacidad del MISMO enlace; si se cae, vuelve a GATT sin soltar ni la ligadura ni la sesión", async () => {
    const { lados } = dosApps();
    await ligar(lados);
    const mac = lados.mac.red;
    expect(mac.enlaces()[0]).toMatchObject({ id: "ble:b1", capacidadKbps: 160, abierto: true });
    conCarril(lados.mac, "rapido", 720);
    expect(mac.enlaces()[0]).toMatchObject({ id: "ble:b1", capacidadKbps: 720, abierto: true, alcanza: { neuronDeviceId: "n-tab" } });
    expect(mac.enlaceHacia("n-tab")).toBe("b1");
    conCarril(lados.mac, "gatt", 160);
    expect(mac.enlaces()[0]).toMatchObject({ id: "ble:b1", capacidadKbps: 160, abierto: true });
    expect(mac.enlaceHacia("n-tab")).toBe("b1");
    const r = await mac.enviarTexto("b1", '{"t":"tu.msg","v":1,"id":"m9","c":"chat","b":"sigue vivo"}');
    expect(r.ok).toBe(true);
    await esperarHasta(() => lados.tab.transporte.some((t) => t.texto.includes("sigue vivo")));
    const tipos = mac.registro().lista().filter((e) => e.tipo === "canal-rapido").map((e) => e.detalle);
    expect(tipos).toHaveLength(2);
    expect(tipos[0]).toMatch(/L2CAP abierto \(psm 133/);
    expect(tipos[1]).toMatch(/sigue por GATT/);
    expect(mac.registro().lista().some((e) => e.tipo === "perdido" || e.tipo === "cerrado")).toBe(false);
  });

  it("(BLE1109A) con el canal rápido la prioridad se mantiene: control > voz > vídeo > datos", async () => {
    const { lados, aire } = dosApps();
    await ligar(lados);
    conCarril(lados.mac, "rapido", 720);
    const mac = lados.mac.red;
    const antes = aire.jsons.length;
    const dato = JSON.stringify({ t: "tu.msg", v: 1, id: "d1", c: "chat", b: "D".repeat(400) });
    const vid = JSON.stringify({ t: "voz.v", s: "s1", q: 0, d: "A".repeat(900) });
    const voz = JSON.stringify({ t: "voz.p", s: "s1", q: 0, d: "B".repeat(200) });
    const pDato = mac.enviarTexto("b1", dato);
    mac.enviarVideo("b1", vid);
    mac.enviarVoz("b1", voz);
    await pDato;
    await esperarHasta(() => mac.colaVideoBytes("b1") === 0 && mac.colaVozBytes("b1") === 0);
    const orden = aire.jsons.slice(antes);
    const iVoz = orden.findIndex((j) => j.includes("voz.p"));
    const iVid = orden.findIndex((j) => j.includes("voz.v"));
    expect(iVoz).toBeGreaterThanOrEqual(0);
    expect(iVid).toBeGreaterThanOrEqual(0);
    expect(iVoz).toBeLessThan(iVid);
  });

  it("(BLE1109A) leerEstadoBle sanea el carril y el texto dice «canal rápido · N kb/s» solo con el canal abierto", () => {
    const base = { id: "b1", rol: "central", paquete: 512, rtt_ms: 30, kbps: 640.4, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 5 };
    const bruto = (x: Record<string, unknown>) => ({ disponible: true, activo: true, radio: "encendida", enlaces: [{ ...base, ...x }] });
    const rapido = leerEstadoBle(bruto({ carril: "rapido", canal_rapido: "abierto", psm: 133, kbps_rapido: 640.4, kbps_gatt: "x" }))?.enlaces[0];
    expect(rapido).toMatchObject({ carril: "rapido", canal_rapido: "abierto", psm: 133, kbps_gatt: null });
    expect(textoCanalBle(rapido)).toBe("Bluetooth directo · canal rápido · 640 kb/s");
    const raro = leerEstadoBle(bruto({ carril: "otro", canal_rapido: "x" }))?.enlaces[0];
    expect(raro).toMatchObject({ carril: "gatt", canal_rapido: "sin-psm", psm: null });
    expect(textoCanalBle(raro)).toBe("Bluetooth directo · 640 kb/s");
    expect(textoCanalBle({ carril: "rapido", kbps: null })).toBe("Bluetooth directo · canal rápido · sin medir");
    expect(textoCanalBle(null)).toBe("Bluetooth directo");
  });

  it("(BLE1111P) el canal rápido en pausa dice cuánto falta y que se vuelve a probar, no que no existe", () => {
    const base = { id: "b1", rol: "central", paquete: 512, rtt_ms: 30, kbps: 40, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 5 };
    const bruto = (x: Record<string, unknown>) => ({ disponible: true, activo: true, radio: "encendida", enlaces: [{ ...base, ...x }], vecinos: [] });
    const pausa = leerEstadoBle(bruto({ carril: "gatt", canal_rapido: "desactivado", canal_rapido_pausa_ms: 24_200 }))?.enlaces[0];
    expect(pausa).toMatchObject({ canal_rapido: "desactivado", canal_rapido_pausa_ms: 24_200 });
    expect(textoPausaCanalBle(pausa)).toBe("canal rápido en pausa · se vuelve a probar en 25 s");
    expect(textoPausaCanalBle({ canal_rapido: "desactivado", canal_rapido_pausa_ms: 120_000 })).toBe("canal rápido en pausa · se vuelve a probar en 2 min");
    expect(textoPausaCanalBle({ canal_rapido: "desactivado", canal_rapido_pausa_ms: 95_000 })).toBe("canal rápido en pausa · se vuelve a probar en 1 min 35 s");
    expect(textoPausaCanalBle({ canal_rapido: "desactivado", canal_rapido_pausa_ms: 599_000 })).toBe("canal rápido en pausa · se vuelve a probar en 10 min");
    // Una app nativa anterior no manda el plazo: se dice igual que vuelve a probar, sin inventar cifra.
    const vieja = leerEstadoBle(bruto({ carril: "gatt", canal_rapido: "desactivado" }))?.enlaces[0];
    expect(vieja?.canal_rapido_pausa_ms).toBeNull();
    expect(textoPausaCanalBle(vieja)).toBe("canal rápido en pausa · se vuelve a probar solo");
    expect(textoPausaCanalBle({ canal_rapido: "disponible", canal_rapido_pausa_ms: 5_000 })).toBeNull();
    expect(textoPausaCanalBle(null)).toBeNull();
    // Y llega a los detalles del enlace de la neurona (radar).
    const est = leerEstadoBle({ ...bruto({ carril: "gatt", canal_rapido: "desactivado", canal_rapido_pausa_ms: 30_000 }), vecinos: [{ id: "v0a1b2c3d", rssi: -60, uuid: "x", propia: true, tipo: "mac", servidor: true, visto_hace_ms: 0, enlace: "b1" }] });
    const metr = senalesBluetoothDirecto(est, 0)[0]?.metrics ?? [];
    expect(metr.find((m) => m.label === "Enlace")?.value).toContain("canal rápido en pausa · se vuelve a probar en 30 s");
  });
});

describe("Bluetooth directo · BLE1109B", () => {
  it("al ligarse avisa a la app nativa (solo desde ahí puede abrirse el canal rápido)", async () => {
    const { lados } = dosApps();
    await ligar(lados);
    await esperarHasta(() => lados.mac.ligados.length > 0 && lados.tab.ligados.length > 0);
    expect(lados.mac.ligados).toContain("b1");
    expect(lados.tab.ligados).toContain("b7");
  });

  it("espeja el registro del otro lado como «(nombre) línea» y no lo reenvía en bucle", async () => {
    const { lados, aire } = dosApps();
    await ligar(lados);
    await esperarHasta(() => lados.tab.anexadas.some((x) => x.startsWith("(MaggaBook) ")));
    await esperarHasta(() => lados.mac.anexadas.some((x) => x.startsWith("(Maggaboard) ")));
    const espejos = aire.jsons.filter((j) => j.startsWith('{"t":"nl.reg"'));
    expect(espejos.length).toBe(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(aire.jsons.filter((j) => j.startsWith('{"t":"nl.reg"')).length).toBe(2);
    for (const j of espejos) expect((JSON.parse(j) as { l: string[] }).l.length).toBeLessThanOrEqual(50);
  });

  it("BLE1110A: el espejo sigue cada ~25 s con SOLO lo nuevo (la regla «nada con voz en cola» está en tocaEspejoContinuo)", async () => {
    const { lados, aire, reloj } = dosApps();
    await ligar(lados);
    const espejos = () => aire.jsons.filter((j) => j.startsWith('{"t":"nl.reg"'));
    await esperarHasta(() => espejos().length >= 2);
    const n0 = espejos().length;
    // Antes de los 25 s, aunque haya líneas nuevas, no se manda.
    lados.mac.red.registro().anotar("reintento", "n-tab", "LINEA-NUEVA-UNO");
    await lados.mac.red.refrescar();
    await new Promise((r) => setTimeout(r, 30));
    expect(espejos().length).toBe(n0);
    // Pasados los 25 s, llega lo nuevo y solo lo nuevo.
    reloj.ahora += 26_000;
    await lados.mac.red.refrescar();
    await esperarHasta(() => espejos().length === n0 + 1);
    const l = (JSON.parse(espejos()[n0]) as { l: string[] }).l;
    expect(l.some((x) => x.includes("LINEA-NUEVA-UNO"))).toBe(true);
    expect(l.some((x) => x.includes("ligado"))).toBe(false);
    // Lo ya espejado no se repite: si el refresco anotó algo propio, va solo eso.
    reloj.ahora += 26_000;
    await lados.mac.red.refrescar();
    await new Promise((r) => setTimeout(r, 30));
    for (const j of espejos().slice(n0 + 1)) expect((JSON.parse(j) as { l: string[] }).l.some((x) => x.includes("LINEA-NUEVA-UNO"))).toBe(false);
    const n1 = espejos().length;
    expect(n1).toBeGreaterThanOrEqual(n0 + 1);
  });

  it("un espejo de quien no está ligado se ignora", async () => {
    const { lados } = dosApps({ conClave: false });
    await lados.tab.red.refrescar();
    await lados.tab.red.recibir('{"t":"nl.reg","l":["x"]}', "b7");
    expect(lados.tab.anexadas.filter((x) => x.startsWith("("))).toEqual([]);
  });

  it("prioridad de colas: el control sale antes que los datos y el espejo va con los datos", async () => {
    const { lados, aire } = dosApps();
    await ligar(lados);
    await esperarHasta(() => aire.jsons.some((j) => j.startsWith('{"t":"nl.reg"')));
    const antes = aire.jsons.length;
    const datos = lados.mac.red.enviarTexto("b1", '{"t":"archivo.trozo","id":"a","i":0}');
    const control = lados.mac.red.enviarTexto("b1", '{"t":"tu.msg","v":1,"id":"c1","c":"chat","b":"urgente"}');
    await Promise.all([datos, control]);
    const nuevos = aire.jsons.slice(antes);
    expect(nuevos.findIndex((j) => j.includes('"id":"c1"'))).toBeLessThan(nuevos.findIndex((j) => j.startsWith('{"t":"archivo.trozo"')));
  });
});
