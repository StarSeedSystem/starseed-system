/**
 * INT1108C — el Bluetooth directo (BLE1108A) negocia el enlace Wi-Fi directo (WFD1108A).
 *
 * Dos apps en memoria SIN router ni internet: el motor REAL del Bluetooth (`crearRedBle`, con un aire de
 * mentira que entrega cada trama al otro lado) se liga con el saludo firmado y la prueba de cuenta (sin
 * vínculo); encima, el motor REAL del enlace Wi-Fi (`crearMotorWifi`) con la vía de este puente. Los cuatro
 * mensajes de control viajan como `tu.msg` del canal `enlace-wifi` por `ble:<id>` y la confianza sale de la
 * ligadura Bluetooth. Después, los elegidores de ruta prefieren la red directa y vuelven al Bluetooth.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { crearRedBle, type DepsBle, type RedBle } from "@/lib/malla/bluetooth-directo-motor";
import type { EstadoBleNativo } from "@/lib/malla/bluetooth-directo";
import {
  __fijarMotorWifiParaPruebas,
  crearMotorWifi,
  enlaceActualDe,
  ligadurasDeVias,
  type EstadoNativoWifi,
  type MotorWifi,
  type NativoWifi,
  type ViaControlWifi,
} from "@/lib/malla/enlace-wifi-motor";
import { remitenteDeConfianza, type CapacidadesWifi, type SobreCifradoWifi } from "@/lib/malla/enlace-wifi-directo";
import { fijarEnlacesWifi } from "@/lib/malla/enlace-wifi-orquestacion";
import { elegirEnlaces, type EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import {
  avisarEnvioPesado,
  avisoWifi,
  enlaceDePaso,
  primeraVez,
  viaControlBle,
  VENTANA_AVISO_MS,
  type BleParaPuente,
} from "@/lib/malla/puente-ble-wifi";

const sutil = (globalThis.crypto?.subtle ?? webcrypto.subtle) as SubtleCrypto;
const ANDROID: CapacidadesWifi = { plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: false, wifi: true, lanas: ["punto-acceso-optin"] };
const MAC: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["punto-acceso-optin"] };
const CLAVE_AP = "clave-del-ap-int1108c";
const MB = 1024 * 1024;

afterEach(() => {
  fijarEnlacesWifi([]);
  __fijarMotorWifiParaPruebas(null);
});

/* ── Cifrado por destinatario (ECDH → HKDF → AES-GCM, como recipient-crypto) ── */

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function claveAes(priv: CryptoKey, pub: JsonWebKey): Promise<CryptoKey> {
  const otra = await sutil.importKey("jwk", pub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await sutil.deriveBits({ name: "ECDH", public: otra }, priv, 256);
  const hk = await sutil.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return sutil.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(1), info: new TextEncoder().encode("int1108c") }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function identidadCifrado(): Promise<{ pub: JsonWebKey; priv: CryptoKey }> {
  const kp = (await sutil.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const j = await sutil.exportKey("jwk", kp.publicKey);
  return { pub: { kty: "EC", crv: "P-256", x: j.x, y: j.y }, priv: kp.privateKey };
}

async function cifrarPara(epub: JsonWebKey, obj: unknown): Promise<SobreCifradoWifi> {
  const eph = (await sutil.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const k = await claveAes(eph.privateKey, epub);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await sutil.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify(obj))));
  const e = await sutil.exportKey("jwk", eph.publicKey);
  return { v: 3, iv: b64(iv), ct: b64(ct), epk: { kty: "EC", crv: "P-256", x: e.x, y: e.y } };
}

async function descifrar(priv: CryptoKey, s: SobreCifradoWifi): Promise<unknown> {
  try {
    const p = await sutil.decrypt({ name: "AES-GCM", iv: deB64(s.iv) }, await claveAes(priv, s.epk), deB64(s.ct));
    return JSON.parse(new TextDecoder().decode(p));
  } catch {
    return null;
  }
}

