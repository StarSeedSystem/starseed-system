/**
 * VID1110A · el vídeo ligero que salía en negro en las dos puntas (prueba.32, Mac ↔ tableta solo por Bluetooth).
 * Cadena entera con falsos: captura → codificación → fragmentos → cola del enlace con tope → reensamblado →
 * decodificación → pintado, con los contadores por sentido y el respaldo a JPEG cuando un códec calla.
 */
import { describe, expect, it } from "vitest";
import { lienzoEsNegro } from "../codec-web";
import { CAPTURAS_SIN_SALIDA, CUADROS_SIN_IMAGEN, PERIODO_CONTADORES_MS, SesionVideoDatos } from "../sesion-video";
import type { CodecVideo, CodificadorVideo, DecodificadorVideo, FabricaVideo, FrameCodificado, FuenteVideo, ImagenDecodificada, PerfilVideo, SalidaVideo, TransporteVideo } from "../tipos";

function bytes(n: number, v = 5): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 17 + v) & 255;
  return b;
}

function relojManual() {
  let t = 1_000;
  const timers: Array<{ fn: () => void; ms: number; prox: number; vivo: boolean }> = [];
  return {
    ahora: () => t,
    cada(fn: () => void, ms: number) {
      const x = { fn, ms, prox: t + ms, vivo: true };
      timers.push(x);
      return () => {
        x.vivo = false;
      };
    },
    avanzar(ms: number) {
      const fin = t + ms;
      while (t < fin) {
        t = Math.min(fin, t + 5);
        for (const x of timers.slice()) {
          while (x.vivo && x.prox <= t) {
            x.prox += x.ms;
            x.fn();
          }
        }
      }
    },
  };
}
type Reloj = ReturnType<typeof relojManual>;

async function vaciar() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/* ───────────── Códecs falsos (con modos de fallo) ───────────── */

interface ModoCodec {
  tamClave?: number;
  tamDelta?: number;
  /** El codificador traga los fotogramas y no devuelve nada (Safari sin VideoFrame de canvas, por ejemplo). */
  mudoTx?: boolean;
  /** El decodificador no devuelve imágenes. */
  mudoRx?: boolean;
  /** El codificador avisa de un error en cada fotograma. */
  errorTx?: string;
}

class Cod implements CodificadorVideo {
  cb: (f: FrameCodificado) => void = () => undefined;
  cbErr: (m: string) => void = () => undefined;
  claves = 0;
  constructor(readonly codec: CodecVideo, readonly m: ModoCodec) {}
  configurar(_p: PerfilVideo) {}
  codificar(f: { ts: number; w: number; h: number }, clave: boolean) {
    if (this.m.errorTx) return this.cbErr(this.m.errorTx);
    if (this.m.mudoTx) return;
    if (clave) this.claves++;
    this.cb({ clave, bytes: bytes(clave ? (this.m.tamClave ?? 3000) : (this.m.tamDelta ?? 400), clave ? 1 : 2), ts: f.ts, w: f.w, h: f.h });
  }
  alSalir(cb: (f: FrameCodificado) => void) {
    this.cb = cb;
  }
  alError(cb: (m: string) => void) {
    this.cbErr = cb;
  }
  cerrar() {}
}

class Dec implements DecodificadorVideo {
  cbImg: (i: ImagenDecodificada) => void = () => undefined;
  cbErr: (m?: string) => void = () => undefined;
  recibidos: FrameCodificado[] = [];
  constructor(readonly m: ModoCodec) {}
  decodificar(f: FrameCodificado) {
    this.recibidos.push(f);
    if (!this.m.mudoRx) this.cbImg({ imagen: {}, w: f.w, h: f.h });
  }
  alImagen(cb: (i: ImagenDecodificada) => void) {
    this.cbImg = cb;
  }
  alError(cb: (m?: string) => void) {
    this.cbErr = cb;
  }
  cerrar() {}
}

