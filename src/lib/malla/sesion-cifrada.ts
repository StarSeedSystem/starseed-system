/**
 * sesion-cifrada — la capa de sesión que cifra de punta a punta cada enlace nativo (2026-11-08 · CIF1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/datos-por-la-malla.md` §6 y `architecture/red-sin-dependencias.md` §5.
 *
 * Qué resuelve: el canal local nativo (TCP 47071, `nativo:<ip>`, también el de la red Wi-Fi directa) y el
 * Bluetooth LE firmaban su saludo pero llevaban los datos en claro. Aquí cada pareja de neuronas ligadas
 * acuerda una SESIÓN y desde entonces todo lo que no es saludo viaja cifrado.
 *
 *   · Acuerdo: ECDH P-256 con claves EFÍMERAS (secreto hacia adelante) dentro de un mensaje `nl.cs`
 *     FIRMADO con la identidad de malla que el saludo ya probó (el motor exige que la huella del `nl.cs`
 *     sea la de la ligadura). Quien firma las claves efímeras es, pues, quien se ligó: no hay intermediario.
 *     Dos mensajes: `ini` (quien necesita hablar) y `res`. Si las dos empiezan a la vez, gana la neurona de
 *     id menor y la otra contesta (igual que `quienOfrece` en la señalización).
 *   · Claves: HKDF-SHA256(secreto ECDH, sal = id de sesión, info = sentido + neuronas + las dos públicas)
 *     → una clave AES-256-GCM por SENTIDO (ini→res y res→ini): nunca se cifra con la misma clave en los dos.
 *   · Trama: `{"t":"nl.cif","s":<sesión>,"n":<contador>,"c":<base64 del cifrado+etiqueta>}`. El nonce de 12
 *     bytes son 4 de sentido + 8 del contador; los datos asociados atan sesión, sentido y contador. Contador
 *     monótono por sentido; el que recibe rechaza un contador repetido o más viejo que la ventana (128).
 *   · Renovación (misma política que el trinquete de `cristal/cifrado/trinquete.ts`): a los 15 min o 500
 *     tramas, y además a los 32 MiB cifrados (flujos de archivos). Se renueva sin cortar: la sesión vieja
 *     sigue valiendo 60 s para lo que llegue en vuelo. Con el doble del límite blando ya no se cifra más
 *     con esa sesión (el motor espera a la nueva).
 *
 * Es PURO: sin red ni DOM; usa WebCrypto (`globalThis.crypto`) y el reloj/firmador que se le inyectan.
 * No añade dependencias: son las mismas primitivas (ECDH P-256, HKDF, AES-GCM) de `par-crypto.ts` y
 * `recipient-crypto.ts`.
 */

import { MARGEN_TRAMA, type LimitesCanal } from "./red-local-nativa";

/* ══════════════════════════ Constantes ══════════════════════════ */

/** Versión de la capa; es lo que se anuncia como `cif` en el saludo. */
export const VERSION_CIFRADO = 1;
export const TIPO_TRAMA_CIFRADA = "nl.cif";
export const TIPO_ACUERDO = "nl.cs";
export const PREFIJO_TRAMA_CIFRADA = '{"t":"nl.cif"';
export const PREFIJO_ACUERDO = '{"t":"nl.cs"';

/** Política de renovación: igual que el trinquete (15 min · 500) más el tope de bytes para archivos. */
export const RENOVAR_TRAMAS = 500;
export const RENOVAR_MS = 15 * 60_000;
export const RENOVAR_BYTES = 32 * 1024 * 1024;
/** Con el doble del límite blando ya no se cifra más con esa sesión. */
export const FACTOR_LIMITE_DURO = 2;
/** La sesión reemplazada sigue valiendo para recibir esto (lo que iba en vuelo). */
export const GRACIA_PREVIA_MS = 60_000;
/** Un acuerdo propio sin respuesta se da por perdido a los… */
export const CADUCA_PENDIENTE_MS = 20_000;
/** Ventana de contadores aceptados hacia atrás. */
export const VENTANA_REPETICION = 128;
/** Bytes que añade una trama cifrada además de la expansión base64 (envoltorio JSON + etiqueta GCM). */
export const SOBRECARGA_FIJA = 96;

/* ══════════════════════════ Tipos ══════════════════════════ */

/**
 * Gancho de identidad: certificado opcional cuenta→neurona que viaja en el saludo (`certificado`). Lo
 * construirá IDN1108A como API pura; aquí solo se TIPA y se comprueba con un verificador inyectado. Por
 * defecto (sin verificador) el certificado se ignora: el comportamiento de hoy.
 */
