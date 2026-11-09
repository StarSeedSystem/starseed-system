/**
 * Motor del enlace Wi-Fi directo (WFD1108A) con DOS neuronas en memoria: control firmado por cualquier
 * vía (Bluetooth LE registrada primero), credenciales cifradas de verdad (ECDH P-256 → AES-GCM con
 * WebCrypto: en el cable nunca va la contraseña), parte nativa simulada (Android levanta la red, el Mac
 * se une o la persona se une a mano), permiso denegado, plazos, remitentes sin confianza, orquestación
 * y el sobre real de `recipient-crypto.ts`. Contrato: architecture/wifi-directo.md.
 */
import { afterEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { crearMotorWifi, type DepsMotorWifi, type EstadoNativoWifi, type MotorWifi, type NativoWifi, type ViaControlWifi } from "@/lib/malla/enlace-wifi-motor";
import { leerCredenciales, leerMensajeWifi, PLAZOS_WIFI, type CapacidadesWifi, type CredencialesWifi, type SobreCifradoWifi } from "@/lib/malla/enlace-wifi-directo";
import { enlacesWifiActivos, fijarEnlacesWifi } from "@/lib/malla/enlace-wifi-orquestacion";

const sutil = (globalThis.crypto?.subtle ?? webcrypto.subtle) as SubtleCrypto;
const ANDROID: CapacidadesWifi = { plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: false, wifi: true, lanas: ["punto-acceso-optin"] };
const MAC: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["punto-acceso-optin"] };
const CLAVE = "clave-del-ap-9f3a";

/* ── Cifrado por destinatario de verdad (mismo esquema que recipient-crypto: ECDH → HKDF → AES-GCM) ── */

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function claveAes(priv: CryptoKey, pub: JsonWebKey): Promise<CryptoKey> {
  const otra = await sutil.importKey("jwk", pub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await sutil.deriveBits({ name: "ECDH", public: otra }, priv, 256);
  const hk = await sutil.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return sutil.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(1), info: new TextEncoder().encode("prueba") }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
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
    const k = await claveAes(priv, s.epk);
    const p = await sutil.decrypt({ name: "AES-GCM", iv: deB64(s.iv) }, k, deB64(s.ct));
    return JSON.parse(new TextDecoder().decode(p));
  } catch {
    return null;
  }
}

/* ── Mundo: dos neuronas, su parte nativa simulada y lo que pasa por el cable ── */

interface Neurona {
  id: string;
  motor: MotorWifi;
  nativo: NativoFalso;
  activos: Array<{ neurona: string; ipOtro: string | null }>;
}

interface NativoFalso extends NativoWifi {
  n: EstadoNativoWifi;
  cerradas: string[];
  unidoCon: CredencialesWifi | null;
  abrirFalla?: { codigo: "permiso-denegado" | "sin-soporte"; motivo: string };
  guiado?: boolean;
  alcanzable?: boolean;
}

function nativoAndroid(): NativoFalso {
  const f: NativoFalso = {
    n: { sesion: null, fase: "inactivo", rol: null, metodo: null, ssid: null, ip_propia: null, ip_ap: null, banda: null, mbps: null, codigo: null, mensaje: "", red_anterior: null, t: 0 },
    cerradas: [],
    unidoCon: null,
    capacidades: async () => ANDROID,
    pedirPermiso: async () => ANDROID,
    abrirAp: async (sesion, metodo) => {
      if (f.abrirFalla) return { ok: false, codigo: f.abrirFalla.codigo, motivo: f.abrirFalla.motivo };
      f.n = { ...f.n, sesion, fase: "red-lista", rol: "ap", metodo, ssid: "StarSeed-9f3a", ip_ap: "192.168.49.1", ip_propia: "192.168.49.1", banda: "5" };
      return { ok: true };
    },
    credenciales: async (sesion) => (f.n.sesion === sesion && f.n.fase === "red-lista" ? { ssid: "StarSeed-9f3a", clave: CLAVE, banda: "5", ip: "192.168.49.1" } : null),
    unirse: async () => ({ ok: false, codigo: "sin-soporte", motivo: "no" }),
    estado: async () => f.n,
    cerrar: async (sesion) => {
      f.cerradas.push(sesion);
      f.n = { ...f.n, fase: "cerrado" };
    },
    comprobar: async () => ({ alcanzable: false, ipLocal: null }),
  };
  return f;
}

