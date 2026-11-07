/*
 * estado-servidor-local — qué dice la app nativa de su servidor local (APP1107T6, 2026-11-07).
 * Contrato: architecture/apps-autonomas-sin-internet.md §4, §10 y T6 · comandos Tauri `servidor_local_estado`
 * y `servidor_local_actualizar` (native/src-tauri/src/servidor_local.rs).
 *
 * (CAP1107A · T1) También qué CAPA del servidor sirve (la del instalador o una más nueva bajada sin
 * reinstalar) y si hay una nueva ya verificada: `pedirActualizarServidor` reinicia SOLO el Node con
 * ella (la página se recarga sola).
 *
 * Puro (sin Node ni React): `interpretarEstadoServidor` convierte la respuesta en un valor tipado,
 * `textoEstadoServidor` en texto + tono, y `consultarEstadoServidor` pregunta SOLO si hay app nativa
 * (fuera de ella no llama a nada y devuelve null: nunca se inventa un estado).
 */

import { esAppNativa, puenteNativo } from "./puente";

export const COMANDO_ESTADO_SERVIDOR = "servidor_local_estado";
export const COMANDO_ACTUALIZAR_SERVIDOR = "servidor_local_actualizar";

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
  /** Registro del servidor en esta máquina. */
  registro?: string | null;
  /** (CAP1107A) Build de la capa que sirve; null = el paquete del instalador. */
  capa?: string | null;
  /** Capa nueva ya verificada, lista para «Actualizar ahora» o el siguiente arranque. */
  capa_nueva?: string | null;
  capa_nueva_version?: string | null;
  /** "buscando" | "descargando" | "verificando" | "lista" | "al-dia" | "sin-red" | "error" */
  capas_fase?: string | null;
  /** Lo último que pasó con las capas (p. ej. una vuelta atrás). */
  capas_aviso?: string | null;
}

export type TonoServidor = "ok" | "info" | "aviso" | "error" | "neutro";

export interface TextoServidor {
  texto: string;
  tono: TonoServidor;
  /** Frase extra para el título / lector de pantalla (motivo, versión, capa). Puede ir vacía. */
  detalle: string;
  /** (CAP1107A) Qué capa sirve, corto: «capa del instalador» o «capa AA0YdaG0». null si no sirve en local. */
  capa: string | null;
  /** (CAP1107A) Si hay una capa nueva lista: su texto («capa nueva lista · 0.3.1 · abc1234»). */
  nueva: string | null;
}

const texto1 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Un BUILD_ID de Next (lo que nombra una capa); cualquier otra cosa se ignora. */
const build1 = (v: unknown): string | null => {
  const t = texto1(v);
  return t && /^[A-Za-z0-9_-]{1,64}$/.test(t) ? t : null;
};
/** Los primeros 8 caracteres de un build (como `corto` en Rust). */
export const buildCorto = (b: string): string => b.slice(0, 8);

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
    registro: texto1(r.registro),
    capa: build1(r.capa),
    capa_nueva: build1(r.capa_nueva),
    capa_nueva_version: texto1(r.capa_nueva_version),
    capas_fase: texto1(r.capas_fase),
    capas_aviso: texto1(r.capas_aviso),
  };
}

const FASE_CAPAS: Record<string, string> = {
  buscando: "buscando una capa nueva",
  descargando: "descargando una capa nueva",
  verificando: "verificando la capa nueva",
  error: "no se pudo traer la capa nueva",
};

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
  const base = (texto: string, tono: TonoServidor, detalle = extra): TextoServidor => ({ texto, tono, detalle, capa: null, nueva: null });
  switch (e.fase) {
    case "local": {
      const a = anfitrion(e);
      const capa = e.capa ? `capa ${buildCorto(e.capa)}` : "capa del instalador";
      const nueva = e.capa_nueva ? ["capa nueva lista", e.capa_nueva_version].filter(Boolean).join(" · ") : null;
      const sirve = e.capa ? `Sirve la capa ${e.capa}, bajada sin reinstalar la app` : "Sirve el paquete del instalador";
      const fase = e.capas_fase ? FASE_CAPAS[e.capas_fase] : undefined;
      const detalle = [extra, sirve, nueva ? `${nueva}: «Actualizar ahora» reinicia solo el servidor` : fase, e.capas_aviso]
        .filter(Boolean)
        .join(" · ");
      return {
        ...base(a ? `servidor local · listo en ${a}` : "servidor local · listo", "ok", detalle),
        capa,
        nueva,
      };
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

/**
 * (CAP1107A) «Actualizar ahora»: reinicia SOLO el Node de la app con la capa nueva ya verificada (la
 * app no se cierra; la página se recarga sola cuando la capa contesta). Nunca lanza.
 */
export async function pedirActualizarServidor(deps: DepsEstadoServidor = DEPS_REALES): Promise<{ ok: boolean; mensaje: string }> {
  try {
    if (!deps.nativa()) return { ok: false, mensaje: "Solo en la app nativa de StarSeed OS." };
    const r = await deps.llamar(COMANDO_ACTUALIZAR_SERVIDOR);
    if (r.ok) return { ok: true, mensaje: typeof r.valor === "string" && r.valor ? r.valor : "Actualizando el servidor local…" };
    return { ok: false, mensaje: r.motivo || "No se pudo actualizar el servidor local." };
  } catch (x) {
    return { ok: false, mensaje: x instanceof Error ? x.message : String(x) };
  }
}

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