function fabrica(cod: CodecVideo[], dec: CodecVideo[], porCodec: Partial<Record<CodecVideo, ModoCodec>> = {}) {
  const codificadores: Cod[] = [];
  const decodificadores: Dec[] = [];
  const f: FabricaVideo & { codificadores: Cod[]; decodificadores: Dec[] } = {
    codificables: () => cod,
    decodificables: () => dec,
    codificador: (c) => {
      if (!cod.includes(c)) return null;
      const x = new Cod(c, porCodec[c] ?? {});
      codificadores.push(x);
      return x;
    },
    decodificador: (c) => {
      if (!dec.includes(c)) return null;
      const x = new Dec(porCodec[c] ?? {});
      decodificadores.push(x);
      return x;
    },
    codificadores,
    decodificadores,
  };
  return f;
}

function fuente(): FuenteVideo {
  let n = 0;
  return {
    capturar(w, h) {
      n++;
      return { imagen: {}, w, h, ts: n * 100 };
    },
    cerrar() {},
  };
}

function salida(opc: { falla?: boolean } = {}): SalidaVideo & { pintadas: number } {
  const o = {
    stream: null,
    pintadas: 0,
    pintar() {
      if (opc.falla) throw new Error("drawImage rechazó el fotograma");
      o.pintadas++;
    },
    cerrar() {},
  };
  return o;
}

/* ───────────── Enlace con cola de vídeo CON TOPE, como el Bluetooth (24 KiB, tira lo más viejo) ───────────── */

class LadoCapado implements TransporteVideo {
  otro!: LadoCapado;
  oyentes = new Set<(t: string) => void>();
  cola: string[] = [];
  bytesCola = 0;
  tiradas = 0;
  enviadosVideo = 0;
  constructor(readonly tope: number | null, readonly bytesPorTic = 3000) {}
  enviar(t: string) {
    queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    return "ok" as const;
  }
  enviarVideo(t: string) {
    this.enviadosVideo++;
    this.cola.push(t);
    this.bytesCola += t.length;
    let tiro = false;
    // Exactamente la regla de bluetooth-directo-motor: lo viejo se tira al pasar del tope.
    while (this.tope !== null && this.bytesCola > this.tope && this.cola.length > 1) {
      const v = this.cola.shift()!;
      this.bytesCola -= v.length;
      this.tiradas++;
      tiro = true;
    }
    return tiro ? ("descartado" as const) : ("ok" as const);
  }
  drenar() {
    let presupuesto = this.bytesPorTic;
    while (this.cola.length && presupuesto > 0) {
      const t = this.cola.shift()!;
      this.bytesCola -= t.length;
      presupuesto -= t.length;
      queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    }
  }
  colaVozBytes() {
    return 0;
  }
  colaVideoBytes() {
    return this.bytesCola;
  }
  topeColaVideoBytes() {
    return this.tope;
  }
  ocupado() {
    return false;
  }
  alRecibir(cb: (t: string) => void) {
    this.oyentes.add(cb);
    return () => void this.oyentes.delete(cb);
  }
  abierto() {
    return true;
  }
  mtu() {
    return null;
  }
}

type SalidaCuenta = SalidaVideo & { pintadas: number };

function montar(reloj: Reloj, fa: FabricaVideo, fb: FabricaVideo, o: { tope?: number | null; salidaB?: SalidaCuenta; hitosA?: string[]; hitosB?: string[] } = {}) {
  const x = new LadoCapado(o.tope === undefined ? 24 * 1024 : o.tope);
  const y = new LadoCapado(o.tope === undefined ? 24 * 1024 : o.tope);
  x.otro = y;
  y.otro = x;
  reloj.cada(() => {
    x.drenar();
    y.drenar();
  }, 50);
  const sa = salida();
  const sb = o.salidaB ?? salida();
  const a = new SesionVideoDatos({ idLlamada: "s", transporte: x, codecs: fa, salida: sa, reloj, anotar: (h) => o.hitosA?.push(h) });
  const b = new SesionVideoDatos({ idLlamada: "s", transporte: y, codecs: fb, salida: sb, reloj, anotar: (h) => o.hitosB?.push(h) });
  a.iniciar();
  b.iniciar();
  return { a, b, x, y, sa, sb: sb as SalidaCuenta };
}

