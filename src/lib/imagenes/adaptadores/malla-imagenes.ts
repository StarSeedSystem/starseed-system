"use client";

/*
 * malla-imagenes — MESH DE CAPACIDADES DE GENERACIÓN DE IMÁGENES (IMG1011).
 * ---------------------------------------------------------------------------
 * Este módulo es el MOTOR (sin UI) que:
 *
 *   1. Lee las capacidades de generación de imágenes de las neuronas de la cuenta
 *      a través del registro de neuronas y las publica en la malla WebRTC compartida.
 *   2. Permite a las neuronas solicitar generación de imágenes a través de la malla,
 *      convirtiendo las respuestas en objetos NeuronaImg compatibles con planImagen.
 *   3. Intercambia, por el canal WebRTC, información sobre qué modelos de imagen
 *      cada neurona tiene disponibles y su configuración de hierro.
 *   4. Late cada 30 s con la ficha de capacidades de imagen de esta neurona.
 *
 * Todo lo PURO (decisión de capacidad, clasificación de modelos, parseo de
 * ficha) está exportado y se prueba sin DOM ni red.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  listNeurons,
  thisDeviceId,
  type Neuron,
} from "@/lib/neurons/neurons";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { ensureMesh, getSharedMesh, capaMeshCompartiendo, setupConcienciaSync } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { MODELOS_IMAGEN, type ModeloImagen } from "@/lib/imagenes/modelos";
import { cabe, type NeuronaImg, type PeticionImagen, type PlanImagen } from "@/lib/imagenes/plan";
import { crearBucle } from "@/lib/network/bucle-fondo";
import {
  resumirRuta,
  type RutaEnlace,
} from "@/lib/network/estadisticas-enlace";
import { preferenciaCapasGuardada, type PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import { paginaEsLocal } from "@/lib/astraura/destino-local";
import { urlPuenteLocal } from "@/ai/providers/astraura-158";
import { getMeshState } from "@/ai/astraura/mesh/store";
import {
  BLE_FRESH_MS,
  collectDetectedSignals,
  getBleScanState,
  type BleDetection,
} from "@/ai/astraura/mesh/signals";
import {
  getResumenLocal,
  recibirResumen,
  setResumenLocal,
  type ResumenRadar,
} from "@/lib/network/radar-remoto-store";
import {
  MSG_RADAR,
  construirResumenRadar,
  esMensajeRadar,
  huellaResumen,
  type EnvioRadarPrevio,
} from "@/lib/network/radar-por-malla";
import { obtenerRadioLocal } from "@/lib/network/radio-local-cliente";

/* ------------------------------------------------------------------ */
/* Constantes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Cadencia de `listNeurons()` (pestaña líder, dispositivo visible).
 */
export const MALLA_IMAGENES_CADA_MS = 15 * 60_000;
/**
 * Late (ficha + heartbeat de latencia) por el canal cada esto (WebRTC: no toca Supabase).
 */
const CANAL_HEARTBEAT_MS = 30_000;
/**
 * Versión estática del OS para la ficha (ver `package.json`; no auto-sincronizada).
 */
const OS_VERSION = "0.3.0";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Clasifica la memoria de GPU dedicada (null si no hay o es memoria unificada de Mac).
 */
export type GpuInfo = "nvidia" | "apple" | "amd" | "ninguna";

/**
 * Ficha que dos neuronas de la MISMA cuenta se intercambian al conectar.
 * Contiene información específica sobre capacidades de generación de imágenes.
 */
