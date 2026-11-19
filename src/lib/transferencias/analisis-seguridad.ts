/**
 * analisis-seguridad — Astraura revisa lo que llega ANTES de abrirlo (FMT1119 · 2026-11-19).
 * Módulo PURO: no ejecuta, no instala, no borra, no toca la red ni el disco.
 *
 * Mira el tipo real por los bytes frente a la extensión y al tipo declarado, la huella SHA-256,
 * la firma del ejecutable si la trae, y las señales de riesgo: ejecutables, macros, scripts,
 * comprimidos anidados y rutas peligrosas dentro de comprimidos. Si el sistema tiene antivirus
 * (ClamAV, XProtect o Defender) se ofrece en ese orden. El resultado se enseña antes de abrir;
 * la persona decide, nunca este módulo.
 */

import { formatearTamano } from "./aceptacion";
import { extensionDe, inspeccionarArchivo } from "@/lib/network/inspeccion-archivos";

export type NivelRiesgo = "limpio" | "aviso" | "peligro";
export type NivelHallazgo = NivelRiesgo | "info";

export type MotorAntivirus = "ClamAV" | "XProtect" | "Defender";

/** Orden de preferencia del sistema: primero el que revisa de verdad, luego el del sistema. */
export const ORDEN_ANTIVIRUS: readonly MotorAntivirus[] = ["ClamAV", "XProtect", "Defender"];

export type EstadoFirma = "notarizada" | "valida" | "invalida" | "ausente" | "desconocida" | "no-aplica";

export interface EntradaComprimido {
  ruta: string;
  tamano?: number;
  comprimido?: number;
  cifrado?: boolean;
}

/** Lo que se sabe de un archivo recibido sin abrirlo. */
export interface EntradaAnalisis {
  nombre: string;
  tamano: number;
  tipoDeclarado?: string | null;
  /** Huella SHA-256 anunciada o calculada al recibir. */
  sha256?: string | null;
  /** Firma del ejecutable, si el sistema la pudo comprobar. */
  firma?: EstadoFirma | null;
  /** Primeros bytes (≤ 64 KB) para deducir el tipo real. */
  inicio?: Uint8Array | null;
  /** Contenido de un comprimido, si lo es. */
  entradasComprimido?: readonly EntradaComprimido[] | null;
  /** Comprimidos dentro de comprimidos ya detectados. */
  comprimidosAnidados?: number;
}

export interface HallazgoSeguridad {
  nivel: NivelHallazgo;
  codigo: string;
  texto: string;
}

export interface PlanAntivirus {
  orden: MotorAntivirus[];
  hay: boolean;
  texto: string;
}

export interface ResultadoAnalisis {
  nivel: NivelRiesgo;
  tipoReal: string | null;
  huella: string | null;
  firma: EstadoFirma;
  hallazgos: HallazgoSeguridad[];
  antivirus: PlanAntivirus;
  resumen: string;
  /** Recordatorio para la ventana: se muestra antes de abrir y nunca decide por la persona. */
  antesDeAbrir: string;
}

export interface OpcionesAnalisis {
  antivirusDisponibles?: readonly MotorAntivirus[];
}

