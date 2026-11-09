/**
 * enlace-wifi-orquestacion — CUÁNDO abrir el enlace Wi-Fi directo y CÓMO se dice en la interfaz (2026-11-08 · WFD1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/wifi-directo.md` §5.
 *
 *   · `decidirEnlaceWifi`: un archivo grande, una llamada, la pantalla o una transmisión hacia una neurona
 *     VECINA (proximidad probada: Bluetooth LE u otra prueba) que el enlace de ahora no aguanta → según el
 *     ajuste «Ajustes › Neuronas › Medios» (Automático / Preguntar / Nunca) se abre solo, se propone
 *     («Abrir enlace Wi-Fi directo») o nada. Nunca si ya vais por la misma red o el envío es pequeño.
 *   · El REGISTRO de enlaces activos (estado de la página, sin React): la pastilla de la vía, el Radar,
 *     Señales, el chat y la ficha de la neurona leen de aquí «Wi-Fi directo (sin router)».
 */

import { decidirParP2p, direccionAwdl, ETIQUETA_WIFI_P2P, puedeOfrecerSinSaberDelOtro, textoPastillaP2p, TEXTO_PASTILLA_PUNTO_ACCESO } from "./wifi-p2p"; // WFA1109A
import { ipEnlaceLocalV6, ipPrivada, puedeEnlaceWifi, type AjusteWifiDirecto, type CapacidadesWifi, type ClaseNecesidad, type FaseWifi, type MetodoAp } from "./enlace-wifi-directo";

/* ══════════════════════════ Ajuste ══════════════════════════ */

export const AJUSTES_WIFI: readonly AjusteWifiDirecto[] = ["automatico", "preguntar", "nunca"];
/** Por defecto se pregunta: en un Mac el enlace deja la red Wi-Fi de casa mientras dura. */
export const AJUSTE_WIFI_POR_DEFECTO: AjusteWifiDirecto = "preguntar";
export const CLAVE_AJUSTE_WIFI = "starseed.neuronas.medios.wifi-directo.v1";

export const TEXTO_AJUSTE: Record<AjusteWifiDirecto, { nombre: string; detalle: string }> = {
  automatico: { nombre: "Automático", detalle: "Se abre solo cuando un envío pesado a una neurona vecina lo necesita, y se cierra solo al dejar de usarse." },
  preguntar: { nombre: "Preguntar", detalle: "Se propone «Abrir enlace Wi-Fi directo» y decides tú cada vez." },
  nunca: { nombre: "Nunca", detalle: "No se abre ni se acepta: todo sigue por el enlace que haya (Bluetooth, red local, internet)." },
};

export function leerAjusteWifi(x: unknown): AjusteWifiDirecto {
  return AJUSTES_WIFI.includes(x as AjusteWifiDirecto) ? (x as AjusteWifiDirecto) : AJUSTE_WIFI_POR_DEFECTO;
}

/* ══════════════════════════ Decisión ══════════════════════════ */

/** Ancho que pide cada clase (kb/s) para no ir a tirones. */
export const KBPS_NECESARIOS: Record<ClaseNecesidad, number> = {
  archivo: 8_000,
  llamada: 1_500,
  pantalla: 4_000,
  flujo: 6_000,
  manual: 0,
};

/** Un archivo por debajo de esto cabe por el enlace de ahora: no merece cambiar de red. */
export const UMBRAL_ARCHIVO_BYTES = 8 * 1024 * 1024;
/** Tras un fallo con una neurona, no se vuelve a ofrecer solo en este tiempo. */
export const ESPERA_TRAS_FALLO_MS = 2 * 60_000;

/** El enlace por el que se iría ahora (lo que hay que superar). */
export type TipoEnlaceActual = "ninguno" | "ble" | "lora" | "rele" | "internet" | "red-local" | "wifi-directo";

export interface EntradaDecision {
  ajuste: AjusteWifiDirecto;
  clase: ClaseNecesidad;
  bytes?: number;
  /** Capacidades de ESTA app (null: sin parte nativa o anterior a WFD1108A). */
  capPropia: CapacidadesWifi | null;
  /** Lo que se sepa del otro (de una negociación anterior); null = se sabrá al ofrecer. */
  capOtro?: CapacidadesWifi | null;
  enlaceActual: { tipo: TipoEnlaceActual; kbps: number | null };
  /** Proximidad PROBADA (Bluetooth LE u otra): sin ella no se abre ni se propone solo. */
  cerca: boolean;
  /** Fase del motor ahora mismo. */
  fase: FaseWifi;
  ultimoFallo?: number | null;
  ahora: number;
}

