// Conversores reales de texto para la Protomolécula: CSV↔JSON y SRT↔VTT.
// Módulo puro: sin red, sin disco, sin dependencias. Todo el texto entra y sale
// como string; los números de línea de los errores cuentan desde 1.

import type { ConversorDef } from "./convertidores";

function normalizarSaltos(texto: string): string {
  return texto.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// --- CSV (RFC 4180) ---

function csvAFilas(csv: string): string[][] {
  const texto = normalizarSaltos(csv);
  const filas: string[][] = [[]];
  let campo = "", enComillas = false, campoSucio = false;
  const cerrarCampo = () => { filas[filas.length - 1].push(campo); campo = ""; campoSucio = false; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && !campoSucio) enComillas = true;
    else if (c === ",") cerrarCampo();
    else if (c === "\n") { cerrarCampo(); filas.push([]); }
    else { campo += c; campoSucio = true; }
  }
  cerrarCampo();
  if (filas.length > 1 && filas[filas.length - 1].join("") === "") filas.pop();
  return filas;
}

function csvAJson(csv: string): string {
  const filas = csvAFilas(csv);
  if (filas.length === 0) return "[]";
  const claves = filas[0];
  const salida: Record<string, string>[] = [];
  for (let f = 1; f < filas.length; f++) {
    if (filas[f].length !== claves.length)
      throw new Error(`CSV mal formado: la línea ${f + 1} tiene ${filas[f].length} columnas y se esperaban ${claves.length}.`);
    const objeto: Record<string, string> = {};
    for (let i = 0; i < claves.length; i++) objeto[claves[i]] = filas[f][i];
    salida.push(objeto);
  }
  return JSON.stringify(salida);
}

function escaparCsv(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function jsonACsv(json: string): string {
  const datos: unknown = JSON.parse(json);
  if (!Array.isArray(datos)) throw new Error("El JSON debe ser un array de objetos para convertirse a CSV.");
  const claves: string[] = [];
  for (const item of datos) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("El JSON debe ser un array de objetos planos para CSV.");
    }
    for (const valor of Object.values(item as Record<string, unknown>))
      if (typeof valor === "object" && valor !== null) throw new Error("JSON demasiado anidado para CSV.");
    for (const clave of Object.keys(item as Record<string, unknown>))
      if (!claves.includes(clave)) claves.push(clave);
  }
  const lineas = [claves.map(escaparCsv).join(",")];
  for (const item of datos) {
    const objeto = item as Record<string, unknown>;
    lineas.push(claves.map((k) => escaparCsv(String(objeto[k] ?? ""))).join(","));
  }
  return lineas.join("\n");
}

// --- SRT ↔ VTT ---

interface BloqueSubtitulo { tiempos: string; texto: string[] }

function bloquesDe(texto: string, lineasCabecera: number): BloqueSubtitulo[] {
  const bloques: BloqueSubtitulo[] = [];
  let actual: BloqueSubtitulo | null = null;
  for (const linea of normalizarSaltos(texto).split("\n").slice(lineasCabecera)) {
    if (linea.trim() === "") { actual = null; continue; }
    if (linea.includes("-->")) {
      actual = { tiempos: linea.trim(), texto: [] };
      bloques.push(actual);
    } else if (actual) actual.texto.push(linea);
  }
  return bloques;
}

function srtAVtt(srt: string): string {
  const partes = bloquesDe(srt, 0).map((b) => `${b.tiempos.replace(/,/g, ".")}\n${b.texto.join("\n")}`);
  return `WEBVTT\n\n${partes.join("\n\n")}`;
}

function vttASrt(vtt: string): string {
  const limpio = normalizarSaltos(vtt).split("\n").filter((l) => !l.startsWith("NOTE")).join("\n");
  return bloquesDe(limpio, 1)
    .map((b, i) => `${i + 1}\n${b.tiempos.replace(/\./g, ",")}\n${b.texto.join("\n")}`)
    .join("\n\n");
}

// --- Registro ---

function conversionTexto(nombre: string, fn: (s: string) => string) {
  return (entrada: Uint8Array | string): string => {
    if (typeof entrada !== "string") throw new Error(`El conversor «${nombre}» solo acepta texto, no binario.`);
    return fn(entrada);
  };
}

export const CONVERSORES_TEXTO: ConversorDef[] = (Object.entries({ csv: { json: csvAJson }, json: { csv: jsonACsv }, srt: { vtt: srtAVtt }, vtt: { srt: vttASrt } }) as [string, Record<string, (s: string) => string>][])
  .flatMap(([de, mapa]) => Object.entries(mapa).map(([a, fn]) => {
    const nombre = `${de.toUpperCase()} → ${a.toUpperCase()}`;
    return { de, a, via: "js" as const, costo: 1, nombre, convertir: conversionTexto(nombre, fn) };
  }));
