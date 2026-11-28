import type { Observador } from "../alcance";
import type { Arista, Nodo } from "../modelo";
import type { Fuente } from "./tipos";

export interface SenalEntrada {
  id: string;
  kind: string;
  antenna: string;
  label: string;
  placement?: { angleRad: number; radiusFrac: number; accuracyFrac: number };
  quality?: number | null;
  metrics?: unknown[];
  lastSeen: number;
}

export interface NeuronaEntrada {
  neuronId: string;
  syncDeviceId?: string;
  nombre: string;
  plataforma: string;
  tipo: string;
  online: boolean;
  esEsteDispositivo: boolean;
  ultimoVisto?: string;
  enlace: { estado: string; latenciaMs?: number };
}

export interface MedioEntrada {
  id: string;
  neuronaId: string;
  etiqueta: string;
  tipo: string;
  visible: boolean;
  propio: boolean;
  desde?: string;
}

export interface EnlaceEntrada {
  id: string;
  de: string;
  a: string;
  clase: string;
  latenciaMs?: number | null;
}

export interface DatosSenales {
  senales?: SenalEntrada[];
  neuronas?: NeuronaEntrada[];
  medios?: MedioEntrada[];
  enlaces?: EnlaceEntrada[];
}

export function senalANodo(senal: SenalEntrada, ahora: number): Nodo {
  const t = senal.lastSeen || ahora;
  return {
    id: `senal:${senal.id}`,
    tipo: "senal",
    titulo: senal.label || senal.id,
    formato: "flujo",
    ref: `/senales/${encodeURIComponent(senal.id)}`,
    alcance: "privado",
    dueno: "local",
    capas: ["senales", "malla", senal.antenna],
    t_creado: t,
    t_actividad: t,
    peso: typeof senal.quality === "number" ? Math.max(0, Math.min(1, senal.quality)) : 0.5,
    etiquetas: [senal.kind, senal.antenna].filter(Boolean),
  };
}

export function neuronaANodo(neurona: NeuronaEntrada): Nodo {
  const t = neurona.ultimoVisto ? new Date(neurona.ultimoVisto).getTime() : Date.now();
  return {
    id: `neurona:${neurona.neuronId}`,
    tipo: "neurona",
    titulo: neurona.nombre,
    formato: "app",
    ref: `/neuronas/${encodeURIComponent(neurona.neuronId)}`,
    alcance: "privado",
    dueno: neurona.esEsteDispositivo ? "local" : neurona.neuronId,
    capas: ["senales", "malla", "neuronas"],
    t_creado: t,
    t_actividad: neurona.online ? Date.now() : t,
    peso: neurona.online ? 1 : 0.3,
    etiquetas: [neurona.tipo, neurona.plataforma, neurona.online ? "online" : "offline"],
  };
}

export function medioANodo(medio: MedioEntrada): Nodo {
  const t = medio.desde ? new Date(medio.desde).getTime() : Date.now();
  return {
    id: `medio:${medio.id}`,
    tipo: "proceso",
    titulo: medio.etiqueta,
    formato: "app",
    ref: `/neuronas/${encodeURIComponent(medio.neuronaId)}/medios/${encodeURIComponent(medio.id)}`,
    alcance: medio.propio ? "privado" : "contactos",
    dueno: medio.propio ? "local" : medio.neuronaId,
    capas: ["senales", "malla", "medios"],
    t_creado: t,
    t_actividad: t,
    peso: medio.visible ? 0.9 : 0.5,
    etiquetas: [medio.tipo, medio.visible ? "visible" : "segundo-plano"],
  };
}

export function enlaceAArista(enlace: EnlaceEntrada, ahora: number): Arista {
  return {
    de: enlace.de,
    a: enlace.a,
    tipo: "senal",
    t: ahora,
    intensidad: typeof enlace.latenciaMs === "number" ? Math.max(0.1, Math.min(1, 1 - enlace.latenciaMs / 2000)) : 0.6,
  };
}

function construirDatosSimulados(ahora: number): DatosSenales {
  return {
    neuronas: [
      {
        neuronId: "local", syncDeviceId: "s-local", nombre: "Esta neurona",
        plataforma: "linux", tipo: "desktop", online: true, esEsteDispositivo: true,
        ultimoVisto: new Date(ahora).toISOString(), enlace: { estado: "conectado" },
      },
      {
        neuronId: "remota-1", syncDeviceId: "s-remota", nombre: "Neurona cercana",
        plataforma: "android", tipo: "mobile", online: true, esEsteDispositivo: false,
        ultimoVisto: new Date(ahora - 30_000).toISOString(), enlace: { estado: "conectado", latenciaMs: 42 },
      },
    ],
    senales: [
      { id: "ble:demo", kind: "bluetooth", antenna: "ble", label: "Auriculares", quality: 0.8, lastSeen: ahora - 10_000 },
      { id: "wifi:demo", kind: "wifi", antenna: "ip", label: "Red local", quality: 0.7, lastSeen: ahora - 5_000 },
    ],
    medios: [
      { id: "medio:local:web", neuronaId: "local", etiqueta: "Navegador", tipo: "web", visible: true, propio: true, desde: new Date(ahora - 60_000).toISOString() },
    ],
    enlaces: [
      { id: "e1", de: "neurona:local", a: "neurona:remota-1", clase: "p2p", latenciaMs: 42 },
      { id: "e2", de: "neurona:local", a: "senal:ble:demo", clase: "rf", latenciaMs: null },
    ],
  };
}

export function crearFuenteSenales(datos?: DatosSenales): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();
  const emitir = (tipo: string, datos: unknown): void => {
    for (const cb of suscriptores) {
      try { cb({ tipo, datos }); } catch { /* silencioso */ }
    }
  };
  return {
    id: "senales",
    capa: "senales",
    leer: async (_observador: Observador) => {
      const ahora = Date.now();
      const fuente = datos ?? construirDatosSimulados(ahora);
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];
      for (const neurona of fuente.neuronas ?? []) nodos.set(`neurona:${neurona.neuronId}`, neuronaANodo(neurona));
      for (const senal of fuente.senales ?? []) nodos.set(`senal:${senal.id}`, senalANodo(senal, ahora));
      for (const medio of fuente.medios ?? []) nodos.set(`medio:${medio.id}`, medioANodo(medio));
      for (const enlace of fuente.enlaces ?? []) {
        if (nodos.has(enlace.de) && nodos.has(enlace.a)) aristas.push(enlaceAArista(enlace, ahora));
      }
      emitir("fuente_leida", { fuenteId: "senales", nodos: nodos.size, aristas: aristas.length });
      return { nodos, aristas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => { suscriptores.delete(callback); };
    },
  };
}

export const fuenteSenales = crearFuenteSenales();
