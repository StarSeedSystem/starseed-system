// src/lib/imagenes/adaptadores/malla-imagenes.ts
// Adaptador para convertir el registro de neuronas existente en NeuronaImg para usar con planImagen
// Reutiliza el registro de neuronas de malla-neuronas.ts
//
// Además EJECUTA la capa «malla» por el RELÉ `capacidad.*` (Ola 1017A · E, §6 de
// `architecture/apps-en-la-malla.md`): pedir a OTRA neurona de la cuenta/grupo/comunidad la
// generación de imagen cuando aquí no cabe. El cliente del relé es `pedirCapacidad` de
// `src/lib/network/capacidad-por-malla.ts`: manda el `capacidad.pedir`, junta los
// `capacidad.trozo` reensamblándolos por índice con `unirTrozosOrdenados` (pueden llegar en
// desorden) y cierra con `capacidad.fin`/`capacidad.error`/`capacidad.cancelar`, validados por
// `esMensajeCapacidadMalla` bajo el espacio `CAPACIDAD_MALLA_NS` y su tope
// `CAPACIDAD_MALLA_MAX_BYTES`. NUNCA lanza: el relé es un candidato, no un contrato.

import { snapshotMallaNeuronas, type MallaNeuronasState } from "@/lib/network/malla-neuronas";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";
import {
  CAPACIDAD_MALLA_MAX_BYTES,
  CAPACIDAD_MALLA_NS,
  TIPOS_CAPACIDAD,
  esTipoCapacidad,
  pedirCapacidad,
  type ResultadoCapacidad,
  type TipoCapacidad,
} from "@/lib/network/capacidad-por-malla";
import { bytesUtf8, crearIdPeticion } from "@/lib/network/astraura-por-malla";
import { type NeuronaImg } from "@/lib/imagenes/plan";
import { MODELOS_IMAGEN, type MotorImg, type ModeloImagen, type CapacidadImg } from "@/lib/imagenes/modelos";

/**
 * Obtiene la lista de neuronas disponibles para usar en la generación de imágenes
 * Convierte las neuronas de la malla en objetos NeuronaImg compatibles con planImagen
 * 
 * @returns Promise<NeuronaImg[]> - Lista de neuronas convertidas
 */
export async function obtenerNeuronasParaImagen(): Promise<NeuronaImg[]> {
  const estado = snapshotMallaNeuronas();
  const { misDispositivos, cercanas } = estado;
  const ids = identidadDispositivo();
  
  const neuronasImg: NeuronaImg[] = [];

  // Procesar neuronas de la cuenta (misDispositivos)
  for (const disp of misDispositivos) {
    // Saltar este dispositivo mismo (se trata como "dispositivo", no como "neurona")
    if (disp.esEsteDispositivo) continue;

    // Convertir DispositivoMallaRow a NeuronaImg
    const neuronaImg: NeuronaImg = {
      id: disp.neuronId,
      capa: "neurona", // Otras neuronas de la cuenta
      gpu: inferirTipoGPU(disp),
      vramGB: inferirVRAMGB(disp),
      ramLibreGB: inferirRAMLibreGB(disp),
      motores: inferirMotores(disp),
      instalados: inferirInstalados(disp),
      ocupada: inferirOcupada(disp),
      medidas: undefined // No se asume que se tenga esta información de la malla
    };

    neuronasImg.push(neuronaImg);
  }

  // Procesar neuronas cercanas (de otras cuentas, asumiendo que ofrecen recursos)
  for (const cerca of cercanas) {
    // Convertir NeuronaCercanaRow a NeuronaImg
    const neuronaImg: NeuronaImg = {
      id: cerca.deviceId,
      capa: "malla", // Neuronas de grupos/comunidades que ofrecieron su GPU
      gpu: inferirTipoGPUDesdeCercana(cerca),
      vramGB: inferirVRAMGBDesdeCercana(cerca),
      ramLibreGB: inferirRAMLibreGBDesdeCercana(cerca),
      motores: inferirMotoresDesdeCercana(cerca),
      instalados: inferirInstaladosDesdeCercana(cerca),
      ocupada: inferirOcupadaDesdeCercana(cerca),
      medidas: undefined
    };

    neuronasImg.push(neuronaImg);
  }

  return neuronasImg;
}

