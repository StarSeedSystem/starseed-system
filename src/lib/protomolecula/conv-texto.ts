// Conversores de texto para la Protomolécula: CSV↔JSON y SRT↔VTT
// Módulo puro: sin red, sin disco, sin dependencias de Node ni del navegador.

import type { ConversorDef } from "./convertidores";

// Funciones auxiliares para manejo de BOM y finales de línea
function quitarBOM(entrada: string): string {
  const bom = "\uFEFF";
  if (entrada.startsWith(bom)) {
    return entrada.slice(bom.length);
  }
  return entrada;
}

function normalizarSaltosLinea(entrada: string): string {
  return entrada.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// CSV ⇄ JSON
function parseCSV(entrada: string): string[][] {
  entrada = quitarBOM(entrada);
  entrada = normalizarSaltosLinea(entrada);
  if (entrada === "") {
    return [];
  }
  const lineas = entrada.split("\n");
  const filas: string[][] = [];
  for (const linea of lineas) {
    if (linea.trim() === "" && linea.length > 0) {
      continue;
    }
    const campos: string[] = [];
    let campoActual = "";
    let entreComillas = false;
    let i = 0;
    while (i < linea.length) {
      const c = linea[i];
      if (entreComillas) {
        if (c === '"') {
          if (i + 1 < linea.length && linea[i + 1] === '"') {
            campoActual += '"';
            i += 2;
          } else {
            entreComillas = false;
            i++;
          }
        } else {
          campoActual += c;
          i++;
        }
      } else {
        if (c === ',') {
          campos.push(campoActual);
          campoActual = "";
          i++;
        } else if (c === '"') {
          entreComillas = true;
          i++;
        } else {
          campoActual += c;
          i++;
        }
      }
    }
    // último campo
    campos.push(campoActual);
    filas.push(campos);
  }
  return filas;
}

function stringifyCSV(filas: string[][]): string {
  if (filas.length === 0) {
    return "";
  }
  const lineas: string[] = [];
  for (const fila of filas) {
    const valores: string[] = [];
    for (const valor of fila) {
      let escapado = valor;
      if (
        escapado.includes(",") ||
        escapado.includes('"') ||
        escapado.includes("\n") ||
        escapado.includes("\r")
      ) {
        escapado = escapado.replace(/"/g, '""');
        escapado = `"${escapado}"`;
      }
      valores.push(escapado);
    }
    lineas.push(valores.join(","));
  }
  return lineas.join("\n");
}

function csvAJson(entrada: string): string {
  try {
    const filas = parseCSV(entrada);
    if (filas.length === 0) {
      return "[]";
    }
    const encabezados = filas[0];
    const resultado: Record<string, string>[] = [];
    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i];
      if (fila.length !== encabezados.length) {
        throw new Error(
          `Fila ${i + 1} tiene ${fila.length} columnas, se esperaban ${encabezados.length}`
        );
      }
      const obj: Record<string, string> = {};
      for (let j = 0; j < encabezados.length; j++) {
        obj[encabezados[j]] = fila[j];
      }
      resultado.push(obj);
    }
    return JSON.stringify(resultado);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw error;
  }
}

function jsonACsv(entrada: string): string {
  try {
    const json = JSON.parse(entrada);
    if (!Array.isArray(json)) {
      throw new Error("JSON debe ser un array de objetos");
    }
    if (json.length === 0) {
      return "";
    }
    // Verificar que cada objeto es plano y recopilar encabezados
    const encabezados: string[] = [];
    const visto = new Set<string>();
    for (const obj of json) {
      if (typeof obj !== "object" || obj === null) {
        throw new Error("JSON demasiado anidado para CSV");
      }
      for (const clave in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, clave)) {
          const valor = obj[clave];
          if (
            typeof valor === "object" &&
            valor !== null &&
            !Array.isArray(valor)
          ) {
            throw new Error("JSON demasiado anidado para CSV");
          }
          if (!visto.has(clave)) {
            visto.add(clave);
            encabezados.push(clave);
          }
        }
      }
    }
    // Construir líneas CSV
    const lineas: string[] = [];
    lineas.push(encabezados.join(","));
    for (const obj of json) {
      const valores: string[] = [];
      for (const encabezado of encabezados) {
        let valor = obj[encabezado];
        if (valor === null || valor === undefined) {
          valor = "";
        } else {
          valor = String(valor);
        }
        // Escalar si contiene coma, comilla o salto de línea
        if (
          valor.includes(",") ||
          valor.includes('"') ||
          valor.includes("\n") ||
          valor.includes("\r")
        ) {
          valor = valor.replace(/"/g, '""');
          valor = `"${valor}"`;
        }
        valores.push(valor);
      }
      lineas.push(valores.join(","));
    }
    return lineas.join("\n");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw error;
  }
}

