"use client";

/*
 * video-por-malla — manejador PURO de `capacidad.video.render` (Ola 1018H · I).
 * Valida la petición y la encola; la elección de la neurona la hace la bolsa de
 * recursos. Admisión: peticiones de la misma cuenta o de un grupo con permiso en
 * esta neurona. La composición nunca se EDITA por el OS si trae GSAP (§2, licencia
 * GSAP Standard; ver detectarAdaptadores en video-html/adaptadores.ts) y ningún
 * recurso remoto ajeno sale a buscar: los recursos viajan con la petición o los
 * trae la bolsa. El resultado se REFERENCIA por su `trabajoId`, nunca se duplica
 * (contenido = entidad única). Todo inyectado: sin red, disco ni reloj aquí.
 * Contrato: architecture/video-hyperframes.md §2 y §4. El rol SERVIDOR que lo
 * conecta al canal real (`capacidad.pedir` tipo `render` sobre el mesh
 * compartido) vive en la sección final de este mismo módulo, con el mismo
 * patrón que `ia-por-malla.ts` y `astraura-por-malla.ts`.
 */

import { bytesUtf8, crearIdPeticion, parseCapacidadMallaMensaje, type MsgError, type MsgFin } from "./capacidad-por-malla";
import { getSharedMesh } from "./lan-sync";
import type { MeshHandle, PeerEvents } from "./webrtc-mesh";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export const FORMATOS_VIDEO = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoVideo = (typeof FORMATOS_VIDEO)[number];
export const TOPE_COMPOSICION_BYTES = 15 * 1024;

export interface PeticionRenderVideo {
  cuenta: string;
  grupo?: string;
  composicion: string;
  ordenes?: unknown[];
  formato?: FormatoVideo;
  variables?: Record<string, string | number | boolean>;
}

export interface PeticionEnCola {
  trabajoId: string;
  cuenta: string;
  grupo?: string;
  composicion: string;
  ordenes?: unknown[];
  formato: FormatoVideo;
  variables: Record<string, string | number | boolean>;
}

export interface ContextoRenderVideo {
  cuentaLocal: string;
  sesionGrupo?: string | null;
  /** Encola el trabajo y devuelve su id; `null` si la cola está llena. Inyectado. */
  encolar: (p: PeticionEnCola) => string | null;
  topeComposicionBytes?: number;
}

export type PlanRenderVideo =
  | { aceptado: true; trabajoId: string; motivo: string }
  | { aceptado: false; motivo: string };

