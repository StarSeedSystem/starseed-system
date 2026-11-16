/**
 * adaptadores/celular-sdr — ranura para fuentes de espectro reales (MAP1116B).
 * Hoy NINGUNA API del OS ni del navegador entrega la celda y la banda móvil a la
 * app y no hay SDR conectado: nada se inventa, sin fuente el mapa lo dice. Puro.
 */

import { bandaDeFrecuencia, BANDAS_CONOCIDAS } from "../bandas";
import type { Medio, SenalEspectro } from "../tipos";

/** Fuente de espectro real que puede enchufarse al espectrómetro (SDR, celda…). */
export interface FuenteEspectroReal {
  nombre: string;
  disponible(): Promise<boolean>;
  barrer(desdeKhz: number, hastaKhz: number): Promise<{ frecuenciaKhz: number; fuerzaDbm: number }[]>;
}

/** La fuente por defecto: no hay receptor SDR conectado. */
export const SIN_SDR: FuenteEspectroReal = {
  nombre: "sin SDR",
  disponible: async () => false,
  barrer: async () => [],
};

/** Lectura de celda que una capa nativa podría inyectar en el futuro. */
export interface LecturaCelular {
  celda?: { banda?: string; frecuenciaKhz?: number; fuerzaDbm?: number };
}
/** Resultado de un adaptador: o señales medidas, o la explicación honesta. */
export type ResultadoFuente =
  | { estado: "senales"; senales: SenalEspectro[] }
  | { estado: "sinFuente"; medio: Medio; motivo: string };

/** Resuelve el id de banda celular (p. ej. «B1» → «celular-b1», «n78» → «celular-n78»). */
export function idBandaCelular(banda: string): string | null {
  const s = banda.trim().toLowerCase().replace(/\s+/g, "");
  const candidato = `celular-${s}`;
  return candidato in BANDAS_CONOCIDAS ? candidato : null;
}

const SIN_CELDA = "este aparato no entrega la celda ni la banda móvil a la app";

/** Adaptador de celda móvil: sin lectura → «sinFuente»; con lectura la convierte. */
export function adaptadorCelular(
  lectura: LecturaCelular | null,
  ahoraMs: number = Date.now(),
): ResultadoFuente {
  if (!lectura || !lectura.celda) return { estado: "sinFuente", medio: "celular", motivo: SIN_CELDA };
  const { banda, frecuenciaKhz, fuerzaDbm } = lectura.celda;

  let etiqueta: string | null = null;
  let frecuencia: number | null = typeof frecuenciaKhz === "number" && Number.isFinite(frecuenciaKhz) && frecuenciaKhz > 0 ? frecuenciaKhz : null;
  if (frecuencia !== null) {
    const porFrecuencia = bandaDeFrecuencia(frecuencia);
    if (porFrecuencia && porFrecuencia.medio === "celular") etiqueta = porFrecuencia.etiqueta;
  }
  if (!etiqueta && banda) {
    const id = idBandaCelular(banda);
    if (id) etiqueta = BANDAS_CONOCIDAS[id].etiqueta;
  }
  const bandaDada = typeof banda === "string" && banda.trim() !== "" ? banda : null;
  if (!etiqueta && !bandaDada) return { estado: "sinFuente", medio: "celular", motivo: SIN_CELDA };
  const etiquetaFinal: string = etiqueta ?? (bandaDada ?? "").trim().slice(0, 32);

  const senal: SenalEspectro = {
    id: `celular-${etiquetaFinal}-${frecuencia ?? "sin-frecuencia"}`.slice(0, 64),
    medio: "celular",
    banda: etiquetaFinal,
    frecuenciaKhz: frecuencia,
    anchoKhz: null,
    fuerzaDbm: typeof fuerzaDbm === "number" && Number.isFinite(fuerzaDbm) ? fuerzaDbm : null,
    calidad: null,
    origen: "medida",
    capa: "propia",
    fuente: "informe de celda del aparato",
    medidoEn: ahoraMs,
    zona: null,
    compatibles: [],
  };
  return { estado: "senales", senales: [senal] };
}
/** Rango de barrido en kHz. */
export interface RangoBarrido {
  desdeKhz: number;
  hastaKhz: number;
}
/** Adaptador de SDR: solo con `disponible()` verdadero barre; sin SDR → «sinFuente». */
export async function adaptadorSdr(
  fuente: FuenteEspectroReal | null,
  rango: RangoBarrido,
  ahoraMs: number = Date.now(),
): Promise<ResultadoFuente> {
  if (!fuente || !(await fuente.disponible())) {
    return { estado: "sinFuente", medio: "sdr", motivo: "no hay un receptor SDR conectado" };
  }
  const puntos = await fuente.barrer(rango.desdeKhz, rango.hastaKhz);
  const senales: SenalEspectro[] = [];
  for (const p of puntos) {
    if (typeof p?.frecuenciaKhz !== "number" || !Number.isFinite(p.frecuenciaKhz) || p.frecuenciaKhz <= 0) continue;
    const banda = bandaDeFrecuencia(p.frecuenciaKhz);
    senales.push({
      id: `sdr-${fuente.nombre}-${p.frecuenciaKhz}`.slice(0, 64),
      medio: "sdr",
      banda: banda?.etiqueta ?? "desconocida",
      frecuenciaKhz: p.frecuenciaKhz,
      anchoKhz: null,
      fuerzaDbm: typeof p.fuerzaDbm === "number" && Number.isFinite(p.fuerzaDbm) ? p.fuerzaDbm : null,
      calidad: null,
      origen: "medida",
      capa: "propia",
      fuente: `SDR conectado: ${fuente.nombre}`.slice(0, 128),
      medidoEn: ahoraMs,
      zona: null,
      compatibles: [],
    });
  }
  return { estado: "senales", senales };
}
