/**
 * Historial de llamadas (LLA1108G) — PURO + almacenamiento local inyectable. Cada llamada que termina deja una
 * fila con el medio por el que fue, la duración y, si se grabó, dónde está la grabación. De aquí salen
 * «Volver a llamar» y el listado de la página de llamadas. Se guarda solo en este aparato.
 */
import type { TipoSuperficie } from "./maquina";

export const CLAVE_HISTORIAL = "starseed.llamadas.historial.v1";
const MAX_FILAS = 100;

export interface FilaHistorial {
  id: string;
  /** Cuándo terminó (epoch ms). */
  fin: number;
  titulo: string;
  tipo: TipoSuperficie;
  /** Medio por el que fue («Voz por WebRTC · cifrada», «Voz por Bluetooth directo · cifrada»…). */
  medio: string | null;
  duracionMs: number;
  contestada: boolean;
  /** Yo la empecé. */
  saliente: boolean;
  hiloId: string | null;
  tipoHilo: "dm" | "grupo" | null;
  miembros: string[];
  /** Ruta de la grabación en el almacén de la app, si se grabó. */
  grabacion: string | null;
}

export interface AlmacenMinimo {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const TIPOS: readonly string[] = ["voz", "video", "pantalla", "vivo", "grupo"];

function sana(v: unknown): FilaHistorial | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || typeof o.fin !== "number" || !TIPOS.includes(String(o.tipo))) return null;
  return {
    id: o.id.slice(0, 80),
    fin: o.fin,
    titulo: typeof o.titulo === "string" ? o.titulo.slice(0, 120) : "Llamada",
    tipo: o.tipo as TipoSuperficie,
    medio: typeof o.medio === "string" ? o.medio.slice(0, 120) : null,
    duracionMs: typeof o.duracionMs === "number" && o.duracionMs >= 0 ? o.duracionMs : 0,
    contestada: o.contestada === true,
    saliente: o.saliente === true,
    hiloId: typeof o.hiloId === "string" ? o.hiloId : null,
    tipoHilo: o.tipoHilo === "dm" || o.tipoHilo === "grupo" ? o.tipoHilo : null,
    miembros: Array.isArray(o.miembros) ? o.miembros.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    grabacion: typeof o.grabacion === "string" ? o.grabacion : null,
  };
}

export function leerHistorial(a: AlmacenMinimo | null): FilaHistorial[] {
  if (!a) return [];
  try {
    const bruto = JSON.parse(a.getItem(CLAVE_HISTORIAL) ?? "[]");
    return Array.isArray(bruto) ? bruto.map(sana).filter((x): x is FilaHistorial => !!x) : [];
  } catch {
    return [];
  }
}

/** Añade una fila (la más reciente primero, sin repetir id) y recorta. */
export function anadirFila(lista: FilaHistorial[], f: FilaHistorial): FilaHistorial[] {
  return [f, ...lista.filter((x) => x.id !== f.id)].sort((x, y) => y.fin - x.fin).slice(0, MAX_FILAS);
}

export function registrarEnHistorial(a: AlmacenMinimo | null, f: FilaHistorial): FilaHistorial[] {
  const lista = anadirFila(leerHistorial(a), f);
  try {
    a?.setItem(CLAVE_HISTORIAL, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: el historial es una comodidad */
  }
  return lista;
}

/** Resumen en una línea: «Videollamada · 12 min · por Wi‑Fi · grabada». */
export function resumenFila(f: FilaHistorial, describirDuracion: (ms: number) => string): string {
  const tipo = { voz: "Llamada de voz", video: "Videollamada", pantalla: "Pantalla compartida", vivo: "Transmisión en vivo", grupo: "Llamada de grupo" }[f.tipo];
  const estado = !f.contestada ? (f.saliente ? "Sin respuesta" : "Perdida") : describirDuracion(f.duracionMs);
  return [tipo, estado, f.medio ? f.medio.replace(/\s*·\s*cifrada$/i, "") : null, f.grabacion ? "grabada" : null].filter(Boolean).join(" · ");
}

/** ¿Se puede volver a llamar desde esta fila? Si no, por qué. */
export function puedeRellamar(f: FilaHistorial): { ok: boolean; motivo?: string } {
  if (!f.hiloId) return { ok: false, motivo: "Esta llamada no salió de un chat; vuelve a llamar desde la neurona o el contacto." };
  if (f.miembros.length === 0) return { ok: false, motivo: "No consta con quién fue; llama desde el chat." };
  return { ok: true };
}
