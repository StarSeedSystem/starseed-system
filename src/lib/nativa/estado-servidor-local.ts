/*
 * estado-servidor-local — qué dice la app nativa de su servidor local (APP1107T6, 2026-11-07).
 * Contrato: architecture/apps-autonomas-sin-internet.md §4 y T6 · comando Tauri `servidor_local_estado`
 * (native/src-tauri/src/servidor_local.rs).
 *
 * Puro (sin Node ni React): `interpretarEstadoServidor` convierte la respuesta en un valor tipado,
 * `textoEstadoServidor` en texto + tono, y `consultarEstadoServidor` pregunta SOLO si hay app nativa
 * (fuera de ella no llama a nada y devuelve null: nunca se inventa un estado).
 */

import { esAppNativa, puenteNativo } from "./puente";

export const COMANDO_ESTADO_SERVIDOR = "servidor_local_estado";

/** Lo que devuelve el comando (los campos opcionales pueden faltar o venir null). */
export interface EstadoServidorLocal {
  /** "apagado" | "arrancando" | "local" | "reiniciando" | "web-publicada" | "sin-internet" | "otro-sistema" */
  fase: string;
  puerto?: number | null;
  origen?: string | null;
  motivo?: string | null;
  reinicios?: number;
  version_paquete?: string | null;
  commit_paquete?: string | null;
}

export type TonoServidor = "ok" | "info" | "aviso" | "error" | "neutro";

export interface TextoServidor {
  texto: string;
  tono: TonoServidor;
  /** Frase extra para el título / lector de pantalla (motivo, versión). Puede ir vacía. */
  detalle: string;
}

const texto1 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Valida la respuesta del comando; null si no es un estado reconocible. */
export function interpretarEstadoServidor(raw: unknown): EstadoServidorLocal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fase = texto1(r.fase);
  if (!fase) return null;
  const puerto = typeof r.puerto === "number" && Number.isInteger(r.puerto) && r.puerto > 0 && r.puerto < 65536 ? r.puerto : null;
  return {
    fase,
    puerto,
    origen: texto1(r.origen),
    motivo: texto1(r.motivo),
    reinicios: typeof r.reinicios === "number" && r.reinicios > 0 ? Math.floor(r.reinicios) : 0,
    version_paquete: texto1(r.version_paquete),
    commit_paquete: texto1(r.commit_paquete),
  };
}

/** `127.0.0.1:47610` desde el origen o el puerto; null si no hay ninguno de los dos. */
function anfitrion(e: EstadoServidorLocal): string | null {
  const o = e.origen?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (o) return o;
  return e.puerto ? `127.0.0.1:${e.puerto}` : null;
}

/** Texto y tono de la pastilla. null = no hay nada que enseñar (Nexus/Café: no llevan servidor local). */
export function textoEstadoServidor(e: EstadoServidorLocal | null): TextoServidor | null {
  if (!e) return null;
  const extra = [e.motivo, e.version_paquete ? `paquete ${e.version_paquete}` : null].filter(Boolean).join(" · ");
  const base = (texto: string, tono: TonoServidor, detalle = extra): TextoServidor => ({ texto, tono, detalle });
  switch (e.fase) {
    case "local": {
      const a = anfitrion(e);
      return base(a ? `servidor local · listo en ${a}` : "servidor local · listo", "ok");
    }
    case "arrancando":
      return base("servidor local · arrancando", "info");
    case "reiniciando": {
      const n = e.reinicios ?? 0;
      return base(n > 0 ? `servidor local · caído, reintentando (${n})` : "servidor local · caído, reintentando", "error");
    }
    case "web-publicada":
      return base("sin paquete local: usa la web publicada", "aviso");
    case "sin-internet":
      return base("sin paquete local ni internet: no hay servidor al que abrir", "error");
    case "apagado":
      return base("servidor local · apagado", "neutro");
    case "otro-sistema":
      return null;
    default:
      return base("servidor local · estado desconocido", "neutro", "");
  }
}

export interface DepsEstadoServidor {
  nativa: () => boolean;
  llamar: (cmd: string) => Promise<{ ok: true; valor: unknown } | { ok: false; motivo: string }>;
}

const DEPS_REALES: DepsEstadoServidor = {
  nativa: esAppNativa,
  llamar: (cmd) => puenteNativo().llamar<unknown>(cmd),
};

/** Pide el estado solo dentro de la app nativa. Nunca lanza; null si no hay app o no contestó. */
export async function consultarEstadoServidor(deps: DepsEstadoServidor = DEPS_REALES): Promise<EstadoServidorLocal | null> {
  try {
    if (!deps.nativa()) return null;
    const r = await deps.llamar(COMANDO_ESTADO_SERVIDOR);
    return r.ok ? interpretarEstadoServidor(r.valor) : null;
  } catch {
    return null;
  }
}
