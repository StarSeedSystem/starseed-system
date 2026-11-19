"use client";

import {
  consultarPermiso,
  pedirPermiso,
  suscribirPermiso,
  type PermisoDispositivo,
  type EstadoPermisoDispositivo,
  type ResultadoPermiso,
  EVENTO_PERMISO,
} from "@/lib/aurora/senses/request-permission";
import {
  normalizarEstado,
  estadoDeResultado,
  type EstadoPermiso,
  type PermisoOS,
  type ResultadoPermisoOS,
} from "@/lib/permisos/contrato";
import {
  detectarMedioActual,
  obtenerReglasParaMedio,
  decidirAccion,
  tieneEnlaceDirecto,
  obtenerEnlaceDirecto,
  type MedioId,
  type PermisoId,
  type EstadoPermiso as EstadoPermisoMatriz,
  type AccionPermiso,
} from "@/lib/permisos/matriz";

export type PermissionId = PermisoOS;

export interface PermissionState {
  id: PermissionId;
  state: EstadoPermiso;
  label: string;
  description: string;
}

export interface PermissionEngine {
  request(id: PermissionId): Promise<ResultadoPermisoOS>;
  grant(id: PermissionId): Promise<ResultadoPermisoOS>;
  revoke(id: PermissionId): Promise<void>;
  list(): PermissionState[];
  listWithState(): Promise<PermissionState[]>;
  subscribe(id: PermissionId, cb: (state: EstadoPermiso) => void): () => void;
  getMedioActual(): MedioId;
  getReglasParaMedio(): ReturnType<typeof obtenerReglasParaMedio>;
  decidirAccionPara(id: PermissionId, estadoActual: EstadoPermiso): { accion: AccionPermiso; fraseHumana?: string; enlaceDirecto?: string };
  tieneEnlaceDirectoPara(id: PermissionId): boolean;
  obtenerEnlaceDirectoPara(id: PermissionId): string | undefined;
}

const PERMISSION_LABELS: Record<PermissionId, string> = {
  microfono: "Micrófono",
  camara: "Cámara",
  ubicacion: "Ubicación",
  notificaciones: "Notificaciones",
  almacenamiento: "Almacenamiento persistente",
  movimiento: "Movimiento",
  archivos: "Archivos (carpetas)",
  pantalla: "Pantalla",
  bluetooth: "Bluetooth",
  serie: "Serie/USB",
};

const PERMISSION_DESCRIPTIONS: Record<PermissionId, string> = {
  microfono: "Acceso al micrófono para llamadas y comandos de voz",
  camara: "Acceso a la cámara para videollamadas y visión",
  ubicacion: "Ubicación geográfica para funciones contextuales",
  notificaciones: "Permiso para mostrar notificaciones del sistema",
  almacenamiento: "Persistencia de datos en el navegador",
  movimiento: "Sensores de movimiento y orientación",
  archivos: "Acceso a carpetas y archivos del sistema",
  pantalla: "Compartir o grabar la pantalla",
  bluetooth: "Comunicación Bluetooth con otras neuronas",
  serie: "Acceso a puertos serie/USB para hardware",
};

const WEB_PERMISSIONS: PermissionId[] = [
  "microfono",
  "camara",
  "ubicacion",
  "notificaciones",
  "almacenamiento",
  "movimiento",
  "archivos",
  "pantalla",
];

const NATIVE_PERMISSIONS: PermissionId[] = ["bluetooth", "serie"];

function isWebPermission(id: PermissionId): boolean {
  return WEB_PERMISSIONS.includes(id);
}

function isNativePermission(id: PermissionId): boolean {
  return NATIVE_PERMISSIONS.includes(id);
}

