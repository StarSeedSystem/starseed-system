/*
 * StarSeed OS · Sala de sonido · SPOTIFY con la cuenta de cada persona (NFC1126M · §11).
 * Aparatos de Spotify Connect, cola y control por la API web. El control exige
 * Premium: sin él se dice y solo se ofrecen enlaces. El audio de Spotify NO viaja
 * por la malla (licencias): a la sala solo entran los datos de la pista.
 * Módulo PURO: sin red, sin disco, sin claves (el client id llega por parámetro).
 */
import type { FuenteAudio } from "./motor";

export const API_SPOTIFY = "https://api.spotify.com/v1";
const URL_AUTORIZAR = "https://accounts.spotify.com/authorize";
const PERMISOS = ["user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing"];

export interface DispositivoSpotify { id: string; nombre: string; tipo: string; activo: boolean; volumen?: number }
export interface PistaSpotify { uri: string; nombre: string; artistas: string; duracionMs?: number }
export interface ColaSpotify { sonando: PistaSpotify | null; siguientes: PistaSpotify[] }
export type AccionSpotify =
  | { tipo: "reanudar" | "pausar" | "siguiente" | "anterior" }
  | { tipo: "volumen"; porcentaje: number }
  | { tipo: "aparato"; id: string }
  | { tipo: "encolar"; uri: string };
export interface PeticionSpotify {
  metodo: "PUT" | "POST";
  ruta: string;
  consulta?: Record<string, string>;
  cuerpo?: Record<string, unknown>;
}
export interface PlanControl {
  permitido: boolean;
  peticion?: PeticionSpotify;
  motivo?: string;
  soloEnlaces?: boolean;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const txt = (v: unknown): string => (typeof v === "string" ? v : "");

export function construirUrlAutorizacion(p: {
  clientId: string;
  redirectUri: string;
  estado: string;
  desafio: string;
}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: PERMISOS.join(" "),
    state: p.estado,
    code_challenge_method: "S256",
    code_challenge: p.desafio,
  });
  return `${URL_AUTORIZAR}?${q.toString()}`;
}

export const esPremium = (producto: string | undefined): boolean => producto === "premium";

export function interpretarDispositivos(json: unknown): DispositivoSpotify[] {
  const lista = obj(json).devices;
  if (!Array.isArray(lista)) return [];
  const salida: DispositivoSpotify[] = [];
  for (const d of lista.map(obj)) {
    if (typeof d.id !== "string" || !d.id || d.is_restricted === true) continue;
    const volumen = typeof d.volume_percent === "number" ? d.volume_percent : undefined;
    salida.push({
      id: d.id,
      nombre: txt(d.name),
      tipo: txt(d.type),
      activo: d.is_active === true,
      ...(volumen === undefined ? {} : { volumen }),
    });
  }
  return salida;
}

function pista(v: unknown): PistaSpotify | null {
  const p = obj(v);
  if (!txt(p.uri)) return null;
  const artistas = Array.isArray(p.artists) ? p.artists.map((a) => txt(obj(a).name)).filter(Boolean) : [];
  return {
    uri: txt(p.uri),
    nombre: txt(p.name),
    artistas: artistas.join(", "),
    ...(typeof p.duration_ms === "number" ? { duracionMs: p.duration_ms } : {}),
  };
}

export function interpretarCola(json: unknown): ColaSpotify {
  const j = obj(json);
  const siguientes = Array.isArray(j.queue) ? j.queue.map(pista).filter((p): p is PistaSpotify => p !== null) : [];
  return { sonando: pista(j.currently_playing), siguientes };
}

export function fuenteDesdePista(p: PistaSpotify, aportadaPor: string): FuenteAudio {
  return {
    id: p.uri,
    tipo: "app",
    nombre: p.artistas ? `${p.nombre} · ${p.artistas}` : p.nombre,
    ...(p.duracionMs === undefined ? {} : { duracionMs: p.duracionMs }),
    aportadaPor,
  };
}

export function enlaceDePista(uri: string): string {
  const [, tipo, id] = uri.split(":");
  return `https://open.spotify.com/${tipo}/${id}`;
}

export function planControl(producto: string | undefined, a: AccionSpotify): PlanControl {
  if (!esPremium(producto)) {
    return {
      permitido: false,
      soloEnlaces: true,
      motivo: "Controlar Spotify desde la sala necesita Spotify Premium. Puedes abrir las pistas con su enlace.",
    };
  }
  switch (a.tipo) {
    case "reanudar":
      return { permitido: true, peticion: { metodo: "PUT", ruta: "/me/player/play" } };
    case "pausar":
      return { permitido: true, peticion: { metodo: "PUT", ruta: "/me/player/pause" } };
    case "siguiente":
      return { permitido: true, peticion: { metodo: "POST", ruta: "/me/player/next" } };
    case "anterior":
      return { permitido: true, peticion: { metodo: "POST", ruta: "/me/player/previous" } };
    case "volumen": {
      const v = Math.round(Math.min(100, Math.max(0, a.porcentaje)));
      return { permitido: true, peticion: { metodo: "PUT", ruta: "/me/player/volume", consulta: { volume_percent: String(v) } } };
    }
    case "aparato":
      return { permitido: true, peticion: { metodo: "PUT", ruta: "/me/player", cuerpo: { device_ids: [a.id] } } };
    case "encolar":
      if (!/^spotify:(track|episode):[A-Za-z0-9]+$/.test(a.uri)) return { permitido: false, motivo: "Pista no válida." };
      return { permitido: true, peticion: { metodo: "POST", ruta: "/me/player/queue", consulta: { uri: a.uri } } };
  }
}
