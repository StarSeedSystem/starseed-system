// Mezclador del estudio: lienzo + audio + grabación + WHIP. Todo lo del navegador
// se inyecta en deps (contrato §10). La URL y el token WHIP viven solo en memoria.
import { adaptarEscena, SALIDAS, type Escena, type Salida } from "./estudio-escenas";

export type Medio = unknown; // HTMLVideoElement | HTMLImageElement | MediaStream | string
export interface Pista { kind: string; stop(): void }
export interface FlujoMezclador { getTracks(): Pista[]; getVideoTracks(): Pista[]; getAudioTracks(): Pista[]; addTrack(p: Pista): void; }
export interface Contexto2d { fillStyle: string; font: string; shadowColor: string; shadowBlur: number; fillRect(x: number, y: number, w: number, h: number): void; drawImage(img: unknown, x: number, y: number, w: number, h: number): void; fillText(t: string, x: number, y: number, maxAncho?: number): void; }
export interface Lienzo { width: number; height: number; getContext(tipo: "2d"): Contexto2d | null; captureStream(fps: number): FlujoMezclador; }
export interface NodoAudio { connect(n: NodoAudio): void; disconnect(): void; gain: { value: number }; }
export interface AudioContextoMezclador { createMediaStreamDestination(): NodoAudio & { stream: FlujoMezclador }; createMediaStreamSource(s: FlujoMezclador): NodoAudio; createGain(): NodoAudio; close(): Promise<void>; }
export interface GrabadoraMezclador { start(): void; stop(): void; ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null; }
export interface ParMezclador { addTrack(p: Pista, f: FlujoMezclador): void; createOffer(): Promise<{ sdp: string }>; setLocalDescription(d: { sdp: string }): Promise<void>; setRemoteDescription(d: { type: string; sdp: string }): Promise<void>; localDescription: { sdp: string } | null; close(): void; }
export type RespuestaFetch = { status: number; ok: boolean; text(): Promise<string>; headers: { get(n: string): string | null } };
export type FetchMezclador = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<RespuestaFetch>;
export interface DepsMezclador { crearCanvas(): Lienzo; crearAudioContexto(): AudioContextoMezclador; requestAnimationFrame(cb: () => void): number; cancelAnimationFrame(id: number): void; crearGrabadora(flujo: FlujoMezclador): GrabadoraMezclador; crearPar(): ParMezclador; fetch: FetchMezclador; }
export interface Mezclador { ponerEscena(escena: Escena, medios: Record<string, Medio>): void; cambiarSalida(salida: Salida): void; flujo(): FlujoMezclador; grabar(): { parar(): Promise<Blob> }; emitirWhip(url: string, token?: string): Promise<{ parar(): Promise<void> }>; destruir(): void; }