async function correr(reloj: Reloj, ms: number) {
  for (let t = 0; t < ms; t += 250) {
    reloj.avanzar(250);
    await vaciar();
  }
}

/* ══════════════════════════════════ Pruebas ══════════════════════════════════ */

describe("VID1110A · un fotograma clave sobrevive al tope de la cola del Bluetooth", () => {
  it("clave de 20 KB crudos (≈ 27 KiB en texto): llega entero y se pinta", async () => {
    const reloj = relojManual();
    const fa = fabrica(["vp8"], ["vp8"], { vp8: { tamClave: 20_000 } });
    const fb = fabrica(["vp8"], ["vp8"]);
    const { a, b, x, sb } = montar(reloj, fa, fb);
    a.ponerFuente(fuente());
    await correr(reloj, 6000);
    expect(x.tiradas).toBe(0); // la cola nunca se pasó del tope: nada que tirar
    expect(sb.pintadas).toBeGreaterThan(0);
    const primero = fb.decodificadores[0].recibidos[0];
    expect(primero.clave).toBe(true);
    expect(primero.bytes.length).toBe(20_000);
    expect(b.contadores().rx.pintados).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });

  it("control: sin la salida paciente, el mismo clave se pasaba del tope (lo que pasaba en prueba.32)", async () => {
    // Una cola de 24 KiB con un clave de 27 KiB en texto tira sus primeros fragmentos: el reensamblado nunca lo completa.
    const x = new LadoCapado(24 * 1024);
    const frag = "x".repeat(1700);
    for (let i = 0; i < 17; i++) x.enviarVideo(frag);
    expect(x.tiradas).toBeGreaterThan(0);
  });
});

