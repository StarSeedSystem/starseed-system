<<<<<<< HEAD
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
    if ("motivo" in data) return { vivo: false, motivo: data.motivo || "Servicio no disponible" };
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
    if (e.message === "Formato de respuesta inesperado") throw e;
    if (e.message.startsWith("Error ")) throw e;
    throw new Error("Error de red: no se pudo conectar al servicio");
  }
}

export async function hablar(base: string | undefined, params: HablarParams): Promise<Uint8Array> {
  const url = new URL("/v1/audio/speech", normalizarBase(base)).toString();
  try {
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
  } catch (e: any) {
    if (e.message.startsWith("Error ")) throw e;
    throw new Error("Error de red: no se pudo conectar al servicio");
  }
}

export async function transcribir(base: string | undefined, audio: ArrayBuffer, idioma: string): Promise<string> {
  const url = new URL("/v1/audio/transcriptions", normalizarBase(base)).toString();
  try {
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
  } catch (e: any) {
    if (e.message.startsWith("Error ")) throw e;
    throw new Error("Error de red: no se pudo conectar al servicio");
=======
/**
 * SERVICIO VOICESTUDIO — cliente al servicio externo de voz.
 * ─────────────────────────────────────────────────────────────────────────────
 * Este módulo se comunica con un servicio VoiceStudio externo que puede estar
 * corriendo en localhost:3900 o en otra URL proporcionada.
 */

export interface DescubrimientoResultado {
  vivo: boolean;
  version?: string;
  ofrece?: string[];
  motivo?: string;
}

export interface Voz {
  id: string;
  name: string;
}

export interface TranscripcionResultado {
  text: string;
}

export interface HablarResultado {
  audio: Uint8Array;
}

export async function descubrir(baseUrl = "http://127.0.0.1:3900"): Promise<DescubrimientoResultado> {
  try {
    const control = new AbortController();
    const timeoutId = setTimeout(() => control.abort(), 800); // 800 ms timeout
    
    try {
      const response = await fetch(`${baseUrl}/.well-known/voicestudio-speech`, {
        signal: control.signal,
        cache: "no-store",
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Proporcionar un fallback para statusText cuando esté vacío (común en entornos de prueba)
        const statusText = response.statusText || 
          (() => {
            const statusTextMap: Record<number, string> = {
              400: "Bad Request",
              401: "Unauthorized",
              402: "Payment Required",
              403: "Forbidden",
              404: "Not Found",
              405: "Method Not Allowed",
              406: "Not Acceptable",
              407: "Proxy Authentication Required",
              408: "Request Timeout",
              409: "Conflict",
              410: "Gone",
              411: "Length Required",
              412: "Precondition Failed",
              413: "Payload Too Large",
              414: "URI Too Long",
              415: "Unsupported Media Type",
              416: "Range Not Satisfiable",
              417: "Expectation Failed",
              418: "I'm a teapot",
              421: "Misdirected Request",
              422: "Unprocessable Entity",
              423: "Locked",
              424: "Failed Dependency",
              425: "Too Early",
              426: "Upgrade Required",
              428: "Precondition Required",
              429: "Too Many Requests",
              431: "Request Header Fields Too Large",
              451: "Unavailable For Legal Reasons",
              500: "Internal Server Error",
              501: "Not Implemented",
              502: "Bad Gateway",
              503: "Service Unavailable",
              504: "Gateway Timeout",
              505: "HTTP Version Not Supported",
              506: "Variant Also Negotiates",
              507: "Insufficient Storage",
              508: "Loop Detected",
              510: "Not Extended",
              511: "Network Authentication Required",
            };
            return statusTextMap[response.status] || "";
          })();
        
        return {
          vivo: false,
          motivo: `HTTP ${response.status}: ${statusText}`,
        };
      }
      
      const data = await response.json();
      return {
        vivo: true,
        version: data.version,
        ofrece: data.ofrece,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        return {
          vivo: false,
          motivo: "Timeout de conexión (800 ms)",
        };
      }
      return {
        vivo: false,
        motivo: "Error de red: no se pudo conectar al servicio",
      };
    }
  } catch (error) {
    return {
      vivo: false,
      motivo: "Error de red: no se pudo conectar al servicio",
    };
  }
}

export async function voces(baseUrl = "http://127.0.0.1:3900"): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/audio/voices`, {
    cache: "no-store",
  });
  
  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!Array.isArray(data.voices)) {
    throw new Error("Formato de respuesta inesperado");
  }
  
  return data.voices.map((voz: Voz) => voz.id);
}

export async function transcribir(
  audio: Blob | undefined = undefined,
  params: Record<string, unknown> = {},
  baseUrl = "http://127.0.0.1:3900"
): Promise<string> {
  try {
    const formData = new FormData();
    if (audio !== undefined) {
      formData.append("file", audio);
    }
    // Añadir cualquier parámetro adicional si es necesario
    // Por ahora, asumimos que el servicio acepta el audio directamente
    
    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    
    if (!response.ok) {
      // Proporcionar un fallback para statusText cuando esté vacío (común en entornos de prueba)
      const statusText = response.statusText || 
        (() => {
          const statusTextMap: Record<number, string> = {
            400: "Bad Request",
            401: "Unauthorized",
            402: "Payment Required",
            403: "Forbidden",
            404: "Not Found",
            405: "Method Not Allowed",
            406: "Not Acceptable",
            407: "Proxy Authentication Required",
            408: "Request Timeout",
            409: "Conflict",
            410: "Gone",
            411: "Length Required",
            412: "Precondition Failed",
            413: "Payload Too Large",
            414: "URI Too Long",
            415: "Unsupported Media Type",
            416: "Range Not Satisfiable",
            417: "Expectation Failed",
            418: "I'm a teapot",
            421: "Misdirected Request",
            422: "Unprocessable Entity",
            423: "Locked",
            424: "Failed Dependency",
            425: "Too Early",
            426: "Upgrade Required",
            428: "Precondition Required",
            429: "Too Many Requests",
            431: "Request Header Fields Too Large",
            451: "Unavailable For Legal Reasons",
            500: "Internal Server Error",
            501: "Not Implemented",
            502: "Bad Gateway",
            503: "Service Unavailable",
            504: "Gateway Timeout",
            505: "HTTP Version Not Supported",
            506: "Variant Also Negotiates",
            507: "Insufficient Storage",
            508: "Loop Detected",
            510: "Not Extended",
            511: "Network Authentication Required",
          };
          return statusTextMap[response.status] || "";
        })();
      
      throw new Error(`Error ${response.status}: ${statusText}`);
    }
    
    const data = await response.json();
    return data.text;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error("Error de red: no se pudo conectar al servicio");
    }
    throw error;
  }
}

export async function hablar(
  text: string | undefined = undefined,
  params: Record<string, unknown> = {},
  baseUrl = "http://127.0.0.1:3900"
): Promise<Uint8Array> {
  try {
    const payload: Record<string, unknown> = {};
    if (text !== undefined) {
      payload.text = text;
    }
    // Añadir cualquier parámetro adicional si es necesario
    
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    
    if (!response.ok) {
      // Proporcionar un fallback para statusText cuando esté vacío (común en entornos de prueba)
      const statusText = response.statusText || 
        (() => {
          const statusTextMap: Record<number, string> = {
            400: "Bad Request",
            401: "Unauthorized",
            402: "Payment Required",
            403: "Forbidden",
            404: "Not Found",
            405: "Method Not Allowed",
            406: "Not Acceptable",
            407: "Proxy Authentication Required",
            408: "Request Timeout",
            409: "Conflict",
            410: "Gone",
            411: "Length Required",
            412: "Precondition Failed",
            413: "Payload Too Large",
            414: "URI Too Long",
            415: "Unsupported Media Type",
            416: "Range Not Satisfiable",
            417: "Expectation Failed",
            418: "I'm a teapot",
            421: "Misdirected Request",
            422: "Unprocessable Entity",
            423: "Locked",
            424: "Failed Dependency",
            425: "Too Early",
            426: "Upgrade Required",
            428: "Precondition Required",
            429: "Too Many Requests",
            431: "Request Header Fields Too Large",
            451: "Unavailable For Legal Reasons",
            500: "Internal Server Error",
            501: "Not Implemented",
            502: "Bad Gateway",
            503: "Service Unavailable",
            504: "Gateway Timeout",
            505: "HTTP Version Not Supported",
            506: "Variant Also Negotiates",
            507: "Insufficient Storage",
            508: "Loop Detected",
            510: "Not Extended",
            511: "Network Authentication Required",
          };
          return statusTextMap[response.status] || "";
        })();
      
      throw new Error(`Error ${response.status}: ${statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error("Error de red: no se pudo conectar al servicio");
    }
    throw error;
>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
  }
}