export function crearMezclador(deps: DepsMezclador): Mezclador {
  let escena: Escena | null = null, medios: Record<string, Medio> = {};
  let salida: Salida = SALIDAS.horizontal;
  let lienzo: Lienzo | null = null, ctx: Contexto2d | null = null;
  let rafId: number | null = null, flujoCache: FlujoMezclador | null = null;
  let audio: AudioContextoMezclador | null = null;
  let destino: (NodoAudio & { stream: FlujoMezclador }) | null = null;
  const conectadas = new Set<string>(), pares: ParMezclador[] = [], grabadoras: GrabadoraMezclador[] = [];

  function asegurarAudio() {
    if (!audio) { audio = deps.crearAudioContexto(); destino = audio.createMediaStreamDestination(); }
    return destino!;
  }
  function dibujar() {
    if (!ctx || !lienzo || !escena) return;
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    const capas = adaptarEscena(escena, salida).capas
      .filter((c) => c.visible && c.fuente.tipo !== "microfono").sort((a, b) => a.z - b.z);
    for (const capa of capas) {
      const x = capa.x * lienzo.width, y = capa.y * lienzo.height;
      const w = capa.ancho * lienzo.width, h = capa.alto * lienzo.height, m = medios[capa.fuente.id];
      if (capa.fuente.tipo === "texto") {
        const texto = typeof m === "string" ? m : capa.fuente.texto ?? "";
        ctx.font = `${Math.max(Math.round(h * 0.4), 16)}px system-ui, sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 8;
        ctx.fillStyle = "#ffffff"; ctx.fillText(texto, x, y + h / 2, w); ctx.shadowBlur = 0;
      } else if (m != null && typeof m !== "string" && typeof m !== "function") {
        ctx.drawImage(m, x, y, w, h);
      }
    }
  }
  function soltarVideo() {
    if (rafId !== null) { deps.cancelAnimationFrame(rafId); rafId = null; }
    lienzo = null; ctx = null; flujoCache = null;
  }
  function flujo(): FlujoMezclador {
    if (flujoCache) return flujoCache;
    const pistasAudio = asegurarAudio().stream.getAudioTracks();
    if (salida.ancho > 0) {
      lienzo = deps.crearCanvas(); lienzo.width = salida.ancho; lienzo.height = salida.alto;
      ctx = lienzo.getContext("2d"); flujoCache = lienzo.captureStream(salida.fps);
      for (const p of pistasAudio) flujoCache.addTrack(p);
      const lazo = () => { dibujar(); rafId = deps.requestAnimationFrame(lazo); };
      rafId = deps.requestAnimationFrame(lazo);
    } else flujoCache = destino!.stream;
    return flujoCache;
  }
  function mezclarAudios() {
    if (!escena) return;
    for (const capa of escena.capas) {
      const m = medios[capa.fuente.id];
      if (!capa.visible || conectadas.has(capa.fuente.id) || m == null || typeof m !== "object") continue;
      const f = m as FlujoMezclador;
      if (typeof f.getAudioTracks !== "function" || f.getAudioTracks().length === 0) continue;
      const uso = audio!.createMediaStreamSource(f), g = audio!.createGain();
      g.gain.value = capa.volumen ?? 1;
      uso.connect(g); g.connect(destino!); conectadas.add(capa.fuente.id);
    }
  }
  function ponerEscena(e: Escena, m: Record<string, Medio>) {
    escena = e; medios = m; asegurarAudio(); mezclarAudios();
    if (salida.ancho > 0 && !flujoCache) flujo(); else dibujar();
  }
  function cambiarSalida(s: Salida) { soltarVideo(); salida = s; if (escena) { flujo(); dibujar(); } }
  function grabar(): { parar(): Promise<Blob> } {
    const rec = deps.crearGrabadora(flujo()), trozos: Blob[] = [];
    grabadoras.push(rec);
    rec.ondataavailable = (e) => { trozos.push(e.data); }; rec.start();
    return { parar: () => new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(trozos, { type: "video/webm" })); rec.stop(); }) };
  }
  async function emitirWhip(url: string, token?: string) {
    const f = flujo(), pc = deps.crearPar(), extra: Record<string, string> = {};
    pares.push(pc);
    for (const p of f.getTracks()) pc.addTrack(p, f);
    await pc.setLocalDescription(await pc.createOffer());
    if (token) extra.Authorization = `Bearer ${token}`;
    const res = await deps.fetch(url, { method: "POST", body: pc.localDescription?.sdp ?? "", headers: { "Content-Type": "application/sdp", ...extra } });
    if (res.status !== 201) { pc.close(); throw new Error(`No se pudo emitir: el servidor WHIP respondió ${res.status}`); }
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    const ubicacion = res.headers.get("Location");
    return { parar: async () => { pc.close(); if (ubicacion) await deps.fetch(ubicacion, { method: "DELETE", headers: extra }); } };
  }
  function destruir() {
    soltarVideo();
    for (const g of grabadoras) g.stop();
    for (const p of pares) p.close();
    if (flujoCache) for (const t of flujoCache.getTracks()) t.stop();
    void audio?.close(); escena = null; medios = {}; conectadas.clear();
  }
  return { ponerEscena, cambiarSalida, flujo, grabar, emitirWhip, destruir };
}
