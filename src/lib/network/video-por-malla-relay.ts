"use client";

/*
 * video-por-malla-relay — HFR1018I · lado SERVIDOR del relé `capacidad.video.render`.
 * Pone el manejador PURO de `video-por-malla.ts` donde debe usarse: sobre el mesh
 * COMPARTIDO, con el patrón de `adjuntarServidorAstrauraMalla`/`adjuntarServidorIaMalla`
 * (namespaces disjuntos, nunca un mesh segundo). Las puertas puras se aplican aquí
 * antes de contestar: cuerpo por encima del tope (413), petición inválida (400),
 * cuenta/grupo sin permiso o recurso privado ajeno (403). Sin cola inyectada, la cola
 * ES el servicio «hyperframes» de ESTA neurona (127.0.0.1:4490, rutas de HFR1018P).
 * Todo inyectable: las pruebas no tocan red, disco, procesos ni reloj.
 */

import type { MeshHandle, PeerEvents } from "@/lib/network/webrtc-mesh";
import { getSharedMesh } from "@/lib/network/lan-sync";
import {
  parseCapacidadMallaMensaje, type MsgPedir, type MsgFin, type MsgError,
} from "@/lib/network/capacidad-por-malla";
import { SERVICIOS_CONOCIDOS, llamarServicio } from "@/lib/protomolecula/servicio-local";
import {
  VIDEO_MALLA_MAX_COMPOSICION, validarPeticionVideoRender, admiteVideoRenderMalla,
  extraerRecursosRemotos, validarRecursosRenderMalla, videoRenderPorMalla,
  type PeticionVideoRenderMalla, type ContextoServidaVideo,
} from "@/lib/network/video-por-malla";

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

/** Cola por defecto: el servicio «hyperframes» LOCAL de esta neurona (POST /render).
 * Solo se puede encolar una composición inline; un id suelto se resuelve donde vive
 * la entidad, no se convierte en un trabajo fantasma. */
async function encolarLocal(p: PeticionVideoRenderMalla): Promise<string> {
  if (typeof p.composicion !== "string" || !p.composicion.trim())
    throw new Error("la cola local necesita la composición inline de esta neurona");
  const def = SERVICIOS_CONOCIDOS.find((s) => s.id === "hyperframes");
  if (!def) throw new Error("esta neurona no declara el servicio «hyperframes»");
  const r = await llamarServicio(def, "/render", { composicion: p.composicion, formato: p.formato ?? "mp4" }, fetch, {});
  if (!r.ok) throw new Error(`el servicio «hyperframes» no admitió el render (${r.motivo})`);
  const id = r.datos && typeof (r.datos as { id?: unknown }).id === "string" ? (r.datos as { id: string }).id : "";
  if (!id) throw new Error("el servicio «hyperframes» no devolvió el id del trabajo");
  return id;
}

/** Puertas de transporte ANTES de encolar; `null` si la petición puede seguir. */
function rechazoDeEntrada(x: unknown, ctx: ContextoServidaVideo): { estado: number; motivo: string } | null {
  const composicion = x && typeof x === "object" ? (x as { composicion?: unknown }).composicion : undefined;
  if (typeof composicion === "string" && composicion.length > VIDEO_MALLA_MAX_COMPOSICION)
    return { estado: 413, motivo: "Rechazo: la composición inline excede el tope del relé; comparte solo su id." };
  const v = validarPeticionVideoRender(x);
  if (!v.ok) return { estado: 400, motivo: v.motivo };
  const a = admiteVideoRenderMalla(v.p, ctx);
  if (!a.ok) return { estado: 403, motivo: a.motivo };
  const r = validarRecursosRenderMalla(v.p);
  if (!r.ok) return { estado: 403, motivo: r.motivo };
  return null;
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
  const ctx: ContextoServidaVideo = { cuentaLocal: cuenta, gruposPresta: deps.gruposPresta?.() };
  const rechazo = rechazoDeEntrada(msg.cuerpo, ctx);
  if (rechazo) {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: rechazo.estado, mensaje: rechazo.motivo });
    return;
  }
  const plan = await videoRenderPorMalla(msg.cuerpo, ctx, { encolar: deps.encolar ?? encolarLocal });
  if (plan.aceptado) {
    const recursosRemotos = extraerRecursosRemotos(typeof msg.cuerpo.composicion === "string" ? msg.cuerpo.composicion : "").length;
    responder(mesh, peerId, { t: "capacidad.fin", id: msg.id, resultado: { trabajoId: plan.trabajoId, editableVisualmente: plan.editableVisualmente, recursosRemotos } });
  } else {
    responder(mesh, peerId, { t: "capacidad.error", id: msg.id, estado: 403, mensaje: plan.motivo });
  }
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
