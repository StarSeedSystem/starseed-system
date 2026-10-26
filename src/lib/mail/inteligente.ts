"use client";

type ReglaTipo =
  | "etiquetar"
  | "mover"
  | "destacar"
  | "esperar-respuesta"
  | "sugerir-borrador";

export interface Regla {
  id?: string;
  tipo: ReglaTipo;
  cuando: Record<string, unknown>;
  parametro?: string;
  texto?: string;
  extra?: unknown;
}

export function R(tipo: ReglaTipo, cuando: Regla["cuando"], parametro?: string): Regla {
  return { tipo, cuando, parametro };
}

export function R0(tipo: ReglaTipo): Regla {
  return { tipo, cuando: {} };
}

export interface Mail {
  id: string;
  remitente: string;
  fecha: string;
  tieneAdjunto?: boolean;
  dominio?: string;
}

export function M(hilos: Mail[]): Mail[] {
  return hilos;
}

export function validarRegla(r: unknown): r is Regla {
  if (!r || typeof r !== "object") return false;
  const regla = r as Regla;
  if (!regla.tipo) return false;
  const tipos: ReglaTipo[] = ["etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador"];
  if (!tipos.includes(regla.tipo as ReglaTipo)) return false;
  if (!regla.cuando || typeof regla.cuando !== "object") return false;
  if (regla.texto && typeof regla.texto !== "string") return false;
  if (regla.parametro && typeof regla.parametro !== "string") return false;
  if (regla.id !== undefined && typeof regla.id !== "string") return false;
  if (regla.id === "") return false;
  if (regla.extra !== undefined) return false;
  if (regla.cuando.extra !== undefined) return false;
  if (regla.cuando.antiguedadHorasMin !== undefined && typeof regla.cuando.antiguedadHorasMin !== "number") return false;
  if (regla.cuando.antiguedadHorasMin !== undefined && regla.cuando.antiguedadHorasMin < 0) return false;
  if (regla.cuando.tieneAdjunto !== undefined && typeof regla.cuando.tieneAdjunto !== "boolean") return false;
  if (regla.cuando.dominio !== undefined && typeof regla.cuando.dominio !== "string") return false;
  if (regla.cuando.de !== undefined && typeof regla.cuando.de !== "string") return false;
  if (regla.texto && regla.texto.length > 200) return false;
  if (regla.parametro && regla.parametro.length > 100) return false;
  return true;
}

export function aplicarReglas(reglas: unknown[], mail: Mail): { tipo: string; parametro?: string; reglaId: string }[] {
  const resultado: { tipo: string; parametro?: string; reglaId: string }[] = [];
  const idsUsados = new Set<string>();

  for (const r of reglas) {
    if (!validarRegla(r)) continue;
    const regla = r as Regla;
    const id = regla.id ?? `r${Math.random().toString(36).slice(2, 11)}`;

    const accionYParam = `${regla.tipo}|${regla.parametro ?? ""}`;
    if (idsUsados.has(accionYParam)) continue;
    idsUsados.add(accionYParam);

    const cuando = regla.cuando;

    if (cuando.antiguedadHorasMin !== undefined) {
      const fecha = new Date(mail.fecha).getTime();
      const ahora = Date.now();
      const horas = (ahora - fecha) / (1000 * 60 * 60);
      if (horas < cuando.antiguedadHorasMin) continue;
    }
    if (cuando.dominio !== undefined && mail.dominio !== cuando.dominio) continue;
    if (cuando.de !== undefined && mail.remitente.toLowerCase() !== cuando.de.toLowerCase()) continue;
    if (cuando.tieneAdjunto !== undefined && mail.tieneAdjunto !== cuando.tieneAdjunto) continue;

    resultado.push({
      tipo: regla.tipo,
      parametro: regla.parametro,
      reglaId: id,
    });
  }

  return resultado;
}

export function clasificarHilo(hilos: Mail[], usuario: string, ahora: number | Date, opciones?: { horasPorResponder?: number; diasEsperando?: number }): "por-responder" | "resuelto" | "esperando" {
  if (!hilos.length) return "resuelto";

  const horasPorResponder = opciones?.horasPorResponder ?? 24;
  const diasEsperando = opciones?.diasEsperando ?? 14;

  const convertido = hilos.map((h) => ({
    ...h,
    fecha: typeof h.fecha === "string" ? h.fecha : new Date(h.fecha).toISOString(),
  }));

  const ultimo = convertido[convertido.length - 1];
  const esCreadoPorMi = ultimo.remitente === usuario;
  const ahoraIso = typeof ahora === "number" ? new Date(ahora).toISOString() : ahora.toISOString();
  const ahoraMs = new Date(ahoraIso).getTime();
  const ultimoMs = new Date(ultimo.fecha).getTime();
  const diffHoras = (ahoraMs - ultimoMs) / (1000 * 60 * 60);
  const diffDias = diffHoras / 24;

  if (!esCreadoPorMi && diffHoras >= horasPorResponder) return "por-responder";
  if (!esCreadoPorMi && diffHoras < horasPorResponder) return "resuelto";
  if (esCreadoPorMi && diffDias >= diasEsperando) return "esperando";
  return "resuelto";
}

export function resumenSeguimiento(hilos: Mail[][], usuario: string, ahora: number | Date): {
  porResponder: number;
  esperando: number;
  resuelto: number;
  total: number;
} {
  const convertido = hilos.map((h) => h.map((m) => ({
    ...m,
    fecha: typeof m.fecha === "string" ? m.fecha : new Date(m.fecha).toISOString(),
  })));

  const ahoraMs = typeof ahora === "number" ? ahora : new Date(ahora).getTime();

  let porResponder = 0;
  let esperando = 0;
  let resuelto = 0;

  for (const h of convertido) {
    const clasificado = clasificarHilo(h, usuario, ahoraMs);
    switch (clasificado) {
      case "por-responder": porResponder++; break;
      case "esperando": esperando++; break;
      case "resuelto": resuelto++; break;
    }
  }

  return { porResponder, esperando, resuelto, total: hilos.length };
}