/* ── Parte nativa del Wi-Fi (Android levanta la red, el Mac se une) ── */

const nativoInicial = (): EstadoNativoWifi => ({ sesion: null, fase: "inactivo", rol: null, metodo: null, ssid: null, ip_propia: null, ip_ap: null, banda: null, mbps: null, codigo: null, mensaje: "", red_anterior: null, t: 0 });

function nativoAndroid(): NativoWifi {
  let n = nativoInicial();
  return {
    capacidades: async () => ANDROID,
    pedirPermiso: async () => ANDROID,
    abrirAp: async (sesion, metodo) => {
      n = { ...n, sesion, fase: "red-lista", rol: "ap", metodo, ssid: "StarSeed-c108", ip_ap: "192.168.49.1", ip_propia: "192.168.49.1", banda: "5" };
      return { ok: true };
    },
    credenciales: async (sesion) => (n.sesion === sesion && n.fase === "red-lista" ? { ssid: "StarSeed-c108", clave: CLAVE_AP, banda: "5", ip: "192.168.49.1" } : null),
    unirse: async () => ({ ok: false, codigo: "sin-soporte", motivo: "no" }),
    estado: async () => n,
    cerrar: async () => {
      n = { ...n, fase: "cerrado" };
    },
    comprobar: async () => ({ alcanzable: false, ipLocal: null }),
  };
}

function nativoMac(): NativoWifi & { unidoA: () => string | null } {
  let n = { ...nativoInicial(), red_anterior: "Casa" };
  let unidoA: string | null = null;
  return {
    unidoA: () => unidoA,
    capacidades: async () => MAC,
    pedirPermiso: async () => MAC,
    abrirAp: async () => ({ ok: false, codigo: "sin-soporte", motivo: "macOS no levanta redes" }),
    credenciales: async () => null,
    unirse: async (sesion, metodo, cred) => {
      unidoA = `${cred.ssid}|${cred.clave}`;
      n = { ...n, sesion, fase: "unida", rol: "cliente", metodo, ssid: cred.ssid, ip_propia: "192.168.49.23", ip_ap: cred.ipAp, mbps: 433 };
      return { ok: true };
    },
    estado: async () => n,
    cerrar: async () => {
      n = { ...n, fase: "cerrado" };
    },
    comprobar: async () => ({ alcanzable: false, ipLocal: null }),
  };
}

/* ── Dos apps: Bluetooth real + enlace Wi-Fi real, unidos por el puente ── */

interface App {
  neurona: string;
  huella: string;
  red: RedBle;
  via: ViaControlWifi;
  wifi: MotorWifi;
  porTransporte: string[];
}

