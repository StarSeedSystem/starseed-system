import type { Observador } from "./alcance";
import type { Grafo4D, Nodo, Arista } from "./modelo";
import { podarGrafo } from "./alcance";
import { crearGrafo, type Grafo4D as Grafo4DType } from "./modelo";
import type { Fuente, FuenteEvento } from "./fuentes/tipos";
import { fuenteCerebros } from "./fuentes/cerebros";
import { fuenteConocimiento } from "./fuentes/conocimiento";
import { fuenteEducacion } from "./fuentes/educacion";
import { onTableChange } from "@/lib/realtime/realtime";

export interface BusConfig {
  observador: Observador;
  intervaloActualizacion?: number;
  fuentes?: Fuente[];
}

export interface EstadoBus {
  grafo: Grafo4D;
  ultimaActualizacion: number;
  fuentesActivas: string[];
  error?: string;
}

type ListenerGrafo = (grafo: Grafo4D, evento?: FuenteEvento) => void;
type ListenerEstado = (estado: EstadoBus) => void;

export function crearBusRamas4D(config: BusConfig) {
  const { observador, intervaloActualizacion = 30000, fuentes = [fuenteCerebros, fuenteConocimiento, fuenteEducacion] } = config;

  let grafoActual = crearGrafo();
  let suscripcionesFuentes: (() => void)[] = [];
  let listenersGrafo: Set<ListenerGrafo> = new Set();
  let listenersEstado: Set<ListenerEstado> = new Set();
  let intervaloId: ReturnType<typeof setInterval> | null = null;
  let estado: EstadoBus = {
    grafo: grafoActual,
    ultimaActualizacion: 0,
    fuentesActivas: [],
  };
  let destruido = false;

  function notificarGrafo(evento?: FuenteEvento) {
    for (const listener of listenersGrafo) {
      try {
        listener(grafoActual, evento);
      } catch {
        // silencioso
      }
    }
  }

  function notificarEstado() {
    estado = {
      grafo: grafoActual,
      ultimaActualizacion: Date.now(),
      fuentesActivas: fuentes.map((f) => f.id),
    };
    for (const listener of listenersEstado) {
      try {
        listener(estado);
      } catch {
        // silencioso
      }
    }
  }

  async function actualizarDesdeFuentes(): Promise<void> {
    if (destruido) return;

    const nuevoGrafo = crearGrafo();
    let algunaFuenteFallida = false;

    for (const fuente of fuentes) {
      try {
        const { nodos, aristas } = await fuente.leer(observador);
        for (const [id, nodo] of nodos.entries()) {
          nuevoGrafo.nodos.set(id, nodo);
        }
        for (const arista of aristas) {
          if (nuevoGrafo.nodos.has(arista.de) && nuevoGrafo.nodos.has(arista.a)) {
            nuevoGrafo.aristas.push(arista);
          }
        }
      } catch (error) {
        console.error(`[Ramas4D] Error leyendo fuente ${fuente.id}:`, error);
        algunaFuenteFallida = true;
      }
    }

    const grafoPodado = podarGrafo(nuevoGrafo, observador);
    grafoActual = grafoPodado;
    notificarGrafo();
    notificarEstado();

    if (algunaFuenteFallida) {
      estado.error = "Algunas fuentes fallaron al actualizar";
    } else {
      estado.error = undefined;
    }
  }

  function suscribirAFuentes() {
    for (const fuente of fuentes) {
      const desuscribir = fuente.suscribir((evento) => {
        notificarGrafo({ ...evento, fuenteId: fuente.id, t: Date.now() });
        void actualizarDesdeFuentes();
      });
      suscripcionesFuentes.push(desuscribir);
    }
  }

  function suscribirRealtime() {
    const tablas = [
      "brains",
      "knowledge_categories",
      "knowledge_topics",
      "topic_categories",
      "entity_state",
    ];

    for (const tabla of tablas) {
      const desuscribir = onTableChange(tabla, { event: "*" }, () => {
        void actualizarDesdeFuentes();
      });
      suscripcionesFuentes.push(desuscribir);
    }
  }

  function iniciar() {
    if (destruido) return;
    suscribirAFuentes();
    suscribirRealtime();
    void actualizarDesdeFuentes();
    intervaloId = setInterval(() => {
      void actualizarDesdeFuentes();
    }, intervaloActualizacion);
  }

  function detener() {
    if (intervaloId) {
      clearInterval(intervaloId);
      intervaloId = null;
    }
    for (const desuscribir of suscripcionesFuentes) {
      try {
        desuscribir();
      } catch {
        // silencioso
      }
    }
    suscripcionesFuentes = [];
  }

  function destruir() {
    destruido = true;
    detener();
    listenersGrafo.clear();
    listenersEstado.clear();
    grafoActual = crearGrafo();
  }

  function onGrafo(listener: ListenerGrafo): () => void {
    listenersGrafo.add(listener);
    listener(grafoActual);
    return () => {
      listenersGrafo.delete(listener);
    };
  }

  function onEstado(listener: ListenerEstado): () => void {
    listenersEstado.add(listener);
    listener(estado);
    return () => {
      listenersEstado.delete(listener);
    };
  }

  function obtenerGrafo(): Grafo4D {
    return grafoActual;
  }

  function obtenerEstado(): EstadoBus {
    return estado;
  }

  function forzarActualizacion(): Promise<void> {
    return actualizarDesdeFuentes();
  }

  return {
    iniciar,
    detener,
    destruir,
    onGrafo,
    onEstado,
    obtenerGrafo,
    obtenerEstado,
    forzarActualizacion,
  };
}

export type BusRamas4D = ReturnType<typeof crearBusRamas4D>;

let instanciaGlobal: BusRamas4D | null = null;

export function obtenerBusGlobal(observador?: Observador): BusRamas4D {
  if (!instanciaGlobal && observador) {
    instanciaGlobal = crearBusRamas4D({ observador });
    instanciaGlobal.iniciar();
  }
  if (!instanciaGlobal) {
    throw new Error("Bus Ramas4D no inicializado. Proporcione un observador en la primera llamada.");
  }
  return instanciaGlobal;
}

export function destruirBusGlobal(): void {
  if (instanciaGlobal) {
    instanciaGlobal.destruir();
    instanciaGlobal = null;
  }
}