function nativoMac(): NativoFalso {
  const f: NativoFalso = {
    n: { sesion: null, fase: "inactivo", rol: null, metodo: null, ssid: null, ip_propia: null, ip_ap: null, banda: null, mbps: null, codigo: null, mensaje: "", red_anterior: "Casa", t: 0 },
    cerradas: [],
    unidoCon: null,
    capacidades: async () => MAC,
    pedirPermiso: async () => MAC,
    abrirAp: async () => ({ ok: false, codigo: "sin-soporte", motivo: "macOS no levanta redes" }),
    credenciales: async () => null,
    unirse: async (sesion, metodo, cred) => {
      f.unidoCon = cred;
      if (f.guiado) {
        f.n = { ...f.n, sesion, fase: "guiado", rol: "cliente", metodo, ssid: cred.ssid };
        return { ok: true, guiado: true };
      }
      f.n = { ...f.n, sesion, fase: "unida", rol: "cliente", metodo, ssid: cred.ssid, ip_propia: "192.168.49.23", ip_ap: cred.ipAp, mbps: 433 };
      return { ok: true };
    },
    estado: async () => f.n,
    cerrar: async (sesion) => {
      f.cerradas.push(sesion);
      f.n = { ...f.n, fase: "cerrado" };
    },
    comprobar: async (ip) => ({ alcanzable: !!f.alcanzable && ip === "192.168.49.1", ipLocal: f.alcanzable ? "192.168.49.40" : null }),
  };
  return f;
}

interface Mundo {
  ahora: number;
  cable: string[];
  neuronas: Record<string, Neurona>;
  /** Neuronas que se fían una de otra (vínculo con huella). */
  confianza: Set<string>;
  viasBle: ViaControlWifi[];
  sinCamino?: boolean;
}

async function montar(m: Mundo, id: string, nativo: NativoFalso, ajuste: "automatico" | "preguntar" | "nunca" = "automatico"): Promise<Neurona> {
  const cif = await identidadCifrado();
  const activos: Neurona["activos"] = [];
  const deps: DepsMotorWifi = {
    ahora: () => m.ahora,
    nuevaSesion: () => `wfd-${id}-${m.ahora}`,
    yo: async () => ({ neurona: id, nombre: `Neurona ${id}` }),
    epubPropia: async () => cif.pub,
    ajuste: () => ajuste,
    puntoAcceso: () => true, // WFA1109A: estos tests cubren el camino por punto de acceso, que es opt-in
    // Firma de juguete: el sobre dice la huella; `valido` lo decide el mundo (un sobre «roto» no vale).
    firmar: async (cuerpo) => ({ v: 2, b: cuerpo, f: `huella-${id}` }),
    verificar: async (s) => {
      const o = s as { b?: unknown; f?: string; roto?: boolean };
      return { cuerpo: o.b, huella: o.f, valido: !o.roto };
    },
    cifrarPara,
    descifrar: (s) => descifrar(cif.priv, s),
    confiable: (de, huella) => m.confianza.has(`${id}<-${de}`) && huella === `huella-${de}`,
    enviarTransporte: async (para, cable) => {
      if (m.sinCamino) return { ok: false, motivo: "sin enlace" };
      const texto = JSON.stringify(cable);
      m.cable.push(texto);
      const destino = m.neuronas[para];
      if (destino) setTimeout(() => void destino.motor.recibir(JSON.parse(texto), { tipo: "nativo" }), 0);
      return { ok: true };
    },
    nativo,
    alActivo: (p) => activos.push(p),
  };
  const n: Neurona = { id, motor: crearMotorWifi(deps, () => m.viasBle), nativo, activos };
  m.neuronas[id] = n;
  return n;
}

