/**
 * puerta/politica — qué comparte esta neurona y con quién (PTA1108A · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Puro: sin red ni DOM (el almacenamiento se inyecta).
 *
 *  · Entre neuronas de la MISMA cuenta: compartir internet está ENCENDIDO por defecto, con topes (datos al día,
 *    batería mínima, red medida).
 *  · Con OTRAS cuentas o público: ajuste del dueño «Nunca / Preguntar / Automático»; por defecto «Preguntar».
 *    Si nadie contesta (no hay interfaz), se deniega.
 *  · Las puertas públicas de StarSeed y los routers configurados como públicos cuentan como permitidos.
 */

import type { TipoCapa } from "@/lib/malla/puerta/capas";

export type ModoOtrasCuentas = "nunca" | "preguntar" | "automatico";

/* ───────── PTA1110A · «Usar el internet de mis neuronas» ───────── */
export type ModoUso = "automatico" | "preguntar" | "nunca";
export type PoliticaOtrosPuertos = "preguntar" | "nunca" | "siempre";
/** Qué hacer con una descarga grande por un carril lento: se pregunta una vez y se recuerda. */
export type EleccionGrande = "preguntar" | "continuar" | "esperar" | "solo-wifi";
export type TipoUso = "navegacion" | "datos" | "descargas" | "actualizaciones" | "ia" | "capas";
export const TIPOS_USO: readonly TipoUso[] = ["navegacion", "datos", "descargas", "actualizaciones", "ia", "capas"];
export type UsosPuerta = Record<TipoUso, boolean>;
export type Carril = "bluetooth" | "wifiP2p" | "redLocal";
export type CarrilesPuerta = Record<Carril, boolean>;
/** Puertos de la web corriente: http, https y los alternativos más comunes. */
export const PUERTOS_WEB_POR_DEFECTO: readonly number[] = [80, 443, 8080, 8443];
/** Nunca por una puerta, diga lo que diga la política (correo saliente, SMB/NetBIOS, RDP, telnet). */
export const PUERTOS_NUNCA: ReadonlySet<number> = new Set([23, 25, 135, 137, 138, 139, 445, 465, 587, 3389]);

export interface TopesCompartir {
  /** Bytes que se sirven al día a todos los solicitantes de este grupo. */
  bytesDia: number;
  /** Batería mínima (0..1) para servir sin estar cargando. */
  bateriaMin: number;
  /** ¿Se comparte aunque la salida sea una red medida (datos móviles)? */
  permitirRedMedida: boolean;
  /** Túneles abiertos a la vez. */
  maxTuneles: number;
}

export interface AjustesPuerta {
  v: 1;
  /** «Compartir mi internet con mis neuronas». */
  misNeuronas: boolean;
  /** «… con otras cuentas». */
  otrasCuentas: ModoOtrasCuentas;
  /** Usar la puerta de otra neurona cuando esta no tenga internet. */
  usarPuertas: boolean;
  topesMias: TopesCompartir;
  topesOtras: TopesCompartir;
  /** Puertos de salida EXTRA permitidos (además de `puertosWeb`). */
  puertos: number[];
  /** PTA1110A · «Usar el internet de mis neuronas»: Automático / Preguntar / Nunca (`usarPuertas` = distinto de «nunca»). */
  modoUso: ModoUso;
  /** PTA1110A · Qué puede salir por la malla cuando no hay internet propio. */
  usos: UsosPuerta;
  /** PTA1110A · Por qué carriles puede ir (Bluetooth, Wi‑Fi directo, red local). */
  carriles: CarrilesPuerta;
  /** PTA1110A · Puertos de la web (http/https y alternativos) abiertos a destinos PÚBLICOS. */
  puertosWeb: number[];
  /** PTA1110A · Cualquier otro puerto público: Preguntar (por defecto) / Nunca / Siempre. */
  otrosPuertos: PoliticaOtrosPuertos;
  /** PTA1110A · Respuesta recordada a «descarga grande por un carril lento». */
  grandeLento: EleccionGrande;
  /** PTA1110A · Capa «IA de esta neurona»: servidores de IA locales de ESTA neurona para las de la misma cuenta. */
  compartirIaNeurona: boolean;
  /** OBSOLETO desde PTA1108C: ya no abre nada por sí solo. Lo privado solo se alcanza por capas concedidas (`capas.ts`). */
  permitirRedPrivada: boolean;
  /** PTA1108C · «Compartir mis servidores propios con mis neuronas». ENCENDIDO por defecto. */
  compartirServidoresPropios: boolean;
  /** PTA1108C · «Compartir mi red local con mis neuronas». APAGADO por defecto. */
  compartirRedLocal: boolean;
  /** PTA1108C · Permiso explícito por neurona (de otra cuenta) a tipos de capa. Nunca por defecto. */
  capasPorNeurona: Record<string, TipoCapa[]>;
  /** Hosts a los que una cuenta ajena puede llegar en modo «Automático» (vacío = cualquiera público). */
  hostsParaOtras: string[];
  /** Neuronas con acceso revocado. */
  revocadas: string[];
  /** Respuestas recordadas del «Preguntar» (id de neurona → decisión). */
  recordadas: Record<string, "permitir" | "denegar">;
}

