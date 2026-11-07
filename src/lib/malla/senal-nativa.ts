/**
 * senal-nativa — señalización WebRTC por el canal local de la app nativa (2026-11-07 · MLT1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM). Contrato: `architecture/datos-por-la-malla.md` §6.
 *
 * Dos apps nativas VINCULADAS (ligadas por un `nl.hola` firmado, `red-local-nativa.ts`) abren solas el
 * enlace local WebRTC de siempre (`emparejar-sin-internet.ts`, `iceServers: []`) sin código QR: el
 * «papel» del código lo hace un mensaje `nl.sen` por el canal TCP. Por ese enlace van llamadas,
 * pantalla y flujos (lo que el canal TCP no lleva bien).
 *
 *   inactiva ─tic(posible, ofrezco)→ ofreciendo ─oferta-enviada→ esperando-respuesta
 *            ─respuesta-recibida→ conectando ─abierta→ abierta ─(se cae)→ inactiva → …
 *   inactiva ─oferta-recibida→ respondiendo ─respuesta-enviada→ conectando ─abierta→ abierta
 *   cualquier fase en curso ─tope de tiempo | fallo | cierre del otro→ fallida ─(espera)→ inactiva…
 *
 * Quién ofrece: la neurona de id MENOR (las dos lo calculan igual: no hay ofertas cruzadas). Si aun
 * así llega una oferta mientras se ofrece, gana la de quien tiene prioridad. Reintentos: 15 s·2ⁿ, ≤ 10 min.
 */

export type FaseSenal = "inactiva" | "ofreciendo" | "esperando-respuesta" | "respondiendo" | "conectando" | "abierta" | "fallida";

export interface EstadoSenal {
  fase: FaseSenal;
  /** Sesión WebRTC en curso (o la última). */
  sesion: string | null;
  /** Fallos seguidos (para la espera del siguiente intento). */
  intentos: number;
  /** Entrada en la fase actual (epoch ms). */
  desde: number;
  /** En `fallida`: cuándo se puede volver a intentar. */
  reintentoEn: number;
  motivo: string | null;
}

export const SENAL_INICIAL: EstadoSenal = { fase: "inactiva", sesion: null, intentos: 0, desde: 0, reintentoEn: 0, motivo: null };

const EN_CURSO = ["ofreciendo", "esperando-respuesta", "respondiendo", "conectando"] as const;
type FaseEnCurso = (typeof EN_CURSO)[number];

export function enCurso(f: FaseSenal): f is FaseEnCurso {
  return (EN_CURSO as readonly string[]).includes(f);
}

/** Tiempo máximo en cada fase en curso (reunir candidatos, que el otro conteste, que ICE conecte). */
export const TOPE_FASE_MS: Record<FaseEnCurso, number> = {
  ofreciendo: 15_000,
  "esperando-respuesta": 20_000,
  respondiendo: 15_000,
  conectando: 30_000,
};

/** ¿Ofrezco yo? La neurona de id menor. Las dos llegan a la misma conclusión. */
export function quienOfrece(mia: string, suya: string): boolean {
  return mia < suya;
}

/** Espera tras `intentos` fallos seguidos: 15 s, 30 s, 1 min… hasta 10 min. */
export function esperaReintento(intentos: number): number {
  return Math.min(10 * 60_000, 15_000 * 2 ** Math.max(0, intentos - 1));
}

export type EventoSenal =
  /** Cada pocos segundos. `posible`: ligada, las dos con WebRTC y el canal escucha. */
  | { t: "tic"; ahora: number; posible: boolean; ofrezco: boolean; enlaceAbierto: boolean; sesionNueva: string }
  | { t: "oferta-enviada"; sesion: string; ahora: number }
  | { t: "oferta-recibida"; sesion: string; ahora: number; ofrezco: boolean }
  | { t: "respuesta-enviada"; sesion: string; ahora: number }
  | { t: "respuesta-recibida"; sesion: string; ahora: number }
  | { t: "abierta"; sesion: string; ahora: number }
  | { t: "fallo"; sesion: string; ahora: number; motivo: string }
  /** El otro canceló esa sesión (`nl.sen` cierre). */
  | { t: "cierre-recibido"; sesion: string; ahora: number };

