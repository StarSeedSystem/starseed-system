import type { Observador } from "../alcance";
import type { Arista, Nodo } from "../modelo";
import type { Fuente } from "./tipos";

export interface MoleculaEntrada {
  id: string;
  titulo: string;
  ambito: string;
  actualizadaEn: number;
}

export interface CanvasEntrada {
  id: string;
  owner: string | null;
  scope: string;
  scope_ref: string | null;
  title: string;
  blocks: Array<{ id: string; kind: string; title?: string }>;
  shared: boolean;
  updated_at?: string;
  created_at?: string;
}

export interface DatosCreacion {
  moleculas?: MoleculaEntrada[];
  canvases?: CanvasEntrada[];
}

function alcanceAmbito(ambito: string, shared?: boolean): Nodo["alcance"] {
  if (shared) return "publico";
  if (ambito === "publico" || ambito === "public") return "publico";
  if (ambito === "grupo" || ambito === "group") return "grupo";
  if (ambito === "comunidad" || ambito === "community") return "comunidad";
  return "privado";
}

export function moleculaANodo(molecula: MoleculaEntrada): Nodo {
  return {
    id: `molecula:${molecula.id}`,
    tipo: "proyecto",
    titulo: molecula.titulo,
    formato: "flujo",
    ref: `/protomolecula/${encodeURIComponent(molecula.id)}`,
    alcance: alcanceAmbito(molecula.ambito),
    dueno: "local",
    capas: ["creacion", "protomolecula"],
    t_creado: molecula.actualizadaEn,
    t_actividad: molecula.actualizadaEn,
    peso: 0.8,
    tema: "creación",
    categoria: "protomolecula",
    etiquetas: ["molecula", molecula.ambito],
  };
}

export function canvasANodo(canvas: CanvasEntrada): Nodo {
  const t = Date.parse(canvas.updated_at ?? canvas.created_at ?? "") || Date.now();
  const alcance = canvas.shared ? "publico" : alcanceAmbito(canvas.scope);
  return {
    id: `canvas:${canvas.id}`,
    tipo: "proyecto",
    titulo: canvas.title || "Lienzo",
    formato: "pizarra",
    ref: `/canvas/${encodeURIComponent(canvas.id)}`,
    alcance,
    dueno: canvas.owner || "local",
    capas: ["creacion", "canvas"],
    t_creado: Date.parse(canvas.created_at ?? "") || t,
    t_actividad: t,
    peso: Math.min(1, 0.5 + (canvas.blocks?.length ?? 0) * 0.05),
    tema: "creación",
    categoria: "canvas",
    etiquetas: ["canvas", canvas.scope, ...(canvas.shared ? ["compartido"] : [])],
  };
}

export function bloqueANodo(canvasId: string, bloque: { id: string; kind: string; title?: string }, canvas: CanvasEntrada): Nodo {
  const t = Date.parse(canvas.updated_at ?? "") || Date.now();
  return {
    id: `canvas-bloque:${canvasId}:${bloque.id}`,
    tipo: "capa",
    titulo: bloque.title || bloque.kind,
    formato: bloque.kind,
    ref: `/canvas/${encodeURIComponent(canvasId)}?bloque=${encodeURIComponent(bloque.id)}`,
    alcance: canvas.shared ? "publico" : alcanceAmbito(canvas.scope),
    dueno: canvas.owner || "local",
    capas: ["creacion", "canvas", "bloques"],
    t_creado: t,
    t_actividad: t,
    peso: 0.5,
    etiquetas: [bloque.kind, "bloque"],
  };
}

function construirDatosSimulados(): DatosCreacion {
  const ahora = Date.now();
  return {
    moleculas: [{ id: "mol-demo", titulo: "Molecula de ejemplo", ambito: "personal", actualizadaEn: ahora - 120_000 }],
    canvases: [{
      id: "canvas-demo", owner: "demo", scope: "private", scope_ref: null,
      title: "Lienzo de ejemplo", shared: false,
      blocks: [{ id: "b1", kind: "text", title: "Nota" }],
      updated_at: new Date(ahora - 60_000).toISOString(),
    }],
  };
}

export function crearFuenteCreacion(datos?: DatosCreacion): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();
  const emitir = (tipo: string, datos: unknown): void => {
    for (const cb of suscriptores) { try { cb({ tipo, datos }); } catch { /* silencioso */ } }
  };
  return {
    id: "creacion",
    capa: "creacion",
    leer: async (_observador: Observador) => {
      const fuente = datos ?? construirDatosSimulados();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];
      const ahora = Date.now();
      for (const molecula of fuente.moleculas ?? []) nodos.set(`molecula:${molecula.id}`, moleculaANodo(molecula));
      for (const canvas of fuente.canvases ?? []) {
        nodos.set(`canvas:${canvas.id}`, canvasANodo(canvas));
        for (const bloque of canvas.blocks ?? []) {
          const nodoBloque = bloqueANodo(canvas.id, bloque, canvas);
          nodos.set(nodoBloque.id, nodoBloque);
          aristas.push({ de: `canvas:${canvas.id}`, a: nodoBloque.id, tipo: "contiene", t: ahora, intensidad: 0.8 });
        }
      }
      emitir("fuente_leida", { fuenteId: "creacion", nodos: nodos.size, aristas: aristas.length });
      return { nodos, aristas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => { suscriptores.delete(callback); };
    },
  };
}

export const fuenteCreacion = crearFuenteCreacion();
