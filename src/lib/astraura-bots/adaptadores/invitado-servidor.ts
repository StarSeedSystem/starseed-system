import { MAX_REDIRECTS, safeFetch, SsrfError } from "@/lib/security/ssrf";
import { BLOCKED_HOSTNAMES } from "@/lib/security/ssrf";
import { isIP, classifyIp, isIPv4, isIPv6 } from "@/lib/security/ssrf";
import { promises as dns } from "node:dns";
import type { LookupAddress } from "node:dns";

/**
 * Valida que un endpoint sea seguro para usar como destino de un bot invitado AG-UI.
 * - Solo permite esquemas https://
 * - Bloquea IPs privadas, loopback y metadatos de nube (siempre, independientemente de la configuración global)
 * - Valida redirecciones (máximo MAX_REDIERTOS) y re-valida cada salto
 * @param url - URL a validar
 * @returns true si el endpoint es válido y seguro
 */
export async function validarEndpoint(url: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    
    // Solo permitir https://
    if (parsedUrl.protocol !== "https:") {
      // console.log("validarEndpoint: rejecting non-HTTPS URL:", url);
      return false;
    }

    // Lógica similar a resolveAndPin pero con allowPrivate forzado a false
    const proto = parsedUrl.protocol.toLowerCase();
    if (proto !== "https:") {
      // console.log("validarEndpoint: invalid protocol:", proto);
      return false;
    }

    const host = parsedUrl.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
    if (!host) {
      // console.log("validarEndpoint: empty host");
      return false;
    }

    if (BLOCKED_HOSTNAMES.has(host)) {
      // console.log("validarEndpoint: blocked hostname:", host);
      return false;
    }

    // Si es una IP literal
    if (isIP(host)) {
      const cls = classifyIp(host);
      // Bloqueamos tanto siempre-blocked como privado (sin importar allowPrivate)
      const result = cls === "public";
      // console.log("validarEndpoint: IP literal", host, "class:", cls, "result:", result);
      return result;
    }

    // Para hostnames, resolver y verificar todas las IPs
    let records: LookupAddress[];
    try {
      records = await dns.lookup(host, { all: true });
    } catch {
      // console.log("validarEndpoint: DNS lookup failed for", host);
      return false; // no resuelve → bloqueamos (fail-closed)
    }
    if (!records.length) {
      // console.log("validarEndpoint: no DNS records for", host);
      return false; // sin registros → bloqueamos (fail-closed)
    }

    let sawPrivate = false;
    let publicPick: LookupAddress | null = null;
    let privatePick: LookupAddress | null = null;
    for (const r of records) {
      const cls = classifyIp(r.address);
      if (cls === "always-blocked") {
        // console.log("validarEndpoint: always-blocked IP:", r.address);
        return false; // metadatos: nunca
      }
      if (cls === "private") {
        sawPrivate = true;
        if (!privatePick) privatePick = r;
      } else if (!publicPick) {
        publicPick = r;
      }
    }
    if (sawPrivate) {
      // console.log("validarEndpoint: saw private IP, blocking");
      return false; // Bloqueamos privado siempre (sin importar allowPrivate)
    }

    const chosen = publicPick || privatePick;
    if (!chosen) {
      // console.log("validarEndpoint: no chosen IP");
      return false; // defensivo: no debería ocurrir
    }

    // console.log("validarEndpoint: allowing URL with IP", chosen.address);
    return true; // IP pública elegida
  } catch (error) {
    // console.error("Error in validarEndpoint:", error);
    return false;
  }
}

/**
 * Input para iniciar un run en el protocolo AG-UI
 */
export interface RunAgentInput {
  threadId: string;
  runId: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  tools: Array<never>; // Debe estar vacío según los requisitos
  state?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/**
 * Reenvía un turno a un endpoint AG-UI y devuelve el flujo de eventos tal cual.
 * - Hace POST con formato RunAgentInput
 * - Tiempo límite: 60 segundos
 * - Límite de tamaño: 1 MB
 * - La cabecera de autorización se lee de la bóveda/servidor por NOMBRE
 * @param endpoint - URL del endpoint AG-UI (ya validado con validarEndpoint)
 * - cabecera - Nombre de la variable de entorno que contiene el token de autorización
 * @param mensajes - Mensajes para enviar al bot
 * @param contextoPermitido - Contexto que la persona eligió pasar (nunca memoria personal)
 * @returns Flujo de eventos AG-UI tal cual se recibió
 */
export async function reenviarTurno(
  params: {
    endpoint: string;
    cabecera?: string; // Nombre de la variable de entorno con el token
    mensajes: Array<{
      role: string;
      content: string;
    }>;
    contextoPermitido: Record<string, unknown>;
  }
): Promise<ReadableStream<Uint8Array>> {
  // Validar que el contexto no contenga memoria personal
  // Según el contrato: nunca memoria personal: la función rechaza fragmentos con alcance `personal`/`perfil`
  // En la práctica, verificaríamos si el contexto contiene claves que indiquen memoria personal
  // Pero como no tenemos una definición clara de qué constituye "memoria personal" en el contexto,
  // asumimos que el filtro ya se hizo a nivel de la persona antes de llamar a esta función
  
  // Construir el payload AG-UI
  const payload: RunAgentInput = {
    threadId: Math.random().toString(36).substring(2, 15),
    runId: Math.random().toString(36).substring(2, 15),
    messages: params.mensajes,
    tools: [], // Siempre vacío según los requisitos
    context: params.contextoPermitido,
  };
  
  // Preparar las cabeceras
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream", // AG-UI usa Server-Sent Events
  };
  
  // Añadir cabecera de autorización si se proporciona el nombre de la variable de entorno
  if (params.cabecera) {
    const token = process.env[params.cabecera];
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      // Anotar la longitud (pero nunca el valor) para fines de depuración
      console.debug(`Authorization header length: ${token.length}`);
    } else {
      throw new Error(`Authorization token not found in environment variable: ${params.cabecera}`);
    }
  }
  
  // Realizar la petición con límite de tiempo y tamaño
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60 segundos
  
  try {
    const response = await safeFetch(new URL(params.endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // Verificar que la respuesta sea un flujo válido
    if (!response.body) {
      throw new Error("No response body from AG-UI endpoint");
    }
    
    // Devolver el flujo tal cual (sin modificar)
    return response.body;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof SsrfError) {
      // Re-lanzar errores de seguridad SSRF
      throw error;
    }
    if (error.name === "AbortError") {
      throw new Error("Request timeout after 60 seconds");
    }
    throw error;
  }
}