export type AccionSenal =
  | { a: "ofrecer"; sesion: string }
  | { a: "responder"; sesion: string }
  /** Aplicar la respuesta recibida a la oferta propia. */
  | { a: "completar"; sesion: string }
  /** Cerrar esa RTCPeerConnection; `avisar`: decírselo al otro (`nl.sen` cierre). */
  | { a: "cancelar"; sesion: string; avisar: boolean };

export interface PasoSenal {
  estado: EstadoSenal;
  acciones: AccionSenal[];
}

function fallar(e: EstadoSenal, ahora: number, motivo: string, avisar: boolean): PasoSenal {
  const intentos = e.intentos + 1;
  return {
    estado: { ...e, fase: "fallida", intentos, desde: ahora, reintentoEn: ahora + esperaReintento(intentos), motivo },
    acciones: e.sesion ? [{ a: "cancelar", sesion: e.sesion, avisar }] : [],
  };
}

const MOTIVO_TOPE: Record<FaseEnCurso, string> = {
  ofreciendo: "no se pudo preparar la oferta a tiempo (¿este aparato está en alguna red?)",
  "esperando-respuesta": "la otra app no contestó a la oferta",
  respondiendo: "no se pudo preparar la respuesta a tiempo",
  conectando: "los dos aparatos no se alcanzaron por WebRTC (¿la red aísla a sus clientes?)",
};

/** pasoSenal — la máquina de estados de la señalización con UNA neurona ligada. Pura y determinista. */
export function pasoSenal(e: EstadoSenal, ev: EventoSenal): PasoSenal {
  const nada: PasoSenal = { estado: e, acciones: [] };
  switch (ev.t) {
    case "tic": {
      if (ev.enlaceAbierto) {
        // Ya hay un enlace local con esa neurona (este u otro, p. ej. por código QR): no hace falta otro.
        if (e.fase === "abierta") return nada;
        const acciones: AccionSenal[] = enCurso(e.fase) && e.sesion ? [{ a: "cancelar", sesion: e.sesion, avisar: true }] : [];
        return { estado: { ...e, fase: "abierta", intentos: 0, desde: ev.ahora, motivo: null }, acciones };
      }
      if (e.fase === "abierta") {
        // Se cayó: se vuelve a intentar enseguida (sin espera: no es un fallo de conexión).
        return { estado: { ...e, fase: "inactiva", desde: ev.ahora, reintentoEn: ev.ahora, motivo: "el enlace directo se cerró" }, acciones: [] };
      }
      if (!ev.posible) {
        if (enCurso(e.fase) && e.sesion) {
          return { estado: { ...e, fase: "inactiva", desde: ev.ahora, motivo: "ya no se puede (sin ligadura o sin WebRTC)" }, acciones: [{ a: "cancelar", sesion: e.sesion, avisar: true }] };
        }
        return nada;
      }
      if (enCurso(e.fase)) {
        return ev.ahora - e.desde > TOPE_FASE_MS[e.fase] ? fallar(e, ev.ahora, MOTIVO_TOPE[e.fase], true) : nada;
      }
      // inactiva o fallida: solo quien ofrece empieza, y solo pasada la espera del último fallo.
      if (ev.ahora < e.reintentoEn || !ev.ofrezco) return nada;
      return {
        estado: { ...e, fase: "ofreciendo", sesion: ev.sesionNueva, desde: ev.ahora, motivo: null },
        acciones: [{ a: "ofrecer", sesion: ev.sesionNueva }],
      };
    }
    case "oferta-enviada":
      if (e.fase !== "ofreciendo" || e.sesion !== ev.sesion) return nada;
      return { estado: { ...e, fase: "esperando-respuesta", desde: ev.ahora }, acciones: [] };
    case "oferta-recibida": {
      if (e.sesion === ev.sesion && (e.fase === "respondiendo" || e.fase === "conectando" || e.fase === "abierta")) return nada; // repetida
      const acciones: AccionSenal[] = [];
      if ((e.fase === "ofreciendo" || e.fase === "esperando-respuesta") && e.sesion) {
        if (ev.ofrezco) return nada; // la mía tiene prioridad: la suya caducará en su lado
        acciones.push({ a: "cancelar", sesion: e.sesion, avisar: false });
      } else if ((e.fase === "respondiendo" || e.fase === "conectando") && e.sesion) {
        acciones.push({ a: "cancelar", sesion: e.sesion, avisar: false }); // una oferta nueva sustituye a la vieja
      }
      acciones.push({ a: "responder", sesion: ev.sesion });
      return { estado: { ...e, fase: "respondiendo", sesion: ev.sesion, desde: ev.ahora, motivo: null }, acciones };
    }
    case "respuesta-enviada":
      if (e.fase !== "respondiendo" || e.sesion !== ev.sesion) return nada;
      return { estado: { ...e, fase: "conectando", desde: ev.ahora }, acciones: [] };
    case "respuesta-recibida":
      if (e.fase !== "esperando-respuesta" || e.sesion !== ev.sesion) return nada;
      return { estado: { ...e, fase: "conectando", desde: ev.ahora }, acciones: [{ a: "completar", sesion: ev.sesion }] };
    case "abierta":
      if (e.sesion !== ev.sesion) return nada;
      return { estado: { ...e, fase: "abierta", intentos: 0, desde: ev.ahora, reintentoEn: 0, motivo: null }, acciones: [] };
    case "fallo":
      if (e.sesion !== ev.sesion || !enCurso(e.fase)) return nada;
      return fallar(e, ev.ahora, ev.motivo, true);
    case "cierre-recibido":
      if (e.sesion !== ev.sesion) return nada;
      if (enCurso(e.fase)) return fallar(e, ev.ahora, "la otra app canceló el intento", false);
      if (e.fase === "abierta") {
        return { estado: { ...e, fase: "inactiva", desde: ev.ahora, reintentoEn: ev.ahora, motivo: "la otra app cerró el enlace" }, acciones: [{ a: "cancelar", sesion: ev.sesion, avisar: false }] };
      }
      return nada;
    default:
      return nada;
  }
}

