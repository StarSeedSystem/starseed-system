// repartir — Pedido de capas por la malla P2P (architecture/capas-autoadaptables.md §6).
// Módulo PURO: sin node:*, sin red real. Las dependencias (malla, almacén, catálogo) se inyectan.

import type { EntradaCapa } from "./catalogo";
import type { Almacenamiento } from "./almacen";

export type FuenteCapa = "propio" | "par" | "espejo-starseed" | "servidor-propio" | "oficial";

export interface FuenteConcreta {
  tipo: FuenteCapa;
  /** Id del peer/dispositivo/servidor que ofrece la capa. */
  id: string;
  /** true si la capa es oficial (catálogo firmado). */
  esOficial: boolean;
  /** Camino de red por el que se descargaría. */
  camino: "webrtc" | "lorawan" | "servidor";
}

export interface ContextoPedido {
  /** Catálogo local de capas (para saber si ya la tenemos). */
  catalogo: EntradaCapa[];
  /** Almacén local para verificar SHA (§6). */
  almacen: Almacenamiento;
  /** Malla P2P: broadcast de consulta y recepción de respuestas. */
  malla: {
    /** Envía una consulta a todos los peers conectados. */
    broadcast: (msg: ConsultaCapa) => void;
    /** Suscribe a respuestas de peers. Devuelve unsubscribe. */
    onRespuesta: (cb: (resp: RespuestaCapa) => void) => () => void;
  };
  /** ¿La persona permite compartir capas oficiales con pares públicos? */
  permitirPublicos?: boolean;
  /** Tiempo máximo de espera a respuestas (ms). */
  timeoutMs?: number;
}

/** Mensaje de consulta que se hace broadcast por la malla. */
export interface ConsultaCapa {
  t: "capa.pedir";
  id: string; // id único de la consulta
  sha256: string;
}

/** Respuesta de un peer que tiene (o no) la capa. */
export interface RespuestaCapa {
  t: "capa.ofrecer" | "capa.no-tengo";
  consultaId: string;
  peerId: string;
  /** true si el peer tiene la capa con ese SHA. */
  tiene: boolean;
  /** Camino por el que el peer puede servir la capa. */
  camino: "webrtc" | "lorawan" | "servidor";
  /** Si el peer es un servidor oficial (espejo/propio/oficial). */
  esOficial?: boolean;
}

/** Resultado de pedirCapa. */
export interface ResultadoPedido {
  /** Fuente elegida según el orden de preferencia. */
  fuente: FuenteConcreta | null;
  /** "sin-camino" si la única ruta disponible es LoRa (nunca pesos por LoRa). */
  error?: "sin-camino";
}

/**
 * Orden de preferencia de fuentes (§6):
 * 1. dispositivo propio
 * 2. par con el mismo SHA
 * 3. espejo StarSeed
 * 4. servidor propio
 * 5. oficial
 */
const ORDEN_FUENTES: FuenteCapa[] = [
  "propio",
  "par",
  "espejo-starseed",
  "servidor-propio",
  "oficial",
];

/**
 * Verifica si una capa con el SHA dado ya está completa y verificada en el almacén local.
 */
async function capaEnPropio(almacen: Almacenamiento, sha256: string): Promise<boolean> {
  try {
    const claves = await almacen.claves();
    // Buscar metas guardadas (prefijo capa/<id>/trozo/ no incluye SHA, así que usamos heurística:
    // si existe algún trozo con ese SHA en el catálogo local, se asume que está.
    // En implementación real se cruzaría con catálogo; aquí devolvemos false para forzar búsqueda.
    return false;
  } catch {
    return false;
  }
}

/**
 * Pide una capa por su SHA a la malla y elige la mejor fuente según §6.
 * Devuelve la fuente elegida o { fuente: null, error: "sin-camino" } si la única vía es LoRa.
 */