// SRT ⇄ VTT
function srtAVtt(entrada: string): string {
  entrada = quitarBOM(entrada);
  entrada = normalizarSaltosLinea(entrada);
  const bloques = entrada.split(/\n\s*\n/);
  const resultado: string[] = ["WEBVTT"];
  if (bloques.length > 0) {
    resultado.push(""); // línea en blanco después de la cabecera
  }
  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    if (bloque.trim() === "") continue;
    const lineas = bloque.split("\n");
    if (lineas.length >= 2) {
      // línea de timestamps: cambiar comas por puntos
      lineas[1] = lineas[1].replace(/,/g, ".");
    }
    resultado.push(...lineas);
    if (i < bloques.length - 1) {
      resultado.push(""); // línea en blanco entre bloques
    }
  }
  return resultado.join("\n");
}

function vttASrt(entrada: string): string {
  entrada = quitarBOM(entrada);
  entrada = normalizarSaltosLinea(entrada);
  // eliminar cabecera WEBVTT y posible línea en blanco después
  let sinCabecera = entrada.replace(/^WEBVTT\s*\n/i, "");
  // eliminar líneas de NOTA (notas)
  const lineas = sinCabecera.split("\n");
  const filtradas: string[] = [];
  for (const linea of lineas) {
    const trimmed = linea.trim();
    if (trimmed.toUpperCase().startsWith("NOTE")) {
      continue; // saltar línea de nota
    }
    filtradas.push(linea);
  }
  sinCabecera = filtradas.join("\n");
  // dividir en bloques por líneas en blanco
  const bloques = sinCabecera.split(/\n\s*\n/);
  const resultado: string[] = [];
  let numeroBloque = 1;
  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    if (bloque.trim() === "") continue;
    const lineas = bloque.split("\n");
    if (lineas.length === 0) continue;
    // asumimos que la primera línea puede ser un identificador (opcional en VTT)
    // la segunda línea es la de timestamps
    let indiceTimestamp = 0;
    if (lineas.length > 1 && /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}$/.test(lineas[1])) {
      indiceTimestamp = 1;
    } else if (
      lineas.length > 2 &&
      /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}$/.test(lineas[2])
    ) {
      indiceTimestamp = 2; // hay un identificador en la primera línea
    }
    if (indiceTimestamp >= linea.length) {
      // no se encontró timestamp, dejamos el bloque como está pero sin número
      resultado.push(...lineas);
      if (i < bloques.length - 1) {
        resultado.push("");
      }
      continue;
    }
    // cambiar puntos por comas en la línea de timestamp
    lineas[indiceTimestamp] = lineas[indiceTimestamp].replace(/\./g, ",");
    // construir bloque SRT: número, timestamp, texto
    resultado.push(String(numeroBloque));
    resultado.push(lineas[indiceTimestamp]);
    // las líneas de texto son todas excepto la de timestamp y el identificador si existía
    const textoInicio = indiceTimestamp === 0 ? 1 : 2;
    for (let j = textoInicio; j < lineas.length; j++) {
      resultado.push(lineas[j]);
    }
    if (i < bloques.length - 1) {
      resultado.push("");
    }
    numeroBloque++;
  }
  return resultado.join("\n");
}

// Definiciones de convertidores
export const CONVERSORES_TEXTO: ConversorDef[] = [
  {
    de: "csv",
    a: "json",
    via: "js",
    costo: 1,
    nombre: "CSV a JSON",
    convertir: csvAJson,
  },
  {
    de: "json",
    a: "csv",
    via: "js",
    costo: 1,
    nombre: "JSON a CSV",
    convertir: jsonACsv,
  },
  {
    de: "srt",
    a: "vtt",
    via: "js",
    costo: 1,
    nombre: "SRT a VTT",
    convertir: srtAVtt,
  },
  {
    de: "vtt",
    a: "srt",
    via: "js",
    costo: 1,
    nombre: "VTT a SRT",
    convertir: vttASrt,
  },
];