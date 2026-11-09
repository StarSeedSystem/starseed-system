/**
 * wifi-p2p — Wi‑Fi P2P SIN router y SIN hotspot entre neuronas, y el punto de acceso como opt-in (2026-11-09 · WFA1109A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/wifi-directo.md` §2 (tabla por pareja).
 *
 * Alex: «debe ser Wi‑Fi directo sin hotspot, más bien mesh P2P». La realidad física, sin adornos:
 *  · Android ↔ Android: P2P de verdad sin punto de acceso. Wi‑Fi Aware (NAN) primero; si falta, Wi‑Fi Direct
 *    CONCURRENTE (los dos conservan su Wi‑Fi de casa). Jamás el punto de acceso local entre dos Android.
 *  · Apple ↔ Apple: AWDL (Network.framework con peer-to-peer + Bonjour `_starseed-p2p._tcp`). Conserva la Wi‑Fi.
 *  · Mac ↔ Android: NO hay protocolo Wi‑Fi P2P común (Apple solo expone AWDL; Android, Aware/Wi‑Fi Direct). Su
 *    enlace directo es Bluetooth. La unión por punto de acceso sigue siendo posible, pero SOLO si la persona la
 *    permite («Permitir red directa por punto de acceso»), porque el Mac deja su Wi‑Fi mientras dure.
 */

import type { CapacidadesWifi, LanaWifi } from "./enlace-wifi-directo";

/* ══════════════════════════ Textos ══════════════════════════ */

/** Cómo se llama en la interfaz todo lo que es Wi‑Fi P2P sin router ni hotspot (Aware, Direct concurrente, AWDL). */
export const ETIQUETA_WIFI_P2P = "Wi‑Fi P2P (sin router ni hotspot)";
/** Cómo se llama la unión por punto de acceso (opt-in). */
export const ETIQUETA_PUNTO_ACCESO = "Red directa por punto de acceso";
export const TEXTO_PERMITIR_PUNTO_ACCESO = "Permitir red directa por punto de acceso (la Mac deja su Wi‑Fi mientras dure)";
export const DETALLE_PUNTO_ACCESO =
  "Solo para Mac ↔ Android, que no comparten ningún Wi‑Fi P2P: el Android levanta una red y la Mac se une a ella, y mientras dura la Mac no tiene internet por Wi‑Fi. Apagado por defecto: sin él, Mac ↔ Android va por Bluetooth.";

/** Las tres parejas, una línea cada una (Ajustes › Neuronas › Medios). */
export const TEXTO_PAREJAS: ReadonlyArray<{ id: "android-android" | "apple-apple" | "mac-android"; titulo: string; texto: string }> = [
  { id: "android-android", titulo: "Android ↔ Android", texto: "Wi‑Fi P2P sin router ni hotspot: Wi‑Fi Aware o, si falta, Wi‑Fi Direct concurrente. Los dos conservan su Wi‑Fi." },
  { id: "apple-apple", titulo: "Mac ↔ Mac (Apple ↔ Apple)", texto: "Wi‑Fi P2P sin router ni hotspot por AWDL. Ambos conservan su Wi‑Fi." },
  { id: "mac-android", titulo: "Mac ↔ Android", texto: "Bluetooth: no existe ningún Wi‑Fi P2P común entre los dos. El punto de acceso solo si lo permites arriba." },
];

// (MTZ1109A) `wifi-direct`: Wi‑Fi Direct estándar SIN concurrencia (Windows, Linux o un Android viejo): quien lo usa deja su Wi‑Fi de casa mientras dure.
export type LanaP2p = "wifi-aware" | "wifi-direct-concurrente" | "wifi-direct" | "awdl";

/** Orden de preferencia: Aware > Wi‑Fi Direct concurrente > AWDL (AWDL solo se da entre Apple, nunca compite). */
export const ORDEN_LANAS_P2P: readonly LanaP2p[] = ["wifi-aware", "wifi-direct-concurrente", "wifi-direct", "awdl"];

const NOMBRE_LANA: Record<LanaP2p, string> = {
  "wifi-aware": "Aware",
  "wifi-direct-concurrente": "Wi‑Fi Direct",
  "wifi-direct": "Wi‑Fi Direct",
  awdl: "AWDL",
};

export function nombreLana(l: LanaP2p): string {
  return NOMBRE_LANA[l];
}

/** La pastilla del enlace: «Wi‑Fi P2P · Aware/AWDL · sin router». */
export function textoPastillaP2p(l: LanaP2p | null): string {
  return l ? `Wi‑Fi P2P · ${NOMBRE_LANA[l]} · sin router` : "Wi‑Fi P2P · sin router";
}