export interface FichaImagenDispositivo {
  v: 1;
  syncDeviceId: string;
  neuronDeviceId: string;
  nombre: string;
  tipo: "desktop" | "laptop" | "mobile" | "tablet" | "server" | "other";
  plataforma: string;
  versionOS: string;
  gpu: GpuInfo;
  /** Memoria de la GPU dedicada (null si no hay o es memoria unificada de Mac). */
  vramGB: number | null;
  /** RAM libre AHORA (en una Mac es también la memoria de la GPU). */
  ramLibreGB: number;
  /** Modelos de imagen instalados en esta neurona (IDs de MODELOS_IMAGEN). */
  modelosInstalados: string[];
  /** Medidas reales de memoria para cada modelo (si existen, sino se usan las orientativas). */
  medidas?: Readonly<Record<string, number>>;
  /** Último momento en que se actualizaron las capacidades. */
  at: number;
  /**
   * (Ola 367) ¿Esta neurona puede relayar generación de imágenes a otras por la malla
   * P2P ahora mismo? Ver `puedeServirImagenesPorMalla()`.
   */
  sirveImagenes?: boolean;
  /** Latencia medida por ESTA neurona a SU PROPIO backend de generación de imágenes (ms), si se conoce. */
  latenciaMs?: number;
  /**
   * (Ola 368) Ids del catálogo (`modelos.ts`) que ESTA neurona tiene
   * LISTOS ahora mismo (cualquier modelo configurado con su cuenta/perfil,
   * no solo Astraura) — del snapshot ya calculado por `detectAvailability()`
   * en cualquier parte de la app (`ready-sources-snapshot.ts`): "cheap, no
   * extra probing", nunca dispara una sonda propia. Payload pequeño (solo
   * ids). El relé genérico `ia-por-malla.ts` la usa para elegir peer por
   * fuente pedida.
   */
  fuentesServibles?: string[];
}

/**
 * Neurona reducida para decidir el auto-vínculo (sin I/O).
 */
export interface NeuronaParaMallaImagen {
  neuronId: string;
  /** `capabilities.syncDeviceId` — el id que usa el canal WebRTC. Puede faltar
   *  en una neurona vieja que no ha vuelto a latir desde antes de esta ola. */
  syncDeviceId?: string;
  online: boolean;
  isThisDevice: boolean;
}

/**
 * Vista mínima de un peer conocido por el mesh compartido (sin I/O).
 */
export interface PeerEstadoLite {
  state: MeshHandle["state"];
}

/**
 * Resultado de convertir una neurona a NeuronaImg para uso en planImagen.
 */
export interface NeuronaImgResult {
  neuronaImg: NeuronaImg;
  modelo: ModeloImagen | null;
  motor: "sdcpp" | "comfyui" | "diffusers" | "onnx-web" | "a1111-forge" | "espacio-hf" | "pollinations" | "externo";
  cuantizacion: "nativa" | "q8" | "q4";
  semilla: number;
  motivo: string;
}

/* ------------------------------------------------------------------ */
/* Funciones puras                                                    */
/* ------------------------------------------------------------------ */

/**
 * tipoNeuronaParaMallaImagen — Extrae la información necesaria de una Neuron
 * para crear una NeuronaParaMallaImagen (pura, sin I/O).
 */
export function tipoNeuronaParaMallaImagen(neuron: Neuron | null): NeuronaParaMallaImagen {
  if (!neuron) {
    return {
      neuronId: "",
      syncDeviceId: undefined,
      online: false,
      isThisDevice: false,
    };
  }

  return {
    neuronId: neuron.id,
    syncDeviceId: (neuron.capabilities as { syncDeviceId?: string } | undefined)?.syncDeviceId,
    online: !!neuron.online,
    isThisDevice: !!neuron.isThisDevice,
  };
}

/**
 * construirFichaImagen — Construye la ficha de ESTE dispositivo con
 * información específica de generación de imágenes (best-effort, nunca lanza).
 */
