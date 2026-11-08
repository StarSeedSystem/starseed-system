/**
 * rele-archivo — vías de RELÉ para un archivo sellado: otra neurona tuya como salto, y el relé del servidor (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * El archivo ya va sellado de punta a punta (`canal-sellado.ts`): estas vías solo mueven TEXTO CIFRADO. Un salto o el servidor
 * ven el id, los índices y las longitudes; nunca el nombre, el contenido ni la clave.
 *
 *   · Salto por una neurona propia: A manda `archivo.salto {para, de, p}` a B (otra neurona de la MISMA cuenta); B comprueba
 *     sus topes (apagado, batería, datos del día, tamaño) y manda `archivo.salto.llega {de, p}` a C por SU enlace. C entrega `p`
 *     al motor y contesta por el mismo salto. B nunca reenvía a quien no sea de la cuenta ni un salto dentro de otro salto.
 *   · Relé del servidor: el texto va como mensaje del relé cifrado (`cv: tu:archivo-rele:<id>`); el tope de bytes por vía
 *     (64 MiB por defecto) lo aplica `canal-multitrayecto-vias`.
 * Aquí está lo PURO (formas de mensaje, topes, canal por texto con cola); el transporte universal pone los envíos reales.
 * Nunca lanza.
 */

import type { CanalArchivos } from "@/lib/network/archivos-malla";
import { topesSalto, type AjustesViasArchivo } from "@/lib/malla/ajustes-vias-archivo";

export const PREFIJO_SALTO = '{"t":"archivo.salto"';
export const PREFIJO_LLEGA = '{"t":"archivo.salto.llega"';
/** Trozo de texto por un relé (base64 dentro de un JSON): bastante menor que un trozo directo. */
export const TAM_TROZO_RELE = 24 * 1024;
export const MAX_TEXTO_RELE = 96 * 1024;

export interface MsgSalto {
  t: "archivo.salto";
  para: string;
  de: string;
  p: string;
}
export interface MsgLlega {
  t: "archivo.salto.llega";
  de: string;
  p: string;
}

function json(texto: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(texto);
    return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function envolverSalto(para: string, de: string, p: string): string {
  return JSON.stringify({ t: "archivo.salto", para, de, p } satisfies MsgSalto);
}

export function leerLlegada(texto: string): { de: string; p: string } | null {
  if (!texto.startsWith(PREFIJO_LLEGA)) return null;
  const m = json(texto);
  return m && typeof m.de === "string" && typeof m.p === "string" ? { de: m.de, p: m.p } : null;
}

/** Canal que manda y recibe SOLO texto, con cola (los envíos reales son asíncronos) y contrapresión. */
export function crearCanalPorTexto(o: {
  enviarTexto: (texto: string) => Promise<boolean> | boolean;
  suscribir: (cb: (texto: string) => void) => () => void;
  tamanoTrozo?: number;
  maxTexto?: number;
  /** ¿Hay enlace ahora? */
  arriba?: () => boolean;
  ruta?: string | null;
}): CanalArchivos {
  let pendientes = 0;
  let cola: Promise<unknown> = Promise.resolve();
  return {
    enviar(texto) {
      if (o.arriba && !o.arriba()) return false;
      pendientes += texto.length;
      cola = cola
        .then(() => o.enviarTexto(texto))
        .catch(() => false)
        .finally(() => {
          pendientes -= texto.length;
        });
      return true;
    },
    bufferedAmount: () => pendientes,
    tamanoTrozo: () => o.tamanoTrozo ?? TAM_TROZO_RELE,
    maxTextoBytes: () => o.maxTexto ?? MAX_TEXTO_RELE,
    ...(o.arriba ? { enlaceArriba: () => !!o.arriba?.() } : {}),
    ...(o.ruta !== undefined ? { rutaMedida: () => o.ruta ?? null } : {}),
    alMensaje: (cb) => o.suscribir((t) => cb(t)),
  };
}

/** Canal hacia `destino` pasando por el salto `salto` (otra neurona tuya). `alLlegar` entrega lo que llega de `destino` por ese salto. */
export function crearCanalViaSalto(o: {
  yo: string;
  destino: string;
  enviarAlSalto: (texto: string) => Promise<boolean> | boolean;
  alLlegar: (cb: (de: string, p: string) => void) => () => void;
  arriba?: () => boolean;
}): CanalArchivos {
  return crearCanalPorTexto({
    enviarTexto: (t) => o.enviarAlSalto(envolverSalto(o.destino, o.yo, t)),
    suscribir: (cb) => o.alLlegar((de, p) => (de === o.destino ? cb(p) : undefined)),
    ...(o.arriba ? { arriba: o.arriba } : {}),
  });
}

export interface DepsSalto {
  ajustes: () => Pick<AjustesViasArchivo, "releNeuronas" | "maxBytesSaltoDia" | "bateriaMinSalto">;
  energia: () => { bateria: number | null; cargando: boolean };
  /** ¿Es una neurona de MI cuenta? (el salto no sirve a nadie más). */
  esPropia: (neurona: string) => boolean;
  /** Reenvía por el enlace de ESTA neurona hacia `para`. */
  reenviar: (para: string, texto: string) => Promise<boolean> | boolean;
  usadoHoy: () => number;
  sumar: (bytes: number) => void;
}

export type ResultadoSalto = { ok: true; bytes: number } | { ok: false; motivo: string };

/** Lo que hace una neurona cuando otra le pide hacer de salto. */
export function crearSalto(deps: DepsSalto): { procesar(texto: string, deQuien: string): Promise<ResultadoSalto | null> } {
  return {
    async procesar(texto, deQuien) {
      if (!texto.startsWith(PREFIJO_SALTO)) return null;
      const m = json(texto);
      if (!m || typeof m.para !== "string" || typeof m.de !== "string" || typeof m.p !== "string") return { ok: false, motivo: "salto mal formado" };
      if (m.de !== deQuien) return { ok: false, motivo: "el origen del salto no es quien lo manda" };
      if (!deps.esPropia(deQuien) || !deps.esPropia(m.para)) return { ok: false, motivo: "solo hago de salto entre neuronas de mi cuenta" };
      if (m.p.startsWith(PREFIJO_SALTO) || m.p.startsWith(PREFIJO_LLEGA)) return { ok: false, motivo: "un salto dentro de otro salto" };
      if (m.p.length > MAX_TEXTO_RELE * 2) return { ok: false, motivo: "demasiado grande para un salto" };
      const bytes = m.p.length;
      const e = deps.energia();
      const t = topesSalto(deps.ajustes(), { bateria: e.bateria, cargando: e.cargando, usadoHoy: deps.usadoHoy(), bytes });
      if (!t.ok) return { ok: false, motivo: t.motivo ?? "tope" };
      const ok = await deps.reenviar(m.para, JSON.stringify({ t: "archivo.salto.llega", de: m.de, p: m.p } satisfies MsgLlega));
      if (!ok) return { ok: false, motivo: "no hay enlace desde aquí hasta la neurona de destino" };
      deps.sumar(bytes);
      return { ok: true, bytes };
    },
  };
}