export const TEXTO_PASTILLA_PUNTO_ACCESO = `${ETIQUETA_PUNTO_ACCESO} · sin router`;

/* ══════════════════════════ Carriles ══════════════════════════ */

/** Los carriles Wi‑Fi P2P que esta neurona dice tener (por lo anunciado o por sus métodos). Puro. */
export function lanasP2pDe(c: CapacidadesWifi | null | undefined): LanaP2p[] {
  if (!c) return [];
  const out = new Set<LanaP2p>();
  for (const l of c.lanas ?? []) if (l === "wifi-aware" || l === "wifi-direct-concurrente" || l === "wifi-direct" || l === "awdl") out.add(l);
  // Una app de WFD1108A (sin `lanas`) con Wi‑Fi Direct de los dos lados: se entiende como Wi‑Fi Direct.
  if (c.lanas === undefined && c.plataforma === "android" && c.ap.includes("wifi-direct") && c.cliente.includes("wifi-direct")) out.add("wifi-direct-concurrente");
  if (c.ap.includes("wifi-aware") && c.cliente.includes("wifi-aware")) out.add("wifi-aware");
  // (MTZ1109A) Wi‑Fi Direct estándar de Windows y Linux (y de un Android sin concurrencia): puede ser GO y cliente, pero deja su Wi‑Fi.
  if (!out.has("wifi-direct-concurrente") && (c.plataforma === "android" || c.plataforma === "windows" || c.plataforma === "linux") && c.ap.includes("wifi-direct") && c.cliente.includes("wifi-direct")) out.add("wifi-direct");
  return ORDEN_LANAS_P2P.filter((l) => out.has(l));
}

/** ¿Permitió la persona la red directa por punto de acceso en esa neurona? */
export function permitePuntoAcceso(c: CapacidadesWifi | null | undefined): boolean {
  return !!c?.lanas?.includes("punto-acceso-optin");
}

const APPLE = new Set(["macos", "ios"]);

/** Carriles que valen para la PAREJA (los dos los tienen; AWDL además exige que los dos sean Apple). Orden de preferencia. */
export function lanasEnComun(a: CapacidadesWifi | null | undefined, b: CapacidadesWifi | null | undefined): LanaP2p[] {
  const la = lanasP2pDe(a);
  const lb = lanasP2pDe(b);
  const esWd = (l: LanaP2p) => l === "wifi-direct" || l === "wifi-direct-concurrente";
  const out: LanaP2p[] = [];
  for (const l of ORDEN_LANAS_P2P) {
    if (l === "wifi-direct-concurrente") {
      if (la.includes(l) && lb.includes(l)) out.push(l);
    } else if (l === "wifi-direct") {
      // (MTZ1109A) Wi‑Fi Direct entre dos cualesquiera de Android/Windows/Linux; si alguna no es concurrente, esa deja su Wi‑Fi.
      if (la.some(esWd) && lb.some(esWd) && !out.includes("wifi-direct-concurrente")) out.push(l);
    } else if (la.includes(l) && lb.includes(l) && (l !== "awdl" || (APPLE.has(a?.plataforma ?? "") && APPLE.has(b?.plataforma ?? "")))) out.push(l);
  }
  return out;
}

export type DecisionPar =
  | { tipo: "p2p"; lana: LanaP2p; texto: string; /** (MTZ1109A) Alguna de las dos deja su Wi‑Fi de casa mientras dure (Wi‑Fi Direct sin concurrencia). */ dejaWifi?: boolean }
  | { tipo: "punto-acceso"; texto: string }
  | { tipo: "bluetooth"; texto: string };

/**
 * decidirParP2p — qué enlace Wi‑Fi cabe entre ESTAS dos neuronas, sin abrir nada:
 *   Android↔Android → Aware o Wi‑Fi Direct concurrente · Mac↔Mac → AWDL · Mac↔Android → Bluetooth,
 *   salvo que las DOS hayan permitido el punto de acceso. Puro.
 */
export function decidirParP2p(a: CapacidadesWifi | null | undefined, b: CapacidadesWifi | null | undefined): DecisionPar {
  const comunes = lanasEnComun(a, b);
  if (comunes.length) {
    const lana = comunes[0];
    return { tipo: "p2p", lana, texto: textoPastillaP2p(lana), ...(lana === "wifi-direct" ? { dejaWifi: true } : {}) };
  }
  if (permitePuntoAcceso(a) && permitePuntoAcceso(b) && a && b && (a.cliente.length || a.ap.length) && (b.cliente.length || b.ap.length)) {
    return { tipo: "punto-acceso", texto: `${ETIQUETA_PUNTO_ACCESO}: una neurona deja su Wi‑Fi mientras dure` };
  }
  return { tipo: "bluetooth", texto: "Entre estos dos aparatos no hay Wi‑Fi P2P sin hotspot: se sigue por Bluetooth" };
}