export type CertificadoNeurona = Record<string, unknown>;

export type VerificadorCertificado = (c: CertificadoNeurona, ctx: { neurona: string; huella: string }) => boolean | Promise<boolean>;

/** Verificador por defecto: no exige nada (el comportamiento de antes de existir los certificados). */
export const verificadorCertificadoPorDefecto: VerificadorCertificado = () => true;

export type EstadoSesion = "sin" | "pendiente" | "activa";

export interface DepsSesiones {
  ahora(): number;
  /** Firma con la identidad de malla (`wrapSigned` v2). Null si no se pudo. */
  firmar(cuerpo: unknown): Promise<unknown | null>;
  /** Bytes aleatorios (por defecto `crypto.getRandomValues`). */
  aleatorio?(n: number): Uint8Array;
  /** Solo pruebas: otros límites de renovación (por defecto, los de la política). */
  limites?: Partial<{ tramas: number; ms: number; bytes: number }>;
}

export type ResultadoCifrar = { ok: true; texto: string; renovar: boolean } | { ok: false; motivo: "sin-sesion" | "limite" | "error" };

export type ResultadoDescifrar =
  | { ok: true; texto: string }
  /** `desconocida`: no hay (o ya no hay) esa sesión: se reabre el acuerdo. `invalida`: etiqueta, repetición o forma: se cierra el enlace. */
  | { ok: false; motivo: "desconocida" | "invalida"; detalle: string };

export type ResultadoAcuerdo = { ok: true; respuesta: unknown | null; activa: boolean } | { ok: false; motivo: string };

export interface SesionesCifradas {
  /** Abre el acuerdo hacia `par`: devuelve el sobre FIRMADO `nl.cs/ini` para mandarlo en claro. Null si ya hay uno vivo o no se pudo. */
  iniciar(yo: string, par: string): Promise<unknown | null>;
  /** Procesa un `nl.cs` YA verificado y firmado por `huellaPar` (que el motor comprobó contra la ligadura). */
  recibirAcuerdo(yo: string, par: string, cuerpo: unknown): Promise<ResultadoAcuerdo>;
  cifrar(par: string, texto: string): Promise<ResultadoCifrar>;
  descifrar(par: string, texto: string): Promise<ResultadoDescifrar>;
  estado(par: string): EstadoSesion;
  /** ¿Toca renovar (límites blandos)? Y no hay ya un acuerdo en marcha. */
  tocaRenovar(par: string): boolean;
  olvidar(par: string): void;
  /** Para el panel y las pruebas. */
  info(par: string): { sesion: string; tramasEnviadas: number; bytesEnviados: number; desde: number } | null;
}

/* ══════════════════════════ Codificación ══════════════════════════ */

