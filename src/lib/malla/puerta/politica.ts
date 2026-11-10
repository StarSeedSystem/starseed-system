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

/* ───────── PTA1110B · ámbitos de confianza: mis neuronas / grupos / otras cuentas / pública ───────── */
/** A quién se sirve (o de quién se usa). Orden de confianza: mias > grupo > otras > publica. */
export type Ambito = "mias" | "grupo" | "otras" | "publica";
export const RANGO_AMBITO: Readonly<Record<Ambito, number>> = { mias: 4, grupo: 3, otras: 2, publica: 1 };
export interface AmbitoSolicitud {
  ambito: Ambito;
  /** Id del grupo o comunidad cuando `ambito` es «grupo». */
  grupo?: string;
}
export type ModoGrupo = "nunca" | "preguntar" | "automatico";
/** «Compartir internet con este grupo» (`compartir`) y su espejo «Usar el de este grupo» (`usar`). */
export interface AjusteGrupo {
  nombre?: string;
  compartir: ModoGrupo;
  usar: ModoGrupo;
  /** Neuronas que ESTA neurona sabe que son del grupo (lista guardada cuando hubo red). Sin prueba criptográfica offline todavía. */
  miembros: string[];
  topes: TopesCompartir;
}
/** Capa pública: apagada por defecto en los dos sentidos y con topes mínimos. */
export interface AjustePublico {
  /** «Ofrecer mi internet a cualquier neurona StarSeed cercana». */
  ofrecer: boolean;
  /** «Usar puertas públicas». */
  usar: boolean;
  topes: TopesCompartir;
}
/** Compartir por datos móviles (red medida): Nunca / Preguntar / Sí, con tope diario. */
export type ModoMovil = "nunca" | "preguntar" | "si";
export interface AjusteMovil {
  modo: ModoMovil;
  /** Bytes al día que se sirven por la red medida cuando `modo` es «si». */
  bytesDia: number;
}
/** Puertos que una puerta PÚBLICA sirve (la web corriente; nada más, ni preguntando). */
export const PUERTOS_PUBLICA: readonly number[] = [80, 443, 8080, 8443];

