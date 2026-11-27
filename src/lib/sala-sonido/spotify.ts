/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Sala de sonido · SPOTIFY (NFC1126M · §11).
 * ---------------------------------------------------------------------------
 * Integración con Spotify Connect: ver aparatos, cola y control de
 * reproducción por la API web de Spotify. El audio de Spotify NO se
 * retransmite por la malla (licencias). Requiere cuenta Premium para
 * el control remoto.
 *
 * Módulo PURO: funciones de transformación de datos. La API HTTP real
 * se maneja en `src/app/api/spotify/route.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AparatoSpotify = {
  id: string;
  nombre: string;
  tipo: "speaker" | "phone" | "computer" | "car" | "unknown";
  conectado: boolean;
};

export type EstadoSpotify = {
  reproduciendo: boolean;
  progresoMs: number;
  duracionMs: number;
  pistaActual: string | null;
  artista: string | null;
  album: string | null;
  enCola: PistaSpotify[];
};

export type PistaSpotify = {
  id: string;
  nombre: string;
  artista: string;
  album: string;
  duracionMs: number;
  portadaUrl?: string;
};

export type ResultadoConexion = {
  ok: boolean;
  aparatoActivo?: AparatoSpotify;
  error?: string;
};

export type ResultadoCola = {
  ok: boolean;
  cola?: PistaSpotify[];
  error?: string;
};

export type ResultadoControl = {
  ok: boolean;
  error?: string;
};

export type AccionCola =
  | { tipo: "anadir"; uri: string }
  | { tipo: "eliminar"; posicion: number };

export function identificarTipoAparato(userAgent: string): AparatoSpotify["tipo"] {
  if (/iPhone|iPad/.test(userAgent)) return "phone";
  if (/Android/.test(userAgent)) return "phone";
  if (/Windows NT/.test(userAgent)) return "computer";
  if (/Macintosh/.test(userAgent)) return "computer";
  if (/Linux/.test(userAgent)) return "computer";
  if (/Car|Motorcycle/.test(userAgent)) return "car";
  return "unknown";
}

export function extraerColaDeRespuesta(data: unknown): PistaSpotify[] {
  const respuesta = data as {
    items?: unknown[];
  };
  if (!respuesta.items) return [];
  return respuesta.items.map((item: unknown) => {
    const i = item as {
      track?: { id: string; name: string; artists: unknown[]; album: unknown[]; duration_ms: number };
      uri?: string;
    };
    const track = i.track;
    if (!track) {
      return {
        id: i.uri ?? "",
        nombre: i.uri ?? "",
        artista: "",
        album: "",
        duracionMs: 0,
      };
    }
    const nombre = track.name;
    const artistas = (track.artists as unknown as [{ name: string }]) ?? [];
    const album = track.album as unknown as { name: string };
    return {
      id: track.id,
      nombre,
      artista: artistas.map((a) => a.name).join(", "),
      album: album?.name ?? "",
      duracionMs: track.duration_ms,
    };
  });
}

export function calcularTiempoRestante(estados: EstadoSpotify[]): number {
  return estados.reduce((total, e) => {
    const restantes = e.enCola.reduce((sum, p) => sum + p.duracionMs, 0);
    return total + restantes;
  }, 0);
}

export function validarUriSpotify(uri: string): boolean {
  return /^spotify:(track|album|artist|playlist|show|episode):[a-zA-Z0-9]+$/.test(uri);
}