const MIB = 1024 * 1024;

export const AJUSTES_PUERTA_POR_DEFECTO: AjustesPuerta = {
  v: 1,
  misNeuronas: true,
  otrasCuentas: "preguntar",
  usarPuertas: true,
  topesMias: { bytesDia: 2048 * MIB, bateriaMin: 0.2, permitirRedMedida: false, maxTuneles: 16 },
  topesOtras: { bytesDia: 100 * MIB, bateriaMin: 0.4, permitirRedMedida: false, maxTuneles: 4 },
  puertos: [443],
  modoUso: "automatico",
  usos: { navegacion: true, datos: true, descargas: true, actualizaciones: true, ia: true, capas: true },
  carriles: { bluetooth: true, wifiP2p: true, redLocal: true },
  puertosWeb: [...PUERTOS_WEB_POR_DEFECTO],
  otrosPuertos: "preguntar",
  grandeLento: "preguntar",
  compartirIaNeurona: true,
  permitirRedPrivada: false,
  compartirServidoresPropios: true,
  compartirRedLocal: false,
  capasPorNeurona: {},
  hostsParaOtras: [],
  revocadas: [],
  recordadas: {},
};

export const CLAVE_AJUSTES_PUERTA = "starseed.malla.puerta.v1";

type Almacen = Pick<Storage, "getItem" | "setItem">;

function numero(x: unknown, def: number, min: number, max: number): number {
  return typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
}

function topes(x: unknown, def: TopesCompartir): TopesCompartir {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    bytesDia: numero(o.bytesDia, def.bytesDia, 0, 1024 * 1024 * MIB),
    bateriaMin: numero(o.bateriaMin, def.bateriaMin, 0, 1),
    permitirRedMedida: typeof o.permitirRedMedida === "boolean" ? o.permitirRedMedida : def.permitirRedMedida,
    maxTuneles: Math.round(numero(o.maxTuneles, def.maxTuneles, 1, 64)),
  };
}

const textos = (x: unknown, max: number): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 255).slice(0, max) : [];

const TIPOS_VALIDOS: readonly TipoCapa[] = ["servidor-propio", "lan", "router-publico"]; // `ia-neurona` nunca se concede a otra cuenta (PTA1110A)

function capasNeurona(x: unknown): Record<string, TipoCapa[]> {
  const out: Record<string, TipoCapa[]> = {};
  if (!x || typeof x !== "object") return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, 200)) {
    if (!k || k.length > 80 || !Array.isArray(v)) continue;
    const tipos = v.filter((t): t is TipoCapa => TIPOS_VALIDOS.includes(t as TipoCapa));
    if (tipos.length) out[k] = [...new Set(tipos)];
  }
  return out;
}