/**
 * Infiere el tipo de GPU basado en la información disponible de un DispositivoMallaRow
 * Esta es una inferencia basada en la plataforma y otras señales disponibles
 */
export function inferirTipoGPU(disp: any): "nvidia" | "apple" | "amd" | "ninguna" {
  // Intentamos obtener información de la plataforma
  const plataforma = disp.plataforma?.toLowerCase() || "";
  
  // Heurísticas básicas (en una implementación real, esto vendría de capacidades explícitas)
  if (plataforma.includes("darwin") || plataforma.includes("mac") || plataforma.includes("ios")) {
    return "apple";
  }
  if (plataforma.includes("windows")) {
    // En Windows, asumimos NVIDIA por defecto (podría ser AMD también)
    // En una implementación real, esto vendría de capacidades de GPU explícitas
    return "nvidia"; 
  }
  if (plataforma.includes("linux")) {
    // En Linux, asumimos NVIDIA por defecto
    return "nvidia";
  }
  if (plataforma.includes("android")) {
    // En Android, las GPUs varían mucho
    return "ninguna"; // Conservador
  }
  
  // Por defecto, asumimos que no hay GPU dedicada disponible
  return "ninguna";
}

/**
 * Infiere la VRAM GB basada en la información disponible
 */
export function inferirVRAMGB(disp: any): number | null {
  // En una implementación real, esto vendría de las capacidades de la neurona
  // Por ahora, retornamos null indicando que no se conoce específicamente
  // El planImagen usará la memoria unificada de la CPU si es necesario
  return null;
}

/**
 * Infiere la RAM libre GB basada en la información disponible
 */
export function inferirRAMLibreGB(disp: any): number {
  // Intentamos obtener la memoria total y asumir una fracción libre
  // En una implementación real, esto vendría de monitoreo en tiempo real
  const memoriaTotalGB = disp.ficha?.ramClase ? 
    convertirRamClaseAGB(disp.ficha.ramClase) : 4; // Valor por defecto conservador
  
  // Asumimos que alrededor del 50% está libre (valor conservador para compartir)
  return Math.max(1, Math.floor(memoriaTotalGB * 0.5));
}

/**
 * Convierte una clase de RAM a GB aproximado
 */
export function convertirRamClaseAGB(clase: string): number {
  switch (clase) {
    case "≤4 GB": return 2;
    case "8 GB": return 4;
    case "16 GB": return 8;
    case ">16 GB": return 16;
    case "desconocida": 
    default: return 2; // Valor por defecto conservador
  }
}

/**
 * Infiere los motores disponibles basado en la información disponible
 */
export function inferirMotores(disp: any): readonly MotorImg[] {
  // En una implementación real, esto vendría de las capacidades explícitas
  // Por ahora, retornamos los motores básicos que es más probable que estén disponibles
  const motoresDisponibles: MotorImg[] = ["sdcpp"];
  
  // Si indican que tienen una GPU decente, añadimos más motores
  const gpu = inferirTipoGPU(disp);
  if (gpu !== "ninguna") {
    motoresDisponibles.push("comfyui", "diffusers");
  }
  
  // Siempre añadimos onnx-web como opción básica (navegador)
  motoresDisponibles.push("onnx-web");
  
  return motoresDisponibles as readonly MotorImg[];
}

/**
 * Infiere los modelos instalados basado en la información disponible
 */
export function inferirInstalados(disp: any): readonly string[] {
  // En una implementación real, esto vendría de las fuentesServibles de la ficha
  // Por ahora, retornamos una lista vacía asumiendo que se tendrá que instalar
  // o que se usará lo que esté disponible en el momento
  return [] as readonly string[];
}

/**
 * Infiere si la neurona está ocupada basado en la información disponible
 */