export function aB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deB64(t: string): Uint8Array<ArrayBuffer> | null {
  if (typeof t !== "string" || t.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(t)) return null;
  try {
    const s = atob(t);
    const o = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  } catch {
    return null;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

/**
 * Los límites del canal para el TEXTO EN CLARO que luego se cifra: una trama cifrada pesa 4/3 del claro
 * (base64) más `SOBRECARGA_FIJA`, y no debe pasar del tope del otro lado. Puro.
 */
export function limitesParaCifrado(l: LimitesCanal): LimitesCanal {
  const cabe = Math.max(1024, l.maxCuerpo - MARGEN_TRAMA);
  const claro = Math.max(1024, Math.floor(((cabe - SOBRECARGA_FIJA) * 3) / 4) - 16);
  return { ...l, maxCuerpo: claro + MARGEN_TRAMA };
}

/**
 * Cómo se habla con una neurona, según lo que anunció en su saludo FIRMADO (no se puede quitar en el aire):
 *   · `cifrado`: las dos apps entienden la capa → cifrado OBLIGATORIO; un fallo cierra el enlace.
 *   · `claro`: la otra es una app anterior → texto en claro, el enlace se marca «sin cifrar».
 *   · `bloqueado`: la otra no cifra y el ajuste «Exigir cifrado en la red local» está activo → no se manda ni
 *     se acepta nada (salvo el saludo).
 */
export type ModoEnlace = "cifrado" | "claro" | "bloqueado";

export function decidirModo(p: { propio: boolean; cifPar: number | undefined; exigir: boolean }): ModoEnlace {
  if (p.propio && (p.cifPar ?? 0) >= VERSION_CIFRADO) return "cifrado";
  return p.exigir ? "bloqueado" : "claro";
}

/** Lo que muestran la cabecera del chat y los acuses. */
export type EtiquetaCifrado = "cifrado" | "sin-cifrar" | "pendiente";

export function etiquetaCifrado(modo: ModoEnlace, sesion: EstadoSesion): EtiquetaCifrado {
  if (modo === "cifrado") return sesion === "activa" ? "cifrado" : "pendiente";
  return "sin-cifrar";
}

/** ¿Es una trama cifrada (por su prefijo)? */
export function esTramaCifrada(t: string): boolean {
  return typeof t === "string" && t.startsWith(PREFIJO_TRAMA_CIFRADA);
}

/** ¿Es un mensaje de acuerdo de sesión? */
export function esAcuerdo(t: string): boolean {
  return typeof t === "string" && t.startsWith(PREFIJO_ACUERDO);
}

/** Lo que SIEMPRE va en claro (ya va firmado): el saludo, el acuerdo de sesión y nada más. */
export function esTextoSiempreEnClaro(t: string): boolean {
  return typeof t === "string" && (t.startsWith('{"t":"nl.hola"') || t.startsWith(PREFIJO_ACUERDO));
}

/* ══════════════════════════ Acuerdo (cuerpo firmado) ══════════════════════════ */

export interface AcuerdoSesion {
  t: "nl.cs";
  v: 1;
  /** `ini`: abre; `res`: contesta. */
  k: "ini" | "res";
  /** Id de sesión (8 bytes aleatorios, base64). Lo elige quien inicia. */
  s: string;
  de: string;
  para: string;
  /** Clave pública ECDH P-256 EFÍMERA, punto sin comprimir (65 bytes) en base64. */
  ef: string;
  ts: number;
}

export function leerAcuerdo(x: unknown): AcuerdoSesion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.t !== TIPO_ACUERDO || o.v !== 1 || (o.k !== "ini" && o.k !== "res")) return null;
  if (typeof o.s !== "string" || o.s.length < 8 || o.s.length > 24 || !/^[A-Za-z0-9+/=]+$/.test(o.s)) return null;
  if (typeof o.de !== "string" || typeof o.para !== "string" || !o.de || !o.para || o.de.length > 80 || o.para.length > 80) return null;
  if (typeof o.ef !== "string" || o.ef.length !== 88) return null;
  if (typeof o.ts !== "number") return null;
  return { t: TIPO_ACUERDO, v: 1, k: o.k, s: o.s, de: o.de, para: o.para, ef: o.ef, ts: o.ts };
}

/* ══════════════════════════ Motor ══════════════════════════ */

interface Sesion {
  sid: string;
  /** Soy quien inició (sentido ini→res al enviar). */
  soyIni: boolean;
  kEnv: CryptoKey;
  kRec: CryptoKey;
  desde: number;
  enviadas: number;
  bytes: number;
  /** Contador de envío: siguiente a usar. */
  siguiente: number;
  /** Recepción: mayor visto y los vistos de la ventana. */
  maxVisto: number;
  vistos: Set<number>;
  /** Solo la sesión reemplazada: hasta cuándo vale recibir con ella. */
  hasta?: number;
}

interface Pendiente {
  sid: string;
  priv: CryptoKey;
  ef: string;
  desde: number;
}

interface Par {
  activa: Sesion | null;
  previa: Sesion | null;
  pendiente: Pendiente | null;
}

const sutil = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("sin WebCrypto");
  return s;
};

function nonce(soyIni: boolean, n: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv[3] = soyIni ? 0 : 1;
  const dv = new DataView(iv.buffer);
  dv.setUint32(4, Math.floor(n / 0x1_0000_0000));
  dv.setUint32(8, n >>> 0);
  return iv;
}

/** El sentido es el del que ENVÍA: `true` si lo envía quien inició la sesión. */
function aad(sid: string, deIni: boolean, n: number): Uint8Array<ArrayBuffer> {
  return enc.encode(`${TIPO_TRAMA_CIFRADA}|${VERSION_CIFRADO}|${sid}|${deIni ? "i" : "r"}|${n}`);
}

async function generarEfimera(): Promise<{ priv: CryptoKey; ef: string }> {
  const kp = await sutil().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const raw = new Uint8Array(await sutil().exportKey("raw", kp.publicKey));
  return { priv: kp.privateKey, ef: aB64(raw) };
}

