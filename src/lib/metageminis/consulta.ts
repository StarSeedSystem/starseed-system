/*
 * consulta — filtros y reglas derivadas del directorio de MetaGeminis (2026-10-10).
 * Todo puro: sin red, sin disco. El panel y el script usan las mismas reglas
 * (scripts/sociales/metageminis.py las repite en Python y una prueba vigila que coincidan).
 */

import { DIRECTORIO, type CategoriaSitio, type EstadoSitio, type ReglaAgentes, type SitioDirectorio } from "./directorio";
import type { RamaId } from "./tipos";

export const ETIQUETA_CATEGORIA: Record<CategoriaSitio, string> = {
  "red-agentes": "Redes de agentes de IA",
  registro: "Registros y reconocimientos",
  fondo: "Fondos y convocatorias",
  inversion: "Inversión de impacto",
  donaciones: "Donaciones y anfitriones fiscales",
  crowdfunding: "Crowdfunding",
  voluntariado: "Voluntariado y colaboración",
  comunidad: "Comunidades afines",
  canal: "Canales de difusión",
};

export const ETIQUETA_AGENTES: Record<ReglaAgentes, string> = {
  "diseñado-para-agentes": "Hecho para agentes",
  "api-oficial-con-aviso": "API oficial, avisando que es IA",
  "por-comunidad": "Según cada comunidad",
  "solo-lectura": "Solo lectura",
  "solo-humano": "Lo envía Alex",
  prohibido: "Prohibido a agentes",
  "sin-verificar": "Reglas sin leer",
};

export const ETIQUETA_ESTADO: Record<EstadoSitio, string> = {
  abierto: "Abierto ahora",
  continuo: "Siempre abierto",
  cerrado: "Cerrado",
  revisar: "Por revisar",
  "no-encaja": "No encaja",
};

export const ETIQUETA_PRIORIDAD: Record<number, string> = {
  1: "Hoy",
  2: "Esta semana",
  3: "Este mes",
  4: "Después",
  5: "No actuar",
};

/** Estados en los que no vale la pena escribir a nadie. */
const ESTADOS_SIN_ACCION: readonly EstadoSitio[] = ["cerrado", "no-encaja"];

/**
 * ¿Puede MetaGeminis redactar texto para este sitio? No si el sitio no acepta texto de IA, si sus
 * reglas vetan a los agentes o los dejan solo en lectura, o si ya no hay nada que pedir.
 * (Un `solo-humano` sí: el agente prepara el borrador y lo envía Alex.)
 */
export function puedeRedactar(s: SitioDirectorio): boolean {
  if (s.ia_en_texto === "no-aceptada") return false;
  if (s.agentes === "prohibido" || s.agentes === "solo-lectura" || s.agentes === "sin-verificar") return false;
  return !ESTADOS_SIN_ACCION.includes(s.estado);
}

/**
 * ¿Puede un agente ENVIAR por sí mismo (tras la aprobación de Alex)? Solo con API oficial o en
 * redes hechas para agentes, solo si la ficha se leyó en la propia página, y nunca si el sitio pide revisar
 * antes o no acepta texto de IA.
 * `por-comunidad` queda fuera hasta que alguien lea las normas de ese servidor.
 */
export function puedeEnviarElAgente(s: SitioDirectorio): boolean {
  if (!puedeRedactar(s)) return false;
  if (s.estado === "revisar") return false;
  // Solo se confía en lo que se leyó en la propia página: lo que se conoce por terceros o por el buscador nunca se envía solo.
  if (s.verificacion !== "pagina-leida") return false;
  return s.agentes === "diseñado-para-agentes" || s.agentes === "api-oficial-con-aviso";
}

/** Quién da el último paso con este sitio, en palabras. */
export function quienActua(s: SitioDirectorio): "agente" | "alex" | "nadie" | "solo-lee" {
  if (ESTADOS_SIN_ACCION.includes(s.estado) || s.agentes === "prohibido" || s.ia_en_texto === "no-aceptada") {
    return s.agentes === "solo-lectura" || s.agentes === "prohibido" ? "solo-lee" : "alex";
  }
  if (s.agentes === "solo-lectura" || s.agentes === "sin-verificar") return "solo-lee";
  return puedeEnviarElAgente(s) ? "agente" : "alex";
}