async function correr(m: Mundo, pasos = 30, avanceMs = 0): Promise<void> {
  for (let i = 0; i < pasos; i++) {
    m.ahora += avanceMs;
    await new Promise((r) => setTimeout(r, 0));
    for (const n of Object.values(m.neuronas)) await n.motor.tic();
  }
}

function mundo(): Mundo {
  return { ahora: 1_000_000, cable: [], neuronas: {}, confianza: new Set(["mac<-tel", "tel<-mac"]), viasBle: [] };
}

afterEach(() => fijarEnlacesWifi([]));

describe("motor del enlace Wi-Fi directo", () => {
  it("Mac ↔ Android: se abre solo, la contraseña viaja cifrada y las dos quedan activas con sus IP", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    const tel = await montar(m, "tel", nativoAndroid());
    expect(await mac.motor.abrir("tel", "archivo", "Teléfono")).toEqual({ ok: true });
    await correr(m);
    expect(tel.motor.instantanea().estado).toMatchObject({ fase: "activo", ipOtro: "192.168.49.23", mbps: 433 });
    expect(mac.motor.instantanea().estado).toMatchObject({ fase: "activo", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23", red: { ssid: "StarSeed-9f3a", banda: "5" } });
    expect(mac.nativo.unidoCon).toMatchObject({ ssid: "StarSeed-9f3a", clave: CLAVE, ipAp: "192.168.49.1", metodo: "hotspot-local" });
    // Nada del cable lleva la contraseña en claro; el `listo` de fase «red» va cifrado.
    expect(m.cable.length).toBeGreaterThanOrEqual(4);
    for (const t of m.cable) expect(t).not.toContain(CLAVE);
    const listoRed = m.cable.map((t) => JSON.parse(t) as { t: string; s: { b: unknown } }).find((x) => x.t === "enlace.wifi.listo" && (x.s.b as { fase?: string }).fase === "red");
    expect(leerMensajeWifi(listoRed?.s.b)).toMatchObject({ fase: "red", cred: { v: 3 } });
    // Ni el estado ni la instantánea guardan la contraseña.
    expect(JSON.stringify(mac.motor.instantanea())).not.toContain(CLAVE);
    expect(JSON.stringify(tel.motor.instantanea())).not.toContain(CLAVE);
    // Pista a la red nativa de cada lado con la IP del otro en la red directa.
    expect(mac.activos).toContainEqual({ neurona: "tel", ipOtro: "192.168.49.1" });
    expect(tel.activos).toContainEqual({ neurona: "mac", ipOtro: "192.168.49.23" });
    expect(enlacesWifiActivos().length).toBe(1);
    // Cerrar: los dos apagan su parte nativa (el Mac vuelve a su red).
    await mac.motor.cerrar();
    await correr(m, 10);
    expect(mac.motor.instantanea().estado.fase).toBe("cerrado");
    expect(tel.motor.instantanea().estado.fase).toBe("cerrado");
    expect(mac.nativo.cerradas.length).toBe(1);
    expect(tel.nativo.cerradas.length).toBe(1);
  });

  it("Mac sin unión programática: la persona se une a mano y se detecta sola al llegar al canal del otro", async () => {
    const m = mundo();
    const macN = nativoMac();
    macN.guiado = true;
    const mac = await montar(m, "mac", macN);
    await montar(m, "tel", nativoAndroid());
    await mac.motor.abrir("tel", "pantalla");
    await correr(m, 20);
    const s = mac.motor.instantanea();
    expect(s.estado.fase).toBe("uniendo");
    expect(s.guiado).toEqual({ ssid: "StarSeed-9f3a", clave: CLAVE, ipAp: "192.168.49.1" });
    macN.alcanzable = true;
    await correr(m, 10);
    expect(mac.motor.instantanea().estado).toMatchObject({ fase: "activo", ipPropia: "192.168.49.40" });
    expect(mac.motor.instantanea().guiado).toBeNull();
  });

  it("permiso denegado en el Android: el Mac recibe el cierre y sigue por el enlace de antes", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    const telN = nativoAndroid();
    telN.abrirFalla = { codigo: "permiso-denegado", motivo: "Android no dio «Dispositivos cercanos»" };
    const tel = await montar(m, "tel", telN);
    await mac.motor.abrir("tel", "archivo");
    await correr(m);
    expect(tel.motor.instantanea().estado).toMatchObject({ fase: "fallido", codigo: "permiso-denegado" });
    const s = mac.motor.instantanea();
    expect(s.estado).toMatchObject({ fase: "fallido", codigo: "permiso-denegado" });
    expect(s.ultimoRespaldo).toContain("Se sigue por el enlace de antes");
    expect(s.fallos.tel).toBe(m.ahora);
    expect(mac.nativo.unidoCon).toBeNull();
  });

  it("plazo: la otra neurona no contesta y se cae al respaldo; sin camino falla al instante", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    await mac.motor.abrir("nadie", "archivo");
    await correr(m, 3, 1000);
    expect(mac.motor.instantanea().estado.fase).toBe("ofreciendo");
    m.ahora += PLAZOS_WIFI.respuesta;
    await correr(m, 2);
    expect(mac.motor.instantanea().estado).toMatchObject({ fase: "fallido", codigo: "plazo" });

    const m2 = mundo();
    m2.sinCamino = true;
    const otro = await montar(m2, "mac", nativoMac());
    await otro.motor.abrir("tel", "archivo");
    expect(otro.motor.instantanea().estado).toMatchObject({ fase: "fallido", codigo: "no-encontrada" });
    expect(otro.motor.instantanea().ultimoRespaldo).toContain("ningún camino");
  });

  it("de una neurona sin vínculo ni cuenta, o con la firma rota, no se atiende nada (ni se contesta)", async () => {
    const m = mundo();
    m.confianza = new Set(["tel<-mac"]); // el Android se fía del Mac, el Mac del Android no
    const mac = await montar(m, "mac", nativoMac());
    const tel = await montar(m, "tel", nativoAndroid());
    await tel.motor.abrir("mac", "archivo");
    await correr(m, 10);
    expect(mac.motor.instantanea().estado.fase).toBe("inactivo");
    expect(m.cable.length).toBe(1); // solo la oferta

    const oferta = JSON.parse(m.cable[0]);
    await tel.motor.recibir({ ...oferta, s: { ...oferta.s, roto: true } });
    expect(tel.motor.instantanea().estado.sesion).not.toBe("x");
    await mac.motor.recibir('{"t":"nl.hola","s":{}}');
    expect(mac.motor.instantanea().estado.fase).toBe("inactivo");
  });

  it("«Preguntar» en el Android: espera a la persona y entonces abre", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    const tel = await montar(m, "tel", nativoAndroid(), "preguntar");
    await mac.motor.abrir("tel", "llamada", "Teléfono");
    await correr(m, 10);
    expect(tel.motor.instantanea().pregunta).toMatchObject({ otro: "mac", clase: "llamada" });
    await tel.motor.decidirPersona(true);
    await correr(m);
    expect(tel.motor.instantanea().pregunta).toBeNull();
    expect(mac.motor.instantanea().estado.fase).toBe("activo");
  });

  it("orquestación: con Bluetooth LE cerca y «Automático», un archivo grande abre el enlace por esa vía", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    await montar(m, "tel", nativoAndroid());
    const porBle: string[] = [];
    m.viasBle.push({
      id: "ble",
      cercana: true,
      alcanza: (n) => n === "tel",
      enviar: async (n, texto) => {
        porBle.push(texto);
        setTimeout(() => void m.neuronas[n].motor.recibir(texto, { tipo: "ble" }), 0);
        return true;
      },
      kbps: () => 250,
    });
    const d = await mac.motor.necesitaAncho({ neurona: "tel", clase: "archivo", bytes: 500 * 1024 * 1024, enlaceActual: { tipo: "ninguno", kbps: null }, cerca: false });
    expect(d).toMatchObject({ accion: "abrir", aviso: expect.stringContaining("una sola radio") });
    await correr(m);
    expect(porBle[0]).toContain('"t":"enlace.wifi.oferta"');
    expect(mac.motor.instantanea().estado.fase).toBe("activo");
    // Ya activo: otro envío no abre nada.
    expect((await mac.motor.necesitaAncho({ neurona: "tel", clase: "archivo", bytes: 1e9, enlaceActual: { tipo: "ble", kbps: null }, cerca: true })).accion).toBe("nada");
  });

  it("orquestación: «Preguntar» deja la propuesta y «Abrir enlace Wi-Fi directo» la abre", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac(), "preguntar");
    await montar(m, "tel", nativoAndroid());
    const d = await mac.motor.necesitaAncho({ neurona: "tel", nombre: "Teléfono", clase: "flujo", enlaceActual: { tipo: "ble", kbps: 300 }, cerca: true });
    expect(d.accion).toBe("proponer");
    expect(mac.motor.instantanea().propuesta).toMatchObject({ neurona: "tel", nombre: "Teléfono", clase: "flujo" });
    await mac.motor.resolverPropuesta(true);
    await correr(m);
    expect(mac.motor.instantanea().estado.fase).toBe("activo");
  });

  it("activo con un flujo vivo no se cierra por inactividad; sin él, sí", async () => {
    const m = mundo();
    const mac = await montar(m, "mac", nativoMac());
    await montar(m, "tel", nativoAndroid());
    await mac.motor.abrir("tel", "llamada");
    await correr(m);
    const pista = { readyState: "live" };
    mac.motor.retenerFlujo("tel", { getTracks: () => [pista] });
    m.ahora += 10 * 60_000;
    await correr(m, 2);
    expect(mac.motor.instantanea().estado.fase).toBe("activo");
    pista.readyState = "ended";
    m.ahora += 6 * 60_000;
    await correr(m, 4);
    expect(mac.motor.instantanea().estado).toMatchObject({ fase: "cerrado", codigo: "inactivo" });
  });
});

