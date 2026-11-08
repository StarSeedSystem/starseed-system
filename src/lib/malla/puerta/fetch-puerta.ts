/**
 * puerta/fetch-puerta — `fetch` que cae por una puerta de la malla cuando no hay salida propia (PTA1108A · 2026-11-08).
 *
 * Se envuelve el `fetch` base SIN tocar quien lo llama (cliente de Supabase, descargas, manifiestos…):
 *   · sin respaldo registrado (web normal, SSR, ajuste apagado) es exactamente el `fetch` base;
 *   · si el aparato sabe que no tiene salida, o el `fetch` base falla por red, repite la petición por la puerta;
 *   · una salida caída se recuerda `MEMORIA_CAIDA_MS` para no esperar el plazo de cada petición; luego se reprueba.
 * Reintentos: solo se repiten por otra vía los métodos idempotentes cuando el fallo vino DESPUÉS de intentar la red;
 * un POST solo va directo por la puerta si se sabía de antemano que no había salida (nunca salió). Si la puerta
 * también falla se lanza el error ORIGINAL, así los reintentos y el backoff de quien llama siguen igual.
 *
 * Ligero a propósito (sin importar la malla): el cliente de Supabase lo carga en cada pantalla.
 */

export interface RespaldoFetch {
  /** Interruptor general (ajuste del usuario y modo disponible). */
  activo(): boolean;
  /** Hay al menos una puerta conocida y viva. */
  hayPuertas(): boolean;
  /** El aparato sabe que no tiene salida propia ahora mismo (sin red, o ya falló hace poco). */
  sinSalida(): boolean;
  /** PTA1108C · El destino es privado (servidor propio, LAN…), esta neurona no lo alcanza y alguna puerta ofrece esa capa: va por la puerta sin probar antes la red propia. */
  requiereCapa?(url: string): boolean;
  /** Hace la petición por la puerta. Lanza si no se pudo. */
  pedir(url: string, init: RequestInit & { cuerpo?: ArrayBuffer | null }): Promise<Response>;
}

let respaldo: RespaldoFetch | null = null;
let caidoHasta = 0;
export const MEMORIA_CAIDA_MS = 15_000;

export function registrarRespaldoFetch(r: RespaldoFetch | null): () => void {
  respaldo = r;
  return () => {
    if (respaldo === r) respaldo = null;
  };
}

/** Para pruebas y para «probar ahora»: olvida que la salida estaba caída. */
export function olvidarCaida(): void {
  caidoHasta = 0;
}

const IDEMPOTENTES = new Set(["GET", "HEAD", "OPTIONS"]);

function urlHttps(input: RequestInfo | URL): string | null {
  try {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const p = new URL(u, typeof location !== "undefined" ? location.href : undefined);
    return p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

const esAbortoDelLlamador = (e: unknown, init?: RequestInit): boolean =>
  !!init?.signal?.aborted || (e instanceof DOMException && e.name === "AbortError");

/** Envuelve `base`. Con `ahora` inyectable para pruebas. */
export function fetchConPuerta(base: typeof fetch, ahora: () => number = () => Date.now()): typeof fetch {
  return async function fetchPuerta(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const r = respaldo;
    const url = r ? urlHttps(input) : null;
    // Solo lo que sale a otro sitio por https; lo relativo y lo local van al servidor propio tal cual.
    if (!r || !url || (typeof location !== "undefined" && new URL(url).origin === location.origin) || !r.activo()) return base(input, init);

    const metodo = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const idempotente = IDEMPOTENTES.has(metodo);

    const porPuerta = async (): Promise<Response> => {
      const req = new Request(input as RequestInfo, init);
      const cuerpo = IDEMPOTENTES.has(req.method) ? null : await req.arrayBuffer();
      return r.pedir(req.url, { method: req.method, headers: req.headers, signal: init?.signal ?? req.signal, cuerpo });
    };

    // PTA1108C · destino de una capa que esta neurona no alcanza: directo por la puerta que la ofrece (nada salió, ni un POST se duplica).
    const porCapa = r.hayPuertas() && r.requiereCapa?.(url) === true;
    // Ya se sabe que no hay salida: directo por la puerta (nada salió, así que ni un POST se duplica).
    if (r.hayPuertas() && (porCapa || r.sinSalida() || caidoHasta > ahora())) {
      try {
        return await porPuerta();
      } catch (e) {
        if (esAbortoDelLlamador(e, init)) throw e;
        // La puerta falló: se prueba la red propia por si volvió; si también falla, error normal.
        return base(input, init);
      }
    }

    try {
      const res = await base(input, init);
      caidoHasta = 0;
      return res;
    } catch (e) {
      if (esAbortoDelLlamador(e, init) || !(e instanceof TypeError)) throw e;
      caidoHasta = ahora() + MEMORIA_CAIDA_MS;
      if (!idempotente || !r.hayPuertas()) throw e;
      try {
        return await porPuerta();
      } catch {
        throw e; // el error ORIGINAL: el reintento de quien llama sigue igual
      }
    }
  } as typeof fetch;
}