async function requestWebPermission(id: PermissionId): Promise<ResultadoPermisoOS> {
  if (id === "pantalla") {
    const { solicitarPantalla } = await import("@/lib/aurora/senses/request-permission");
    try {
      const stream = await solicitarPantalla({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return { id, estado: "concedido" };
    } catch (e) {
      const err = e as Error;
      if (err.name === "NoMediaDevices") {
        return { id, estado: "no-disponible", motivo: "getDisplayMedia no disponible" };
      }
      return { id, estado: "denegado", motivo: err.message };
    }
  }
  return pedirPermiso(id as PermisoDispositivo);
}

async function requestNativePermission(_id: PermissionId): Promise<ResultadoPermisoOS> {
  return { id: _id, estado: "no-disponible", motivo: "Permiso nativo: requiere app Tauri/Android" };
}

async function queryWebPermission(id: PermissionId): Promise<EstadoPermiso> {
  if (id === "pantalla") return "no-disponible";
  return consultarPermiso(id as PermisoDispositivo);
}

async function queryNativePermission(_id: PermissionId): Promise<EstadoPermiso> {
  return "no-disponible";
}

export function createPermissionEngine(): PermissionEngine {
  const subscribers = new Map<PermissionId, Set<(state: EstadoPermiso) => void>>();
  const medioActual = typeof window !== "undefined" ? detectarMedioActual() : ("web-chromium" as MedioId);
  const reglasMedio = obtenerReglasParaMedio(medioActual);

  function notifySubscribers(id: PermissionId, state: EstadoPermiso) {
    const set = subscribers.get(id);
    if (set) {
      set.forEach((cb) => cb(state));
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener(EVENTO_PERMISO, (e: Event) => {
      const detail = (e as CustomEvent<ResultadoPermiso>).detail;
      if (detail?.permiso) {
        const state = estadoDeResultado(detail);
        notifySubscribers(detail.permiso as PermissionId, state);
      }
    });
  }

  function permisoIdAMatriz(id: PermissionId): PermisoId {
    return id as PermisoId;
  }

  function estadoAMatriz(e: EstadoPermiso): EstadoPermisoMatriz {
    return e as EstadoPermisoMatriz;
  }

  return {
    async request(id: PermissionId): Promise<ResultadoPermisoOS> {
      const result = isWebPermission(id)
        ? await requestWebPermission(id)
        : await requestNativePermission(id);
      notifySubscribers(id, result.estado);
      return result;
    },

    async grant(id: PermissionId): Promise<ResultadoPermisoOS> {
      return this.request(id);
    },

    async revoke(id: PermissionId): Promise<void> {
      if (typeof window !== "undefined" && isWebPermission(id)) {
        if (id === "notificaciones" && "Notification" in window) {
        }
        if (id === "almacenamiento" && navigator.storage?.persist) {
          await navigator.storage.persist();
        }
      }
      const list = this.list();
      const state = list.find((p) => p.id === id)?.state ?? "no-disponible";
      notifySubscribers(id, state);
    },

    list(): PermissionState[] {
      return [...WEB_PERMISSIONS, ...NATIVE_PERMISSIONS].map((id) => ({
        id,
        state: "no-disponible" as EstadoPermiso,
        label: PERMISSION_LABELS[id],
        description: PERMISSION_DESCRIPTIONS[id],
      }));
    },

    async listWithState(): Promise<PermissionState[]> {
      const perms = this.list();
      return Promise.all(
        perms.map(async (p) => ({
          ...p,
          state: isWebPermission(p.id) ? await queryWebPermission(p.id) : await queryNativePermission(p.id),
        }))
      );
    },

    getMedioActual(): MedioId {
      return medioActual;
    },

    getReglasParaMedio(): typeof reglasMedio {
      return reglasMedio;
    },

    decidirAccionPara(id: PermissionId, estadoActual: EstadoPermiso): { accion: AccionPermiso; fraseHumana?: string; enlaceDirecto?: string } {
      const permisoMatriz = permisoIdAMatriz(id);
      const estadoMatriz = estadoAMatriz(estadoActual);
      const decision = decidirAccion(permisoMatriz, medioActual, estadoMatriz);
      return {
        accion: decision.accion,
        fraseHumana: decision.fraseHumana,
        enlaceDirecto: decision.enlaceDirecto,
      };
    },

    tieneEnlaceDirectoPara(id: PermissionId): boolean {
      return tieneEnlaceDirecto(permisoIdAMatriz(id), medioActual);
    },

    obtenerEnlaceDirectoPara(id: PermissionId): string | undefined {
      return obtenerEnlaceDirecto(permisoIdAMatriz(id), medioActual);
    },

    subscribe(id: PermissionId, cb: (state: EstadoPermiso) => void): () => void {
      if (!subscribers.has(id)) {
        subscribers.set(id, new Set());
      }
      subscribers.get(id)!.add(cb);

      if (isWebPermission(id)) {
        const unsubscribe = suscribirPermiso(id as PermisoDispositivo, (state) => {
          const normalized = normalizarEstado(state);
          cb(normalized);
        });
        return () => {
          subscribers.get(id)?.delete(cb);
          unsubscribe();
        };
      }

      return () => {
        subscribers.get(id)?.delete(cb);
      };
    },
  };
}

export const permissionEngine = createPermissionEngine();