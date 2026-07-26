/**
 * voice-recorder.ts — Grabación y captura de audio de referencia (Adenda 96).
 *
 * Permite a cada personalidad/neurona grabar (MediaRecorder) o importar un
 * audio desde el dispositivo/Biblioteca, y devolverlo como `data:` URL lista
 * para guardar en `VoiceAudioRef.dataUrl` (vía patchPersonalityVoice).
 *
 * TODO(recolección): la "subida a la Biblioteca" como entidad compartida es
 * post-ergo; por ahora el audio vive en la personalidad (synced por cerebro).
 *
 * SSR-safe y 100% defensivo: cualquier API no disponible degrada a null.
 */

import type { VoiceAudioRef } from "@/lib/aurora/personalities";

/** Graba desde el micrófono hasta `maxMs` y devuelve un data URL de audio. */
export async function recordReferenceAudio(maxMs = 15000): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    const done = new Promise<string | null>((resolve) => {
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          const dataUrl = await blobToDataUrl(blob);
          resolve(dataUrl);
        } catch { resolve(null); }
        finally { stream.getTracks().forEach((t) => t.stop()); }
      };
    });
    rec.start();
    setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxMs);
    return await done;
  } catch {
    return null;
  }
}

/** Abre un selector de archivo y devuelve el audio como data URL. */
export function importReferenceAudio(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !window.document) { resolve(null); return; }
      const input = window.document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        try { resolve(await blobToDataUrl(file)); } catch { resolve(null); }
      };
      input.click();
    } catch { resolve(null); }
  });
}

/** Construye un VoiceAudioRef a partir de un data URL grabado/importado. */
export function makeRecordedRef(dataUrl: string, label: string): VoiceAudioRef {
  return { kind: "recorded", label, dataUrl, at: Date.now() };
}

export function makeLibraryRef(dataUrl: string, label: string): VoiceAudioRef {
  return { kind: "library", label, dataUrl, at: Date.now() };
}

// ── helpers ────────────────────────────────────────────────────────────────
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* */ }
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
