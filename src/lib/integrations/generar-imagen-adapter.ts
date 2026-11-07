import type { MediaGenResult } from "@/ai/astraura/media/media-gen";
import type { ContentOutcome } from "@/lib/aurora/generate/content-actions";
import { findMediaProvider } from "@/ai/astraura/media/media-gen";

interface SaveResult {
  ok: boolean;
  id: string;
}

export function adaptGenerateImageResult(
  mediaResult: MediaGenResult,
  prompt: string,
  saved: SaveResult,
): ContentOutcome {
  if (!mediaResult.ok || !mediaResult.url) {
    return {
      ok: false,
      message: mediaResult.error ? `No se pudo generar la imagen: ${mediaResult.error}` : "No se pudo generar la imagen.",
      data: { needsConfig: false, error: mediaResult.error },
    };
  }

  const providerLabel = findMediaProvider(mediaResult.provider)?.label ?? mediaResult.provider;
  const title = `Imagen: ${prompt.slice(0, 60)}`;
  const huboVarias = false; // TODO: detectar galería si aplica

  const message = saved.ok
    ? `Generé ${huboVarias ? `varias opciones de imagen` : "la imagen"} con ${providerLabel} y la guardé en tu Biblioteca.`
    : `Generé ${huboVarias ? `varias opciones de imagen` : "la imagen"} (${providerLabel}), pero no pude guardarla en la Biblioteca de este equipo.`;

  return {
    ok: true,
    message,
    data: { id: saved.ok ? saved.id : undefined, url: mediaResult.url },
  };
}