function mundo(ajustes: { mac: "automatico" | "preguntar" | "nunca"; tab: "automatico" | "preguntar" | "nunca" }, opts: { conClave?: boolean } = {}) {
  const reloj = { ble: 1_800_000_000_000, wifi: 1_000_000 };
  const aire: Array<{ de: string; texto: string }> = [];
  const apps: Record<string, App> = {};
  const otro: Record<string, string> = { mac: "tab", tab: "mac" };
  const enlaceDe: Record<string, string> = { mac: "b1", tab: "b7" };

  const montar = async (nombre: "mac" | "tab"): Promise<App> => {
    const neurona = `n-${nombre}`;
    const huella = `fp-${nombre}`;
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
      enlaces: [{ id: enlaceDe[nombre], rol: nombre === "mac" ? "central" : "periferico", vecino: null, neurona: nombre === "mac" ? "n-tab" : null, rssi: -58, paquete: 182, rtt_ms: 70, kbps: 180, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 0 }],
      ultimo_seq: 0,
      max_cuerpo: 16 * 1024,
      limite_mensajes: 120,
      limite_ventana_ms: 10_000,
      paquete_max: 512,
    };
    const app = { neurona, huella, porTransporte: [] } as unknown as App;
    const depsBle: DepsBle = {
      ahora: () => reloj.ble,
      dormir: async (ms) => {
        reloj.ble += ms;
        await new Promise((r) => setTimeout(r, 0));
      },
      estado: async () => estado,
      enviar: async (_enlace, json) => {
        if (new TextEncoder().encode(json).length > 16 * 1024) return { ok: false, motivo: "trama no válida" };
        aire.push({ de: nombre, texto: json });
        const destino = apps[otro[nombre]];
        setTimeout(() => void destino.red.recibir(json, enlaceDe[otro[nombre]]), 0);
        return { ok: true, ms: 35 };
      },
      yo: async () => ({ neurona, nombre: nombre === "mac" ? "MaggaBook" : "Maggaboard" }),
      vinculos: () => [], // sin vínculo: solo la prueba de cuenta (misma clave de faro)
      neuronasCuenta: () => ["n-mac", "n-tab"],
      firmar: async (cuerpo) => ({ v: 2, fp: huella, body: cuerpo }),
      verificar: async (s) => {
        const o = s as { fp?: string; body?: unknown };
        return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
      },
      // Lo que hace el transporte universal con un `tu.msg` que llega por `ble:<id>`: al oyente de su canal.
      entregarTransporte: (texto, origen) => {
        const m = JSON.parse(texto) as { t: string; c: string; b: unknown };
        if (m.t === "tu.msg" && m.c === "enlace-wifi") void app.wifi.recibir(m.b, { tipo: "ble", enlaceId: origen.enlaceId });
      },
      entregarArchivo: () => undefined,
      // HMAC de juguete con la misma «clave de faro» en las dos apps (misma cuenta); sin clave, null.
      pruebaCuenta: async (t) => (opts.conClave === false ? null : createHash("sha256").update(`${"ab".repeat(32)}|${t}`).digest("hex").slice(0, 32)),
      huellaPropia: async () => huella,
    };
    app.red = crearRedBle(depsBle);
    // La vía del puente; `enviarPorEnlace` hace lo que `enviarMensaje({ enlaceId })` del transporte universal.
    app.via = viaControlBle({
      ble: () => app.red,
      enviarPorEnlace: async (enlaceId, _neurona, cable) => {
        const b = enlaceId.replace(/^ble:/, "");
        const r = await app.red.enviarTexto(b, JSON.stringify({ t: "tu.msg", v: 1, id: `m${aire.length}`, c: "enlace-wifi", b: cable }));
        return { ok: r.ok };
      },
    });
    const cif = await identidadCifrado();
    app.wifi = crearMotorWifi(
      {
        ahora: () => reloj.wifi,
        nuevaSesion: () => `wfd-${nombre}-${reloj.wifi}`,
        yo: async () => ({ neurona, nombre: nombre === "mac" ? "MaggaBook" : "Maggaboard" }),
        epubPropia: async () => cif.pub,
        ajuste: () => ajustes[nombre],
        puntoAcceso: () => true, // WFA1109A: estos tests cubren el camino por punto de acceso, que es opt-in
        firmar: async (cuerpo) => ({ v: 2, b: cuerpo, f: huella }),
        verificar: async (s) => {
          const o = s as { b?: unknown; f?: string };
          return { cuerpo: o.b, huella: o.f, valido: true };
        },
        cifrarPara,
        descifrar: (s) => descifrar(cif.priv, s),
        // Lo de `depsReales`: sin vínculos ni canal local; SOLO la ligadura del Bluetooth da la confianza.
        confiable: (de, h, origen) => remitenteDeConfianza({ de, huella: h, vinculos: [], ligaduras: ligadurasDeVias([app.via]), origen }),
        enviarTransporte: async (_para, cable) => {
          app.porTransporte.push(JSON.stringify(cable));
          return { ok: false, motivo: "sin router ni internet" };
        },
        nativo: nombre === "mac" ? nativoMac() : nativoAndroid(),
      },
      () => [app.via],
    );
    apps[nombre] = app;
    return app;
  };

  const correrHasta = async (cond: () => boolean, max = 3000): Promise<void> => {
    for (let i = 0; i < max && !cond(); i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (i % 5 === 0) for (const a of Object.values(apps)) await a.wifi.tic();
    }
    if (!cond()) throw new Error("correrHasta: no se cumplió a tiempo");
  };

  return { montar, apps, aire, reloj, correrHasta };
}