export interface AjustesPuerta {
  v: 1;
  /** PTA1110B · Ajuste por grupo o comunidad (id → ajuste). */
  grupos: Record<string, AjusteGrupo>;
  /** PTA1110B · Capa pública (apagada por defecto). */
  publica: AjustePublico;
  /** PTA1110B · Compartir por datos móviles. */
  datosMoviles: AjusteMovil;
  /** PTA1110B · Respuestas recordadas de «¿compartir datos móviles con esta neurona?». */
  movilRecordadas: Record<string, "permitir" | "denegar">;
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

const TOPES_GRUPO_POR_DEFECTO: TopesCompartir = { bytesDia: 500 * MIB, bateriaMin: 0.3, permitirRedMedida: false, maxTuneles: 6 };
const TOPES_PUBLICA_POR_DEFECTO: TopesCompartir = { bytesDia: 20 * MIB, bateriaMin: 0.5, permitirRedMedida: false, maxTuneles: 2 };

export const AJUSTES_PUERTA_POR_DEFECTO: AjustesPuerta = {
  v: 1,
  grupos: {},
  publica: { ofrecer: false, usar: false, topes: { ...TOPES_PUBLICA_POR_DEFECTO } },
  datosMoviles: { modo: "nunca", bytesDia: 200 * MIB },
  movilRecordadas: {},
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
  // PTA1110B · MIGRACIÓN: quien ya tenía «permitir red medida» en sus topes pasa a «Sí, con tope» con ese mismo tope; el resto, «Nunca».
  const topesMias = topes(o.topesMias, d.topesMias);
  const topesOtras = topes(o.topesOtras, d.topesOtras);
  const om = (o.datosMoviles && typeof o.datosMoviles === "object" ? o.datosMoviles : {}) as Record<string, unknown>;
  const legado = topesMias.permitirRedMedida || topesOtras.permitirRedMedida;
  const datosMoviles: AjusteMovil = {
    modo: om.modo === "nunca" || om.modo === "preguntar" || om.modo === "si" ? om.modo : legado ? "si" : d.datosMoviles.modo,
    bytesDia: numero(om.bytesDia, legado ? Math.min(topesMias.bytesDia, topesOtras.bytesDia) : d.datosMoviles.bytesDia, 0, 1024 * 1024 * MIB),
  };
  const movilRecordadas: Record<string, "permitir" | "denegar"> = {};
  if (o.movilRecordadas && typeof o.movilRecordadas === "object") {
    for (const [k, v] of Object.entries(o.movilRecordadas as Record<string, unknown>).slice(0, 200)) if (v === "permitir" || v === "denegar") movilRecordadas[k] = v;
  }
  const op = (o.publica && typeof o.publica === "object" ? o.publica : {}) as Record<string, unknown>;
  const publica: AjustePublico = {
    ofrecer: op.ofrecer === true,
    usar: op.usar === true,
    // Los topes públicos nunca superan los de una cuenta ajena y nunca permiten red medida.
    topes: { ...topes(op.topes, TOPES_PUBLICA_POR_DEFECTO), permitirRedMedida: false },
  };
  const grupos: Record<string, AjusteGrupo> = {};
  if (o.grupos && typeof o.grupos === "object") {
    for (const [gid, raw] of Object.entries(o.grupos as Record<string, unknown>).slice(0, 100)) {
      if (!gid || gid.length > 80 || !raw || typeof raw !== "object") continue;
      const g = raw as Record<string, unknown>;
      const modo = (x: unknown): ModoGrupo => (x === "nunca" || x === "automatico" || x === "preguntar" ? x : "preguntar");
      grupos[gid] = {
        ...(typeof g.nombre === "string" && g.nombre ? { nombre: g.nombre.slice(0, 80) } : {}),
        compartir: modo(g.compartir),
        usar: modo(g.usar),
        miembros: textos(g.miembros, 500),
        topes: topes(g.topes, TOPES_GRUPO_POR_DEFECTO),
      };
    }
  }
  return {
    v: 1,
    grupos,
    publica,
    datosMoviles,
    movilRecordadas,
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
    // PTA1110B: la red medida la gobierna `datosMoviles`; el campo viejo queda en falso (ya está migrado arriba).
    topesMias: { ...topesMias, permitirRedMedida: false },
    topesOtras: { ...topesOtras, permitirRedMedida: false },
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
  /** PTA1110B · Ámbito ya resuelto (ver `ambitoEfectivo`). Sin él: «mias» si `mismaCuenta`, si no «otras». */
  ambito?: Ambito;
  /** PTA1110B · Grupo o comunidad cuando `ambito` es «grupo». */
  grupo?: string;
}

export interface EstadoPropio {
  conInternet: boolean;
  bateria: number | null;
  cargando: boolean;
  /** La salida actual es una red medida (datos móviles, tethering). */
  medida: boolean;
}

export type MotivoDecision =
  | "ok" | "apagada" | "revocada" | "sin-internet" | "bateria" | "red-medida" | "cuota" | "tuneles" | "otra-cuenta" | "pregunta"
  | "datos-moviles" | "tope-movil"; // PTA1110B

export interface Decision {
  veredicto: "permitir" | "preguntar" | "denegar";
  motivo: MotivoDecision;
  /** Topes que se le aplican si se permite. */
  topes: TopesCompartir;
}

/** PTA1110B · Los topes que valen para un ámbito. */
export function topesDeAmbito(aj: AjustesPuerta, ambito: Ambito, grupo?: string): TopesCompartir {
  if (ambito === "mias") return aj.topesMias;
  if (ambito === "publica") return aj.publica.topes;
  if (ambito === "grupo" && grupo && aj.grupos[grupo]) return aj.grupos[grupo].topes;
  return aj.topesOtras;
}

/** Decide si esta neurona sirve a `s` AHORA. No cuenta cuotas por sí sola: recibe lo gastado. */
export function decidirServir(
  aj: AjustesPuerta,
  s: Solicitante,
  est: EstadoPropio,
  uso: { bytesHoyGrupo: number; tunelesGrupo: number; /** PTA1110B · bytes servidos hoy por red medida */ bytesMovilHoy?: number },
): Decision {
  const amb: Ambito = s.ambito ?? (s.mismaCuenta ? "mias" : "otras");
  const cfgG = amb === "grupo" && s.grupo ? aj.grupos[s.grupo] : undefined;
  const t = topesDeAmbito(aj, amb, s.grupo);
  const no = (motivo: MotivoDecision): Decision => ({ veredicto: "denegar", motivo, topes: t });
  if (aj.revocadas.includes(s.id)) return no("revocada");
  if (amb === "mias" && !aj.misNeuronas) return no("apagada");
  if (amb === "publica" && !aj.publica.ofrecer) return no("apagada");
  if (amb === "grupo" && (!cfgG || cfgG.compartir === "nunca")) return no("apagada");
  if (amb === "otras" && !s.publico && aj.otrasCuentas === "nunca") return no("apagada");
  if (!est.conInternet) return no("sin-internet");
  if (!est.cargando && est.bateria !== null && est.bateria < t.bateriaMin) return no("bateria");
  if (est.medida) {
    // PTA1110B · «Compartir también por datos móviles»: Nunca / Preguntar / Sí con tope. Lo público jamás sale por datos móviles.
    const modo: ModoMovil = amb === "publica" ? "nunca" : t.permitirRedMedida ? "si" : aj.datosMoviles.modo;
    if (modo === "nunca") return no("red-medida");
    if (modo === "preguntar") {
      const r = aj.movilRecordadas[s.id];
      if (r === "denegar") return no("red-medida");
      if (r !== "permitir") return { veredicto: "preguntar", motivo: "datos-moviles", topes: t };
    } else if ((uso.bytesMovilHoy ?? 0) >= aj.datosMoviles.bytesDia) return no("tope-movil");
  }
  if (uso.bytesHoyGrupo >= t.bytesDia) return no("cuota");
  if (uso.tunelesGrupo >= t.maxTuneles) return no("tuneles");
  if (amb === "mias" || amb === "publica" || s.publico) return { veredicto: "permitir", motivo: "ok", topes: t };
  const r = aj.recordadas[s.id];
  if (r === "denegar") return no("otra-cuenta");
  if (amb === "grupo") {
    if (r === "permitir" || cfgG?.compartir === "automatico") return { veredicto: "permitir", motivo: "ok", topes: t };
    return { veredicto: "preguntar", motivo: "pregunta", topes: t };
  }
  if (r === "permitir" || aj.otrasCuentas === "automatico") return { veredicto: "permitir", motivo: "ok", topes: t };
  return { veredicto: "preguntar", motivo: "pregunta", topes: t };
}

/* ───────────────────────── PTA1110B · ámbito del solicitante y de la puerta ───────────────────────── */

const PERMISIVIDAD: Record<ModoGrupo, number> = { automatico: 2, preguntar: 1, nunca: 0 };

/**
 * Ámbito de una vecina DIRECTA respecto a mí: la misma cuenta (probada), un grupo en cuya lista de miembros está, u otra.
 * Si está en varios grupos manda el más permisivo para `lado`.
 */
export function ambitoDeVecina(aj: AjustesPuerta, v: { id: string; mismaCuenta: boolean }, lado: "compartir" | "usar" = "compartir"): AmbitoSolicitud {
  if (v.mismaCuenta) return { ambito: "mias" };
  let mejor: string | null = null;
  for (const [gid, g] of Object.entries(aj.grupos)) {
    if (!g.miembros.includes(v.id)) continue;
    if (mejor === null || PERMISIVIDAD[g[lado]] > PERMISIVIDAD[aj.grupos[mejor][lado]]) mejor = gid;
  }
  return mejor ? { ambito: "grupo", grupo: mejor } : { ambito: "otras" };
}

const AMBITOS: readonly Ambito[] = ["mias", "grupo", "otras", "publica"];

/**
 * PTA1110B · Ámbito con el que esta neurona atiende una apertura. Una cadena NUNCA ensancha la confianza:
 *  · directa (el que abre es mi vecina): manda lo que YO sé de ella; solo puede declararse «pública» si no es de los míos ni de un grupo.
 *  · reenviada: lo declarado por la vecina (`am`/`g`) se recorta a lo que YO sé de la vecina. «mias» exige `mc` Y vecina de mi cuenta;
 *    «grupo» exige una vecina de mi cuenta (que lo garantiza) o de ESE mismo grupo; si no, baja a «otras»/«pública».
 */
export function ambitoEfectivo(
  aj: AjustesPuerta,
  vecina: { id: string; mismaCuenta: boolean },
  t: { directa: boolean; mc: boolean; am?: unknown; g?: unknown },
): AmbitoSolicitud {
  const r = ambitoEfectivoBruto(aj, vecina, t);
  // La capa pública solo existe si ESTA neurona la ofrece; si no, quien la reclama es «otra cuenta» (la política de siempre: Preguntar).
  return r.ambito === "publica" && !aj.publica.ofrecer ? { ambito: "otras" } : r;
}

function ambitoEfectivoBruto(
  aj: AjustesPuerta,
  vecina: { id: string; mismaCuenta: boolean },
  t: { directa: boolean; mc: boolean; am?: unknown; g?: unknown },
): AmbitoSolicitud {
  const propio = ambitoDeVecina(aj, vecina);
  const declarado: Ambito = typeof t.am === "string" && (AMBITOS as readonly string[]).includes(t.am) ? (t.am as Ambito) : t.mc ? "mias" : "otras";
  const grupoDecl = typeof t.g === "string" && t.g.length <= 80 ? t.g : undefined;
  if (t.directa) {
    if (propio.ambito === "otras" && declarado === "publica") return { ambito: "publica" };
    return propio;
  }
  // Reenviada.
  if (declarado === "mias") {
    return t.mc && vecina.mismaCuenta ? { ambito: "mias" } : propio.ambito === "grupo" ? propio : { ambito: "otras" };
  }
  if (declarado === "grupo") {
    if (propio.ambito === "mias") return grupoDecl && aj.grupos[grupoDecl] ? { ambito: "grupo", grupo: grupoDecl } : { ambito: "publica" };
    if (propio.ambito === "grupo") return grupoDecl === propio.grupo ? propio : { ambito: "publica" };
    return { ambito: "otras" };
  }
  // «otras» o «pública» declaradas: nunca suben; no pasan de lo que la vecina permite.
  if (declarado === "otras") return propio.ambito === "otras" || propio.ambito === "grupo" || propio.ambito === "mias" ? { ambito: "otras" } : { ambito: "publica" };
  return { ambito: "publica" };
}

/**
 * PTA1110B · El espejo: ¿puedo USAR esta puerta? Devuelve el ámbito en que la usaría y si la política lo deja.
 * `via` es mi vecina directa por la que llego; `puerta` el anuncio de la dueña de la salida.
 */
export function ambitoDePuerta(
  aj: AjustesPuerta,
  e: { vecino: string; anuncio: { id: string; uid?: string; publica?: boolean; op?: boolean } },
  ctx: { miCuenta: string | null; vecinoMismaCuenta: (id: string) => boolean },
): AmbitoSolicitud & { permitido: boolean; preguntar: boolean } {
  const vMia = ctx.vecinoMismaCuenta(e.vecino);
  const directa = e.vecino === e.anuncio.id;
  // Una puerta es «mía» si llego a ella por una vecina mía (que garantiza) y dice ser de mi cuenta, o es esa vecina.
  const esMia = directa ? vMia : vMia && !!ctx.miCuenta && e.anuncio.uid === ctx.miCuenta;
  if (esMia) return { ambito: "mias", permitido: aj.usarPuertas && aj.modoUso !== "nunca", preguntar: aj.modoUso === "preguntar" };
  const g = ambitoDeVecina(aj, { id: e.anuncio.id, mismaCuenta: false }, "usar");
  if (g.ambito === "grupo" && g.grupo) {
    const modo = aj.grupos[g.grupo].usar;
    // Solo se confía en la lista de miembros si la puerta es vecina directa o llegamos por una neurona mía.
    if (directa || vMia) return { ...g, permitido: modo !== "nunca", preguntar: modo === "preguntar" };
  }
  // Cualquier otra puerta (de otra cuenta, sin grupo común) cuenta como pública: solo con «Usar puertas públicas».
  return { ambito: "publica", permitido: aj.publica.usar, preguntar: false };
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