export interface Decision {
  accion: "abrir" | "proponer" | "nada";
  motivo: string;
  /** Aviso para la persona aunque se abra solo (el Mac pierde su red mientras dure). */
  aviso?: string;
  /** (WFA1109A) Entre estas dos neuronas no hay Wi-Fi P2P sin hotspot (y el punto de acceso no está permitido): se sigue por Bluetooth, sin avisos de Wi-Fi. */
  sinP2p?: boolean;
}

export const AVISO_RADIO_UNICA =
  "Este Mac tiene una sola radio Wi-Fi: mientras dure el enlace directo deja tu red de casa (sin internet por Wi-Fi) y vuelve a ella al cerrarlo.";

/**
 * decidirEnlaceWifi — ¿se abre, se propone o nada? Lo decide con lo MEDIDO (el ancho del enlace de ahora
 * si se conoce; si no, por su tipo). Nunca se abre sin proximidad probada ni con el ajuste en «Nunca». Puro.
 */
export function decidirEnlaceWifi(p: EntradaDecision): Decision {
  const nada = (motivo: string): Decision => ({ accion: "nada", motivo });
  if (p.fase !== "inactivo" && p.fase !== "cerrado" && p.fase !== "fallido") return nada("ya hay un enlace Wi-Fi directo abierto o en marcha");
  if (p.ajuste === "nunca") return nada("el enlace Wi-Fi directo está en «Nunca» (Ajustes › Neuronas › Medios)");
  if (!puedeEnlaceWifi(p.capPropia)) return nada("esta app no puede abrir ni unirse a una red Wi-Fi directa (navegador, app anterior o permiso denegado)");
  if (p.capOtro && !puedeEnlaceWifi(p.capOtro)) return nada("la otra neurona no puede abrir ni unirse a una red Wi-Fi directa");
  // (WFA1109A) Solo Wi-Fi P2P sin router ni hotspot; el punto de acceso únicamente si la persona lo permitió (las dos neuronas).
  if (p.capOtro) {
    const par = decidirParP2p(p.capPropia, p.capOtro);
    if (par.tipo === "bluetooth") return { accion: "nada", motivo: par.texto, sinP2p: true };
    if (par.tipo === "p2p" && par.lana === "awdl") return nada("AWDL conecta solo con los Mac cercanos: no hace falta abrir nada");
  } else if (!puedeOfrecerSinSaberDelOtro(p.capPropia)) {
    return { accion: "nada", motivo: "sin Wi-Fi P2P ofrecible desde este aparato (AWDL se conecta solo; el punto de acceso no está permitido): se sigue por Bluetooth", sinP2p: true };
  }
  if (p.enlaceActual.tipo === "red-local" || p.enlaceActual.tipo === "wifi-directo") return nada("ya vais por la misma red: no hace falta otra");
  if (p.clase === "archivo" && (p.bytes ?? 0) < UMBRAL_ARCHIVO_BYTES) return nada("archivo pequeño: cabe por el enlace de ahora");
  const necesita = KBPS_NECESARIOS[p.clase];
  if (typeof p.enlaceActual.kbps === "number" && p.enlaceActual.kbps >= necesita && p.clase !== "manual") {
    return nada(`el enlace de ahora (${Math.round(p.enlaceActual.kbps)} kb/s medidos) ya basta`);
  }
  if (!p.cerca) return nada("no hay prueba de que la otra neurona esté al lado (Bluetooth LE): un enlace directo no llegaría");
  if (typeof p.ultimoFallo === "number" && p.ahora - p.ultimoFallo < ESPERA_TRAS_FALLO_MS) {
    const s = Math.ceil((ESPERA_TRAS_FALLO_MS - (p.ahora - p.ultimoFallo)) / 1000);
    return nada(`falló hace poco con esta neurona; se vuelve a probar en ${s} s`);
  }
  const aviso = p.capPropia?.radioUnica ? AVISO_RADIO_UNICA : undefined;
  if (p.ajuste === "automatico") return { accion: "abrir", motivo: "envío pesado a una neurona vecina: se abre el enlace Wi-Fi directo", ...(aviso ? { aviso } : {}) };
  return { accion: "proponer", motivo: "envío pesado a una neurona vecina: ¿abrir el enlace Wi-Fi directo?", ...(aviso ? { aviso } : {}) };
}

/** Ancho que se supone por tipo de enlace cuando no hay medida (solo para decidir, nunca se enseña). */
export function kbpsSupuesto(t: TipoEnlaceActual): number | null {
  switch (t) {
    case "ninguno":
      return 0;
    case "lora":
      return 1;
    case "ble":
      return 200; // BLE 4/5 real: 0,1–1,4 Mb/s; sin medida se cuenta por lo bajo
    default:
      return null;
  }
}

/* ══════════════════════════ Registro de enlaces activos ══════════════════════════ */