async function dosApps(ajustes: Parameters<typeof mundo>[0], opts?: Parameters<typeof mundo>[1]) {
  const w = mundo(ajustes, opts);
  const mac = await w.montar("mac");
  const tab = await w.montar("tab");
  await tab.red.refrescar();
  await mac.red.refrescar();
  if (opts?.conClave !== false) await w.correrHasta(() => !!mac.red.enlaceHacia("n-tab") && !!tab.red.enlaceHacia("n-mac"));
  return { ...w, mac, tab };
}

/** Lo que viajó por el aire del Bluetooth del canal de control del Wi-Fi (tipo de cada mensaje). */
function controlPorElAire(aire: Array<{ de: string; texto: string }>): string[] {
  return aire
    .map((x) => JSON.parse(x.texto) as { t: string; c?: string; b?: { t?: string } })
    .filter((x) => x.t === "tu.msg" && x.c === "enlace-wifi")
    .map((x) => String(x.b?.t));
}

describe("puente Bluetooth directo ↔ enlace Wi-Fi directo (INT1108C)", () => {
  it("sin router: el Bluetooth liga solo, propone el Wi-Fi ante lo pesado («Preguntar») y lo negocia entero por `ble:<id>`", async () => {
    const { mac, tab, aire, correrHasta } = await dosApps({ mac: "preguntar", tab: "preguntar" });
    // Mensajes por Bluetooth desde el primer momento: el enlace está ligado sin vínculo (prueba de cuenta).
    expect(mac.red.enlaces()[0]).toMatchObject({ id: "ble:b1", tipo: "ble", alcanza: { neuronDeviceId: "n-tab" } });
    expect(mac.via.alcanza("n-tab")).toBe(true);
    expect(mac.via.kbps?.("n-tab")).toBe(180);

    // Un archivo de 200 MB sin camino (no cabe por Bluetooth): se PROPONE (con el aviso de la radio del Mac).
    const d = await mac.wifi.necesitaAncho({ neurona: "n-tab", nombre: "Maggaboard", clase: "archivo", bytes: 200 * MB, enlaceActual: enlaceActualDe(null), cerca: false });
    expect(d.accion).toBe("proponer");
    const propuesta = avisoWifi(mac.wifi.instantanea());
    expect(propuesta).toMatchObject({ tipo: "propuesta", si: "Abrir", no: "Ahora no" });
    expect(propuesta?.titulo).toContain("Maggaboard");
    expect(propuesta?.detalle).toContain("una sola radio");

    // Un toque: la oferta sale por Bluetooth y la tableta (en «Preguntar») lo pregunta, fiándose de la ligadura.
    await mac.wifi.resolverPropuesta(true);
    await correrHasta(() => !!tab.wifi.instantanea().pregunta);
    const pregunta = avisoWifi(tab.wifi.instantanea());
    expect(pregunta).toMatchObject({ tipo: "pregunta", si: "Aceptar", no: "Ahora no" });
    expect(pregunta?.titulo).toContain("MaggaBook");

    // Otro toque en la tableta: levanta la red, la contraseña viaja cifrada y el Mac se une.
    await tab.wifi.decidirPersona(true);
    await correrHasta(() => mac.wifi.instantanea().estado.fase === "activo" && tab.wifi.instantanea().estado.fase === "activo");
    expect(mac.wifi.instantanea().estado).toMatchObject({ otro: "n-tab", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23" });
    expect(tab.wifi.instantanea().estado).toMatchObject({ otro: "n-mac", ipOtro: "192.168.49.23" });

    // Todo el control fue por el Bluetooth (nada por el transporte de respaldo) y nunca en claro.
    expect(controlPorElAire(aire)).toEqual(expect.arrayContaining(["enlace.wifi.oferta", "enlace.wifi.respuesta", "enlace.wifi.listo"]));
    expect(mac.porTransporte).toEqual([]);
    expect(tab.porTransporte).toEqual([]);
    for (const x of aire) expect(x.texto).not.toContain(CLAVE_AP);
    expect(avisoWifi(mac.wifi.instantanea())).toBeNull();
    expect(avisoWifi(tab.wifi.instantanea())).toBeNull();
  });

  it("«Automático» lo abre solo; «Nunca» ni lo propone ni lo acepta", async () => {
    const auto = await dosApps({ mac: "automatico", tab: "automatico" });
    const d = await auto.mac.wifi.necesitaAncho({ neurona: "n-tab", clase: "llamada", enlaceActual: enlaceActualDe(null), cerca: false });
    expect(d.accion).toBe("abrir");
    await auto.correrHasta(() => auto.mac.wifi.instantanea().estado.fase === "activo");
    expect(avisoWifi(auto.tab.wifi.instantanea())).toBeNull();

    const nunca = await dosApps({ mac: "automatico", tab: "nunca" });
    const n = await nunca.tab.wifi.necesitaAncho({ neurona: "n-mac", clase: "archivo", bytes: 200 * MB, enlaceActual: enlaceActualDe(null), cerca: false });
    expect(n.accion).toBe("nada");
    expect(avisoWifi(nunca.tab.wifi.instantanea())).toBeNull();
    // Una oferta que llega a «Nunca» se rechaza (por Bluetooth) y el que ofreció vuelve al enlace de antes.
    await nunca.mac.wifi.abrir("n-tab", "manual");
    await nunca.correrHasta(() => nunca.mac.wifi.instantanea().estado.fase === "fallido");
    expect(nunca.tab.wifi.instantanea().pregunta).toBeNull();
    expect(nunca.mac.wifi.instantanea().ultimoRespaldo).toContain("Se sigue por el enlace de antes");
  });

  it("sin ligadura Bluetooth (otra cuenta, sin vínculo) no hay vía, ni proximidad, ni confianza", async () => {
    const { mac, tab, aire } = await dosApps({ mac: "automatico", tab: "automatico" }, { conClave: false });
    expect(mac.via.alcanza("n-tab")).toBe(false);
    expect(await mac.via.enviar("n-tab", '{"t":"enlace.wifi.cierre","s":{}}')).toBe(false);
    expect(mac.via.ligaduras?.()).toEqual([]);
    const d = await mac.wifi.necesitaAncho({ neurona: "n-tab", clase: "archivo", bytes: 200 * MB, enlaceActual: enlaceActualDe(null), cerca: false });
    expect(d.accion).toBe("nada");
    expect(d.motivo).toMatch(/al lado/);
    expect(controlPorElAire(aire)).toEqual([]);
    expect(tab.wifi.instantanea().pregunta).toBeNull();
  });

  it("ya activo: los elegidores de ruta prefieren la red directa para lo pesado y vuelven al Bluetooth al cerrarse", async () => {
    const { mac } = await dosApps({ mac: "automatico", tab: "automatico" });
    const [ble] = mac.red.enlaces();
    const tcp: EnlaceDisponible = { id: "nativo:192.168.49.1", tipo: "nativo", etiqueta: "Maggaboard · red local", alcanza: { neuronDeviceId: "n-tab" }, abierto: true, sinInternet: true, admite: { mensaje: true, archivo: true, flujo: false } };
    const rtc: EnlaceDisponible = { id: "local:nativo-c1", tipo: "local", etiqueta: "Maggaboard · directo", alcanza: { neuronDeviceId: "n-tab" }, abierto: true, sinInternet: true, ruta: "misma-red-local", admite: { mensaje: true, archivo: true, flujo: true } };
    fijarEnlacesWifi([{ neurona: "n-tab", nombre: "Maggaboard", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23", ssid: "StarSeed-c108", metodo: "hotspot-local", soyAp: false, mbps: 433, desde: 1 }]);
    const destino = { neuronDeviceId: "n-tab" };
    const archivo = elegirEnlaces([ble, tcp], destino, "archivo", 200 * MB);
    expect(archivo.elegidos.map((e) => e.enlace.id)).toEqual(["nativo:192.168.49.1"]);
    expect(archivo.descartados.map((e) => e.id)).toEqual(["ble:b1"]); // 200 MB no caben por Bluetooth
    expect(enlaceActualDe(tcp)).toEqual({ tipo: "wifi-directo", kbps: null });
    const mediano = elegirEnlaces([ble, tcp], destino, "archivo", 5 * MB);
    expect(mediano.elegidos.map((e) => e.enlace.id)).toEqual(["nativo:192.168.49.1", "ble:b1"]);
    const flujo = elegirEnlaces([ble, tcp, rtc], destino, "flujo");
    expect(flujo.elegidos.map((e) => e.enlace.id)).toEqual(["local:nativo-c1"]);
    const mensaje = elegirEnlaces([ble, tcp], destino, "mensaje", 200);
    expect(mensaje.elegidos.map((e) => e.enlace.id)).toEqual(["nativo:192.168.49.1", "ble:b1"]);
    // Con el Wi-Fi activo, otro envío pesado no vuelve a abrir nada.
    expect(
      (await mac.wifi.necesitaAncho({ neurona: "n-tab", clase: "archivo", bytes: 200 * MB, enlaceActual: enlaceActualDe(tcp), cerca: true })).accion,
    ).toBe("nada");
    // Cerrado el enlace directo: los mensajes vuelven solos al Bluetooth.
    fijarEnlacesWifi([]);
    expect(elegirEnlaces([ble], destino, "mensaje", 200).elegidos.map((e) => e.enlace.id)).toEqual(["ble:b1"]);
  });
});

describe("piezas puras del puente", () => {
  it("la vía no manda lo que no es del protocolo Wi-Fi y aguanta un Bluetooth roto", async () => {
    const enviados: Array<{ enlaceId: string; cable: unknown }> = [];
    const ble: BleParaPuente = {
      enlaceHacia: (n) => (n === "n-tab" ? "b3" : null),
      enlaces: () => [{ id: "ble:b3", capacidadKbps: 0 }],
      instantanea: () => ({ ligaduras: [{ enlace: "b3", neurona: "n-tab", huella: "fp-tab" }, { enlace: "b9", neurona: "n-tab", huella: "fp-vieja" }] }),
    };
    const via = viaControlBle({ ble: () => ble, enviarPorEnlace: async (enlaceId, _n, cable) => (enviados.push({ enlaceId, cable }), { ok: true }) });
    expect(await via.enviar("n-tab", '{"t":"tu.msg","b":1}')).toBe(false);
    expect(await via.enviar("n-tab", '{"t":"enlace.wifi.cierre","s":{"b":{}}}')).toBe(true);
    expect(enviados).toEqual([{ enlaceId: "ble:b3", cable: { t: "enlace.wifi.cierre", s: { b: {} } } }]);
    expect(via.kbps?.("n-tab")).toBeNull(); // 0 = sin medir
    expect(via.ligaduras?.()).toEqual([{ neurona: "n-tab", huella: "fp-tab" }]);
    const rota = viaControlBle({
      ble: () => {
        throw new Error("sin app");
      },
      enviarPorEnlace: async () => ({ ok: true }),
    });
    expect(rota.alcanza("n-tab")).toBe(false);
    expect(await rota.enviar("n-tab", '{"t":"enlace.wifi.cierre","s":{}}')).toBe(false);
    expect(ligadurasDeVias([rota, via])).toEqual([{ neurona: "n-tab", huella: "fp-tab" }]);
  });

  it("enlaceDePaso, primeraVez y el aviso sin nada pendiente", () => {
    expect(enlaceDePaso({ enlaceId: "ble:b3" })).toEqual({ id: "ble:b3", tipo: "ble", ruta: null });
    expect(enlaceActualDe(enlaceDePaso({ enlaceId: "servidor" }))).toEqual({ tipo: "internet", kbps: null });
    expect(enlaceActualDe(enlaceDePaso({ enlaceId: "cuenta:x", ruta: "misma-red-local" }))).toEqual({ tipo: "red-local", kbps: null });
    expect(enlaceDePaso(undefined)).toBeNull();
    const mem = new Map<string, number>();
    expect(primeraVez(mem, "archivo:1", 0)).toBe(true);
    expect(primeraVez(mem, "archivo:1", VENTANA_AVISO_MS - 1)).toBe(false);
    expect(primeraVez(mem, "archivo:2", 10)).toBe(true);
    expect(primeraVez(mem, "archivo:1", VENTANA_AVISO_MS)).toBe(true);
    expect(avisoWifi({ pregunta: null, propuesta: null, capPropia: null })).toBeNull();
  });

  it("avisarEnvioPesado: el mismo archivo (reintentos del buzón) avisa una sola vez al motor", async () => {
    const llamadas: unknown[] = [];
    __fijarMotorWifiParaPruebas({ necesitaAncho: async (p: unknown) => (llamadas.push(p), { accion: "nada", motivo: "" }), uso: () => undefined, retenerFlujo: () => undefined } as unknown as MotorWifi);
    const pesado = { clave: "archivo:int-1", destino: { neuronDeviceId: "n-tab" }, clase: "archivo" as const, bytes: 50 * MB, enlace: enlaceDePaso({ enlaceId: "ble:b3" }) };
    avisarEnvioPesado(pesado);
    avisarEnvioPesado(pesado);
    avisarEnvioPesado({ destino: { neuronDeviceId: "n-tab" }, clase: "llamada" });
    await new Promise((r) => setTimeout(r, 50));
    expect(llamadas).toEqual([
      { neurona: "n-tab", clase: "archivo", bytes: 50 * MB, enlaceActual: { tipo: "ble", kbps: null }, cerca: false },
      { neurona: "n-tab", clase: "llamada", bytes: undefined, enlaceActual: { tipo: "ninguno", kbps: 0 }, cerca: false },
    ]);
  });
});

describe("archivo grande solo con Bluetooth (BLE1108B)", () => {
  const cap = { pregunta: null, capPropia: null } as const;
  const propuesta = (bytes?: number) => ({ neurona: "n", nombre: "Maggaboard", clase: "archivo" as const, motivo: "pesado", ...(bytes === undefined ? {} : { bytes }) });

  it("propone Wi-Fi directo y ofrece «Enviar por Bluetooth igualmente» con el tiempo estimado", () => {
    const a = avisoWifi({ ...cap, propuesta: propuesta(8 * MB) }, 200);
    expect(a?.tipo).toBe("propuesta");
    expect(a?.si).toBe("Abrir");
    expect(a?.no).toBe("Enviar por Bluetooth igualmente");
    expect(a?.detalle).toMatch(/Por Bluetooth igualmente tardaría ≈ \d+ min/);
  });

  it("pasado el tope de 20 MB solo cabe por Wi-Fi directo: sin la opción de Bluetooth", () => {
    const a = avisoWifi({ ...cap, propuesta: propuesta(30 * MB) }, 200);
    expect(a?.no).toBe("Ahora no");
    expect(a?.detalle).toContain("solo cabe por Wi-Fi directo");
  });

  it("una llamada no ofrece Bluetooth igualmente", () => {
    const a = avisoWifi({ ...cap, propuesta: { ...propuesta(), clase: "llamada" } });
    expect(a?.no).toBe("Ahora no");
  });
});
