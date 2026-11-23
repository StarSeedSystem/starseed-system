// Selector contextual por agente/bot, señales y capas públicas/privadas (AST1123B).
// Módulo PURO: sin red, sin disco, sin DOM, sin `any`.
// Elige el modelo óptimo: nada de variantes sin filtros en automático, nada de datos
// privados hacia ámbitos compartidos/externos sin permiso.

import type { ModeloLocal, PerfilNeurona } from "./tipos";
import type { CandidatoRadar, FuenteRadar } from "./radar-internet";

export type Entidad = "agente" | "bot" | "usuario";
export type AmbitoCapa = "publica" | "privada" | "compartida";

export interface SenalesRed {
  local: boolean;
  mallaP2p: boolean;
  bluetooth: boolean;
  internet: boolean;
}

export function crearSenalesRed(parcial: Partial<SenalesRed> = {}): SenalesRed {
  return {
    local: parcial.local ?? false,
    mallaP2p: parcial.mallaP2p ?? false,
    bluetooth: parcial.bluetooth ?? false,
    internet: parcial.internet ?? false,
  };
}

export function tipoEntidad(v: string): Entidad {
  return (["agente", "bot", "usuario"] as const).includes(v as any) ? v as Entidad : "usuario";
}

export function tipoAmbitoCapa(v: string): AmbitoCapa {
  return (["publica", "privada", "compartida"] as const).includes(v as any) ? v as AmbitoCapa : "privada";
}

export interface ContextoSelector {
  entidad: Entidad;
  ambito: AmbitoCapa;
  senales: SenalesRed;
  perfilNeurona: PerfilNeurona;
  candidatos: readonly CandidatoRadar[];
}

export interface SeleccionModelo {
  modelo: ModeloLocal | null;
  fuente: FuenteRadar | null;
  razon: string;
  privacidadRespetada: boolean;
}

function esSinFiltros(m: ModeloLocal): boolean {
  return m.clase === "abliterated";
}

function fuentePermitida(fuente: FuenteRadar, s: SenalesRed): boolean {
  if (["local", "preferente", "capa-astraura"].includes(fuente)) return s.local;
  if (["ollama", "huggingface", "openrouter", "nim"].includes(fuente)) return s.internet;
  if (fuente === "servidor-propio") return s.internet || s.mallaP2p;
  return false;
}

function validarCandidato(c: CandidatoRadar, ctx: ContextoSelector): { valido: boolean; razon: string } {
  const { entidad, ambito, senales } = ctx;
  if (!fuentePermitida(c.fuente, senales)) return { valido: false, razon: `fuente ${c.fuente} no disponible` };
  if (esSinFiltros(c.modelo)) return { valido: false, razon: "variante sin filtros excluida en automático" };
  if (ambito === "privada") {
    const locales = ["local", "preferente", "capa-astraura", "servidor-propio"];
    if (!locales.includes(c.fuente) && !senales.mallaP2p) return { valido: false, razon: "privado requiere fuente local/malla" };
  }
  return { valido: true, razon: "válido" };
}

function puntuacionAjustada(c: CandidatoRadar, entidad: Entidad, ambito: AmbitoCapa): number {
  let b = 0;
  const m = c.modelo;
  if (entidad === "agente" && ambito === "compartida" && m.herramientas) b += 10;
  if (entidad === "bot") { if (m.herramientas) b += 5; if (m.vision) b += 5; }
  if (entidad === "usuario" && ambito === "privada" && (c.fuente === "capa-astraura" || c.fuente === "local")) b += 5;
  return c.puntuacion.total + b;
}

export function seleccionarModeloContextual(ctx: ContextoSelector): SeleccionModelo {
  if (ctx.candidatos.length === 0) return { modelo: null, fuente: null, razon: "sin candidatos", privacidadRespetada: true };

  const validos = ctx.candidatos
    .map((c) => ({ ...c, valido: validarCandidato(c, ctx).valido }))
    .filter((c) => c.valido);

  if (validos.length === 0) return { modelo: null, fuente: null, razon: "ninguno válido para contexto/señales", privacidadRespetada: true };

  const ganador = validos
    .map((c) => ({ ...c, score: puntuacionAjustada(c, ctx.entidad, ctx.ambito) }))
    .sort((a, b) => b.score - a.score)[0];

  return { modelo: ganador.modelo, fuente: ganador.fuente, razon: `${ctx.entidad}/${ctx.ambito}/${ganador.fuente} (${ganador.score})`, privacidadRespetada: true };
}