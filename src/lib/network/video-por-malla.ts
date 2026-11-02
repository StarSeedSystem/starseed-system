"use client";

/*
 * video-por-malla — HFR1018I · manejador PURO del relé `capacidad.video.render`
 * (capacidad-por-malla.ts, tipo `render`). La neurona que sirve admite solo
 * peticiones de la MISMA cuenta o de un GRUPO al que presta render; lo privado
 * nunca sale de las neuronas de su dueño. Comprueba que la composición no traiga
 * GSAP cuando el OS va a editarla (adaptadores.ts: licencia GSAP Standard, §2 del
 * contrato) y que ningún recurso remoto privado ajeno entre en el render. La
 * elección de la neurona la hace la bolsa de recursos (apps-en-la-malla.md §4);
 * aquí solo se valida y se encola. Contrato: architecture/video-hyperframes.md.
 * Todo inyectado: sin red, sin disco, sin procesos y sin reloj.
 */

import type { MeshHandle, PeerEvents } from "@/lib/network/webrtc-mesh";
import { getSharedMesh } from "@/lib/network/lan-sync";
import { detectarAdaptadores, type ResultadoDeteccion } from "@/lib/video-html/adaptadores";
import {
  crearIdPeticion, parseCapacidadMallaMensaje,
  type MsgPedir, type MsgFin, type MsgError,
} from "@/lib/network/capacidad-por-malla";

/* ═══════════════════ 1) Tipos y guard de la petición ═══════════════════ */

export const VIDEO_MALLA_MAX_COMPOSICION = 16 * 1024;

export type FormatoRenderVideo = "mp4" | "webm" | "mov" | "gif" | "png-sequence" | "hls";

export interface RecursoVideoRemoto { url: string; publico?: boolean; dueñoId?: string }

export interface PeticionVideoRenderMalla {
  cuenta: string;
  grupo?: string;
  privado?: boolean;
  composicion?: string;
  composicionId?: string;
  recursos?: RecursoVideoRemoto[];
  formato?: FormatoRenderVideo;
  duracionS?: number;
  variables?: Record<string, string>;
  editar?: boolean;
}

export interface ContextoServidaVideo {
  cuentaLocal: string;
  gruposPresta?: string[];
}

export type PlanVideoRenderMalla =
  | { aceptado: true; trabajoId: string; editableVisualmente: boolean; motivo: string }
  | { aceptado: false; motivo: string };

const FORMATOS: ReadonlySet<string> = new Set<FormatoRenderVideo>(["mp4", "webm", "mov", "gif", "png-sequence", "hls"]);

function hostDe(url: string): string {
  try { return new URL(url).host; } catch { return ""; }
}

export function validarPeticionVideoRender(x: unknown): { ok: true; p: PeticionVideoRenderMalla } | { ok: false; motivo: string } {
  if (!esObjeto(x) || typeof x.cuenta !== "string" || !x.cuenta.trim())
    return { ok: false, motivo: "Rechazo: falta la cuenta de quien pide." };
  const tieneId = typeof x.composicionId === "string" && x.composicionId.trim().length > 0;
  const tieneHtml = typeof x.composicion === "string" && x.composicion.trim().length > 0;
  if (!tieneId && !tieneHtml)
    return { ok: false, motivo: "Rechazo: falta la composición (inline o referenciada por id)." };
  if (tieneHtml && (x.composicion as string).length > VIDEO_MALLA_MAX_COMPOSICION)
    return { ok: false, motivo: "Rechazo: la composición inline excede el tope del relé; la entidad única ya está creada, comparte solo su id." };
  if (x.formato !== undefined && !FORMATOS.has(x.formato as string))
    return { ok: false, motivo: "Rechazo: formato no admitido (mp4, webm, mov, gif, png-sequence o hls)." };
  if (x.duracionS !== undefined && (!Number.isFinite(x.duracionS as number) || (x.duracionS as number) <= 0))
    return { ok: false, motivo: "Rechazo: la duración tiene que ser un número de segundos positivo." };
  return { ok: true, p: x as unknown as PeticionVideoRenderMalla };
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }

/* ═══════════════════ 2) Admisión y recursos remotos ═══════════════════ */

/** Admisión: misma cuenta SIEMPRE; grupo solo si la neurona presta a ese grupo; lo privado solo en su dueño. */
export function admiteVideoRenderMalla(p: PeticionVideoRenderMalla, ctx: ContextoServidaVideo): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Petición sin cuenta: nada que atender." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.privado) return { ok: false, motivo: "La composición es privada y no sale de las neuronas de su dueño." };
  if (p.grupo && (ctx.gruposPresta ?? []).includes(p.grupo))
    return { ok: true, motivo: `la neurona presta render al grupo «${p.grupo}»` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** URLs remotas (http/https) que la composición pide cargar; únicas y en orden de aparición. Pura. */
export function extraerRecursosRemotos(html: string): string[] {
  const vistos = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]+/gi)) vistos.add(m[0]);
  return [...vistos];
}

/** Toda URL que menciona la composición debe estar declarada; y cada recurso declarado ha de ser
 * público o propio (el recurso privado de otra cuenta nunca entra en un render de esta neurona). */
export function validarRecursosRenderMalla(p: PeticionVideoRenderMalla): { ok: boolean; motivo: string } {
  const declaradas = new Set((p.recursos ?? []).map((r) => r.url));
  const sinDeclarar = extraerRecursosRemotos(p.composicion ?? "").filter((u) => !declaradas.has(u));
  if (sinDeclarar.length)
    return { ok: false, motivo: `Rechazo: recurso remoto sin declarar en la petición (${hostDe(sinDeclarar[0])}).` };
  for (const r of p.recursos ?? []) {
    if (r.publico === true || r.dueñoId === p.cuenta) continue;
    return { ok: false, motivo: `Rechazo: recurso remoto privado ajeno (${hostDe(r.url)}); el contenido se referencia, no se duplica.` };
  }
  return { ok: true, motivo: "" };
}