/** Normaliza lo guardado: cualquier campo que no sirva vuelve a su valor por defecto. */
export function interpretarAjustes(texto: string | null | undefined): AjustesPuerta {
  const d = AJUSTES_PUERTA_POR_DEFECTO;
  let o: Record<string, unknown> = {};
  try {
    const p = texto ? JSON.parse(texto) : null;
    if (p && typeof p === "object") o = p as Record<string, unknown>;
  } catch {
    /* ajustes rotos: por defecto */
  }
  const rec: Record<string, "permitir" | "denegar"> = {};
  if (o.recordadas && typeof o.recordadas === "object") {
    for (const [k, v] of Object.entries(o.recordadas as Record<string, unknown>).slice(0, 200)) {
      if (v === "permitir" || v === "denegar") rec[k] = v;
    }
  }
  const puertos = Array.isArray(o.puertos) ? o.puertos.filter((n): n is number => Number.isInteger(n) && n > 0 && n < 65536).slice(0, 8) : [];
  // PTA1110A · MIGRACIÓN: lo guardado antes de esta versión no trae los campos nuevos. `usarPuertas:false` pasa a «Nunca»;
  // los puertos web se SUMAN siempre a lo que hubiera (quien tenía solo 443 ahora también abre 80/8080/8443 a destinos públicos).
  const modoUso: ModoUso = o.modoUso === "automatico" || o.modoUso === "preguntar" || o.modoUso === "nunca" ? o.modoUso : o.usarPuertas === false ? "nunca" : d.modoUso;
  const usos = { ...d.usos };
  const ou = (o.usos && typeof o.usos === "object" ? o.usos : {}) as Record<string, unknown>;
  for (const k of TIPOS_USO) if (typeof ou[k] === "boolean") usos[k] = ou[k] as boolean;
  const carriles = { ...d.carriles };
  const oc = (o.carriles && typeof o.carriles === "object" ? o.carriles : {}) as Record<string, unknown>;
  for (const k of ["bluetooth", "wifiP2p", "redLocal"] as const) if (typeof oc[k] === "boolean") carriles[k] = oc[k] as boolean;
  const web = Array.isArray(o.puertosWeb) ? o.puertosWeb.filter((n): n is number => Number.isInteger(n) && n > 0 && n < 65536 && !PUERTOS_NUNCA.has(n)).slice(0, 12) : [];
  return {
    v: 1,
    modoUso,
    usos,
    carriles,
    puertosWeb: [...new Set([...PUERTOS_WEB_POR_DEFECTO, ...web])],
    otrosPuertos: o.otrosPuertos === "nunca" || o.otrosPuertos === "siempre" || o.otrosPuertos === "preguntar" ? o.otrosPuertos : d.otrosPuertos,
    grandeLento: o.grandeLento === "continuar" || o.grandeLento === "esperar" || o.grandeLento === "solo-wifi" || o.grandeLento === "preguntar" ? o.grandeLento : d.grandeLento,
    compartirIaNeurona: typeof o.compartirIaNeurona === "boolean" ? o.compartirIaNeurona : d.compartirIaNeurona,
    misNeuronas: typeof o.misNeuronas === "boolean" ? o.misNeuronas : d.misNeuronas,
    otrasCuentas: o.otrasCuentas === "nunca" || o.otrasCuentas === "automatico" || o.otrasCuentas === "preguntar" ? o.otrasCuentas : d.otrasCuentas,
    usarPuertas: modoUso !== "nunca" && (typeof o.usarPuertas === "boolean" ? o.usarPuertas : d.usarPuertas),
    topesMias: topes(o.topesMias, d.topesMias),
    topesOtras: topes(o.topesOtras, d.topesOtras),
    puertos: puertos.length ? puertos : [...d.puertos],
    permitirRedPrivada: o.permitirRedPrivada === true,
    compartirServidoresPropios: typeof o.compartirServidoresPropios === "boolean" ? o.compartirServidoresPropios : d.compartirServidoresPropios,
    compartirRedLocal: o.compartirRedLocal === true,
    capasPorNeurona: capasNeurona(o.capasPorNeurona),
    hostsParaOtras: textos(o.hostsParaOtras, 64),
    revocadas: textos(o.revocadas, 200),
    recordadas: rec,
  };
}

export function leerAjustesPuerta(almacen?: Almacen | null): AjustesPuerta {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return interpretarAjustes(s?.getItem(CLAVE_AJUSTES_PUERTA));
  } catch {
    return interpretarAjustes(null);
  }
}

