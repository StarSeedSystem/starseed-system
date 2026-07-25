/**
 * voice-recorder.ts — GRABAR Y SELECCIONAR audio de referencia de voz (Adenda 96).
 * ============================================================================
 * Utilidades client-side para que cada neurona grabe DESDE el micrófono o elija
 * un archivo de la Biblioteca / dispositivo como referencia de voz de una
 * personalidad. El audio se devuelve como Blob + data URL (base64) lista para
 * guardar en `PersonalityVoiceStyle.audioRef` (memorias del cerebro, synced).
 *
 * Client-safe (solo usa Web APIs). Nunca lanza: los errores vienen en el
 * resultado (`ok: false`). Sin dependencias externas.
 */

/** Resultado de capturar audio. */
export interface CapturedAudio {
  ok: boolean;
  /** Blob del audio capturado (wav/ogg/webm según soporte). */
  blob?: Blob;
  /** Data URL base64 (p.ej. "data:audio/webm;base64,...") para guardar. */
  dataUrl?: string;
  /** MIME real del audio. */
  mime?: string;
  /** Duración estimada en ms (mejor esfuerzo). */
  durationMs?: number;
  /** Motivo de fallo si ok=false. */
  error?: string;
}

/** ¿El navegador soporta grabación de audio? */
export function isRecordingSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder !== "undefined";
}

/** Convierte un Blob a data URL base64 (sin lanzar). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read-failed"));
    r.onloadend = () => resolve(typeof r.result === "string" ? r.result : "");
    r.readAsDataURL(blob);
  });
}

/**
 * Graba una muestra de voz desde el micrófono de ESTA neurona.
 * @param maxMs duración máxima (por defecto 12 s).
 * @returns la muestra capturada (Blob + data URL).
 */
export async function recordVoiceReference(maxMs = 12_000): Promise<CapturedAudio> {
  if (!isRecordingSupported()) {
    return { ok: false, error: "Este navegador no permite grabar audio." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const MR = (window as any).MediaRecorder;
    const mime = ["audio/webm", "audio/ogg;codecs=opus", "audio/wav"].find(
      (m) => MR.isTypeSupported?.(m),
    ) ?? "audio/webm";
    const rec = new MR(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    const startedAt = Date.now();
    return await new Promise<CapturedAudio>((resolve) => {
      let done = false;
      const finish = async (cancelled = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { rec.stop(); } catch { /* */ }
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return resolve({ ok: false, error: "cancelado" });
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 800) return resolve({ ok: false, error: "Muestra demasiado corta." });
        try {
          const dataUrl = await blobToDataUrl(blob);
          resolve({ ok: true, blob, dataUrl, mime, durationMs: Date.now() - startedAt });
        } catch {
          resolve({ ok: true, blob, mime, durationMs: Date.now() - startedAt });
        }
      };
      rec.ondataavailable = (e: any) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => finish(false);
      rec.onerror = () => finish(true);
      const timer = setTimeout(() => finish(false), maxMs);
      rec.start();
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo acceder al micrófono." };
  }
}

/**
 * Abre el selector de archivos del dispositivo / Biblioteca y devuelve el audio
 * elegido como data URL. El input vive fuera del DOM (no interfiere con el modal).
 */
export function pickAudioFile(): Promise<CapturedAudio> {
  return new Promise<CapturedAudio>((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.style.display = "none";
      const cleanup = () => input.remove();
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { cleanup(); return resolve({ ok: false, error: "Sin archivo." }); }
        try {
          const dataUrl = await blobToDataUrl(file);
          resolve({ ok: true, blob: file, dataUrl, mime: file.type || "audio/wav" });
        } catch {
          resolve({ ok: false, error: "No se pudo leer el archivo." });
        } finally { cleanup(); }
      };
      input.oncancel = () => { cleanup(); resolve({ ok: false, error: "cancelado" }); };
      document.body.appendChild(input);
      input.click();
    } catch (e: any) {
      resolve({ ok: false, error: e?.message ?? "Error al elegir archivo." });
    }
  });
}