export function inferirOcupada(disp: any): boolean {
  // En una implementación real, esto vendría de estado de uso en tiempo real
  // Por ahora, asumimos que no está ocupada para ofrecer oportunidades de uso
  return false;
}

/* Funciones similares para procesar neuronas cercanas (de otras cuentas) */

/**
 * Infiere el tipo de GPU basado en la información disponible de una NeuronaCercanaRow
 */
export function inferirTipoGPUDesdeCercana(cerca: any): "nvidia" | "apple" | "amd" | "ninguna" {
  // Similar a inferirTipoGPU pero para neuronas cercanas
  // En una implementación real, esto vendría de capacidades explícitas compartidas
  const plataforma = cerca.plataforma?.toLowerCase() || "";
  
  if (plataforma.includes("darwin") || plataforma.includes("mac") || plataforma.includes("ios")) {
    return "apple";
  }
  if (plataforma.includes("windows")) {
    return "nvidia";
  }
  if (plataforma.includes("linux")) {
    return "nvidia";
  }
  
  return "ninguna";
}

/**
 * Infiere la VRAM GB basada en la información disponible de una NeuronaCercanaRow
 */
export function inferirVRAMGBDesdeCercana(cerca: any): number | null {
  return null; // Mismo enfoque conservador
}

/**
 * Infiere la RAM libre GB basada en la información disponible de una NeuronaCercanaRow
 */
export function inferirRAMLibreGBDesdeCercana(cerca: any): number {
  // Asumimos un valor conservador para neuronas de otras cuentas
  return 2; // 2 GB libre como valor por defecto conservador
}

/**
 * Infiere los motores disponibles basado en la información disponible de una NeuronaCercanaRow
 */
export function inferirMotoresDesdeCercana(cerca: any): readonly MotorImg[] {
  const motoresDisponibles: MotorImg[] = ["sdcpp"];
  
  const gpu = inferirTipoGPUDesdeCercana(cerca);
  if (gpu !== "ninguna") {
    motoresDisponibles.push("comfyui", "diffusers");
  }
  
  motoresDisponibles.push("onnx-web");
  
  return motoresDisponibles as readonly MotorImg[];
}

/**
 * Infiere los modelos instalados basado en la información disponible de una NeuronaCercanaRow
 */
export function inferirInstaladosDesdeCercana(cerca: any): readonly string[] {
  return [] as readonly string[];
}

/**
 * Infiere si la neurona está ocupada basado en la información disponible de una NeuronaCercanaRow
 */
export function inferirOcupadaDesdeCercana(cerca: any): boolean {
  return false; // Asumimos disponible para compartir
}

/* ── Pedir generación por el relé `capacidad.*` (la mitad que FALTA de RTIMG1011F) ───────── */

/** Cuerpo del pedido de imagen que viaja en el `capacidad.pedir` (contrato del servicio IMG1011A). */
export interface PeticionGeneracionMalla {
  prompt: string;
  /** Id de modelo del catálogo (`MODELOS_IMAGEN`); null = la que el peer tenga lista. */
  modelo: string | null;
  semilla: number;
  pasos?: number;
}

export interface OpcionesPedirGeneracionMalla {
  /** Por defecto «imagen»; otra capacidad solo si está en `TIPOS_CAPACIDAD`. */
  tipo?: TipoCapacidad;
  /** ms de espera del relé (por defecto 15 s: la galería paraleliza y sustituye rápido). */
  timeoutMs?: number;
  /** Canal de la malla inyectado (pruebas sin red). `null` = sin malla; ausente: `getSharedMesh()`. */
  mesh?: MeshHandle | null;
  signal?: AbortSignal;
}

export type ResultadoGeneracionMalla =
  | { ok: true; url?: string; ref?: string }
  | { ok: false; motivo: string; ocupado?: boolean };

/**
 * Pacta la suscripción del relé sobre el canal real, con el filtro del espacio de nombres:
 * solo pasan al reensamblador los mensajes de `capacidad.*` (el resto de la malla —fichas,
 * latidos, `ia.*`, `archivos.*`— no toca JSON de este protocolo).
 */
