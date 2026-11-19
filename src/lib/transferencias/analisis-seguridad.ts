/**
 * analisis-seguridad — lo que Astraura OFRECE al recibir algo por la malla (FMT1119 · 2026-11-19).
 * Lo hace solo si la persona quiere o lo dejó activado, sin abrir ni ejecutar nada, y enseña el
 * resultado antes de abrir. Mira tipo real por bytes, huella, firma del ejecutable, señales de riesgo
 * (ejecutables, macros, scripts, comprimidos anidados, rutas peligrosas) y antivirus del sistema
 * (ClamAV → XProtect → Defender). PURO: sin red, sin disco, sin procesos, sin DOM.
 */
import { inspeccionarArchivo, type EntradaZip, type Hallazgo, type NivelInspeccion } from "@/lib/network/inspeccion-archivos";

export type NivelAnalisis = NivelInspeccion;
export type MotorAntivirus = "clamav" | "xprotect" | "defender";
export const ORDEN_ANTIVIRUS: readonly MotorAntivirus[] = ["clamav", "xprotect", "defender"];
export type VeredictoAntivirus = "limpio" | "sospechoso" | "infectado";
export interface FirmaEjecutable { valida: boolean; firmante?: string; motivo?: string }
export interface EntradaAnalisisSeguridad {
  nombre: string;
  tipo?: string | null;
  tamano: number;
  /** Primeros bytes (≤ 64 KB) y rutas del comprimido, si ya se listaron. */
  inicio?: Uint8Array | null;
  entradasZip?: readonly EntradaZip[] | null;
  zipSegun?: "remitente" | "archivo";
  /** Huella SHA-256 recibida y la que anunció el remitente, para comparar. */
  huella?: string | null;
  huellaEsperada?: string | null;
  /** Firma del ejecutable, si el sistema pudo comprobarla. */
  firma?: FirmaEjecutable | null;
  /** Antivirus que existen en el aparato (en cualquier orden) y lo que respondió, si ya se pasó. */
  antivirusDisponibles?: readonly string[] | null;
  antivirus?: { motor: string; veredicto: VeredictoAntivirus; detalle?: string } | null;
}
export interface ResultadoAnalisisSeguridad {
  nivel: NivelAnalisis;
  hallazgos: Hallazgo[];
  tipoReal: string | null;
  huella: string | null;
  firma: FirmaEjecutable | null;
  antivirus: { motor: MotorAntivirus; veredicto: VeredictoAntivirus; detalle?: string } | null;
  /** Frase corta para enseñar antes de abrir. */
  resumen: string;
  conBytes: boolean;
}