describe("VID1110A · contadores y líneas del registro", () => {
  it("cada 5 s anota una línea tx y otra rx con el formato acordado", async () => {
    const reloj = relojManual();
    const hitosA: string[] = [];
    const hitosB: string[] = [];
    const { a, b } = montar(reloj, fabrica(["vp8"], ["vp8"]), fabrica(["vp8"], ["vp8"]), { hitosA, hitosB });
    a.ponerFuente(fuente());
    await correr(reloj, PERIODO_CONTADORES_MS + 1500);
    const tx = hitosA.find((h) => h.startsWith("video-datos tx capturados="));
    const rx = hitosB.find((h) => h.startsWith("video-datos rx paquetes="));
    expect(tx).toMatch(/^video-datos tx capturados=\d+ codificados=\d+ enviados=\d+ descartados=\d+ clave=\d+ kbps=\d+/);
    expect(rx).toMatch(/^video-datos rx paquetes=\d+ cuadros=\d+ decodificados=\d+ pintados=\d+ errores=0 ultimoError=ninguno$/);
    const c = a.contadores().tx;
    expect(c.capturados).toBeGreaterThan(5);
    expect(c.codificados).toBe(c.capturados);
    expect(c.enviados).toBe(c.codificados);
    expect(c.clave).toBeGreaterThanOrEqual(1);
    const r = b.contadores().rx;
    expect(r.decodificados).toBe(r.cuadros);
    expect(r.pintados).toBe(r.decodificados);
    a.detener();
    b.detener();
  });

  it("un error al pintar se cuenta y se cuenta con su motivo (no se traga)", async () => {
    const reloj = relojManual();
    const hitosB: string[] = [];
    const { a, b } = montar(reloj, fabrica(["vp8"], ["vp8"]), fabrica(["vp8"], ["vp8"]), { salidaB: salida({ falla: true }), hitosB });
    a.ponerFuente(fuente());
    await correr(reloj, PERIODO_CONTADORES_MS + 1500);
    const r = b.contadores().rx;
    expect(r.decodificados).toBeGreaterThan(0);
    expect(r.pintados).toBe(0);
    expect(r.errores).toBeGreaterThan(0);
    expect(r.ultimoError).toMatch(/^pintar: drawImage/);
    expect(hitosB.some((h) => /^video-datos rx .*pintados=0 errores=\d+ ultimoError="pintar: /.test(h))).toBe(true);
    a.detener();
    b.detener();
  });
});

describe("VID1110A · respaldo a JPEG cuando un códec calla", () => {
  it("el codificador VP8 traga fotogramas sin devolver nada: se veta y se pasa a JPEG", async () => {
    const reloj = relojManual();
    const hitosA: string[] = [];
    const fa = fabrica(["vp8", "jpeg"], ["vp8", "jpeg"], { vp8: { mudoTx: true } });
    const fb = fabrica(["vp8", "jpeg"], ["vp8", "jpeg"]);
    const { a, sb } = montar(reloj, fa, fb, { hitosA });
    a.ponerFuente(fuente());
    await correr(reloj, 6000);
    expect(a.contadores().tx.capturados).toBeGreaterThanOrEqual(CAPTURAS_SIN_SALIDA);
    expect(a.estado().codecTx).toBe("jpeg");
    expect(hitosA.some((h) => /^video-datos tx=jpeg \(vp8 vetado/.test(h))).toBe(true);
    expect(sb.pintadas).toBeGreaterThan(0);
    a.detener();
  });

  it("el codificador avisa de errores seguidos: se veta con su motivo", async () => {
    const reloj = relojManual();
    const hitosA: string[] = [];
    const fa = fabrica(["vp8", "jpeg"], ["jpeg"], { vp8: { errorTx: "configuración no aceptada" } });
    const fb = fabrica(["vp8", "jpeg"], ["vp8", "jpeg"]);
    const { a, sb } = montar(reloj, fa, fb, { hitosA });
    a.ponerFuente(fuente());
    await correr(reloj, 4000);
    expect(hitosA.some((h) => h.includes('tx-error codec=vp8 "configuración no aceptada"'))).toBe(true);
    expect(a.estado().codecTx).toBe("jpeg");
    expect(sb.pintadas).toBeGreaterThan(0);
    expect(a.contadores().tx.erroresCodec).toBeGreaterThanOrEqual(3);
    a.detener();
  });

  it("el decodificador VP8 no devuelve imágenes: B lo veta, se lo dice a A y A manda JPEG", async () => {
    const reloj = relojManual();
    const hitosB: string[] = [];
    const fa = fabrica(["vp8", "jpeg"], ["vp8", "jpeg"]);
    const fb = fabrica(["vp8", "jpeg"], ["vp8", "jpeg"], { vp8: { mudoRx: true } });
    const { a, b, sb } = montar(reloj, fa, fb, { hitosB });
    a.ponerFuente(fuente());
    await correr(reloj, 8000);
    expect(b.contadores().rx.cuadros).toBeGreaterThanOrEqual(CUADROS_SIN_IMAGEN);
    expect(hitosB.some((h) => /^video-datos rx-vetado codec=vp8/.test(h))).toBe(true);
    expect(a.estado().codecTx).toBe("jpeg");
    expect(sb.pintadas).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });
});

describe("VID1110A · fotograma negro", () => {
  it("lienzoEsNegro: todo a cero es negro; un píxel claro no lo es; si no puede leer, no inventa un fallo", () => {
    const w = 32;
    const h = 24;
    const datos = new Uint8ClampedArray(w * h * 4);
    const ctx = { getImageData: () => ({ data: datos }) };
    expect(lienzoEsNegro(ctx, w, h)).toBe(true);
    datos[(12 * w + 16) * 4 + 1] = 200;
    expect(lienzoEsNegro(ctx, w, h)).toBe(false);
    expect(lienzoEsNegro({ getImageData: () => { throw new Error("tainted"); } }, w, h)).toBe(false);
  });
});
