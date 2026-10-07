import type { TipoEstacion } from "./tipos";
import { isLikelyEmbeddable } from "../browser/browser";

export type FormatoReproduccion =
  | "hls" | "dash" | "audio" | "video" | "youtube" | "twitch" | "vimeo" | "peertube" | "owncast"
  | "jitsi" | "webrtc-whep" | "web" | "interno";
export type Reproductor = "nativo-audio" | "nativo-video" | "hls" | "marco" | "interno" | "pestana";

export interface FormatoDetectado {
  formato: FormatoReproduccion;
  reproductor: Reproductor;
  urlIncrustable: string | null;
  soloAudio: boolean;
  motivo: string;
}

const EXT_AUDIO = ["mp3", "aac", "ogg", "opus", "flac", "wav"];
const EXT_VIDEO = ["mp4", "webm", "mov"];

function tieneExtension(ruta: string, exts: string[]): boolean {
  return exts.some((e) => ruta.endsWith("." + e));
}

function extraerIdYoutube(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id || null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/^\/live\/([^/?#]+)/i);
    if (m) return m[1];
  }
  return null;
}

/** Rellena el `parent` vacío del reproductor de Twitch al pintar. */
export function conParent(url: string, host: string): string {
  return url.replace(/parent=[^&]*/i, "parent=" + encodeURIComponent(host));
}

export function detectarFormato(enlace: string, tipo?: TipoEstacion): FormatoDetectado {
  const crudo = (enlace ?? "").trim();
  const soloAudio = tipo === "audio";
  const base = (formato: FormatoReproduccion, reproductor: Reproductor,
    urlIncrustable: string | null, motivo: string): FormatoDetectado =>
    ({ formato, reproductor, urlIncrustable, soloAudio: soloAudio || formato === "audio", motivo });

  if (crudo.startsWith("/") && !crudo.startsWith("//")) {
    return base("interno", "interno", null, "Destino interno del OS");
  }
  let u: URL;
  try {
    u = new URL(crudo);
  } catch {
    return base("web", "pestana", null, "Enlace no válido: se abre en pestaña");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return base("web", "pestana", null, "Enlace no válido: se abre en pestaña");
  }

  const ruta = u.pathname.toLowerCase();
  const host = u.hostname.toLowerCase();
  const busqueda = u.search.toLowerCase();

  if (tieneExtension(ruta, ["m3u8"]) || busqueda.includes("format=m3u8")) {
    return base("hls", "hls", null, "HLS (.m3u8)");
  }
  if (tieneExtension(ruta, ["mpd"])) {
    return base("dash", "pestana", null, "DASH (.mpd): se abre en pestaña");
  }
  if (tieneExtension(ruta, EXT_AUDIO) || ruta.includes("/stream") || ruta.includes("/listen")
      || u.port === "8000" || host.includes("icecast") || host.includes("shoutcast")) {
    return base("audio", "nativo-audio", null, "Audio en directo");
  }
  if (tieneExtension(ruta, EXT_VIDEO)) {
    return base("video", "nativo-video", null, "Vídeo directo");
  }
  const idYoutube = extraerIdYoutube(u);
  if (idYoutube) {
    return base("youtube", "marco",
      "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(idYoutube) + "?autoplay=1&mute=1",
      "YouTube en directo");
  }
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    const canal = u.pathname.split("/").filter(Boolean)[0];
    if (canal) {
      return base("twitch", "marco",
        "https://player.twitch.tv/?channel=" + encodeURIComponent(canal) + "&parent=&muted=true",
        "Twitch en directo");
    }
  }
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const ev = u.pathname.match(/^\/event\/([^/?#]+)/i);
    if (ev) {
      return base("vimeo", "marco", "https://vimeo.com/event/" + encodeURIComponent(ev[1]) + "/embed",
        "Evento de Vimeo");
    }
    const vid = u.pathname.match(/^\/(?:video\/)?(\d+)/i);
    if (vid) {
      return base("vimeo", "marco", "https://player.vimeo.com/video/" + vid[1] + "?muted=1",
        "Vídeo de Vimeo");
    }
  }
  const pt = u.pathname.match(/^\/(?:videos\/watch|w)\/([^/?#]+)/i);
  if (pt) {
    return base("peertube", "marco",
      u.origin + "/videos/embed/" + encodeURIComponent(pt[1]), "PeerTube");
  }
  if (ruta.endsWith("/embed.html") || host.includes("owncast")) {
    return base("owncast", "marco", crudo, "Owncast");
  }
  if (host === "meet.jit.si" || ruta.includes("/jitsi")) {
    return base("jitsi", "marco", crudo, "Sala Jitsi");
  }
  if (ruta.endsWith("/whep")) {
    return base("webrtc-whep", "pestana", null, "WebRTC (WHEP): fase 2");
  }
  const incrustable = isLikelyEmbeddable(crudo);
  if (incrustable === false) {
    return base("web", "pestana", null, "Web que no permite incrustar: se abre en pestaña");
  }
  return base("web", "marco", crudo, "Página web incrustada");
}

export function tipoSugerido(f: FormatoDetectado): TipoEstacion {
  switch (f.formato) {
    case "audio": return "audio";
    case "video":
    case "hls":
    case "dash":
    case "youtube":
    case "twitch":
    case "vimeo":
    case "peertube":
    case "owncast":
    case "webrtc-whep":
      return "video";
    case "jitsi": return "evento";
    case "interno":
    case "web":
      return "app";
  }
}