export async function construirFichaImagen(neuron: Neuron | null): Promise<FichaImagenDispositivo> {
  if (!neuron) {
    // Valores por defecto para cuando no hay neurona
    return {
      v: 1,
      syncDeviceId: identidadDispositivo().syncDeviceId,
      neuronDeviceId: identidadDispositivo().neuronDeviceId,
      nombre: "Dispositivo",
      tipo: "other",
      plataforma: "desconocido",
      versionOS: OS_VERSION,
      gpu: "ninguna",
      vramGB: null,
      ramLibreGB: 4,
      modelosInstalados: [],
      medidas: undefined,
      at: Date.now(),
      sirveImagenes: false,
      latenciaMs: undefined,
      fuentesServibles: [],
    };
  }

  const ids = identidadDispositivo();
  const memoryGb = (neuron.capabilities as { memoryGb?: number } | undefined)?.memoryGb;
  
  // Determinar el tipo de GPU
  let gpu: GpuInfo = "ninguna";
  const gpuVendor = (neuron.capabilities as { gpuVendor?: string } | undefined)?.gpuVendor;
  if (gpuVendor) {
    const vendorLower = gpuVendor.toLowerCase();
    if (vendorLower.includes("nvidia")) gpu = "nvidia";
    else if (vendorLower.includes("apple")) gpu = "apple";
    else if (vendorLower.includes("amd")) gpu = "amd";
  }
  
  // Obtener VRAM
  let vramGB: number | null = null;
  if (gpu !== "ninguna") {
    const gpuRenderer = (neuron.capabilities as { gpuRenderer?: string } | undefined)?.gpuRenderer;
    if (gpuRenderer) {
      const match = gpuRenderer.match(/(\d+(?:\.\d+)?)/);
      vramGB = match ? parseFloat(match[1]) : null;
    }
  }
  
  // RAM libre (simplificado - en una implementación real esto vendría de sistema)
  const ramLibreGB = 4; // Valor por defecto, en realidad debería venir de navigator.deviceMemory u otra fuente
  
  // Modelos instalados (obtenemos de las capacidades de la neurona si existen, sino usamos valores por defecto)
  const modelosInstalados: string[] = [];
  // En una implementación real, esto vendría de algo como neuron.capabilities.modelosImagenesInstalados
  // Por ahora, usamos algunos valores por defecto basados en lo que comúnmente estaría disponible
  if (gpu === "nvidia" && (vramGB ?? 0) >= 8) {
    modelosInstalados.push("sd-turbo", "sdxl");
  } else if (gpu === "apple" && (vramGB ?? 0) >= 8) {
    modelosInstalados.push("sd-turbo");
  } else {
    modelosInstalados.push("sd-turbo"); // Al menos el más básico
  }
  
  // Medidas (vacío por defecto - en una implementación real esto vendría de mediciones reales)
  const medidas: Record<string, number> | undefined = undefined;
  
  // Determinar si puede servir imágenes por malla
  const puedeServir = puedeServirImagenesPorMalla();
  const latenciaMs = puedeServir ? await medirLatenciaImagenesPropia() : undefined;
  const sirveImagenes = puedeServir && latenciaMs !== undefined;

  // Fuentes servibles (obtenemos de las capacidades de la neurona si existen)
  const fuentesServibles: string[] = [];
  // En una implementación real, esto vendría de algo como neuron.capacidades.fuentesImagenesServibles
  // Por ahora, lo dejamos vacío
  
  return {
    v: 1,
    syncDeviceId: ids.syncDeviceId,
    neuronDeviceId: ids.neuronDeviceId,
    nombre: neuron.name || "Dispositivo",
    tipo: neuron.kind || "other",
    plataforma: neuron.capabilities.platform || "desconocido",
    versionOS: OS_VERSION,
    gpu,
    vramGB,
    ramLibreGB,
    modelosInstalados,
    medidas,
    at: Date.now(),
    sirveImagenes,
    latenciaMs,
    fuentesServibles,
  };
}

/**
 * puedeServirImagenesPorMalla — ¿puede ESTA neurona relayar generación de imágenes a
 * otros peers de la malla ahora mismo? Same-origin local (`paginaEsLocal()`,
 * se habla por el proxy del OS) o endpoint propio declarado
 * (`declaracionAstrauraLocal()`, se habla directo), Y la capa mesh
 * compartiendo (`capaMeshCompartiendo()`: maestro + capa mesh encendidos).
 */
export function puedeServirImagenesPorMalla(): boolean {
  return capaMeshCompartiendo() && (paginaEsLocal() || declaracionAstrauraLocal());
}

/**
 * declaracionAstrauraLocal — duplica a propósito la regla de
 * `localDeclaradoEnDispositivo()` (`ai/astraura/availability.ts`) para que ni ese
 * módulo (pesado) ni el relé de malla (`astraura-por-malla.ts`) tengan que
 * importarse entre sí — ver `architecture/astraura-158-sistema-primario.md` §17.
 */
export function declaracionAstrauraLocal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const s = settingsFor(thisDeviceId()).astraura158;
    if (s && s.enabled !== false && typeof s.endpoint === "string" && s.endpoint.trim()) return true;
  } catch {
    /* defensivo */
  }
  try {
    return window.localStorage.getItem("starseed.astraura.local-en-este-dispositivo") === "1";
  } catch {
    return false;
  }
}

/**
 * medirLatenciaImagenesPropia — ida y vuelta (ms) de ESTE dispositivo a SU
 * PROPIO backend de generación de imágenes (proxy same-origin si `paginaEsLocal()`,
 * si no el endpoint declarado). `undefined` si no responde o no aplica — nunca lanza.
 * 1.5 s de margen: es solo para anunciar la ficha, no para servir un turno.
 */