export interface FiltrosDirectorio {
  texto?: string;
  categoria?: CategoriaSitio | "todas";
  estado?: EstadoSitio | "todos";
  /** Solo los de prioridad igual o más urgente (1 es lo más urgente). */
  prioridadMax?: number;
  rama?: RamaId | "todas";
  /** Solo los que el agente puede enviar por sí mismo. */
  soloAgente?: boolean;
}

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filtrarDirectorio(f: FiltrosDirectorio = {}, base: readonly SitioDirectorio[] = DIRECTORIO): SitioDirectorio[] {
  const q = sinTildes((f.texto ?? "").trim());
  const fuera = base.filter((s) => {
    if (f.categoria && f.categoria !== "todas" && s.categoria !== f.categoria) return false;
    if (f.estado && f.estado !== "todos" && s.estado !== f.estado) return false;
    if (f.prioridadMax && s.prioridad > f.prioridadMax) return false;
    if (f.rama && f.rama !== "todas" && !s.ramas.includes(f.rama)) return false;
    if (f.soloAgente && !puedeEnviarElAgente(s)) return false;
    if (q) {
      const pajar = sinTildes(`${s.nombre} ${s.que_es} ${s.utilidad} ${s.categoria} ${s.url}`);
      if (!pajar.includes(q)) return false;
    }
    return true;
  });
  return ordenarDirectorio(fuera);
}

/** Primero lo más urgente; a igual prioridad, lo que vence antes; después, por nombre. */
export function ordenarDirectorio(lista: readonly SitioDirectorio[]): SitioDirectorio[] {
  return [...lista].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    const va = a.vence ?? "9999-12-31";
    const vb = b.vence ?? "9999-12-31";
    if (va !== vb) return va < vb ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function sitioPorId(id: string, base: readonly SitioDirectorio[] = DIRECTORIO): SitioDirectorio | undefined {
  return base.find((s) => s.id === id);
}

/** Fechas límite que llegan dentro de `dias` días (o ya vencidas, con `dias` negativo en el resultado). */
export function proximosVencimientos(
  hoy: Date,
  dias = 30,
  base: readonly SitioDirectorio[] = DIRECTORIO,
): { sitio: SitioDirectorio; diasRestantes: number }[] {
  const t0 = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const fuera: { sitio: SitioDirectorio; diasRestantes: number }[] = [];
  for (const s of base) {
    if (!s.vence || ESTADOS_SIN_ACCION.includes(s.estado)) continue;
    const [a, m, d] = s.vence.split("-").map(Number);
    const resta = Math.round((Date.UTC(a, m - 1, d) - t0) / 86_400_000);
    if (resta <= dias) fuera.push({ sitio: s, diasRestantes: resta });
  }
  return fuera.sort((x, y) => x.diasRestantes - y.diasRestantes);
}

export interface ResumenDirectorio {
  total: number;
  porCategoria: Partial<Record<CategoriaSitio, number>>;
  porEstado: Partial<Record<EstadoSitio, number>>;
  paraHoy: number;
  puedeEnviarElAgente: number;
  soloAlex: number;
  soloLectura: number;
}

export function resumirDirectorio(base: readonly SitioDirectorio[] = DIRECTORIO): ResumenDirectorio {
  const r: ResumenDirectorio = { total: base.length, porCategoria: {}, porEstado: {}, paraHoy: 0, puedeEnviarElAgente: 0, soloAlex: 0, soloLectura: 0 };
  for (const s of base) {
    r.porCategoria[s.categoria] = (r.porCategoria[s.categoria] ?? 0) + 1;
    r.porEstado[s.estado] = (r.porEstado[s.estado] ?? 0) + 1;
    if (s.prioridad === 1) r.paraHoy += 1;
    const q = quienActua(s);
    if (q === "agente") r.puedeEnviarElAgente += 1;
    else if (q === "alex") r.soloAlex += 1;
    else r.soloLectura += 1;
  }
  return r;
}