/** Primer antivirus del aparato según el orden de preferencia; null si no hay ninguno. Puro. */
export function elegirAntivirus(disponibles: readonly string[] | null | undefined): MotorAntivirus | null {
  const hay = new Set((disponibles ?? []).map((x) => String(x ?? "").toLowerCase()));
  return ORDEN_ANTIVIRUS.find((m) => hay.has(m)) ?? null;
}
/** Texto con el que Astraura ofrece analizar: qué hará y qué NO hará. Puro. */
export function textoOfertaAnalisis(p: { nombre: string; origen?: string; via?: string }): string {
  const de = p.origen ? ` de ${p.origen}` : "";
  const via = p.via ? ` (${p.via})` : "";
  return (
    `Astraura puede analizar «${p.nombre}»${de}${via} antes de abrirlo: revisa el tipo real frente a la extensión, ` +
    "la huella, la firma del ejecutable si la tiene, las señales de riesgo y el antivirus del sistema. " +
    "Lo hace sin abrirlo ni ejecutarlo, y te enseña el resultado antes de abrirlo. Nada se ejecuta ni se instala sin que tú lo aceptes."
  );
}
function motorConocido(m: string): MotorAntivirus | null {
  const x = String(m ?? "").toLowerCase();
  return ORDEN_ANTIVIRUS.includes(x as MotorAntivirus) ? (x as MotorAntivirus) : null;
}
function peor(a: NivelAnalisis, b: NivelAnalisis): NivelAnalisis {
  const orden: Record<NivelAnalisis, number> = { limpio: 0, aviso: 1, peligro: 2 };
  return orden[b] > orden[a] ? b : a;
}
const ANIDADOS = new Set(["zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "zst", "cab", "iso", "img"]);
function extensionDe(ruta: string): string {
  const base = String(ruta ?? "").split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

/** Analiza lo recibido y devuelve lo que se enseña antes de abrir. Puro y determinista. */
export function analizarRecepcion(e: EntradaAnalisisSeguridad): ResultadoAnalisisSeguridad {
  const base = inspeccionarArchivo({
    nombre: e.nombre,
    tipo: e.tipo ?? null,
    tamano: e.tamano,
    inicio: e.inicio ?? null,
    entradasZip: e.entradasZip ?? null,
    zipSegun: e.zipSegun,
  });
  const hallazgos: Hallazgo[] = [...base.hallazgos];
  const ejecutable = (base.tipoReal ?? "").startsWith("EJECUTABLE");
  if (ejecutable && e.firma == null) hallazgos.push({ nivel: "aviso", texto: "Ejecutable sin firma comprobable: no se puede saber quién lo hizo" });
  else if (e.firma && !e.firma.valida) hallazgos.push({ nivel: "peligro", texto: "La firma del ejecutable no es válida o está rota" });
  else if (e.firma && e.firma.valida) hallazgos.push({ nivel: "info", texto: `Firma válida${e.firma.firmante ? `: ${e.firma.firmante}` : ""}` });

  const huella = e.huella ?? null;
  if (huella && e.huellaEsperada && huella.toLowerCase() !== e.huellaEsperada.toLowerCase()) {
    hallazgos.push({ nivel: "peligro", texto: "La huella recibida no coincide con la que anunció el remitente" });
  }
  const anidados = (e.entradasZip ?? []).filter((x) => ANIDADOS.has(extensionDe(x.ruta)));
  if (anidados.length) {
    hallazgos.push({ nivel: "aviso", texto: `Comprimido dentro de otro comprimido (anidado): ${anidados.slice(0, 3).map((x) => x.ruta).join(", ")}${anidados.length > 3 ? "…" : ""}` });
  }

  let antivirus: ResultadoAnalisisSeguridad["antivirus"] = null;
  if (e.antivirus) {
    const motor = motorConocido(e.antivirus.motor);
    if (motor) {
      antivirus = { motor, veredicto: e.antivirus.veredicto, ...(e.antivirus.detalle ? { detalle: e.antivirus.detalle.slice(0, 200) } : {}) };
      if (e.antivirus.veredicto === "infectado") hallazgos.push({ nivel: "peligro", texto: `${motor}: encontró una amenaza${e.antivirus.detalle ? ` (${e.antivirus.detalle})` : ""}` });
      else if (e.antivirus.veredicto === "sospechoso") hallazgos.push({ nivel: "aviso", texto: `${motor}: resultado sospechoso, conviene revisarlo` });
      else hallazgos.push({ nivel: "info", texto: `${motor}: sin amenazas conocidas` });
    }
  }

  let nivel: NivelAnalisis = "limpio";
  for (const h of hallazgos) if (h.nivel !== "info") nivel = peor(nivel, h.nivel);
  const señales = hallazgos.filter((h) => h.nivel !== "info").length;
  const ext = extensionDe(e.nombre);
  const que = base.tipoReal ?? (ext ? `.${ext}` : "tipo sin leer");
  const resumen =
    nivel === "limpio"
      ? `Limpio: ${que}, sin señales de riesgo${antivirus ? ` (${antivirus.motor})` : ""}.`
      : `${nivel === "peligro" ? "Peligro" : "Aviso"}: ${que}, ${señales} señal${señales === 1 ? "" : "es"} que revisar antes de abrir.`;
  return { nivel, hallazgos, tipoReal: base.tipoReal, huella, firma: e.firma ?? null, antivirus, resumen, conBytes: base.conBytes };
}