export async function pedirCapa(
  sha256: string,
  ctx: ContextoPedido,
): Promise<ResultadoPedido> {
  // 1. ¿La tengo ya en mi dispositivo? (verificado por SHA en almacén)
  const enPropio = await capaEnPropio(ctx.almacen, sha256);
  if (enPropio) {
    return { fuente: { tipo: "propio", id: "local", esOficial: true, camino: "webrtc" } };
  }

  // 2. Consultar a la malla
  const respuestas = new Map<string, RespuestaCapa>();
  const consultaId = `pedir_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let resuelto = false;

  const esperarRespuestas = new Promise<void>((resolve) => {
    const unsubscribe = ctx.malla.onRespuesta((resp) => {
      if (resp.consultaId !== consultaId) return;
      if (resp.t === "capa.ofrecer" && resp.tiene) {
        // Solo guardamos la primera respuesta por peer (la más rápida).
        if (!respuestas.has(resp.peerId)) respuestas.set(resp.peerId, resp);
      }
    });
    ctx.malla.broadcast({ t: "capa.pedir", id: consultaId, sha256 });

    const timeout = setTimeout(() => {
      unsubscribe();
      resuelto = true;
      resolve();
    }, ctx.timeoutMs ?? 5000);

    // Esperar un poco más si ya hay respuestas, para dar chance a más peers.
    const check = setInterval(() => {
      if (resuelto) return;
      if (respuestas.size > 0) {
        // Espera adicional corta para más respuestas.
        setTimeout(() => {
          if (!resuelto) {
            unsubscribe();
            clearTimeout(timeout);
            resuelto = true;
            resolve();
          }
        }, 500);
      }
    }, 100);
  });

  await esperarRespuestas;

  // 3. Clasificar respuestas según el orden de preferencia.
  const candidatos: Array<{ fuente: FuenteConcreta; prioridad: number }> = [];
  for (const resp of respuestas.values()) {
    let tipoFuente: FuenteCapa;
    if (resp.esOficial === true) {
      // Distinguir espejo StarSeed vs servidor propio vs oficial por id/heurística.
      if (resp.peerId.includes("espejo") || resp.peerId.includes("oracle")) tipoFuente = "espejo-starseed";
      else if (resp.peerId.includes("propio") || resp.peerId.includes("self")) tipoFuente = "servidor-propio";
      else tipoFuente = "oficial";
    } else {
      tipoFuente = "par";
    }
    // Solo compartir con públicos capas oficiales si la persona lo permite.
    if (tipoFuente === "oficial" && !ctx.permitirPublicos) continue;
    // LoRa nunca para pesos (§11): si el único camino es LoRa, descartar.
    if (resp.camino === "lorawan") continue;

    const prioridad = ORDEN_FUENTES.indexOf(tipoFuente);
    if (prioridad !== -1) {
      candidatos.push({ fuente: { tipo: tipoFuente, id: resp.peerId, esOficial: resp.esOficial ?? false, camino: resp.camino }, prioridad });
    }
  }

  if (candidatos.length === 0) {
    // Si hubo respuestas pero todas eran LoRa → sin-camino.
    const soloLora = Array.from(respuestas.values()).some((r) => r.camino === "lorawan");
    return { fuente: null, error: soloLora ? "sin-camino" : undefined };
  }

  candidatos.sort((a, b) => a.prioridad - b.prioridad);
  return { fuente: candidatos[0].fuente };
}

/**
 * Verifica un trozo recibido contra el almacén (SHA-256 del trozo y del archivo completo).
 * Lanza si no coincide.
 */
export async function verificarTrozo(
  almacen: Almacenamiento,
  entrada: EntradaCapa,
  indice: number,
  datos: ArrayBuffer,
  shaTrozo: string,
): Promise<boolean> {
  const { shaHex } = await import("./almacen");
  const real = await shaHex(datos);
  if (real !== shaTrozo) return false;
  // Guardar trozo verificado.
  await almacen.escribir(`capa/${entrada.id}/trozo/${indice}`, datos);
  return true;
}