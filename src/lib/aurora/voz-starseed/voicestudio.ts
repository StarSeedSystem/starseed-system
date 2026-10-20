/* src/lib/aurora/voz-starseed/voicestudio.ts */
export type DescubrimientoResult = {
  vivo: boolean;
  version?: string;
  ofrece: string[];
} | { vivo: false; motivo: string };

export type HablarParams = {
  texto: string;
  voz: string;
  formato: string;
};

export type TranscribirParams = {
  audio: ArrayBuffer;
  idioma: string;
};

export const basePorDefecto = "http://127.0.0.1:3900";

export function normalizarBase(base?: string): string {
  return base ? base : basePorDefecto;
}

export async function descubrir(base?: string): Promise<DescubrimientoResult> {
  const url = new URL("/.well-known/voicestudio-speech", normalizarBase(base)).toString();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout de conexión (800 ms)")), 800);
  });
  try {
    const resp = await Promise.race([fetch(url), timeout]);
    if (!resp.ok) {
      const motivo = await resp.text();
      return { vivo: false, motivo: `HTTP ${resp.status}: ${motivo}` };
    }
    const data: DescubrimientoResult = (await resp.json());
    if (!data.vivo) return { vivo: false, motivo: data.motivo || "Servicio no disponible" };
    return { vivo: true, version: data.version, ofrece: data.ofrece };
  } catch (e: any) {
    if (e.message && (e.message.includes("Timeout") || e.message.includes("HTTP"))) return { vivo: false, motivo: e.message.includes("Timeout") ? "Timeout de conexión (800 ms)" : e.message };
    return { vivo: false, motivo: "Error de red: no se pudo conectar al servicio" };
  }
}

export async function voces(base?: string): Promise<string[]> {
  const url = new URL("/v1/audio/voices", normalizarBase(base)).toString();
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Error ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    if (!Array.isArray(data.voices)) {
      throw new Error("Formato de respuesta inesperado");
    }
    return data.voices.map((v: { id: string }) => v.id);
  } catch (e: any) {
    if (e.message.startsWith("Error ")) throw e;
    throw new Error("Error de red: no se pudo conectar al servicio");
  }
}

export async function hablar(base: string | undefined, params: HablarParams): Promise<Uint8Array> {
  const url = new URL("/v1/audio/speech", normalizarBase(base)).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: params.texto, voz: params.voz, formato: params.formato }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Error ${resp.status}: ${txt}`);
  }
  const blob = await resp.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function transcribir(base: string | undefined, audio: ArrayBuffer, idioma: string): Promise<string> {
  const url = new URL("/v1/audio/transcriptions", normalizarBase(base)).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio, idioma }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  if (typeof data.text !== "string") {
    throw new Error("Respuesta de transcripción inválida");
  }
  return data.text;
}