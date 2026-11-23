// Radar comparativo unificado: internet + local (AST1123A).
// Módulo PURO: sin red, sin disco, sin DOM, sin `any`.
// Compara candidatos locales instalados, modelos curados preferentes y descubrimientos de internet
// (Ollama, Hugging Face GGUF, OpenRouter, NVIDIA NIM, servidor propio).
// Calcula puntuación compuesta por encaje hardware, ECI/calidad, capacidades y preferencia declarada.

import type { ModeloLocal, PerfilNeurona, Veredicto, MotivoEncaje } from "./tipos";
import { requisitosDe } from "./catalogo";

export type FuenteRadar =
  | "local"
  | "preferente"
  | "ollama"
  | "huggingface"
  | "openrouter"
  | "nim"
  | "servidor-propio"
  | "capa-astraura";

export type TipoFuenteRadar =
  | "instalado"
  | "curado"
  | "ollama"
  | "huggingface"
  | "openrouter"
  | "nim"
  | "servidor-propio"
  | "capa-astraura";

export interface PuntuacionRadar {
  eci: number;
  encaje: number;
  capacidades: number;
  preferencia: number;
  total: number;
}

export interface CandidatoRadar {
  modelo: ModeloLocal;
  fuente: FuenteRadar;
  preferido: boolean;
  puntuacion: PuntuacionRadar;
}

const FRONTERA_MAX_ECI = 180;

export function tipoFuenteRadar(f: FuenteRadar): TipoFuenteRadar {
  const mapa: Record<FuenteRadar, TipoFuenteRadar> = {
    local: "instalado",
    preferente: "curado",
    ollama: "ollama",
    huggingface: "huggingface",
    openrouter: "openrouter",
    nim: "nim",
    "servidor-propio": "servidor-propio",
    "capa-astraura": "capa-astraura",
  };
  return mapa[f];
}

function veredictoEncaje(m: ModeloLocal, p: PerfilNeurona): { veredicto: Veredicto; motivo: MotivoEncaje } {
  const rq = requisitosDe(m);
  const ram = p.ramGb;
  if (ram === null) return { veredicto: "no-cabe", motivo: "memoria-insuficiente" };
  if (p.chip === "apple-silicon") {
    if (ram >= rq.memoriaComodaGb) return { veredicto: "recomendado", motivo: "ok" };
    if (ram >= rq.memoriaMinGb) return { veredicto: "justo", motivo: "memoria-justa" };
    return { veredicto: "no-cabe", motivo: "memoria-insuficiente" };
  }
  if ((p.chip === "nvidia" || p.chip === "amd") && p.vramGb !== null && rq.vramMinGb !== null && rq.vramComodaGb !== null) {
    if (p.vramGb >= rq.vramComodaGb && ram >= rq.memoriaMinGb) return { veredicto: "recomendado", motivo: "ok" };
    if (p.vramGb >= rq.vramMinGb && ram >= rq.memoriaMinGb) return { veredicto: "justo", motivo: "memoria-justa" };
    if (ram >= rq.memoriaComodaGb) return { veredicto: "justo", motivo: "memoria-justa" };
    return { veredicto: "no-cabe", motivo: "memoria-insuficiente" };
  }
  if (ram < rq.memoriaMinGb || m.descargaGb > 8) return { veredicto: "no-cabe", motivo: m.descargaGb > 8 ? "sin-gpu" : "memoria-insuficiente" };
  if (m.descargaGb <= 3.5 && ram >= rq.memoriaComodaGb) return { veredicto: "recomendado", motivo: "ok" };
  return { veredicto: "justo", motivo: "sin-gpu" };
}

function puntuacionEncaje(v: Veredicto): number {
  switch (v) {
    case "recomendado": return 100;
    case "justo": return 60;
    case "falta-disco": return 40;
    default: return 0;
  }
}

function tieneRuntime(m: ModeloLocal, p: PerfilNeurona): boolean {
  return m.runtimes.some((r) => p.runtimes.includes(r));
}

function soloApple(m: ModeloLocal, p: PerfilNeurona): boolean {
  return m.soloApple === true && p.chip !== "apple-silicon";
}

function heuristicaEci(m: ModeloLocal): number {
  if (m.tipo === "needle") return 45;
  if (m.tipo === "capa-158") return 55;
  let base = Math.min(85, m.descargaGb * 3.5 + 20);
  if (m.herramientas) base += 5;
  if (m.vision) base += 5;
  if (m.razonamiento) base += 3;
  return Math.min(90, base);
}

function puntuacionCapacidades(m: ModeloLocal): number {
  let score = 0;
  if (m.herramientas) score += 25;
  if (m.vision) score += 20;
  if (m.contextoK !== null && m.contextoK >= 1000) score += 30;
  else if (m.contextoK !== null && m.contextoK >= 256) score += 10;
  if (m.razonamiento) score += 10;
  return Math.min(100, score);
}

export function calcularPuntuacionRadar(m: ModeloLocal, p: PerfilNeurona, preferido: boolean): PuntuacionRadar {
  const enc = veredictoEncaje(m, p);
  const eci = m.puntuacion?.eci ?? 0;
  const eciNorm = eci > 0 ? Math.min(100, (eci / FRONTERA_MAX_ECI) * 100) : heuristicaEci(m);
  const cap = puntuacionCapacidades(m);
  const pref = preferido ? 15 : 0;
  const encaje = puntuacionEncaje(enc.veredicto);
  const total = Math.round(eciNorm * 0.4 + encaje * 0.35 + cap * 0.15 + pref * 0.1);
  return { eci: eciNorm, encaje, capacidades: cap, preferencia: pref, total };
}

export function filtrarPorEncaje(
  candidatos: readonly { modelo: ModeloLocal; fuente: FuenteRadar; preferido: boolean }[],
  p: PerfilNeurona
): CandidatoRadar[] {
  return candidatos
    .filter((c) => tieneRuntime(c.modelo, p) && !soloApple(c.modelo, p))
    .map((c) => ({
      modelo: c.modelo,
      fuente: c.fuente,
      preferido: c.preferido,
      puntuacion: calcularPuntuacionRadar(c.modelo, p, c.preferido),
    }))
    .filter((c) => c.puntuacion.encaje > 0);
}

export function compararRadar(
  candidatos: readonly { modelo: ModeloLocal; fuente: FuenteRadar; preferido: boolean }[],
  perfil: PerfilNeurona
): CandidatoRadar[] {
  return filtrarPorEncaje(candidatos, perfil).sort((a, b) => b.puntuacion.total - a.puntuacion.total);
}

export function explicarGanador(ganador: CandidatoRadar, perfil: PerfilNeurona): string {
  const { modelo, preferido, fuente } = ganador;
  const enc = veredictoEncaje(modelo, perfil);
  const partes: string[] = [];
  partes.push(`«${modelo.etiqueta}»`);
  if (preferido) partes.push("es preferente");
  if (fuente === "capa-astraura") partes.push("es una capa propia de Astraura");
  if (enc.veredicto === "recomendado") partes.push("cabe holgado en esta neurona");
  else if (enc.veredicto === "justo") partes.push(`cabe justo (${enc.motivo === "sin-gpu" ? "sin GPU" : "memoria justa"})`);
  if (modelo.herramientas) partes.push("tiene herramientas");
  if (modelo.vision) partes.push("tiene visión");
  if (modelo.contextoK !== null && modelo.contextoK >= 1000) partes.push("soporta contexto de 1M tokens");
  if (modelo.puntuacion) partes.push(`rinde ECI ${modelo.puntuacion.eci.toFixed(1).replace(".", ",")}`);
  return partes.join(" · ") + ".";
}