export interface EnlaceWifiActivo {
  neurona: string;
  nombre: string | null;
  /** IP del otro en la red directa (null hasta que la diga). */
  ipOtro: string | null;
  ipPropia: string | null;
  ssid: string | null;
  metodo: MetodoAp | null;
  soyAp: boolean;
  /** Velocidad de la radio que dice el sistema (Mb/s); null = sin medir. */
  mbps: number | null;
  desde: number;
}

let activos: EnlaceWifiActivo[] = [];
const oyentes = new Set<() => void>();

export function enlacesWifiActivos(): EnlaceWifiActivo[] {
  return activos;
}

/** Lo fija el motor al cambiar de fase. Avisa a la interfaz solo si cambió algo. */
export function fijarEnlacesWifi(lista: EnlaceWifiActivo[]): void {
  if (JSON.stringify(lista) === JSON.stringify(activos)) return;
  activos = lista;
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
}

export function suscribirEnlacesWifi(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** El enlace Wi-Fi directo activo con esa neurona, si lo hay. */
export function enlaceWifiDe(neurona: string | null | undefined, lista: readonly EnlaceWifiActivo[] = activos): EnlaceWifiActivo | null {
  if (!neurona) return null;
  return lista.find((e) => e.neurona === neurona) ?? null;
}

/** Ruta que se guarda en la vía de un mensaje que fue por el enlace Wi-Fi directo. */
export const RUTA_WIFI_DIRECTO = "wifi-directo";
export const ETIQUETA_WIFI_DIRECTO = ETIQUETA_WIFI_P2P; // WFA1109A: «Wi‑Fi P2P (sin router ni hotspot)"

/**
 * ¿Este enlace del transporte va por un enlace Wi-Fi directo activo? `nativo:<ip>` con la IP del otro en
 * la red directa. Puro sobre la lista dada.
 */
export function esEnlaceWifiDirecto(enlaceId: string | null | undefined, lista: readonly EnlaceWifiActivo[] = activos): boolean {
  if (!enlaceId || !enlaceId.startsWith("nativo:")) return false;
  if (direccionAwdl(enlaceId.slice("nativo:".length))) return true; // WFA1109A: un vecino por AWDL siempre es Wi-Fi P2P
  if (ipEnlaceLocalV6(enlaceId.slice("nativo:".length))) return true; // WFA1109A: IPv6 de enlace local con ámbito = ruta Aware
  const ip = ipPrivada(enlaceId.slice("nativo:".length));
  return !!ip && lista.some((e) => e.ipOtro === ip);
}

/**
 * (WFA1109A) La etiqueta de la pastilla de un enlace Wi-Fi directo: «Wi‑Fi P2P · Aware · sin router», «… · AWDL · …»,
 * «… · Wi‑Fi Direct · …» o «Red directa por punto de acceso · sin router» (el opt-in). Puro sobre la lista dada.
 */
export function etiquetaEnlaceP2p(enlaceId: string | null | undefined, lista: readonly EnlaceWifiActivo[] = activos): string {
  const ip = enlaceId && enlaceId.startsWith("nativo:") ? enlaceId.slice("nativo:".length) : "";
  if (direccionAwdl(ip)) return textoPastillaP2p("awdl");
  if (ipEnlaceLocalV6(ip)) return textoPastillaP2p("wifi-aware");
  const activo = lista.find((e) => e.ipOtro === ipPrivada(ip));
  if (activo?.metodo === "hotspot-local") return TEXTO_PASTILLA_PUNTO_ACCESO;
  if (activo?.metodo === "wifi-aware") return textoPastillaP2p("wifi-aware");
  if (activo?.metodo === "wifi-direct") return textoPastillaP2p("wifi-direct-concurrente");
  return ETIQUETA_WIFI_DIRECTO;
}

/** La ruta de la vía: «wifi-directo» si el enlace va por la red directa; si no, la que traía. */
export function rutaConWifi(enlaceId: string | null | undefined, ruta: string | null | undefined): string | null {
  return esEnlaceWifiDirecto(enlaceId) ? RUTA_WIFI_DIRECTO : (ruta ?? null);
}

/** «Enlace Wi-Fi directo: activo · 433 Mb/s» (o «· sin medir»). */
export function textoEnlaceWifi(e: Pick<EnlaceWifiActivo, "mbps"> | null): string {
  if (!e) return "Enlace Wi-Fi directo: no";
  return `Enlace Wi-Fi directo: activo · ${typeof e.mbps === "number" && e.mbps > 0 ? `${Math.round(e.mbps)} Mb/s` : "sin medir"}`;
}

/** Texto corto del método de la red para la ficha. */
export function textoMetodo(m: MetodoAp | null): string {
  if (m === "hotspot-local") return "punto de acceso local de Android";
  if (m === "wifi-direct") return "grupo Wi-Fi Direct";
  if (m === "wifi-aware") return "Wi-Fi Aware (NAN)";
  return "red directa";
}
