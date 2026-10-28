import { vi } from "vitest";

/**
 * Utility para mockear fetch en las pruebas.
 * Devuelve una función fetch mockeada y un registro de las llamadas realizadas.
 */

export interface LlamadaFetch {
  url: RequestInfo | URL;
  init?: RequestInit;
}

export interface FetchMock {
  fetch: typeof fetch;
  llamadas: LlamadaFetch[];
}

/**
 * Crea un mock de fetch que responde según las reglas proporcionadas.
 * @param reglas Array de reglas que definen cómo responder a ciertas URLs
 * @returns Objeto con la función fetch mockeada y el registro de llamadas
 */
export function crearFetchMock(reglas: {
  url: string | RegExp;
  status?: number;
  ok?: boolean;
  json?: unknown;
  body?: string | Blob;
  contentType?: string;
  method?: string;
}[]): FetchMock {
  const llamadas: LlamadaFetch[] = [];
  
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url, init });
    
    // Buscar la primera regla que coincida
    for (const regla of reglas) {
      const urlString = url instanceof URL ? url.toString() : String(url);
      const urlMatches = typeof regla.url === 'string' 
        ? urlString === regla.url 
        : regla.url.test(urlString);
      
      if (!urlMatches) continue;
      
      // Verificar el método si se especifica
      if (regla.method && init?.method !== regla.method) {
        continue;
      }
      
      // Crear la respuesta
      let response: Response;
      
      if (regla.json !== undefined) {
        response = new Response(JSON.stringify(regla.json), {
          status: regla.status ?? 200,
          headers: { "Content-Type": "application/json" },
          ...(regla.ok !== undefined ? {} : { ok: (regla.status ?? 200) >= 200 && (regla.status ?? 200) < 300 }),
        });
      } else if (regla.body !== undefined) {
        response = new Response(regla.body, {
          status: regla.status ?? 200,
          headers: regla.contentType ? { "Content-Type": regla.contentType } : {},
          ...(regla.ok !== undefined ? {} : { ok: (regla.status ?? 200) >= 200 && (regla.status ?? 200) < 300 }),
        });
      } else {
        response = new Response(null, {
          status: regla.status ?? 200,
          ...(regla.ok !== undefined ? {} : { ok: (regla.status ?? 200) >= 200 && (regla.status ?? 200) < 300 }),
        });
      }
      
      return response;
    }
    
    // Si no coincide ninguna regla, devolver 404
    return new Response(null, { status: 404 });
  });
  
  return { fetch: fetchMock, llamadas };
}