/* ══════════════════════════ Mensajes `nl.sen` ══════════════════════════ */

export interface SenalNativa {
  t: "nl.sen";
  v: 1;
  /** oferta | respuesta | cierre */
  k: "oferta" | "respuesta" | "cierre";
  /** Sesión (`nativo-…`). */
  s: string;
  /** Neurona que la manda y neurona a la que va. */
  de: string;
  para: string;
  /** SDP completo (con los candidatos ya reunidos), en oferta y respuesta. */
  sdp?: string;
  /** Nombre legible de quien la manda. */
  n?: string;
  ts: number;
}

/** Tope de un SDP por el canal (los reales con candidatos de red local ocupan 2–6 KB). */
export const MAX_SDP = 24 * 1024;
const RE_SESION = /^nativo-[a-z0-9]{6,32}$/;

export function esSesionNativa(s: unknown): s is string {
  return typeof s === "string" && RE_SESION.test(s);
}

export function leerSenal(x: unknown): SenalNativa | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.t !== "nl.sen" || o.v !== 1) return null;
  if (o.k !== "oferta" && o.k !== "respuesta" && o.k !== "cierre") return null;
  if (!esSesionNativa(o.s)) return null;
  if (typeof o.de !== "string" || !o.de || o.de.length > 80 || typeof o.para !== "string" || !o.para || o.para.length > 80) return null;
  if (typeof o.ts !== "number") return null;
  const conSdp = o.k !== "cierre";
  if (conSdp && (typeof o.sdp !== "string" || !o.sdp.startsWith("v=0") || o.sdp.length > MAX_SDP)) return null;
  return {
    t: "nl.sen",
    v: 1,
    k: o.k,
    s: o.s,
    de: o.de,
    para: o.para,
    ...(conSdp ? { sdp: o.sdp as string } : {}),
    ...(typeof o.n === "string" && o.n.trim() ? { n: o.n.trim().slice(0, 60) } : {}),
    ts: o.ts,
  };
}

/** Frase corta del estado para la interfaz (panel del vínculo / estado de transportes). */
export function textoSenal(e: EstadoSenal): string {
  switch (e.fase) {
    case "inactiva":
      return "Enlace directo (WebRTC): aún no";
    case "ofreciendo":
    case "esperando-respuesta":
    case "respondiendo":
    case "conectando":
      return "Abriendo el enlace directo por la red local…";
    case "abierta":
      return "Enlace directo abierto (llamadas, pantalla y flujos)";
    case "fallida":
      return `Enlace directo sin abrir: ${e.motivo ?? "falló"}`;
    default:
      return "";
  }
}
