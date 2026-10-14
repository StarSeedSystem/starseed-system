import { ConversorDef } from "./convertidores";

function limpiarBom(s: string): string {
  return s.replace(/^\ufeff/, "");
}

function normalizarSalto(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseCsvLine(line: string, lineNum: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let value = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      result.push(value);
      if (i < line.length && line[i] === ',') i++;
    } else {
      let value = "";
      while (i < line.length && line[i] !== ',') {
        value += line[i];
        i++;
      }
      result.push(value);
      if (i < line.length && line[i] === ',') i++;
    }
  }
  return result;
}

function convertirCsvAJson(texto: string): string {
  const limpio = normalizarSalto(texto);
  const lineas = limpio.split("\n").filter((l, idx, arr) => {
    if (l === "" && idx === arr.length - 1) return false;
    return true;
  });
  if (lineas.length === 0) return "[]";
  const claves = parseCsvLine(lineas[0], 1);
  const filas: Record<string, string>[] = [];
  for (let n = 1; n < lineas.length; n++) {
    const linea = lineas[n];
    const valores = parseCsvLine(linea, n + 1);
    if (valores.length !== claves.length) {
      throw new Error(`Fila ${n + 1}: ${valores.length} columnas, se esperaban ${claves.length}`);
    }
    const obj: Record<string, string> = {};
    for (let k = 0; k < claves.length; k++) {
      obj[claves[k]] = valores[k];
    }
    filas.push(obj);
  }
  return JSON.stringify(filas);
}

function convertirJsonACsv(texto: string): string {
  let arr: unknown;
  try {
    arr = JSON.parse(texto);
  } catch {
    throw new Error("JSON no válido");
  }
  if (!Array.isArray(arr)) throw new Error("Se espera un array de objetos");
  if (arr.length === 0) return "";
  const claves: string[] = [];
  const visto = new Set<string>();
  for (const obj of arr) {
    if (obj === null || typeof obj !== "object") throw new Error("Cada elemento debe ser un objeto plano");
    const r = obj as Record<string, unknown>;
    for (const k of Object.keys(r)) {
      if (r[k] !== null && typeof r[k] === "object") {
        throw new Error("JSON demasiado anidado para CSV");
      }
      if (!visto.has(k)) {
        visto.add(k);
        claves.push(k);
      }
    }
  }
  const filas = [claves.join(",")];
  for (const obj of arr) {
    const r = obj as Record<string, unknown>;
    const valores = claves.map((k) => {
      const v = r[k] !== undefined ? String(r[k]) : "";
      if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    });
    filas.push(valores.join(","));
  }
  return filas.join("\n");
}

function convertirSrtAVtt(texto: string): string {
  const limpio = limpiarBom(texto);
  const lineas = normalizarSalto(limpio).split("\n");
  const bloques: string[] = [];
  let bloqueLineas: string[] = [];
  let num = "";
  for (const linea of lineas) {
    const recortado = linea.trim();
    if (recortado === "") {
      if (bloqueLineas.length > 0) {
        bloques.push(bloqueLineas.join("\n"));
        bloqueLineas = [];
        num = "";
      }
    } else if (/^\d+$/.test(recortado)) {
      num = recortado;
    } else if (/-->/.test(recortado)) {
      bloqueLineas.push(recortado.replace(",", "."));
    } else {
      bloqueLineas.push(recortado);
    }
  }
  if (bloqueLineas.length > 0) bloques.push(bloqueLineas.join("\n"));
  const salida = ["WEBVTT", ""];
  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    const partes = bloque.split("\n");
    const lineasBloque = partes.filter((l) => l.trim() !== "");
    const tiempo = lineasBloque.find((l) => l.includes("-->")) || "00:00:00.000 --> 00:00:00.000";
    const textoBloque = lineasBloque.filter((l) => !l.includes("-->")).join("\n");
    salida.push((i + 1) + "");
    salida.push(tiempo);
    salida.push(textoBloque);
    salida.push("");
  }
  return salida.join("\n").trim() + "\n";
}

function convertirVttASrt(texto: string): string {
  const limpio = limpiarBom(texto);
  const lineas = normalizarSalto(limpio).split("\n");
  const bloques: string[] = [];
  let bloqueLineas: string[] = [];
  for (const linea of lineas) {
    const recortado = linea.trim();
    if (recortado === "" || recortado === "WEBVTT") {
      if (bloqueLineas.length > 0) {
        bloques.push(bloqueLineas.join("\n"));
        bloqueLineas = [];
      }
    } else {
      bloqueLineas.push(recortado);
    }
  }
  if (bloqueLineas.length > 0) bloques.push(bloqueLineas.join("\n"));
  const salida: string[] = [];
  for (let i = 0; i < bloques.length; i++) {
    const partes = bloques[i].split("\n");
    const tiempo = partes.find((l) => l.includes("-->")) || "00:00:00,000 --> 00:00:00,000";
    const textoBloque = partes.filter((l) => !l.includes("-->") && !/^\d+$/.test(l)).join("\n");
    const tiempoSrt = tiempo.replace(/\./g, ",");
    salida.push(String(i + 1));
    salida.push(tiempoSrt);
    salida.push(textoBloque);
  }
  return salida.join("\n\n") + "\n";
}

export const CONVERSORES_TEXTO: ConversorDef[] = [
  {
    de: "csv",
    a: "json",
    via: "js",
    costo: 1,
    nombre: "csv-a-json",
    convertir: (entrada) => convertirCsvAJson(limpiarBom(typeof entrada === "string" ? entrada : new TextDecoder().decode(entrada))),
  },
  {
    de: "json",
    a: "csv",
    via: "js",
    costo: 1,
    nombre: "json-a-csv",
    convertir: (entrada) => convertirJsonACsv(typeof entrada === "string" ? entrada : new TextDecoder().decode(entrada)),
  },
  {
    de: "srt",
    a: "vtt",
    via: "js",
    costo: 1,
    nombre: "srt-a-vtt",
    convertir: (entrada) => convertirSrtAVtt(limpiarBom(typeof entrada === "string" ? entrada : new TextDecoder().decode(entrada))),
  },
  {
    de: "vtt",
    a: "srt",
    via: "js",
    costo: 1,
    nombre: "vtt-a-srt",
    convertir: (entrada) => convertirVttASrt(limpiarBom(typeof entrada === "string" ? entrada : new TextDecoder().decode(entrada))),
  },
];