async function derivar(p: { priv: CryptoKey; efPar: string; sid: string; ini: string; res: string; efIni: string; efRes: string; soyIni: boolean; ahora: number }): Promise<Sesion | null> {
  const raw = deB64(p.efPar);
  if (!raw || raw.length !== 65 || raw[0] !== 4) return null;
  const s = sutil();
  const pub = await s.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await s.deriveBits({ name: "ECDH", public: pub }, p.priv, 256);
  const base = await s.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const clave = (sentido: "i2r" | "r2i") =>
    s.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode(p.sid), info: enc.encode(`ss-nl-cif-v1|${sentido}|${p.ini}|${p.res}|${p.efIni}|${p.efRes}`) },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  const [i2r, r2i] = await Promise.all([clave("i2r"), clave("r2i")]);
  return {
    sid: p.sid,
    soyIni: p.soyIni,
    kEnv: p.soyIni ? i2r : r2i,
    kRec: p.soyIni ? r2i : i2r,
    desde: p.ahora,
    enviadas: 0,
    bytes: 0,
    siguiente: 0,
    maxVisto: -1,
    vistos: new Set(),
  };
}

export function crearSesionesCifradas(deps: DepsSesiones): SesionesCifradas {
  const pares = new Map<string, Par>();
  const aleatorio = deps.aleatorio ?? ((n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)));

  const par = (id: string): Par => {
    let p = pares.get(id);
    if (!p) {
      p = { activa: null, previa: null, pendiente: null };
      pares.set(id, p);
    }
    return p;
  };

  const limpiar = (p: Par) => {
    const t = deps.ahora();
    if (p.previa?.hasta && p.previa.hasta < t) p.previa = null;
    if (p.pendiente && t - p.pendiente.desde > CADUCA_PENDIENTE_MS) p.pendiente = null;
  };

  const instalar = (p: Par, s: Sesion) => {
    if (p.activa) p.previa = { ...p.activa, hasta: deps.ahora() + GRACIA_PREVIA_MS };
    p.activa = s;
    p.pendiente = null;
  };

  const lT = deps.limites?.tramas ?? RENOVAR_TRAMAS;
  const lB = deps.limites?.bytes ?? RENOVAR_BYTES;
  const lM = deps.limites?.ms ?? RENOVAR_MS;
  const duro = (s: Sesion) => s.enviadas >= lT * FACTOR_LIMITE_DURO || s.bytes >= lB * FACTOR_LIMITE_DURO || deps.ahora() - s.desde >= lM * FACTOR_LIMITE_DURO;
  const blando = (s: Sesion) => s.enviadas >= lT || s.bytes >= lB || deps.ahora() - s.desde >= lM;

  async function iniciar(yo: string, otro: string): Promise<unknown | null> {
    const p = par(otro);
    limpiar(p);
    if (p.pendiente) return null;
    try {
      const sid = aB64(aleatorio(8));
      const { priv, ef } = await generarEfimera();
      p.pendiente = { sid, priv, ef, desde: deps.ahora() };
      const cuerpo: AcuerdoSesion = { t: TIPO_ACUERDO, v: 1, k: "ini", s: sid, de: yo, para: otro, ef, ts: deps.ahora() };
      const firmado = await deps.firmar(cuerpo);
      if (!firmado) {
        p.pendiente = null;
        return null;
      }
      return firmado;
    } catch {
      p.pendiente = null;
      return null;
    }
  }

  async function recibirAcuerdo(yo: string, otro: string, cuerpo: unknown): Promise<ResultadoAcuerdo> {
    const a = leerAcuerdo(cuerpo);
    if (!a) return { ok: false, motivo: "acuerdo de sesión mal formado" };
    if (a.de !== otro || a.para !== yo) return { ok: false, motivo: "el acuerdo no es entre estas dos neuronas" };
    const p = par(otro);
    limpiar(p);
    try {
      if (a.k === "ini") {
        // Si las dos abrieron a la vez, gana la de id menor: la otra contesta a la ganadora.
        if (p.pendiente && yo < otro) return { ok: true, respuesta: null, activa: !!p.activa };
        const { priv, ef } = await generarEfimera();
        const s = await derivar({ priv, efPar: a.ef, sid: a.s, ini: otro, res: yo, efIni: a.ef, efRes: ef, soyIni: false, ahora: deps.ahora() });
        if (!s) return { ok: false, motivo: "clave efímera inválida" };
        const resp: AcuerdoSesion = { t: TIPO_ACUERDO, v: 1, k: "res", s: a.s, de: yo, para: otro, ef, ts: deps.ahora() };
        const firmado = await deps.firmar(resp);
        if (!firmado) return { ok: false, motivo: "no se pudo firmar la contestación" };
        instalar(p, s);
        return { ok: true, respuesta: firmado, activa: true };
      }
      // res
      const pend = p.pendiente;
      if (!pend || pend.sid !== a.s) return { ok: true, respuesta: null, activa: !!p.activa };
      const s = await derivar({ priv: pend.priv, efPar: a.ef, sid: a.s, ini: yo, res: otro, efIni: pend.ef, efRes: a.ef, soyIni: true, ahora: deps.ahora() });
      if (!s) {
        p.pendiente = null;
        return { ok: false, motivo: "clave efímera inválida" };
      }
      instalar(p, s);
      return { ok: true, respuesta: null, activa: true };
    } catch {
      return { ok: false, motivo: "no se pudo derivar la clave de sesión" };
    }
  }

  async function cifrar(otro: string, texto: string): Promise<ResultadoCifrar> {
    const p = pares.get(otro);
    if (p) limpiar(p);
    const s = p?.activa;
    if (!s) return { ok: false, motivo: "sin-sesion" };
    if (duro(s)) return { ok: false, motivo: "limite" };
    try {
      const n = s.siguiente++;
      const claro = enc.encode(texto);
      const ct = new Uint8Array(await sutil().encrypt({ name: "AES-GCM", iv: nonce(s.soyIni, n), additionalData: aad(s.sid, s.soyIni, n) }, s.kEnv, claro));
      s.enviadas += 1;
      s.bytes += claro.length;
      return { ok: true, texto: `{"t":"${TIPO_TRAMA_CIFRADA}","s":"${s.sid}","n":${n},"c":"${aB64(ct)}"}`, renovar: blando(s) };
    } catch {
      return { ok: false, motivo: "error" };
    }
  }

  async function descifrar(otro: string, texto: string): Promise<ResultadoDescifrar> {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      return { ok: false, motivo: "invalida", detalle: "trama cifrada que no es JSON" };
    }
    const n = o.n;
    if (o.t !== TIPO_TRAMA_CIFRADA || typeof o.s !== "string" || typeof o.c !== "string" || typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
      return { ok: false, motivo: "invalida", detalle: "trama cifrada mal formada" };
    }
    const p = pares.get(otro);
    if (p) limpiar(p);
    const s = [p?.activa, p?.previa].find((x) => x && x.sid === o.s);
    if (!s) return { ok: false, motivo: "desconocida", detalle: "sesión desconocida" };
    // Soy quien recibe: el sentido es el del OTRO.
    const deIni = !s.soyIni;
    if (s.vistos.has(n) || n <= s.maxVisto - VENTANA_REPETICION) return { ok: false, motivo: "invalida", detalle: "contador repetido o fuera de ventana" };
    const ct = deB64(o.c);
    if (!ct || ct.length < 16) return { ok: false, motivo: "invalida", detalle: "cifrado ilegible" };
    let claro: Uint8Array;
    try {
      claro = new Uint8Array(await sutil().decrypt({ name: "AES-GCM", iv: nonce(deIni, n), additionalData: aad(s.sid, deIni, n) }, s.kRec, ct));
    } catch {
      return { ok: false, motivo: "invalida", detalle: "la etiqueta no cuadra (trama alterada o clave distinta)" };
    }
    // Solo tras autenticar se anota el contador (una trama falsa no gasta la ventana).
    s.vistos.add(n);
    if (n > s.maxVisto) s.maxVisto = n;
    if (s.vistos.size > VENTANA_REPETICION * 2) for (const v of Array.from(s.vistos)) if (v <= s.maxVisto - VENTANA_REPETICION) s.vistos.delete(v);
    try {
      return { ok: true, texto: dec.decode(claro) };
    } catch {
      return { ok: false, motivo: "invalida", detalle: "texto no UTF-8" };
    }
  }

  return {
    iniciar,
    recibirAcuerdo,
    cifrar,
    descifrar,
    estado: (id) => {
      const p = pares.get(id);
      if (!p) return "sin";
      limpiar(p);
      return p.activa ? "activa" : p.pendiente ? "pendiente" : "sin";
    },
    tocaRenovar: (id) => {
      const p = pares.get(id);
      if (!p) return false;
      limpiar(p);
      return !!p.activa && !p.pendiente && blando(p.activa);
    },
    olvidar: (id) => {
      pares.delete(id);
    },
    info: (id) => {
      const s = pares.get(id)?.activa;
      return s ? { sesion: s.sid, tramasEnviadas: s.enviadas, bytesEnviados: s.bytes, desde: s.desde } : null;
    },
  };
}
