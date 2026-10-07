/**
 * Asistente IA del estudio de producción (§10): rótulos, guion, descripción
 * y escena sugerida. Usa `astrauraChat` (gratis-primero) inyectable como
 * último parámetro; pide JSON y lo valida a mano. Si la IA falla o devuelve
 * basura, `{ ok: false, error }` en español y nada se inventa. Módulo puro:
 * sin red ni disco propios (la red vive dentro de la función inyectada).
 */
import { astrauraChat, type AstrauraChatRequest } from "@/ai/astraura/router";
import type { ChatMessage, ChatResponse } from "@/ai/providers/types";

export type FnChat = (req: AstrauraChatRequest) => Promise<ChatResponse>;

export type ResultadoAsistente<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

export interface EstadoEscenas {
  escenas: { id: string; nombre: string }[];
}

const SISTEMA =
  "Eres el asistente de producción en directo de StarSeed OS. Respondes SOLO " +
  "con JSON válido, sin texto alrededor, sin comentarios y en español.";

function mensajes(instruccion: string): ChatMessage[] {
  return [
    { role: "system", content: SISTEMA },
    { role: "user", content: instruccion },
  ];
}

function extraerJson(texto: string): Record<string, unknown> | null {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  const plano = ini >= 0 && fin > ini ? limpio.slice(ini, fin + 1) : limpio;
  try {
    const p = JSON.parse(plano);
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type RespuestaIa = { ok: true; json: Record<string, unknown> } | { ok: false; error: string };

async function pedir(chat: FnChat, instruccion: string): Promise<RespuestaIa> {
  try {
    const res = await chat({ messages: mensajes(instruccion), taskHint: "creative", temperature: 0.4, maxTokens: 900 });
    const json = extraerJson(res.text ?? "");
    if (!json) return { ok: false, error: "La IA no devolvió un JSON válido." };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "La IA no pudo responder ahora. Inténtalo de nuevo en un momento." };
  }
}

function textoCorto(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

export async function generarRotulos(tema: string, n = 5, chat: FnChat = astrauraChat): Promise<ResultadoAsistente<string[]>> {
  const t = tema.trim();
  if (!t) return { ok: false, error: "Escribe un tema para los rótulos." };
  const r = await pedir(chat, `Genera ${n} rótulos cortos (máximo 60 caracteres cada uno) para una transmisión en directo sobre «${t}». Responde exactamente: {"rotulos": ["...", "..."]}`);
  if (!r.ok) return r;
  const json = r.json;
  const lista = Array.isArray(json.rotulos) ? json.rotulos : null;
  const rotulos = lista ? lista.map((v) => textoCorto(v, 1, 60)).filter((v): v is string => v !== null) : [];
  if (!rotulos.length) return { ok: false, error: "La IA no devolvió rótulos aprovechables." };
  return { ok: true, valor: rotulos.slice(0, Math.max(1, Math.min(20, n))) };
}

export async function generarGuion(tema: string, minutos: number, chat: FnChat = astrauraChat): Promise<ResultadoAsistente<string>> {
  const t = tema.trim();
  if (!t) return { ok: false, error: "Escribe un tema para el guion." };
  if (!Number.isFinite(minutos) || minutos <= 0) return { ok: false, error: "Indica cuántos minutos dura el directo." };
  const r = await pedir(chat, `Escribe el guion de un directo de ${Math.round(minutos)} minutos sobre «${t}», con bloques minuto a minuto. Responde exactamente: {"guion": "..."}`);
  if (!r.ok) return r;
  const guion = textoCorto(r.json.guion, 20, 8000);
  if (!guion) return { ok: false, error: "La IA no devolvió un guion aprovechable." };
  return { ok: true, valor: guion };
}

export async function describirEstacion(titulo: string, tipo: string, chat: FnChat = astrauraChat): Promise<ResultadoAsistente<{ descripcion: string; categorias: string[] }>> {
  const t = titulo.trim();
  if (t.length < 2) return { ok: false, error: "Escribe el título de la estación." };
  const r = await pedir(chat, `Para una estación en directo llamada «${t}» de tipo «${tipo}», escribe una descripción breve (máximo 300 caracteres) y hasta 5 categorías en minúsculas. Responde exactamente: {"descripcion": "...", "categorias": ["..."]}`);
  if (!r.ok) return r;
  const json = r.json;
  const descripcion = textoCorto(json.descripcion, 10, 300);
  const categorias = Array.isArray(json.categorias)
    ? [...new Set(json.categorias.map((v) => textoCorto(v, 1, 24)?.toLowerCase()).filter((v): v is string => !!v))].slice(0, 5)
    : [];
  if (!descripcion) return { ok: false, error: "La IA no devolvió una descripción aprovechable." };
  return { ok: true, valor: { descripcion, categorias } };
}

export async function sugerirEscena(
  estado: EstadoEscenas & { hablando?: string; fuenteActiva?: string },
  chat: FnChat = astrauraChat,
): Promise<ResultadoAsistente<{ escenaId: string; porque: string }>> {
  const escenas = estado.escenas.filter((e) => textoCorto(e?.id, 1, 80) && textoCorto(e?.nombre, 1, 80));
  if (!escenas.length) return { ok: false, error: "No hay escenas entre las que sugerir." };
  const lista = escenas.map((e) => `· ${e.id}: ${e.nombre}`).join("\n");
  const contexto = [
    estado.hablando ? `Está hablando: ${estado.hablando}.` : "",
    estado.fuenteActiva ? `Fuente activa: ${estado.fuenteActiva}.` : "",
  ].filter(Boolean).join(" ");
  const r = await pedir(chat, `Escenas del estudio:\n${lista}\n${contexto}\nElige la escena que mejor conviene ahora. Responde exactamente: {"escenaId": "<id exacto>", "porque": "<motivo breve>"}`);
  if (!r.ok) return r;
  const escenaId = textoCorto(r.json.escenaId, 1, 80);
  const porque = textoCorto(r.json.porque, 3, 200) ?? "Conviene para el momento actual del directo.";
  if (!escenaId || !escenas.some((e) => e.id === escenaId)) {
    return { ok: false, error: "La IA propuso una escena que no existe." };
  }
  return { ok: true, valor: { escenaId, porque } };
}
