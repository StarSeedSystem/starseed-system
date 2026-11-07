/*
 * Estado del servidor local de la app nativa (APP1107T6, 2026-11-07) — lógica pura, sin DOM ni Node.
 * Contrato: architecture/apps-autonomas-sin-internet.md §4 y §12 (T6).
 *
 * La app de escritorio sirve el OS desde su propio Node en 127.0.0.1 (uno de diez puertos fijos).
 * Rust expone el comando `servidor_local_estado` con la fase del paquete; aquí se convierte esa
 * respuesta en el texto y el tono de la pastilla («servidor local · listo en 127.0.0.1:47610»).
 * Componente: src/components/nativa/estado-servidor-local.tsx. Fuera de la app nativa no se llama
 * a nada. Sin `node:*`: este módulo también lo lee el cliente.
 */

/** Lo mínimo de `window.__TAURI__` que se usa (withGlobalTauri en native/). */
export interface TauriInvoke {
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

/** Fases que escribe native/src-tauri/src/servidor_local.rs. */
export type FaseServidorLocal =
  | "apagado"
  | "arrancando"
  | "local"
  | "reiniciando"
  | "web-publicada"
  | "sin-internet"
  | "otro-sistema";

/** Respuesta de `invoke('servidor_local_estado')` con los campos ya revisados. */
export interface EstadoServidorLocalRemoto {
  fase: FaseServidorLocal;
  puerto: number | null;
  /** `http://127.0.0.1:<puerto>` cuando sirve en local. */
  origen: string | null;
  /** Por qué no está en local (o qué pasó la última vez), en una frase. */
  motivo: string | null;
  reinicios: number;
  version_paquete: string | null;
  commit_paquete: string | null;
}

export type TonoEstado = "listo" | "arrancando" | "caido" | "respaldo";

export interface PastillaEstado {
  texto: string;
  tono: TonoEstado;
}

/** Comando de Tauri que da el estado (native/src-tauri/src/servidor_local.rs). */
export const COMANDO_ESTADO = "servidor_local_estado";

/** ¿Este objeto ventana es la app nativa de escritorio? Puro: se le pasa `window` por fuera. */
export function esAppNativa(w: { __TAURI__?: unknown } | undefined | null): boolean {
  return typeof w !== "undefined" && w !== null && "__TAURI__" in w;
}

/** Lee la respuesta de `servidor_local_estado`; cualquier cosa rara → null (no se sabe). */
export function interpretarEstado(json: unknown): EstadoServidorLocalRemoto | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const fases: readonly string[] = [
    "apagado",
    "arrancando",
    "local",
    "reiniciando",
    "web-publicada",
    "sin-internet",
    "otro-sistema",
  ];
  const fase = typeof j.fase === "string" && fases.includes(j.fase) ? (j.fase as FaseServidorLocal) : null;
  if (!fase) return null;
  const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  return {
    fase,
    puerto: typeof j.puerto === "number" && Number.isFinite(j.puerto) ? j.puerto : null,
    origen: texto(j.origen),
    motivo: texto(j.motivo),
    reinicios: typeof j.reinicios === "number" && j.reinicios > 0 ? j.reinicios : 0,
    version_paquete: texto(j.version_paquete),
    commit_paquete: texto(j.commit_paquete),
  };
}

/** Pide el estado por el puente; nunca lanza (convención de puente.ts): con fallo u otra cosa rara, null. */
export async function pedirEstado(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): Promise<EstadoServidorLocalRemoto | null> {
  try {
    return interpretarEstado(await invoke(COMANDO_ESTADO));
  } catch {
    return null;
  }
}

/** Convierte el estado en el texto y el tono de la pastilla. */
export function decirEstado(e: EstadoServidorLocalRemoto): PastillaEstado {
  switch (e.fase) {
    case "local": {
      const en = e.origen ? e.origen.replace(/^https?:\/\//, "").replace(/\/$/, "") : `127.0.0.1:${e.puerto ?? ""}`;
      return { texto: `servidor local · listo en ${en}`, tono: "listo" };
    }
    case "arrancando":
    case "apagado":
      return { texto: "servidor local · arrancando…", tono: "arrancando" };
    case "reiniciando":
      return { texto: "servidor local · caído, reintentando", tono: "caido" };
    case "web-publicada":
      return { texto: "sin paquete local: usa la web publicada", tono: "respaldo" };
    case "sin-internet":
      return { texto: "sin internet: usa la web publicada", tono: "respaldo" };
    case "otro-sistema":
      return { texto: "este portal usa su web publicada", tono: "respaldo" };
  }
}
