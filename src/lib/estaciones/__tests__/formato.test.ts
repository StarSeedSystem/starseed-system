import { describe, it, expect } from "vitest";
import { detectarFormato, tipoSugerido, conParent } from "../formato";

describe("detectarFormato: tabla del contrato", () => {
  it("enlace interno", () => {
    const f = detectarFormato("/genesis/panel");
    expect(f.formato).toBe("interno");
    expect(f.reproductor).toBe("interno");
    expect(f.urlIncrustable).toBeNull();
  });
  it("hls por extensión y por format=m3u8", () => {
    expect(detectarFormato("https://tv.example.com/directo.M3U8?x=1#f").formato).toBe("hls");
    const f = detectarFormato("https://tv.example.com/play?format=m3u8");
    expect(f.formato).toBe("hls");
    expect(f.reproductor).toBe("hls");
  });
  it("dash por .mpd", () => {
    const f = detectarFormato("https://cdn.example.com/manifest.mpd");
    expect(f.formato).toBe("dash");
    expect(f.reproductor).toBe("pestana");
  });
  it("audio por extensión, ruta, puerto y red", () => {
    const a = detectarFormato("https://radio.example.com/musica.mp3");
    expect(a.formato).toBe("audio");
    expect(a.reproductor).toBe("nativo-audio");
    expect(a.soloAudio).toBe(true);
    expect(detectarFormato("https://radio.example.com/stream").formato).toBe("audio");
    expect(detectarFormato("https://radio.example.com/listen/lofi").formato).toBe("audio");
    expect(detectarFormato("https://radio.example.com:8000/cadena").formato).toBe("audio");
    expect(detectarFormato("https://icecast.ejemplo.org/montana").formato).toBe("audio");
    expect(detectarFormato("https://shoutcast.ejemplo.org/ok.aac").formato).toBe("audio");
  });
  it("vídeo por extensión", () => {
    const f = detectarFormato("https://media.example.com/Clip.MP4?dl=1");
    expect(f.formato).toBe("video");
    expect(f.reproductor).toBe("nativo-video");
    expect(f.soloAudio).toBe(false);
    expect(detectarFormato("https://media.example.com/a.webm").formato).toBe("video");
    expect(detectarFormato("https://media.example.com/a.mov").formato).toBe("video");
  });
  it("youtube watch, /live/ y youtu.be", () => {
    const w = detectarFormato("https://www.youtube.com/watch?v=abc123&t=5");
    expect(w.formato).toBe("youtube");
    expect(w.reproductor).toBe("marco");
    expect(w.urlIncrustable).toBe("https://www.youtube-nocookie.com/embed/abc123?autoplay=1&mute=1");
    expect(detectarFormato("https://youtube.com/live/xyz987").urlIncrustable)
      .toBe("https://www.youtube-nocookie.com/embed/xyz987?autoplay=1&mute=1");
    expect(detectarFormato("https://youtu.be/qwe456").urlIncrustable)
      .toBe("https://www.youtube-nocookie.com/embed/qwe456?autoplay=1&mute=1");
  });
  it("twitch con parent vacío y conParent", () => {
    const f = detectarFormato("https://www.twitch.tv/MiCanal");
    expect(f.formato).toBe("twitch");
    expect(f.urlIncrustable).toBe("https://player.twitch.tv/?channel=MiCanal&parent=&muted=true");
    expect(conParent(f.urlIncrustable!, "starseed-os.vercel.app"))
      .toBe("https://player.twitch.tv/?channel=MiCanal&parent=starseed-os.vercel.app&muted=true");
  });
  it("vimeo vídeo y evento", () => {
    expect(detectarFormato("https://vimeo.com/12345").urlIncrustable)
      .toBe("https://player.vimeo.com/video/12345?muted=1");
    expect(detectarFormato("https://vimeo.com/event/9988").urlIncrustable)
      .toBe("https://vimeo.com/event/9988/embed");
  });
  it("peertube /videos/watch/ y /w/", () => {
    const f = detectarFormato("https://tubo.example.com/videos/watch/abc-def");
    expect(f.formato).toBe("peertube");
    expect(f.urlIncrustable).toBe("https://tubo.example.com/videos/embed/abc-def");
    expect(detectarFormato("https://tubo.example.com/w/zz99").urlIncrustable)
      .toBe("https://tubo.example.com/videos/embed/zz99");
  });
  it("owncast por embed.html o host", () => {
    const f = detectarFormato("https://tv.example.com/embed.html");
    expect(f.formato).toBe("owncast");
    expect(f.reproductor).toBe("marco");
    expect(detectarFormato("https://owncast.example.net/").formato).toBe("owncast");
  });
  it("jitsi por host o ruta", () => {
    expect(detectarFormato("https://meet.jit.si/MiSala").formato).toBe("jitsi");
    expect(detectarFormato("https://os.example.com/jitsi/sala").formato).toBe("jitsi");
  });
  it("webrtc-whep", () => {
    const f = detectarFormato("https://cam.example.com/calle/whep");
    expect(f.formato).toBe("webrtc-whep");
    expect(f.reproductor).toBe("pestana");
  });
  it("web genérico con marco", () => {
    const f = detectarFormato("https://blog-desconocido.example.com/entrada");
    expect(f.formato).toBe("web");
    expect(["marco", "pestana"]).toContain(f.reproductor);
  });
});

describe("detectarFormato: casos raros", () => {
  it("URL inválida → web + pestana, sin lanzar", () => {
    const f = detectarFormato("no es una url");
    expect(f.formato).toBe("web");
    expect(f.reproductor).toBe("pestana");
    expect(() => detectarFormato("")).not.toThrow();
    expect(detectarFormato("").reproductor).toBe("pestana");
  });
  it("protocolo no http → pestana", () => {
    expect(detectarFormato("ftp://example.com/f.mp3").reproductor).toBe("pestana");
  });
  it("tipo audio fuerza soloAudio", () => {
    expect(detectarFormato("https://media.example.com/a.mp4", "audio").soloAudio).toBe(true);
  });
});

describe("tipoSugerido", () => {
  it("mapea cada formato", () => {
    expect(tipoSugerido({ formato: "audio", reproductor: "nativo-audio", urlIncrustable: null, soloAudio: true, motivo: "" })).toBe("audio");
    for (const formato of ["video", "hls", "dash", "youtube", "twitch", "vimeo", "peertube", "owncast"] as const) {
      expect(tipoSugerido({ formato, reproductor: "marco", urlIncrustable: null, soloAudio: false, motivo: "" })).toBe("video");
    }
    expect(tipoSugerido({ formato: "jitsi", reproductor: "marco", urlIncrustable: null, soloAudio: false, motivo: "" })).toBe("evento");
    expect(tipoSugerido({ formato: "interno", reproductor: "interno", urlIncrustable: null, soloAudio: false, motivo: "" })).toBe("app");
    expect(tipoSugerido({ formato: "web", reproductor: "marco", urlIncrustable: null, soloAudio: false, motivo: "" })).toBe("app");
  });
});
