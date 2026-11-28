import type { Observador } from "../alcance";
import type { Nodo, Arista, AlcanceNodo } from "../modelo";
import type { Fuente } from "./tipos";
import type { OsEvent } from "@/lib/os-social";
import type { EventRow } from "@/lib/events/events-store";
import type { CalendarItem } from "@/contexts/calendar-context";

export interface EventoVista {
  id: string;
  slug: string;
  titulo: string;
  tipo?: string;
  comienzaEn?: string | null;
  terminaEn?: string | null;
  lugar?: string;
  organizadorSlug?: string;
  asistentes?: number;
  etiquetas?: string[];
  alcance?: AlcanceNodo;
  dueno?: string;
  creadoEn?: string | null;
  esEjemplo?: boolean;
}

export interface DatosEventos {
  eventos?: EventoVista[];
}

export type LectorEventos = (observador: Observador) => Promise<DatosEventos>;

function fecha(valor: string | null | undefined): number {
  const t = valor ? new Date(valor).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

function slugDe(evento: EventoVista): string {
  return evento.slug || evento.id;
}

function pesoPorAsistentes(asistentes: number | undefined): number {
  const extra = Math.min(0.4, Math.max(0, asistentes ?? 0) / 200);
  return Math.round((0.6 + extra) * 100) / 100;
}

export function nodoDesdeEvento(evento: EventoVista): Nodo {
  const tipo = evento.tipo ?? "encuentro";
  const creado = fecha(evento.creadoEn ?? evento.comienzaEn);
  return {
    id: `evento:${slugDe(evento)}`,
    tipo: "evento",
    titulo: evento.titulo,
    formato: "documento",
    ref: `/evento/${slugDe(evento)}`,
    alcance: evento.alcance ?? "publico",
    dueno: evento.dueno ?? "red",
    capas: ["eventos", "agenda", tipo],
    t_creado: creado,
    t_actividad: fecha(evento.comienzaEn ?? evento.creadoEn),
    peso: pesoPorAsistentes(evento.asistentes),
    tema: tipo,
    categoria: "evento",
    etiquetas: [tipo, ...(evento.etiquetas ?? []), evento.esEjemplo ? "ejemplo" : "real"],
  };
}

export function aristasDeEvento(evento: EventoVista): Arista[] {
  if (!evento.organizadorSlug) return [];
  return [
    {
      de: `entidad:page:${evento.organizadorSlug}`,
      a: `evento:${slugDe(evento)}`,
      tipo: "contiene",
      t: fecha(evento.comienzaEn ?? evento.creadoEn),
      intensidad: 0.8,
    },
  ];
}

export function eventoDesdeOsEvento(evento: OsEvent): EventoVista {
  return {
    id: evento.id,
    slug: evento.slug || evento.id,
    titulo: evento.title,
    tipo: evento.kind,
    comienzaEn: evento.startsAt,
    lugar: evento.location,
    organizadorSlug: evento.organizerSlug,
    asistentes: evento.attendeeCount,
    etiquetas: evento.tags,
    alcance: "publico",
    dueno: "red",
    esEjemplo: evento.isSample,
  };
}

function alcanceDesdeVisibilidad(visibilidad: string | null | undefined): AlcanceNodo {
  const v = (visibilidad ?? "").toLowerCase();
  return v === "public" || v === "publico" || v === "público" ? "publico" : "privado";
}

export function eventoDesdeFila(fila: EventRow): EventoVista {
  const meta = fila.meta ?? {};
  const etiquetas = Array.isArray(meta.tags)
    ? meta.tags.filter((t: unknown): t is string => typeof t === "string")
    : undefined;
  return {
    id: fila.id,
    slug: fila.id,
    titulo: fila.title ?? "Evento",
    tipo: fila.kind ?? undefined,
    comienzaEn: fila.starts_at,
    terminaEn: fila.ends_at,
    lugar: fila.location ?? undefined,
    asistentes: typeof meta.attendees === "number" ? meta.attendees : undefined,
    etiquetas,
    alcance: alcanceDesdeVisibilidad(fila.visibility),
    dueno: fila.owner ?? undefined,
    creadoEn: fila.created_at,
  };
}

export function eventoDesdeCalendario(item: CalendarItem, dueno?: string): EventoVista {
  const alcance: AlcanceNodo = item.visibility === "publico"
    ? "publico"
    : item.visibility === "red"
      ? "contactos"
      : "privado";
  const slug = item.sourceRef?.startsWith("os_event:")
    ? item.sourceRef.slice("os_event:".length)
    : item.id;
  return {
    id: item.id,
    slug,
    titulo: item.title,
    tipo: item.layer,
    comienzaEn: item.time ? `${item.date}T${item.time}:00` : item.date,
    terminaEn: item.endDate,
    lugar: item.location,
    asistentes: item.attendees,
    etiquetas: item.tags,
    alcance,
    dueno: alcance === "publico" ? "red" : dueno,
    creadoEn: item.createdAt,
  };
}

async function leerEventosReal(observador: Observador): Promise<DatosEventos> {
  const eventos: EventoVista[] = [];
  try {
    const { fetchEvents } = await import("@/lib/os-social");
    for (const evento of await fetchEvents()) eventos.push(eventoDesdeOsEvento(evento));
  } catch {
    // sin eventos sociales visibles
  }
  try {
    const { listEvents } = await import("@/lib/events/events-store");
    for (const item of await listEvents()) eventos.push(eventoDesdeCalendario(item, observador.id));
  } catch {
    // sin eventos del calendario visibles
  }
  return { eventos };
}

export function crearFuenteEventos(leer: LectorEventos = leerEventosReal): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();

  function emitir(evento: { tipo: string; datos: unknown }) {
    for (const cb of suscriptores) {
      try {
        cb(evento);
      } catch {
        // silencioso
      }
    }
  }

  return {
    id: "eventos",
    capa: "eventos",
    leer: async (observador: Observador) => {
      const datos = await leer(observador);
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      for (const evento of datos.eventos ?? []) {
        const nodo = nodoDesdeEvento(evento);
        nodos.set(nodo.id, nodo);
        aristas.push(...aristasDeEvento(evento));
      }

      const validas = aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
      emitir({
        tipo: "fuente_leida",
        datos: { fuenteId: "eventos", nodos: nodos.size, aristas: validas.length },
      });
      return { nodos, aristas: validas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => {
        suscriptores.delete(callback);
      };
    },
  };
}

export const fuenteEventos = crearFuenteEventos();