/* ═══════════════════ 3) Manejador del relé ═══════════════════ */

export interface DepsVideoRenderMalla {
  /** Cola del servicio hyperframes de esta neurona (inyectada: aquí solo se valida y se encola). */
  encolar?: (p: PeticionVideoRenderMalla) => string | Promise<string>;
}

/** Manejador de `capacidad.pedir` (tipo `render`): valida, admite, comprueba GSAP al editar
 * y los recursos remotos, y encola. Nunca lanza: {aceptado,trabajoId} o rechazo legible. */
export async function videoRenderPorMalla(
  x: unknown,
  ctx: ContextoServidaVideo,
  deps: DepsVideoRenderMalla = {},
): Promise<PlanVideoRenderMalla> {
  const v = validarPeticionVideoRender(x);
  if (!v.ok) return { aceptado: false, motivo: v.motivo };
  const a = admiteVideoRenderMalla(v.p, ctx);
  if (!a.ok) return { aceptado: false, motivo: a.motivo };
  const r = validarRecursosRenderMalla(v.p);
  if (!r.ok) return { aceptado: false, motivo: r.motivo };
  let deteccion: ResultadoDeteccion | null = null;
  if (v.p.composicion) {
    deteccion = detectarAdaptadores(v.p.composicion);
    if (v.p.editar && deteccion.usados.includes("gsap"))
      return { aceptado: false, motivo: `Rechazo: el OS no edita composiciones con GSAP. ${deteccion.motivo}` };
  }
  try {
    const trabajoId = await (deps.encolar ?? (() => crearIdPeticion()))(v.p);
    return {
      aceptado: true,
      trabajoId,
      editableVisualmente: deteccion ? deteccion.editableVisualmente : true,
      motivo: `${a.motivo}${v.p.editar ? " · edición sin GSAP" : ""}`,
    };
  } catch (e) {
    return { aceptado: false, motivo: `Rechazo: la cola de render (${e instanceof Error ? e.message : "error al encolar"}).` };
  }
}

/* ═══════════════════ 4) Rol SERVIDOR del relé ═══════════════════ */

export type MeshRenderServidor = Pick<MeshHandle, "userId" | "sendToPeer" | "onPeer">;

/** Piezas de la neurona que sirve, todas inyectables (probar sin mesh real). */
export interface DepsServidorRenderMalla {
  cuentaLocal?: () => string | null;
  gruposPresta?: () => string[];
  encolar?: (p: PeticionVideoRenderMalla) => string | Promise<string>;
}

/** Responde por el canal sin lanzar: un peer que se va no rompe la neurona que servía. */
function responder(mesh: Pick<MeshRenderServidor, "sendToPeer">, peerId: string, msg: MsgFin | MsgError): void {
  try { mesh.sendToPeer(peerId, JSON.stringify(msg)); } catch { /* el peer ya no escucha */ }
}

/** Entrega UNA `capacidad.pedir` (tipo `render`) al manejador PURO y contesta
 * la REFERENCIA (`trabajoId`) o el rechazo legible. Ningún error sin mensaje. */
export async function atenderPedidoRenderMalla(
  mesh: Pick<MeshRenderServidor, "userId" | "sendToPeer">,
  peerId: string,
  msg: Pick<MsgPedir, "id" | "cuerpo">,
  deps: DepsServidorRenderMalla = {},
): Promise<void> {
  const cuenta = deps.cuentaLocal?.() ?? mesh.userId;
  if (!cuenta) {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 503, mensaje: "Esta neurona no atiende render ahora mismo: sin cuenta en el canal." });
    return;
  }
  // La petición mal formada es un 400; el resto (admisión, GSAP, recursos,
  // cola) lo juzga el manejador puro y sale como 403 legible.
  const v = validarPeticionVideoRender(msg.cuerpo);
  if (!v.ok) {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 400, mensaje: v.motivo });
    return;
  }
  const ctx: ContextoServidaVideo = { cuentaLocal: cuenta, gruposPresta: deps.gruposPresta?.() };
  const plan = await videoRenderPorMalla(msg.cuerpo, ctx, { encolar: deps.encolar });
  if (plan.aceptado)
    responder(mesh, peerId, { t: "capacidad.fin", id: msg.id, resultado: { trabajoId: plan.trabajoId, editableVisualmente: plan.editableVisualmente } });
  else
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 403, mensaje: plan.motivo });
}

/** Escucha `capacidad.pedir` tipo `render` en el mesh compartido y los entrega
 * al manejador puro. Devuelve unsubscribe. Namespace `capacidad.*`, disjunto
 * de `astraura.*`, `ia.*` y `archivo.*` que conviven en el mismo canal. */
export function adjuntarServidorRenderMalla(mesh: MeshRenderServidor, deps: DepsServidorRenderMalla = {}): () => void {
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseCapacidadMallaMensaje(data);
    if (msg?.t === "capacidad.pedir" && msg.tipo === "render") void atenderPedidoRenderMalla(mesh, peerId, msg, deps);
  };
  return mesh.onPeer({ onMessage });
}

let servidorRenderTimer: ReturnType<typeof setInterval> | null = null;
let servidorRenderUnsub: (() => void) | null = null;

/** Arranca (o reintenta hasta que exista) el servidor sobre el MISMO mesh
 * compartido; nunca abre uno segundo. Idempotente, hermano de
 * `iniciarServidorIaPorMalla`. */
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