describe("sobre real de recipient-crypto", () => {
  it("las credenciales cifradas con `encryptEnvelopeFor` pasan por el protocolo y se descifran", async () => {
    const rc = await import("@/ai/astraura/mesh/recipient-crypto");
    const pub = await rc.myEncryptionPublicKey();
    expect(pub).toBeTruthy();
    const ahora = Date.now();
    const cred: CredencialesWifi = { ssid: "StarSeed-1", clave: "otra-clave-77", banda: null, ipAp: "192.168.43.1", puerto: 47071, metodo: "hotspot-local", caduca: ahora + 60_000 };
    const sobre = await rc.encryptEnvelopeFor(pub as JsonWebKey, cred);
    const msg = leerMensajeWifi({ t: "enlace.wifi.listo", v: 1, sesion: "s", de: "a", para: "b", ts: 1, fase: "red", cred: sobre });
    expect(msg && msg.t === "enlace.wifi.listo" && msg.cred).toBeTruthy();
    expect(JSON.stringify(msg)).not.toContain("otra-clave-77");
    const plano = await rc.decryptEnvelopeFor((msg as { cred: Parameters<typeof rc.decryptEnvelopeFor>[0] }).cred);
    expect(leerCredenciales(plano, ahora)).toEqual(cred);
  });
});
