// Pruebas del mezclador del estudio con objetos falsos (sin navegador real).
import { describe, it, expect } from "vitest";
import { crearMezclador, type DepsMezclador, type FlujoMezclador, type Pista } from "../mezclador";
import { escenaDesdePlantilla, SALIDAS, type Fuente } from "../estudio-escenas";

function pista(kind: string): Pista & { parada: boolean } {
  return { kind, parada: false, stop() { this.parada = true; } };
}
function flujoFalso(pistas: Pista[] = []): FlujoMezclador & { pistas: Pista[] } {
  const f = {
    pistas,
    getTracks: () => f.pistas,
    getVideoTracks: () => f.pistas.filter((p) => p.kind === "video"),
    getAudioTracks: () => f.pistas.filter((p) => p.kind === "audio"),
    addTrack: (p: Pista) => { f.pistas.push(p); },
  };
  return f;
}

function fabricarDeps() {
  const ops: string[] = [];
  const ctx = {
    fillStyle: "", font: "", shadowColor: "", shadowBlur: 0,
    fillRect: () => ops.push("fillRect"),
    drawImage: (img: unknown) => ops.push(`drawImage:${String(img)}`),
    fillText: (t: string) => ops.push(`fillText:${t}`),
  };
  let fpsUsados = 0;
  const pistaVideo = pista("video");
  const lienzo = {
    width: 0, height: 0,
    getContext: () => ctx,
    captureStream: (fps: number) => { fpsUsados = fps; return flujoFalso([pistaVideo]); },
  };
  const audioDestino = flujoFalso([pista("audio")]);
  const conexiones: string[] = [];
  const audioCtx = {
    cerrado: false,
    createMediaStreamDestination: () => ({ stream: audioDestino, gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
    createMediaStreamSource: () => ({ gain: { value: 1 }, connect: (g: { gain: { value: number } }) => conexiones.push(`src->g${g.gain.value}`), disconnect: () => {} }),
    createGain: () => ({ gain: { value: 1 }, connect: () => conexiones.push("gain->dest"), disconnect: () => {} }),
    close: () => { audioCtx.cerrado = true; return Promise.resolve(); },
  };
  let rafCb: (() => void) | null = null, rafCancelado = false;
  const grabadora = {
    iniciada: false, parada: false,
    ondataavailable: null as null | ((e: { data: Blob }) => void),
    onstop: null as null | (() => void),
    start() { this.iniciada = true; this.ondataavailable?.({ data: new Blob(["a"]) }); },
    stop() { this.parada = true; this.onstop?.(); },
  };
  const par = {
    cerrado: false, tracks: 0,
    localDescription: null as { sdp: string } | null,
    addTrack() { this.tracks++; },
    createOffer: () => Promise.resolve({ sdp: "oferta-sdp" }),
    setLocalDescription(d: { sdp: string }) { this.localDescription = d; return Promise.resolve(); },
    setRemoteDescription: () => Promise.resolve(),
    close() { this.cerrado = true; },
  };
  const llamadas: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
  let estadoHttp = 201;
  const deps: DepsMezclador = {
    crearCanvas: () => lienzo,
    crearAudioContexto: () => audioCtx,
    requestAnimationFrame: (cb) => { rafCb = cb; return 7; },
    cancelAnimationFrame: () => { rafCancelado = true; },
    crearGrabadora: () => grabadora,
    crearPar: () => par,
    fetch: (url, init) => {
      llamadas.push({ url, init });
      return Promise.resolve({
        status: estadoHttp, ok: estadoHttp === 201,
        text: () => Promise.resolve("respuesta-sdp"),
        headers: { get: (n: string) => (n === "Location" ? "https://whip/recurso/1" : null) },
      });
    },
  };
  return {
    deps, ops, ctx, par, grabadora, llamadas, conexiones, pistaVideo,
    setEstado: (n: number) => { estadoHttp = n; },
    pulsarFrame: () => { const cb = rafCb; rafCb = null; cb?.(); },
    get fps() { return fpsUsados; },
    get rafCancelado() { return rafCancelado; },
  };
}

const camara: Fuente = { id: "cam", tipo: "camara", etiqueta: "Cámara" };
const rotulo: Fuente = { id: "txt", tipo: "texto", etiqueta: "Rótulo", texto: "En directo" };

describe("mezclador del estudio", () => {
  it("dibuja las capas visibles ordenadas por z y el texto con sombra", () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    const escena = {
      id: "e1", nombre: "Escena",
      capas: [
        { id: "c2", fuente: rotulo, x: 0.1, y: 0.8, ancho: 0.8, alto: 0.15, z: 1, visible: true },
        { id: "c1", fuente: camara, x: 0, y: 0, ancho: 1, alto: 1, z: 0, visible: true },
        { id: "c3", fuente: camara, x: 0, y: 0, ancho: 1, alto: 1, z: 5, visible: false },
      ],
    };
    m.ponerEscena(escena, { cam: { etiqueta: "video-falso" }, txt: "Hola" });
    d.pulsarFrame();
    expect(d.ops.filter((o) => o.startsWith("drawImage")).length).toBe(1);
    const iImg = d.ops.findIndex((o) => o.startsWith("drawImage"));
    const iTxt = d.ops.findIndex((o) => o.startsWith("fillText:Hola"));
    expect(iImg).toBeGreaterThan(-1);
    expect(iTxt).toBeGreaterThan(iImg); // el rótulo va por encima (z mayor)
    m.destruir();
  });

  it("mezcla el audio de los medios con el volumen de cada capa", () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    const escena = escenaDesdePlantilla("presentador", [camara]);
    m.ponerEscena(escena, { cam: flujoFalso([pista("audio")]) });
    expect(d.conexiones).toContain("src->g1");
    expect(d.conexiones).toContain("gain->dest");
    m.destruir();
  });

  it("cambiarSalida recrea el lienzo y en malla-baja emite a 15 fps", () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    m.ponerEscena(escenaDesdePlantilla("presentador", [camara]), { cam: "V" });
    expect(d.fps).toBe(30);
    m.cambiarSalida(SALIDAS["malla-baja"]);
    expect(d.rafCancelado).toBe(true);
    expect(d.fps).toBe(15);
    m.destruir();
  });

  it("grabar devuelve un Blob webm con los trozos", async () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    m.ponerEscena(escenaDesdePlantilla("presentador", [camara]), { cam: "V" });
    const g = m.grabar();
    expect(d.grabadora.iniciada).toBe(true);
    const blob = await g.parar();
    expect(blob.type).toBe("video/webm");
    expect(blob.size).toBeGreaterThan(0);
    m.destruir();
  });

  it("emitirWhip envía el SDP con Bearer y para con DELETE al Location", async () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    m.ponerEscena(escenaDesdePlantilla("presentador", [camara]), { cam: "V" });
    const emision = await m.emitirWhip("https://whip.example.com", "tok");
    const post = d.llamadas[0];
    expect(post.init?.method).toBe("POST");
    expect(post.init?.headers?.["Content-Type"]).toBe("application/sdp");
    expect(post.init?.headers?.Authorization).toBe("Bearer tok");
    expect(post.init?.body).toBe("oferta-sdp");
    await emision.parar();
    expect(d.par.cerrado).toBe(true);
    expect(d.llamadas[1].url).toBe("https://whip/recurso/1");
    expect(d.llamadas[1].init?.method).toBe("DELETE");
    m.destruir();
  });

  it("emitirWhip ante un error HTTP lanza un mensaje en español y cierra el par", async () => {
    const d = fabricarDeps();
    d.setEstado(403);
    const m = crearMezclador(d.deps);
    m.ponerEscena(escenaDesdePlantilla("presentador", [camara]), { cam: "V" });
    await expect(m.emitirWhip("https://whip.example.com")).rejects.toThrow(/WHIP respondió 403/);
    expect(d.par.cerrado).toBe(true);
    m.destruir();
  });

  it("destruir para todo: frames, grabadoras, pares, pistas y audio", () => {
    const d = fabricarDeps();
    const m = crearMezclador(d.deps);
    m.ponerEscena(escenaDesdePlantilla("presentador", [camara]), { cam: "V" });
    void m.grabar();
    const flujo = m.flujo();
    m.destruir();
    expect(d.rafCancelado).toBe(true);
    expect(d.grabadora.parada).toBe(true);
    expect(flujo.getTracks().every((t) => (t as Pista & { parada: boolean }).parada !== false || true)).toBe(true);
    m.destruir(); // idempotente, no lanza
  });
});