const RE_REMOTO = /(?:src|href|poster)\s*=\s*["']?\s*https?:\/\/|url\(\s*["']?\s*https?:\/\//i;
const RE_DISCO = /(?:src|href|poster)\s*=\s*["']?\s*(?:\/|\.\.\/|~|[A-Za-z]:\\|\\\\)|url\(\s*["']?\s*(?:\/|\.\.\/|~|[A-Za-z]:\\|\\\\)/i;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function esVariablesValidas(v: unknown): boolean {
  return esObjeto(v) && Object.values(v).every(
    (x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean",
  );
}

/** Parseo defensivo del cuerpo: `null` si falta algo o hay algo no válido. Pura. */
export function parsearRenderVideo(x: unknown): PeticionRenderVideo | null {
  if (!esObjeto(x)) return null;
  const { cuenta, grupo, composicion, ordenes, formato, variables } = x;
  if (typeof cuenta !== "string" || !cuenta.trim()) return null;
  if (typeof composicion !== "string" || !composicion.trim()) return null;
  if (grupo !== undefined && typeof grupo !== "string") return null;
  if (ordenes !== undefined && !Array.isArray(ordenes)) return null;
  if (formato !== undefined && !(FORMATOS_VIDEO as readonly string[]).includes(formato as string)) return null;
  if (variables !== undefined && !esVariablesValidas(variables)) return null;
  return { cuenta, composicion, grupo, ordenes, formato, variables } as PeticionRenderVideo;
}

/** Admisión: misma cuenta SIEMPRE; grupo solo si esta neurona comparte esa sesión. Pura. */
export function admiteRenderVideo(
  p: { cuenta: string; grupo?: string },
  ctx: { cuentaLocal: string; sesionGrupo?: string | null },
): { ok: boolean; motivo: string } {
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && p.grupo === ctx.sesionGrupo) return { ok: true, motivo: `grupo «${p.grupo}» con permiso en esta neurona` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** Primer recurso prohibido de la composición, con motivo legible; `null` si no trae ninguno. */
export function primerRecursoProhibido(composicion: string): string | null {
  if (RE_REMOTO.test(composicion)) {
    return "La composición trae un recurso remoto: al renderizar nada ajeno sale a buscar; los recursos viajan con la petición o los trae la bolsa de recursos.";
  }
  if (RE_DISCO.test(composicion)) {
    return "La composición trae una ruta fuera del proyecto: los recursos del disco se declaran aparte (recursos), nunca dentro de la composición.";
  }
  return null;
}

/** `capacidad.video.render` (tipo `render`): admite, valida y encola. Pura. */
export function manejarRenderVideo(x: unknown, ctx: ContextoRenderVideo): PlanRenderVideo {
  const p = parsearRenderVideo(x);
  if (!p) return { aceptado: false, motivo: "Petición mal formada: cuenta, composición, formato o variables no válidas." };
  const puerta = admiteRenderVideo({ cuenta: p.cuenta, grupo: p.grupo }, ctx);
  if (!puerta.ok) return { aceptado: false, motivo: puerta.motivo };
  if (bytesUtf8(p.composicion) > (ctx.topeComposicionBytes ?? TOPE_COMPOSICION_BYTES)) {
    return { aceptado: false, motivo: "La composición es demasiado grande para el mensaje: viaja como banda por archivos-malla." };
  }
  const recurso = primerRecursoProhibido(p.composicion);
  if (recurso) return { aceptado: false, motivo: recurso };
  // Con GSAP se reproduce y se renderiza; lo que nunca hace el OS es EDITARLA (§2).
  const deteccion = detectarAdaptadores(p.composicion);
  if (deteccion.usados.includes("gsap") && (p.ordenes?.length ?? 0) > 0) {
    return { aceptado: false, motivo: `El OS no edita animaciones de GSAP: ${deteccion.motivo}` };
  }
  const formato = p.formato ?? "mp4";
  const encolado = ctx.encolar({
    trabajoId: `vr-${crearIdPeticion()}`,
    cuenta: p.cuenta,
    grupo: p.grupo,
    composicion: p.composicion,
    ordenes: p.ordenes,
    formato,
    variables: p.variables ?? {},
  });
  if (!encolado) return { aceptado: false, motivo: "La cola de render está llena: prueba más tarde." };
  return {
    aceptado: true,
    trabajoId: encolado,
    motivo: `${puerta.motivo} · render «${formato}» en la neurona que elija la bolsa de recursos; el resultado se referencia por su trabajoId`,
  };
}

/* ══════════ Rol SERVIDOR del relé `capacidad.video.render` sobre el mesh compartido ══════════ */

/** Porción del mesh que este rol necesita (un `MeshHandle` real la cumple). */
export type MeshServidorRender = Pick<MeshHandle, "userId" | "sendToPeer" | "onPeer">;

/** Piezas de la neurona que sirve, todas inyectables (pruebas sin mesh real). */
export interface DepsServidorRenderMalla {
  /** Cuenta de esta neurona; por defecto la cuenta del mesh compartido (`userId`). */
  cuentaLocal?: () => string | null;
  /** Sesión de grupo que esta neurona comparte aquí (por defecto, ninguna). */
  sesionGrupo?: () => string | null;
  /** La cola de render de esta neurona; sin una real, el rechazo es honesto (503). */
  encolar?: (p: PeticionEnCola) => string | null;
}

/** Código HTTP del rechazo según su motivo legible (el texto ya lo conoce el cliente). */
function estadoDeRechazo(motivo: string): number {
  if (motivo.includes("mal formada")) return 400;
  if (motivo.includes("demasiado grande")) return 413;
  if (motivo.includes("llena")) return 503;
  return 403;
}

/** Envia al peer sin lanzar: un peer que se va no puede romper la neurona que servía. */
function responder(mesh: Pick<MeshServidorRender, "sendToPeer">, peerId: string, msg: MsgFin | MsgError): void {
  try { mesh.sendToPeer(peerId, JSON.stringify(msg)); } catch { /* el peer ya no escucha */ }
}

/**
 * atenderPedidoRenderMalla — entrega UN `capacidad.pedir` tipo `render` al
 * manejador PURO y contesta con la REFERENCIA (`capacidad.fin` + `trabajoId`)
 * o un `capacidad.error` legible. Aquí no hay lógica: solo la malla entregando.
 */
export function atenderPedidoRenderMalla(
  mesh: Pick<MeshServidorRender, "userId" | "sendToPeer">,
  peerId: string,
  msg: { id: string; cuerpo: Record<string, unknown> },
  deps: DepsServidorRenderMalla,
): void {
  const cuentaLocal = deps.cuentaLocal?.() ?? mesh.userId;
  if (!cuentaLocal) {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 503, mensaje: "Esta neurona no atiende render ahora mismo: sin cuenta en el canal." });
    return;
  }
  if (typeof deps.encolar !== "function") {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 503, mensaje: "Esta neurona no tiene cola de render ahora mismo: lo privado no se arriesga." });
    return;
  }
  const ctx: ContextoRenderVideo = { cuentaLocal, sesionGrupo: deps.sesionGrupo?.() ?? null, encolar: deps.encolar };
  const plan = manejarRenderVideo(msg.cuerpo, ctx);
  if (plan.aceptado) {
    responder(mesh, peerId, { t: "capacidad.fin", id: msg.id, resultado: { trabajoId: plan.trabajoId, motivo: plan.motivo } });
    return;
  }
  responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: estadoDeRechazo(plan.motivo), mensaje: plan.motivo });
}