export function guardarAjustesPuerta(a: AjustesPuerta, almacen?: Almacen | null): boolean {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return false;
    s.setItem(CLAVE_AJUSTES_PUERTA, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

/* ───────────────────────── Decisión ───────────────────────── */

export interface Solicitante {
  /** Id de la neurona que pide (la de origen del túnel, no el vecino que lo reenvía). */
  id: string;
  /** Prueba de misma cuenta (certificado o huella guardada). */
  mismaCuenta: boolean;
  /** Puerta pública de StarSeed o router declarado público. */
  publico?: boolean;
}

export interface EstadoPropio {
  conInternet: boolean;
  bateria: number | null;
  cargando: boolean;
  /** La salida actual es una red medida (datos móviles, tethering). */
  medida: boolean;
}

export type MotivoDecision = "ok" | "apagada" | "revocada" | "sin-internet" | "bateria" | "red-medida" | "cuota" | "tuneles" | "otra-cuenta" | "pregunta";

export interface Decision {
  veredicto: "permitir" | "preguntar" | "denegar";
  motivo: MotivoDecision;
  /** Topes que se le aplican si se permite. */
  topes: TopesCompartir;
}

/** Decide si esta neurona sirve a `s` AHORA. No cuenta cuotas por sí sola: recibe lo gastado. */
export function decidirServir(
  aj: AjustesPuerta,
  s: Solicitante,
  est: EstadoPropio,
  uso: { bytesHoyGrupo: number; tunelesGrupo: number },
): Decision {
  const propia = s.mismaCuenta;
  const t = propia ? aj.topesMias : aj.topesOtras;
  const no = (motivo: MotivoDecision): Decision => ({ veredicto: "denegar", motivo, topes: t });
  if (aj.revocadas.includes(s.id)) return no("revocada");
  if (propia && !aj.misNeuronas) return no("apagada");
  if (!propia && !s.publico && aj.otrasCuentas === "nunca") return no("apagada");
  if (!est.conInternet) return no("sin-internet");
  if (!est.cargando && est.bateria !== null && est.bateria < t.bateriaMin) return no("bateria");
  if (est.medida && !t.permitirRedMedida) return no("red-medida");
  if (uso.bytesHoyGrupo >= t.bytesDia) return no("cuota");
  if (uso.tunelesGrupo >= t.maxTuneles) return no("tuneles");
  if (propia || s.publico) return { veredicto: "permitir", motivo: "ok", topes: t };
  const r = aj.recordadas[s.id];
  if (r === "denegar") return no("otra-cuenta");
  if (r === "permitir" || aj.otrasCuentas === "automatico") return { veredicto: "permitir", motivo: "ok", topes: t };
  return { veredicto: "preguntar", motivo: "pregunta", topes: t };
}

/** ¿Puede una cuenta ajena en modo «Automático» llegar a este host? Vacío = cualquier público. */
export function hostPermitidoParaOtras(aj: AjustesPuerta, host: string): boolean {
  if (!aj.hostsParaOtras.length) return true;
  const h = host.toLowerCase();
  return aj.hostsParaOtras.some((p) => {
    const q = p.toLowerCase();
    return q.startsWith("*.") ? h.endsWith(q.slice(1)) : h === q;
  });
}


/* ───────────────────────── PTA1110A · puertos y carriles ───────────────────────── */

export type VeredictoPuerto = "si" | "preguntar" | "no";

/** ¿Se puede salir a ese puerto de un destino PÚBLICO? Los destinos privados no pasan por aquí (los gobiernan las capas). */
export function veredictoPuerto(aj: Pick<AjustesPuerta, "puertos" | "puertosWeb" | "otrosPuertos">, puerto: number): VeredictoPuerto {
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535 || PUERTOS_NUNCA.has(puerto)) return "no";
  if (aj.puertosWeb.includes(puerto) || aj.puertos.includes(puerto)) return "si";
  return aj.otrosPuertos === "siempre" ? "si" : aj.otrosPuertos === "nunca" ? "no" : "preguntar";
}

/** Carril de ajustes al que pertenece un enlace del transporte universal (`null` = sin restricción: malla de la cuenta, par, relé). */
export function carrilDeEnlace(tipoEnlace: string, etiqueta = ""): Carril | null {
  if (tipoEnlace === "ble") return "bluetooth";
  if (tipoEnlace === "local" || tipoEnlace === "nativo") return /wi.?fi (directo|aware|p2p)|awdl|aware/i.test(etiqueta) ? "wifiP2p" : "redLocal";
  return null;
}

export const carrilPermitido = (aj: Pick<AjustesPuerta, "carriles">, tipoEnlace: string, etiqueta = ""): boolean => {
  const c = carrilDeEnlace(tipoEnlace, etiqueta);
  return c === null || aj.carriles[c];
};