const EXT_COMPRIMIDOS = new Set(["zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "zst", "cab", "iso", "img", "jar", "apk", "aab"]);
const EXT_PROGRAMA = new Set(["exe", "dll", "scr", "com", "msi", "msp", "cpl", "msc", "pif", "sys", "drv", "apk", "dmg", "pkg", "deb", "rpm", "appimage", "run"]);

function peor(a: NivelRiesgo, b: NivelRiesgo): NivelRiesgo {
  const orden: Record<NivelRiesgo, number> = { limpio: 0, aviso: 1, peligro: 2 };
  return orden[b] > orden[a] ? b : a;
}

function codigoDe(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes("ejecutable") || t.includes("programa")) return "ejecutable";
  if (t.includes("script")) return "script";
  if (t.includes("macro")) return "macro";
  if (t.includes("ruta") || t.includes("descomprimir")) return "ruta-peligrosa";
  if (t.includes("comprimid")) return "comprimido";
  if (t.includes("extensión") || t.includes("bytes") || t.includes("tipo")) return "tipo-real";
  if (t.includes("firma")) return "firma";
  return "heuristica";
}

function huellaValida(sha256?: string | null): string | null {
  const h = String(sha256 ?? "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(h) ? h : null;
}

function parecePrograma(nombre: string, tipoReal: string | null): boolean {
  return !!tipoReal && tipoReal.startsWith("EJECUTABLE") || EXT_PROGRAMA.has(extensionDe(nombre));
}

function esComprimidoAnidado(ruta: string): boolean {
  return EXT_COMPRIMIDOS.has(extensionDe(ruta));
}

/**
 * Antivirus del sistema a usar, en el orden acordado (ClamAV → XProtect → Defender). Solo devuelve
 * los que existen: si la lista llega vacía, no hay ninguno. Puro.
 */
export function elegirAntivirus(disponibles: readonly MotorAntivirus[]): PlanAntivirus {
  const hay = new Set(disponibles);
  const orden = ORDEN_ANTIVIRUS.filter((motor) => hay.has(motor));
  return { orden, hay: orden.length > 0, texto: orden.length ? orden.join(" → ") : "ninguno disponible" };
}

function resumirTexto(p: {
  nombre: string;
  tamano: number;
  tipoReal: string | null;
  huella: string | null;
  firma: EstadoFirma;
  nivel: NivelRiesgo;
  antivirus: PlanAntivirus;
  hallazgos: readonly HallazgoSeguridad[];
}): string {
  const lineas = [
    `Revisión de seguridad: ${p.nombre || "sin nombre"}`,
    `Tipo real: ${p.tipoReal ?? "sin determinar"} · Tamaño: ${formatearTamano(p.tamano)}`,
    `Huella SHA-256: ${p.huella ?? "sin huella"}`,
    `Firma: ${p.firma}`,
    `Antivirus: ${p.antivirus.hay ? p.antivirus.texto : "ninguno disponible"}`,
    `Riesgo: ${p.nivel}`,
  ];
  for (const h of p.hallazgos) lineas.push(`- [${h.nivel}] ${h.texto}`);
  return lineas.join("\n");
}

/**
 * Analiza lo recibido sin abrirlo: tipo real frente a extensión y tipo declarado, huella, firma
 * del ejecutable y señales de riesgo (programas, macros, scripts, comprimidos anidados y rutas
 * peligrosas dentro de comprimidos). El antivirus del sistema se ofrece en su orden. Puro.
 */
export function analizarSeguridad(entrada: EntradaAnalisis, opciones: OpcionesAnalisis = {}): ResultadoAnalisis {
  const nombre = String(entrada.nombre ?? "");
  const tamano = Number.isFinite(entrada.tamano) ? Math.max(0, entrada.tamano) : 0;
  const inicio = entrada.inicio && entrada.inicio.length ? entrada.inicio : null;
  const base = inspeccionarArchivo({
    nombre,
    tipo: entrada.tipoDeclarado ?? null,
    tamano,
    inicio,
    entradasZip: entrada.entradasComprimido ?? null,
    zipSegun: "archivo",
  });
  const tipoReal = base.tipoReal;
  const huella = huellaValida(entrada.sha256);
  const hallazgos: HallazgoSeguridad[] = base.hallazgos.map((h) => ({ nivel: h.nivel, codigo: codigoDe(h.texto), texto: h.texto }));

  if (!huella) hallazgos.push({ nivel: "info", codigo: "sin-huella", texto: "Sin huella SHA-256 para cotejar" });

  const entradas = entrada.entradasComprimido ?? [];
  const declarados = Number.isFinite(entrada.comprimidosAnidados) ? Math.max(0, Math.round(entrada.comprimidosAnidados as number)) : 0;
  const anidados = Math.max(declarados, entradas.filter((e) => esComprimidoAnidado(e.ruta)).length);
  if (anidados > 0) {
    hallazgos.push({
      nivel: "aviso",
      codigo: "comprimido-anidado",
      texto: `Lleva ${anidados} comprimido${anidados === 1 ? "" : "s"} dentro del comprimido: se revisan al descomprimir`,
    });
  }

  const programa = parecePrograma(nombre, tipoReal);
  const firma: EstadoFirma = entrada.firma ?? (programa ? "desconocida" : "no-aplica");
  if (firma === "invalida") {
    hallazgos.push({ nivel: "peligro", codigo: "firma", texto: "La firma del ejecutable no es válida" });
  } else if (programa && (firma === "ausente" || firma === "desconocida")) {
    hallazgos.push({ nivel: "aviso", codigo: "firma", texto: "Ejecutable sin firma comprobada: solo ábrelo si lo esperabas" });
  } else if (programa && (firma === "valida" || firma === "notarizada")) {
    hallazgos.push({ nivel: "info", codigo: "firma", texto: `Firma del ejecutable: ${firma}` });
  }

  const antivirus = elegirAntivirus(opciones.antivirusDisponibles ?? []);
  hallazgos.push(
    antivirus.hay
      ? { nivel: "info", codigo: "antivirus", texto: `Antivirus del sistema disponible: ${antivirus.texto}` }
      : { nivel: "info", codigo: "antivirus", texto: "No hay antivirus del sistema disponible (ClamAV, XProtect, Defender)" },
  );

  let nivel: NivelRiesgo = "limpio";
  for (const h of hallazgos) if (h.nivel !== "info") nivel = peor(nivel, h.nivel);

  const resumen = resumirTexto({ nombre, tamano, tipoReal, huella, firma, nivel, antivirus, hallazgos });
  const antesDeAbrir = `${resumen}\n\nRevisa este resultado antes de abrir. Nada se ejecuta ni se instala sin tu aceptación.`;
  return { nivel, tipoReal, huella, firma, hallazgos, antivirus, resumen, antesDeAbrir };
}