const suscribirDesdeMesh = (mesh: MeshHandle) => (manejar: (peerId: string, data: string) => void) =>
  mesh.onPeer({
    onMessage: (peerId, data) => {
      if (!data.startsWith(`{"t":"${CAPACIDAD_MALLA_NS}`)) return;
      manejar(peerId, data);
    },
  });

/** Abre la respuesta del servicio del peer (JSON del mismo contrato IMG1011A que la ficha). */
function resultadoDelRelé(r: ResultadoCapacidad): ResultadoGeneracionMalla {
  if (!r.ok) return { ok: false, motivo: r.motivo, ...(r.ocupado ? { ocupado: true } : {}) };
  try {
    const datos: unknown = JSON.parse(r.texto);
    if (!datos || typeof datos !== "object") throw new Error("no JSON");
    const o = datos as Record<string, unknown>;
    const url = typeof o.url === "string" && o.url.trim() ? o.url.trim() : undefined;
    const ref = typeof o.ref === "string" && o.ref.trim() ? o.ref.trim() : undefined;
    if (url || ref) return { ok: true, ...(url ? { url } : {}), ...(ref ? { ref } : {}) };
    const b64 = typeof o.base64 === "string" ? o.base64.trim() : "";
    if (b64) return { ok: true, url: /^data:|^https?:\/\//i.test(b64) ? b64 : `data:image/png;base64,${b64}` };
    return { ok: false, motivo: "La neurona de la malla no devolvió una imagen que se pueda mostrar." };
  } catch {
    return { ok: false, motivo: "La respuesta del relé no se puede leer: no era el JSON del servicio de imágenes." };
  }
}

/**
 * pedirGeneracionMalla — pide una imagen a UNA neurona de la malla por el relé `capacidad.*`.
 * Reúne los trozos y mapea el resultado al JSON del servicio de imágenes. Sin malla
 * (`getSharedMesh()` nulo) falla con su motivo. Nunca lanza; con `mesh` inyectado no toca red.
 */
export async function pedirGeneracionMalla(
  peerId: string,
  peticion: PeticionGeneracionMalla,
  opciones: OpcionesPedirGeneracionMalla = {},
): Promise<ResultadoGeneracionMalla> {
  if (!peerId) return { ok: false, motivo: "Sin neurona de la malla a la que relevar." };
  const tipo = opciones.tipo ?? "imagen";
  if (!esTipoCapacidad(tipo)) {
    return { ok: false, motivo: `Capacidad «${tipo}» no reconocida; válidas: ${TIPOS_CAPACIDAD.join(", ")}.` };
  }
  const cuerpo: Record<string, unknown> = {
    prompt: peticion.prompt,
    ...(peticion.modelo ? { modelo: peticion.modelo } : {}),
    semilla: peticion.semilla,
    ...(peticion.pasos ? { pasos: peticion.pasos } : {}),
  };
  if (bytesUtf8(JSON.stringify(cuerpo)) > CAPACIDAD_MALLA_MAX_BYTES) {
    return { ok: false, motivo: `El cuerpo del pedido excede el tope del relé (${CAPACIDAD_MALLA_MAX_BYTES} bytes).` };
  }
  const mesh = opciones.mesh !== undefined ? opciones.mesh : await import("@/lib/network/lan-sync").then((m) => m.getSharedMesh());
  if (!mesh) return { ok: false, motivo: "Sin malla P2P activa: la capa «malla» no puede relevar ahora." };
  const res = await pedirCapacidad(
    (destino, data) => mesh.sendToPeer(destino, data),
    {
      peerId,
      tipo,
      cuerpo,
      sesionId: crearIdPeticion(),
      timeoutMs: opciones.timeoutMs ?? 15_000,
      suscribir: suscribirDesdeMesh(mesh),
      signal: opciones.signal,
    },
  );
  return resultadoDelRelé(res);
}