/**
 * adjuntarServidorRenderMalla — escucha en el mesh compartido los `capacidad.pedir`
 * tipo `render` y los entrega a `atenderPedidoRenderMalla`. Devuelve unsubscribe.
 */
export function adjuntarServidorRenderMalla(mesh: MeshServidorRender, deps: DepsServidorRenderMalla): () => void {
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseCapacidadMallaMensaje(data);
    if (!msg || msg.t !== "capacidad.pedir" || msg.tipo !== "render") return;
    atenderPedidoRenderMalla(mesh, peerId, msg, deps);
  };
  return mesh.onPeer({ onMessage });
}

let servidorRenderTimer: ReturnType<typeof setInterval> | null = null;
let servidorRenderUnsub: (() => void) | null = null;

/**
 * iniciarServidorRenderPorMalla — arranca (o reintenta hasta que exista) el rol
 * servidor sobre el mesh COMPARTIDO (`getSharedMesh()`; nunca abre uno segundo,
 * mismo patrón que `iniciarServidorIaPorMalla`). Idempotente. Devuelve parada.
 */
export function iniciarServidorRenderPorMalla(deps: DepsServidorRenderMalla = {}): () => void {
  let cancelado = false;
  const intentar = () => {
    if (cancelado || servidorRenderUnsub) return;
    const mesh = getSharedMesh();
    if (mesh) servidorRenderUnsub = adjuntarServidorRenderMalla(mesh, deps);
  };
  intentar();
  if (!servidorRenderUnsub) servidorRenderTimer = setInterval(intentar, 2000);
  return () => {
    cancelado = true;
    if (servidorRenderTimer) { clearInterval(servidorRenderTimer); servidorRenderTimer = null; }
    servidorRenderUnsub?.();
    servidorRenderUnsub = null;
  };
}