/**
 * Con SOLO lo propio (el otro aún no dijo qué puede): ¿merece la pena ofrecer? Un Mac sin permiso de punto de
 * acceso nunca ofrece (AWDL se conecta solo con otros Mac, no se «abre»): no se le molesta con ningún aviso de Wi‑Fi.
 */
export function puedeOfrecerSinSaberDelOtro(propia: CapacidadesWifi | null | undefined): boolean {
  if (!propia) return false;
  if (permitePuntoAcceso(propia)) return true;
  return lanasP2pDe(propia).some((l) => l !== "awdl");
}

/* ══════════════════════════ Capacidades en el saludo ══════════════════════════ */

/** Las capacidades que se anuncian en el saludo de la neurona (cadenas estables, compatibles hacia atrás). */
export function capacidadesDeSaludo(c: CapacidadesWifi | null | undefined): LanaWifi[] {
  const out: LanaWifi[] = [...lanasP2pDe(c)];
  if (permitePuntoAcceso(c)) out.push("punto-acceso-optin");
  return out;
}

/** Lee las `lanas` de un saludo ajeno: lo que no se entiende, fuera. */
export function leerLanasDeSaludo(x: unknown): LanaWifi[] {
  if (!Array.isArray(x)) return [];
  const validas: readonly string[] = ["wifi-aware", "wifi-direct-concurrente", "awdl", "punto-acceso-optin"];
  return Array.from(new Set(x.filter((v): v is LanaWifi => typeof v === "string" && validas.includes(v))));
}

/** Suma el opt-in y los carriles de la parte nativa a las capacidades (el opt-in vive en la interfaz). Puro. */
export function conLanas(c: CapacidadesWifi, optin: boolean): CapacidadesWifi {
  const lanas = new Set<LanaWifi>([...(c.lanas ?? []).filter((l) => l !== "punto-acceso-optin"), ...lanasP2pDe(c)]);
  if (optin) lanas.add("punto-acceso-optin");
  return { ...c, lanas: Array.from(lanas) };
}

/* ══════════════════════════ Opt-in del punto de acceso (con migración) ══════════════════════════ */

export const CLAVE_PUNTO_ACCESO = "starseed.neuronas.medios.punto-acceso.v1";
export const CLAVE_MARCA_PUNTO_ACCESO = "starseed.neuronas.medios.punto-acceso.migracion";
/** Sube cuando cambia el defecto (y hay que revisar lo ya guardado). */
export const VERSION_PUNTO_ACCESO = 1;
export const PUNTO_ACCESO_POR_DEFECTO = false;

export function leerPuntoAcceso(raw: string | null | undefined): boolean {
  return raw === "1" || raw === "true" ? true : PUNTO_ACCESO_POR_DEFECTO;
}

export interface PlanPuntoAcceso {
  /** Valor a guardar (null: no se toca). */
  valor: "0" | null;
  /** Marca a guardar (null: ya estaba al día). */
  marca: string | null;
}

/**
 * Migración (una vez por versión): hasta WFD1108A el punto de acceso era el camino normal de Mac ↔ Android
 * (el ajuste «Automático»/«Preguntar» lo abría). Desde WFA1109A es un permiso APARTE y apagado: quien no lo ha
 * tocado queda en «no», aunque tuviera «Automático». Una elección HECHA después de la migración (marca al día)
 * nunca se cambia. Puro.
 */
export function planMigracionPuntoAcceso(marcaRaw: string | null | undefined, valorRaw: string | null | undefined): PlanPuntoAcceso {
  const v = Number(marcaRaw);
  if (Number.isFinite(v) && v >= VERSION_PUNTO_ACCESO) return { valor: null, marca: null };
  return { valor: valorRaw === "0" ? null : "0", marca: String(VERSION_PUNTO_ACCESO) };
}

/* ══════════════════════════ Direcciones P2P ══════════════════════════ */

/** Puerto del canal TCP en IPv6 de enlace local (Aware): el mismo protocolo que 47071, otro socket. */
export const PUERTO_CANAL_P2P_V6 = 47073;
const RE_AWDL = /^awdl:([a-z0-9]{6,32})$/;

/** `awdl:<id>`: la dirección virtual de un vecino Apple por AWDL (Espejo de `direccion_awdl` en Rust). */
export function direccionAwdl(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = RE_AWDL.exec(x.trim().toLowerCase());
  return m ? `awdl:${m[1]}` : null;
}

export function esDireccionAwdl(x: unknown): boolean {
  return direccionAwdl(x) !== null;
}