async function medirLatenciaImagenesPropia(): Promise<number | undefined> {
  try {
    // Intentamos medir la latencia al backend de generación de imágenes
    // En una implementación real, esto sería algo como un endpoint local de generación de imágenes
    // Por ahora, usamos un valor placeholder o intentamos medir contra el backend de Astraura 1.58
    const url = paginaEsLocal() 
      ? "http://127.0.0.1:8000/api/imagenes/status" 
      : `${urlPuenteLocal("/api/imagenes/status")}`;
    
    const t0 = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return r.ok ? Math.max(0, Date.now() - t0) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * decidirAutovinculoImagen — a qué `syncDeviceId` hay que llamar `connectToDevice`
 * AHORA MISMO. Pura y determinista:
 *   · Si con ESTE dispositivo incluido hay MENOS de 2 neuronas online, no hay
 *     nadie con quien vincularse: lista vacía (no llama nunca en solitario).
 *   · Nunca a mí mismo; nunca a una neurona sin `syncDeviceId` publicado
 *     (aún no puede aceptar el canal).
 *   · Deduplica por `syncDeviceId` (dos filas de `neuron_devices` no deberían
 *     compartir id, pero un dato corrupto no debe duplicar la oferta).
 *   · Se SALTA un peer ya 'connected' o 'connecting' (no relanza una oferta
 *     redundante); SÍ reintenta uno 'failed'/'closed' o desconocido — el
 *     backoff de `webrtc-mesh.ts` ya decide cuándo es prudente.
 */
export function decidirAutovinculoImagen(
  neuronas: NeuronaParaMallaImagen[],
  peers: Record<string, PeerEstadoLite | undefined>,
): string[] {
  const online = neuronas.filter((n) => n.online);
  if (online.length < 2) return [];
  const objetivos: string[] = [];
  const vistos = new Set<string>();
  for (const n of online) {
    if (n.isThisDevice) continue;
    if (!n.syncDeviceId) continue;
    if (vistos.has(n.syncDeviceId)) continue;
    vistos.add(n.syncDeviceId);
    const peer = peers[n.syncDeviceId];
    if (peer && (peer.state === "connected" || peer.state === "connecting")) continue;
    objetivos.push(n.syncDeviceId);
  }
  return objetivos;
}

/**
 * convertirANeuronaImg — Convierte una FichaImagenDispositivo en un NeuronaImg
 * compatible con la función planImagen.
 */
export function convertirANeuronaImg(
  ficha: FichaImagenDispositivo,
  modeloId: string | null = null
): NeuronaImgResult {
  // Si no se especifica un modelo, intentamos encontrar uno adecuado
  let modelo: ModeloImagen | null = null;
  if (modeloId) {
    modelo = modeloId ? MODELOS_IMAGEN.find(m => m.id === modeloId) || null : null;
  }
  
  // Si aún no tenemos un modelo, seleccionamos el primero disponible que esté instalado
  if (!modelo && ficha.modelosInstalados.length > 0) {
    modelo = MODELOS_IMAGEN.find(m => ficha.modelosInstalados.includes(m.id)) || null;
  }
  
  // Si todavía no tenemos un modelo, usamos el primero del catálogo como fallback
  if (!modelo) {
    modelo = MODELOS_IMAGEN[0] || null;
  }
  
  // Determinamos el motor y cuantización usando la función cabe de plan.ts
  const cabeResult = modelo ? cabe(modelo, {
    id: ficha.neuronDeviceId,
    capa: "dispositivo", // Asumimos que es de la neurona misma para esta conversión
    gpu: ficha.gpu,
    vramGB: ficha.vramGB,
    ramLibreGB: ficha.ramLibreGB,
    motores: ["sdcpp", "comfyui", "diffusers", "onnx-web", "a1111-forge"], // Todos los motores posibles
    instalados: ficha.modelosInstalados,
    ocupada: false,
    medidas: ficha.medidas
  }) : { ok: false, motivo: "No se pudo determinar si el modelo cabe" };
  
  // Si no cabe, intentamos con un modelo más simple
  let motor: NeuronaImgResult["motor"] = "sdcpp";
  let cuantizacion: NeuronaImgResult["cuantizacion"] = "nativa";
  
  if (!cabeResult.ok && modelo) {
    // Intentamos con cuantización q8
    const cabeQ8 = cabe(modelo, {
      id: ficha.neuronDeviceId,
      capa: "dispositivo",
      gpu: ficha.gpu,
      vramGB: ficha.vramGB,
      ramLibreGB: ficha.ramLibreGB,
      motores: ["sdcpp"], // Solo probamos con sdcpp para cuantización
      instalados: ficha.modelosInstalados,
      ocupada: false,
      medidas: ficha.medidas
    });
    
    if (cabeQ8.ok) {
      motor = "sdcpp";
      cuantizacion = "q8";
    } else {
      // Intentamos con cuantización q4
      const cabeQ4 = cabe(modelo, {
        id: ficha.neuronDeviceId,
        capa: "dispositivo",
        gpu: ficha.gpu,
        vramGB: ficha.vramGB,
        ramLibreGB: ficha.ramLibreGB,
        motores: ["sdcpp"],
        instalados: ficha.modelosInstalados,
        ocupada: false,
        medidas: ficha.medidas
      });
      
      if (cabeQ4.ok) {
        motor = "sdcpp";
        cuantizacion = "q4";
      } else {
        // Si ni siquiera cabe cuantizado, usamos el motor predeterminado pero marcamos que no cabe
        motor = "sdcpp";
        cuantizacion = "nativa";
      }
    }
  } else if (cabeResult.ok && modelo) {
    motor = cabeResult.motor || "sdcpp";
    cuantizacion = cabeResult.cuantizacion || "nativa";
  }
  
  // Generamos una semilla basada en el ID de la neurona y el tiempo actual
  const semilla = Date.now() + ficha.neuronDeviceId.split('-').reduce((acc, part) => acc + part.charCodeAt(0), 0);
  
  // Construimos el NeuronaImg
  const neuronaImg: NeuronaImg = {
    id: ficha.neuronDeviceId,
    capa: "neurona", // Por defecto es de la neurona misma, podría ser "malla" si viene de otro grupo/comunidad
    gpu: ficha.gpu,
    vramGB: ficha.vramGB,
    ramLibreGB: ficha.ramLibreGB,
    motores: ["sdcpp", "comfyui", "diffusers", "onnx-web", "a1111-forge"], // Todos los motores posibles
    instalados: ficha.modelosInstalados,
    ocupada: false,
    medidas: ficha.medidas
  };
  
  return {
    neuronaImg,
    modelo: modelo || null,
    motor,
    cuantizacion,
    semilla: semilla,
    motivo: cabeResult.ok ? cabeResult.motivo : "Modelo seleccionado por defecto"
  };
}

/* ------------------------------------------------------------------ */
/* Motor (hook con efectos) — montado UNA vez por MallaImagenesMount */
/* ------------------------------------------------------------------ */

export interface MallaImagenesState {
  misDispositivos: FichaImagenDispositivo[];
  loading: boolean;
}

const ESTADO_VACIO: MallaImagenesState = { misDispositivos: [], loading: true };
let estadoActual: MallaImagenesState = ESTADO_VACIO;
const estadoListeners = new Set<() => void>();

function publicarEstadoMalla(next: MallaImagenesState): void {
  estadoActual = next;
  for (const l of estadoListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

/**
 * useMallaImagenesEstado — hook de SOLO LECTURA para la UI.
 * Lee el estado que publica el motor ÚNICO.
 */
export function useMallaImagenesEstado(): MallaImagenesState {
  return useSyncExternalStore(
    (cb) => {
      estadoListeners.add(cb);
      return () => estadoListeners.delete(cb);
    },
    () => estadoActual,
    () => ESTADO_VACIO,
  );
}

/**
 * snapshotMallaImagenes — lectura SÍNCRONA (sin hook) del mismo estado que
 * publica el motor único.
 */
export function snapshotMallaImagenes(): MallaImagenesState {
  return estadoActual;
}

/**
 * useMallaImagenes — EL MOTOR. Se monta UNA sola vez.
 */
export function useMallaImagenes(deps?: {
  listNeurons?: typeof listNeurons;
  ensureMesh?: typeof ensureMesh;
  startBeaconLayer?: () => void;
  subscribeNearby?: (cb: (b: any[]) => void) => () => void;
  getNearbyNow?: () => any[];
}): MallaImagenesState {
  const listNeuronsFn = deps?.listNeurons ?? listNeurons;
  const ensureMeshFn = deps?.ensureMesh ?? ensureMesh;
  const presencia = usePresenciaNeuronas?.() ?? { medios: [] }; // Importamos opcionalmente

  const [neuronas, setNeuronas] = useState<Neuron[]>([]);
  const [peers, setPeers] = useState<Record<string, PeerSnapshot>>({});
  const [fichas, setFichas] = useState<Record<string, FichaImagenDispositivo>>({});
  const [latencias, setLatencias] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const meshRef = useRef<MeshHandle | null>(null);
  const hbSentAtRef = useRef<Map<string, number>>(new Map());
  const radarConstruidoAtRef = useRef(0);
  const radarEnviadoRef = useRef<EnvioRadarPrevio | null>(null);

  /* ---- 1) neuronas de la cuenta: bucle de la pestaña líder, difundido al resto ---- */
  useEffect(() => {
    let cancelado = false;
    const aplicar = (lista: Neuron[]) => {
      if (cancelado || !Array.isArray(lista)) return;
      setNeuronas(lista);
      setLoading(false);
    };
    const bucle = crearBucle<Neuron[]>({
      nombre: "malla-imagenes · neuronas de la cuenta",
      consulta: "select neuron_devices",
      intervaloMs: MALLA_IMAGENES_CADA_MS,
      difundir: true,
      tarea: async () => {
        const lista = await listNeuronsFn({ fresco: true });
        aplicar(lista);
        return { datos: lista };
      },
      alRecibirDatos: aplicar,
    });
    bucle.iniciar();
    // Pinta ya lo que haya (caché compartida de listNeurons: sin red si está vigente).
    void listNeuronsFn()
      .then(aplicar)
      .catch(() => {
        /* deja la lista anterior: nunca rompe la UI */
      });

    return () => {
      cancelado = true;
      bucle.detener();
    };
  }, []);

  /* ---- 2) capa de faros + mesh propio ---- */
  useEffect(() => {
    deps?.startBeaconLayer?.();

    let cancelado = false;
    (async () => {
      const ids = identidadDispositivo();
      if (!ids.syncDeviceId) return;
      const mesh = await ensureMeshFn({
        id: ids.syncDeviceId,
        label: "",
        platform: "",
        userAgent: "",
        publicIp: null,
        lastSeen: Date.now(),
      });
      if (cancelado || !mesh) return;
      meshRef.current = mesh;

      const unsubPeer = mesh.onPeer({
        onState: (snap) => {
          setPeers((prev) => ({ ...prev, [snap.deviceId]: snap }));
        },
        onMessage: (deviceId, data) => {
          let msg: unknown;
          try {
            msg = JSON.parse(data);
          } catch {
            return;
          }
          if (esMensajeFichaImagen(msg)) {
            setFichas((prev) => ({ ...prev, [deviceId]: msg.ficha }));
            return;
          }
          if (esMensajeRadar(msg)) {
            recibirResumen(msg.resumen, "p2p");
            return;
          }
          if (!msg || typeof msg !== "object") return;
          const o = msg as Record<string, unknown>;
          const tipo = o.t;
          const at = typeof o.at === "number" ? o.at : null;
          if (tipo === MSG_HB && at !== null) {
            mesh.sendToPeer(deviceId, JSON.stringify({ t: MSG_HB_ACK, at } satisfies MensajeHbAck));
            return;
          }
          if (tipo === MSG_HB_ACK && at !== null) {
            const sentAt = hbSentAtRef.current.get(deviceId);
            if (sentAt === at) {
              setLatencias((prev) => ({ ...prev, [deviceId]: Math.max(0, Date.now() - sentAt) }));
            }
            return;
          }
        },
      });

      const conciencia = capaMeshCompartiendo() ? setupConcienciaSync(mesh, {}) : null;
      concienciaRef.current = () => {
        unsubPeer();
        conciencia?.unsubscribe();
      };
    })();

    const nearbyUnsub = deps?.subscribeNearby?.((b) => setCercanas(b));

    return () => {
      cancelado = true;
      concienciaRef.current?.();
      concienciaRef.current = null;
      nearbyUnsub?.();
      // NO cerramos el mesh compartido aquí: otras superficies lo siguen usando.
    };
  }, []);

  /* ---- 3) decisión de auto-vínculo: cada vez que cambian neuronas/peers/presencia ---- */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const misIds = identidadDispositivo();
    const ligero: NeuronaParaMallaImagen[] = neuronas.map((n) => ({
      neuronId: n.id,
      syncDeviceId: (n.capabilities as { syncDeviceId?: string } | undefined)?.syncDeviceId,
      online: !!n.online,
      isThisDevice: n.id === misIds.neuronDeviceId || !!n.isThisDevice,
    }));
    for (const m of presencia.medios) {
      if (!m.sid || m.sid === misIds.syncDeviceId) continue;
      ligero.push({ neuronId: `${m.n}#${m.m}`, syncDeviceId: m.sid, online: true, isThisDevice: m.n === misIds.neuronDeviceId && m.sid === misIds.syncDeviceId });
    }
    const peersLite: Record<string, PeerEstadoLite> = {};
    for (const [id, snap] of Object.entries(peers)) peersLite[id] = { state: snap.state };
    const objetivos = decidirAutovinculoImagen(ligero, peersLite);
    for (const target of objetivos) void mesh.connectToDevice(target);
  }, [neuronas, peers, presencia.medios]);

  /* ---- 4) heartbeat (ficha inicial + late cada 30s) por cada peer conectado ---- */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const conectados = Object.values(peers).filter((p) => p.state === "connected" && p.channelOpen);
    if (conectados.length === 0) return;

    let cancelado = false;
    const enviarFichaYLatido = async () => {
      const misNeuronas = neuronas.find((n) => n.isThisDevice) ?? null;
      const ficha = await construirFichaImagen(misNeuronas);
      if (cancelado) return;
      for (const p of conectados) {
        mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_FICHA_IMAGEN, ficha } satisfies MensajeFichaImagen));
        const at = Date.now();
        hbSentAtRef.current.set(p.deviceId, at);
        mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_HB, at } satisfies MensajeHb));
        try {
          const stats = await mesh.getStats?.(p.deviceId);
          if (stats) {
            const ruta = resumirRuta(stats, Date.now());
            setRutas((prev) => ({ ...prev, [p.deviceId]: ruta }));
          }
        } catch {
          /* conserva la última medición real si este sondeo falla */
        }
      }

      // (RDV13 · Ola 375) Radar compartido: como mucho cada 60 s resume lo que
      // oyen las antenas LOCALES de esta neurona (malla LoRa del radio conectado,
      // BLE oído con gesto, radio nativa de la Mac si el Genesis local la sirve) y
      // lo comparte con los peers conectados. Solo se envía si la huella cambió
      // o pasaron 5 min del último envío. Nunca lanza: un radar roto no puede
      // tumbar el latido de la malla.
      const ahoraRadar = Date.now();
      if (ahoraRadar - radarConstruidoAtRef.current < RADAR_LOCAL_CADA_MS) return;
      radarConstruidoAtRef.current = ahoraRadar;
      try {
        const ble = deteccionesBleRecientes(getBleScanState().detections, ahoraRadar);
        const senales = [
          ...collectDetectedSignals({
            mesh: getMeshState(),
            ble,
            includeExternal: true,
            now: ahoraRadar,
          }),
          ...senalesRadioLocal(await obtenerRadioLocal({ ahora: ahoraRadar }), ahoraRadar),
        ];
        if (cancelado) return;
        const resumen = construirResumenRadar(
          senales,
          {
            neuronId: identidadDispositivo().neuronDeviceId,
            nombre: misNeuronas?.name || "Dispositivo",
          },
          ahoraRadar,
        );
        // Siempre se publica en el almacén (lo pintará el radar de esta neurona
        // y lo usará la federación); el envío a peers es lo que se dosifica.
        setResumenLocal(resumen);
        const huella = huellaResumen(resumen);
        if (hayQueEnviarRadar(huella, radarEnviadoRef.current, ahoraRadar)) {
          radarEnviadoRef.current = { huella, at: ahoraRadar };
          for (const p of conectados) {
            mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_RADAR, resumen } satisfies MensajeRadar));
          }
        }
      } catch {
        /* el radar se reintenta en el siguiente latido; el latido ya fue */
      }
    };
    void enviarFichaYLatido();
    const timer = setInterval(() => void enviarFichaYLatido(), CANAL_HEARTBEAT_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [Object.keys(peers).filter((k) => peers[k]?.state === "connected").join(",")]);

  /* ---- 5) publica el estado para useMallaImagenesEstado() ---- */
  useEffect(() => {
    const estado: MallaImagenesState = { misDispositivos: Object.values(fichas), loading };
    publicarEstadoMalla(estado);
  }, [fichas, loading]);

  return estado;
}