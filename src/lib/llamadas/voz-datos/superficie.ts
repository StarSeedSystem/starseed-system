/**
 * voz-datos/superficie — los textos de la superficie de la llamada para el medio, la calidad y los fallos (LLA1108E).
 * Puro: la ventana de la llamada solo pinta lo que sale de aquí.
 */
import type { EstadoLlamada } from "@/lib/llamadas/tipos";

export interface TextosSuperficieVoz {
  /** Línea de estado en lugar del cronómetro mientras el audio no suena: «Contestada · conectando audio…». */
  estadoAudio: string | null;
  /** «Voz por Bluetooth directo · cifrada». */
  medio: string | null;
  /** «latencia 180 ms · pérdida 2 % · ADPCM». */
  calidad: string | null;
  nivelCalidad: "buena" | "regular" | "mala" | null;
  /** Por qué no hay vídeo en este medio (y la oferta de seguir solo con voz). */
  video: string | null;
  /** ¿Se ofrece «Reintentar»? */
  reintentar: boolean;
}

export function textosSuperficieVoz(e: Pick<EstadoLlamada, "medio" | "estadoAudio" | "videoNoDisponible" | "puedeReintentar" | "fase">): TextosSuperficieVoz {
  const m = e.medio ?? null;
  return {
    estadoAudio: e.fase === "en-curso" ? (e.estadoAudio ?? null) : null,
    medio: m ? m.texto : null,
    calidad: m?.tipo === "enlace-datos" ? (m.calidadTexto ?? null) : null,
    nivelCalidad: m?.tipo === "enlace-datos" ? (m.nivel ?? null) : null,
    video: e.videoNoDisponible ?? null,
    reintentar: !!e.puedeReintentar && e.fase === "error",
  };
}
