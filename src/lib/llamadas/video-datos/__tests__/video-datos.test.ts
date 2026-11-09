/**
 * LLA1108H · vídeo ligero por enlace de datos: fragmentación, reensamblado, pérdida, adaptación, prioridad de la voz
 * y códec por sentido. Sin WebCodecs (jsdom no lo tiene): códecs y enlaces falsos, reloj manual.
 */
import { describe, expect, it } from "vitest";
import { ControlAdaptativo, hayHueco, presupuestoVideoKbps, techoDePerfiles, UMBRAL_COLA_VIDEO_BYTES, UMBRAL_VOZ_HUECO_BYTES } from "../adaptacion";
import { armarControlVideo, armarFragmento, esTextoVideo, fragmentar, leerControlVideo, leerFragmento, mtuSana, ReensambladorVideo, ESPERA_FRAGMENTOS_MS, MTU_VIDEO_DEFECTO } from "../paquete";
import { elegirCodecVideo, SesionVideoDatos } from "../sesion-video";
import { PERFILES_VIDEO, type CodecVideo, type CodificadorVideo, type DecodificadorVideo, type FabricaVideo, type FrameCodificado, type FuenteVideo, type ImagenDecodificada, type PerfilVideo, type SalidaVideo, type TransporteVideo } from "../tipos";
import { SesionVozDatos, fabricaCodecsSimples, type AudioVoz, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";
import { esTextoVoz } from "@/lib/llamadas/voz-datos/paquete";

/* ─────────────────────────────── Ayudas ─────────────────────────────── */

function bytes(n: number, relleno = 7): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + relleno) & 255;
  return b;
}

function frame(n: number, clave: boolean): FrameCodificado {
  return { clave, bytes: bytes(n, clave ? 1 : 2), ts: 100, w: 160, h: 120 };
}

/** Reloj manual: `avanzar` dispara los temporizadores en orden, en pasos de 5 ms. */
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

/* ─────────────────────────── Códecs y fuente falsos ─────────────────────────── */

class CodificadorFalso implements CodificadorVideo {
  perfil: PerfilVideo | null = null;
  cb: (f: FrameCodificado) => void = () => undefined;
  codificados: boolean[] = [];
  cerrado = false;
  constructor(readonly codec: CodecVideo, private readonly tamClave = 3000, private readonly tamDelta = 500) {}
  configurar(p: PerfilVideo) {
    this.perfil = p;
  }
  codificar(f: { ts: number; w: number; h: number }, clave: boolean) {
    this.codificados.push(clave);
    this.cb({ clave, bytes: bytes(clave ? this.tamClave : this.tamDelta, clave ? 1 : 2), ts: f.ts, w: f.w, h: f.h });
  }
  alSalir(cb: (f: FrameCodificado) => void) {
    this.cb = cb;
  }
  cerrar() {
    this.cerrado = true;
  }
}

class DecodificadorFalso implements DecodificadorVideo {
  recibidos: FrameCodificado[] = [];
  cbImg: (i: ImagenDecodificada) => void = () => undefined;
  cbErr: () => void = () => undefined;
  decodificar(f: FrameCodificado) {
    this.recibidos.push(f);
    this.cbImg({ imagen: { ts: f.ts }, w: f.w, h: f.h });
  }
  alImagen(cb: (i: ImagenDecodificada) => void) {
    this.cbImg = cb;
  }
  alError(cb: () => void) {
    this.cbErr = cb;
  }
  cerrar() {
    /* nada */
  }
}

function fabricaFalsa(cod: CodecVideo[], dec: CodecVideo[]) {
  const codificadores: CodificadorFalso[] = [];
  const decodificadores: DecodificadorFalso[] = [];
  const f: FabricaVideo & { codificadores: CodificadorFalso[]; decodificadores: DecodificadorFalso[] } = {
    codificables: () => cod,
    decodificables: () => dec,
    codificador: (c) => {
      if (!cod.includes(c)) return null;
      const x = new CodificadorFalso(c);
      codificadores.push(x);
      return x;
    },
    decodificador: (c) => {
      if (!dec.includes(c)) return null;
      const x = new DecodificadorFalso();
      decodificadores.push(x);
      return x;
    },
    codificadores,
    decodificadores,
  };
  return f;
}

function fuenteFalsa(): FuenteVideo & { capturas: Array<[number, number]> } {
  const capturas: Array<[number, number]> = [];
  return {
    capturas,
    capturar(w, h) {
      capturas.push([w, h]);
      return { imagen: {}, w, h, ts: capturas.length * 100 };
    },
    cerrar() {
      /* nada */
    },
  };
}

function salidaFalsa(): SalidaVideo & { pintadas: ImagenDecodificada[] } {
  const pintadas: ImagenDecodificada[] = [];
  return { stream: null, pintadas, pintar: (i) => void pintadas.push(i), cerrar: () => undefined };
}

/* ─────────────────────────── Enlace falso entre dos aparatos ─────────────────────────── */

interface OpcionesLado {
  /** Pierde el fragmento número N (contando desde 0) de los que SALEN de este lado. */
  perderFragmentos?: Set<number>;
  capacidadKbps?: number | null;
  mtu?: number | null;
}

class LadoFalso implements TransporteVideo {
  otro!: LadoFalso;
  oyentes = new Set<(t: string) => void>();
  enviadosVoz: string[] = [];
  enviadosVideo: string[] = [];
  fragmentosSalidos = 0;
  vozBytes = 0;
  videoBytes = 0;
  esta_ocupado = false;
  resultadoVideo: "ok" | "descartado" | "cerrado" = "ok";
  constructor(readonly o: OpcionesLado = {}) {}
  enviar(t: string) {
    this.enviadosVoz.push(t);
    queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    return "ok" as const;
  }
  enviarVideo(t: string) {
    this.enviadosVideo.push(t);
    const n = this.fragmentosSalidos++;
    if (!this.o.perderFragmentos?.has(n)) queueMicrotask(() => this.otro.oyentes.forEach((cb) => cb(t)));
    return this.resultadoVideo;
  }
  colaVozBytes() {
    return this.vozBytes;
  }
  colaVideoBytes() {
    return this.videoBytes;
  }
  ocupado() {
    return this.esta_ocupado;
  }
  alRecibir(cb: (t: string) => void) {
    this.oyentes.add(cb);
    return () => void this.oyentes.delete(cb);
  }
  abierto() {
    return true;
  }
  capacidadKbps() {
    return this.o.capacidadKbps ?? null;
  }
  mtu() {
    return this.o.mtu ?? null;
  }
}

function enlace(a: OpcionesLado = {}, b: OpcionesLado = {}) {
  const x = new LadoFalso(a);
  const y = new LadoFalso(b);
  x.otro = y;
  y.otro = x;
  return { x, y };
}

async function vaciar() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/* ══════════════════════════════════ Paquetes ══════════════════════════════════ */

describe("fragmentar y reensamblar", () => {
  it("un fotograma clave de 5000 bytes se parte al MTU y se recompone igual aunque lleguen desordenados", () => {
    const f = frame(5000, true);
    const frags = fragmentar("s1", 0, "vp8", f, 1200)!;
    expect(frags.map((x) => x.datos.length)).toEqual([1200, 1200, 1200, 1200, 200]);
    expect(frags.every((x) => x.n === 5 && x.clave)).toBe(true);
    const r = new ReensambladorVideo();
    const orden = [3, 0, 4, 2, 1];
    let res = r.meter(leerFragmento(armarFragmento(frags[orden[0]]))!, 0);
    for (const i of orden.slice(1)) res = r.meter(leerFragmento(armarFragmento(frags[i]))!, 0);
    expect(res.tipo).toBe("frame");
    if (res.tipo === "frame") {
      expect(res.frame.clave).toBe(true);
      expect(Array.from(res.frame.bytes)).toEqual(Array.from(f.bytes));
      expect(res.codec).toBe("vp8");
    }
  });

  it("el MTU se acota y un fotograma vacío o enorme no se manda", () => {
    expect(mtuSana(null)).toBe(MTU_VIDEO_DEFECTO);
    expect(mtuSana(10)).toBe(200);
    expect(mtuSana(1e9)).toBe(4000);
    expect(fragmentar("s", 0, "vp8", frame(0, true), 1200)).toBeNull();
    expect(fragmentar("s", 0, "vp8", frame(100_000, true), 200)).toBeNull();
    // Cada fragmento en texto cabe de sobra en una trama del Bluetooth (16 KiB).
    for (const x of fragmentar("s", 0, "jpeg", frame(4000, true), 4000)!) expect(armarFragmento(x).length).toBeLessThan(6000);
  });

  it("lo que llega del otro aparato se valida: nada raro entra", () => {
    const bueno = armarFragmento(fragmentar("s", 1, "h264", frame(300, false), 1200)![0]);
    expect(leerFragmento(bueno)).not.toBeNull();
    const roto = (cambio: Record<string, unknown>) => leerFragmento(JSON.stringify({ ...JSON.parse(bueno), ...cambio }));
    expect(roto({ n: 0 })).toBeNull();
    expect(roto({ i: 5, n: 2 })).toBeNull();
    expect(roto({ c: "av1" })).toBeNull();
    expect(roto({ w: 4 })).toBeNull();
    expect(roto({ d: "@@@@" })).toBeNull();
    expect(roto({ s: "" })).toBeNull();
    expect(leerFragmento("{no es json")).toBeNull();
    expect(esTextoVideo(bueno)).toBe(true);
    expect(esTextoVoz(bueno)).toBe(true); // el Bluetooth lo reconoce como `voz.*`
    expect(leerControlVideo(armarControlVideo({ s: "s", k: "hola", dec: ["vp8", "jpeg"] }))).toEqual({ s: "s", k: "hola", dec: ["vp8", "jpeg"] });
    expect(leerControlVideo(JSON.stringify({ t: "voz.w", s: "s", k: "explotar" }))).toBeNull();
  });
});

describe("pérdida: se pide un fotograma clave y nunca se enseña una imagen a medias", () => {
  const meter = (r: ReensambladorVideo, q: number, f: FrameCodificado, saltar: number[] = [], ahora = 0) => {
    const frags = fragmentar("s", q, "vp8", f, 1200)!;
    let res: ReturnType<ReensambladorVideo["meter"]> = { tipo: "nada" };
    for (const x of frags) if (!saltar.includes(x.i)) res = r.meter(x, ahora);
    return res;
  };

  it("falta un fragmento de un diferencial: el siguiente fotograma completo avisa de pérdida y los diferenciales se ignoran hasta el próximo clave", () => {
    const r = new ReensambladorVideo();
    expect(meter(r, 0, frame(2500, true)).tipo).toBe("frame");
    expect(meter(r, 1, frame(2500, false), [1]).tipo).toBe("nada"); // incompleto
    const res = meter(r, 2, frame(600, false));
    expect(res.tipo).toBe("perdida");
    expect(r.necesitaClave).toBe(true);
    expect(meter(r, 3, frame(600, false)).tipo).toBe("nada"); // diferencial sin clave previa: se ignora
    const clave = meter(r, 4, frame(2500, true));
    expect(clave.tipo).toBe("frame");
    expect(r.necesitaClave).toBe(false);
    expect(meter(r, 5, frame(600, false)).tipo).toBe("frame");
  });

  it("un fotograma a medias que nunca se completa caduca y exige clave", () => {
    const r = new ReensambladorVideo();
    meter(r, 0, frame(2500, true));
    meter(r, 1, frame(2500, false), [2], 1000);
    expect(r.caducar(1000 + ESPERA_FRAGMENTOS_MS - 1).tipo).toBe("nada");
    expect(r.caducar(1000 + ESPERA_FRAGMENTOS_MS).tipo).toBe("perdida");
    expect(r.necesitaClave).toBe(true);
  });

  it("un fotograma repetido o viejo no se entrega dos veces", () => {
    const r = new ReensambladorVideo();
    expect(meter(r, 3, frame(300, true)).tipo).toBe("frame");
    expect(meter(r, 3, frame(300, true)).tipo).toBe("nada");
    expect(meter(r, 2, frame(300, true)).tipo).toBe("nada");
  });
});

/* ══════════════════════════════════ Adaptación ══════════════════════════════════ */

describe("adaptación de la calidad", () => {
  it("la escalera va de 160×120·4 fps·40 kbps a 320×240·12 fps·150 kbps", () => {
    const primero = PERFILES_VIDEO[0];
    const ultimo = PERFILES_VIDEO[PERFILES_VIDEO.length - 1];
    expect([primero.w, primero.h, primero.fps, primero.kbps]).toEqual([160, 120, 4, 40]);
    expect([ultimo.w, ultimo.h, ultimo.fps, ultimo.kbps]).toEqual([320, 240, 12, 150]);
    for (const p of PERFILES_VIDEO) {
      expect(p.w).toBeGreaterThanOrEqual(160);
      expect(p.w).toBeLessThanOrEqual(320);
      expect(p.fps).toBeGreaterThanOrEqual(4);
      expect(p.fps).toBeLessThanOrEqual(12);
      expect(p.kbps).toBeGreaterThanOrEqual(40);
      expect(p.kbps).toBeLessThanOrEqual(150);
      expect(p.kfMs).toBeLessThanOrEqual(3000);
    }
  });

  it("el techo sale de la capacidad del enlace: la mitad menos lo que come la voz", () => {
    expect(presupuestoVideoKbps(80)).toBe(12);
    expect(techoDePerfiles(presupuestoVideoKbps(80))).toBe(0); // el suelo siempre se intenta
    expect(techoDePerfiles(presupuestoVideoKbps(480))).toBe(PERFILES_VIDEO.length - 1);
    expect(techoDePerfiles(presupuestoVideoKbps(null))).toBe(0); // sin medida: lo más cauto
  });

  it("sube un escalón tras 6 s de calma, y baja uno con presión sostenida", () => {
    const c = new ControlAdaptativo();
    let t = 10_000;
    expect(c.tic(t, 480)).toBeNull();
    for (let s = 0; s < 5; s++) expect(c.tic((t += 1000), 480)).toBeNull(); // aún no han pasado 6 s
    expect(c.tic((t += 1000), 480)?.w).toBe(PERFILES_VIDEO[1].w);
    expect(c.indice).toBe(1);
    for (let s = 0; s < 6; s++) c.tic((t += 1000), 480);
    expect(c.indice).toBe(2);
    // Presión: dos avisos en la ventana de 2 s → baja uno.
    c.registrarPresion(t + 100);
    c.registrarPresion(t + 200);
    expect(c.tic((t += 1000), 480)).not.toBeNull();
    expect(c.indice).toBe(1);
    // Una sola presión aislada no baja.
    c.registrarPresion(t + 100);
    c.tic((t += 1000), 480);
    expect(c.indice).toBe(1);
  });

  it("si el enlace pierde capacidad, baja al techo nuevo sin esperar", () => {
    const c = new ControlAdaptativo(PERFILES_VIDEO, 4);
    expect(c.tic(1000, 100)?.kbps).toBe(PERFILES_VIDEO[0].kbps);
    expect(c.indice).toBe(0);
  });

  it("hay hueco solo si la voz no espera, el enlace no está ocupado y la cola de vídeo es corta", () => {
    expect(hayHueco({ vozBytes: 0, videoBytes: 0, ocupado: false })).toBe(true);
    expect(hayHueco({ vozBytes: UMBRAL_VOZ_HUECO_BYTES - 1, videoBytes: 0, ocupado: false })).toBe(true);
    expect(hayHueco({ vozBytes: UMBRAL_VOZ_HUECO_BYTES, videoBytes: 0, ocupado: false })).toBe(false);
    expect(hayHueco({ vozBytes: 0, videoBytes: UMBRAL_COLA_VIDEO_BYTES, ocupado: false })).toBe(false);
    expect(hayHueco({ vozBytes: 0, videoBytes: 0, ocupado: true })).toBe(false);
  });
});

/* ══════════════════════════════════ Códec por sentido ══════════════════════════════════ */

describe("códec por sentido", () => {
  it("elige el mejor que yo codifico y el otro decodifica", () => {
    expect(elegirCodecVideo(["vp8", "h264", "jpeg"], ["h264", "jpeg"])).toBe("h264");
    expect(elegirCodecVideo(["h264", "jpeg"], ["vp8", "h264"])).toBe("h264");
    expect(elegirCodecVideo(["jpeg"], ["vp8"])).toBeNull();
    expect(elegirCodecVideo(["vp8"], null)).toBeNull();
  });

  it("cada sentido va con su códec y el registro anota el final de cada uno", async () => {
    const reloj = relojManual();
    const { x, y } = enlace();
    const hitosA: string[] = [];
    const hitosB: string[] = [];
    // A codifica VP8/H.264/JPEG y decodifica solo JPEG; B codifica JPEG y decodifica H.264/JPEG.
    const fa = fabricaFalsa(["vp8", "h264", "jpeg"], ["jpeg"]);
    const fb = fabricaFalsa(["jpeg"], ["h264", "jpeg"]);
    const salidaA = salidaFalsa();
    const salidaB = salidaFalsa();
    const a = new SesionVideoDatos({ idLlamada: "s", transporte: x, codecs: fa, salida: salidaA, reloj, anotar: (h) => hitosA.push(h) });
    const b = new SesionVideoDatos({ idLlamada: "s", transporte: y, codecs: fb, salida: salidaB, reloj, anotar: (h) => hitosB.push(h) });
    a.iniciar();
    b.iniciar();
    a.ponerFuente(fuenteFalsa());
    b.ponerFuente(fuenteFalsa());
    await vaciar();
    reloj.avanzar(1500);
    await vaciar();
    reloj.avanzar(1500);
    await vaciar();
    expect(a.estado().codecTx).toBe("h264"); // A→B: lo mejor que B decodifica
    expect(b.estado().codecTx).toBe("jpeg"); // B→A: lo único que A decodifica
    expect(a.estado().codecRx).toBe("jpeg");
    expect(b.estado().codecRx).toBe("h264");
    expect(hitosA).toContain("video-datos tx=h264");
    expect(hitosA).toContain("video-datos rx=jpeg");
    expect(hitosB).toContain("video-datos tx=jpeg");
    expect(hitosB).toContain("video-datos rx=h264");
    // Y las imágenes llegan de verdad, en los dos sentidos.
    expect(salidaA.pintadas.length).toBeGreaterThan(0);
    expect(salidaB.pintadas.length).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });

  it("sin ningún códec en común no se manda vídeo (pero no se rompe nada)", async () => {
    const reloj = relojManual();
    const { x, y } = enlace();
    const a = new SesionVideoDatos({ idLlamada: "s", transporte: x, codecs: fabricaFalsa(["vp8"], ["vp8"]), salida: salidaFalsa(), reloj });
    const b = new SesionVideoDatos({ idLlamada: "s", transporte: y, codecs: fabricaFalsa(["jpeg"], ["jpeg"]), salida: salidaFalsa(), reloj });
    a.iniciar();
    b.iniciar();
    a.ponerFuente(fuenteFalsa());
    await vaciar();
    reloj.avanzar(3000);
    await vaciar();
    expect(a.estado().codecTx).toBeNull();
    expect(a.estado().enviando).toBe(false);
    expect(x.enviadosVideo.length).toBe(0);
    a.detener();
    b.detener();
  });
});

/* ══════════════════════════════════ Sesión de vídeo ══════════════════════════════════ */

async function sesiones(opts: { a?: OpcionesLado; b?: OpcionesLado; escalera?: readonly PerfilVideo[] } = {}) {
  const reloj = relojManual();
  const { x, y } = enlace(opts.a, opts.b);
  const fa = fabricaFalsa(["vp8"], ["vp8"]);
  const fb = fabricaFalsa(["vp8"], ["vp8"]);
  const salidaB = salidaFalsa();
  const fuente = fuenteFalsa();
  const a = new SesionVideoDatos({ idLlamada: "s", transporte: x, codecs: fa, salida: salidaFalsa(), reloj, escalera: opts.escalera });
  const b = new SesionVideoDatos({ idLlamada: "s", transporte: y, codecs: fb, salida: salidaB, reloj });
  a.iniciar();
  b.iniciar();
  await vaciar();
  a.ponerFuente(fuente);
  return { reloj, x, y, a, b, fa, fb, salidaB, fuente };
}

describe("sesión de vídeo ligero", () => {
  it("manda 4 fps al suelo (160×120), fragmenta el clave y el otro lo pinta", async () => {
    const { reloj, x, a, b, fa, salidaB, fuente } = await sesiones();
    reloj.avanzar(2000);
    await vaciar();
    expect(fuente.capturas.every(([w, h]) => w === 160 && h === 120)).toBe(true);
    expect(fuente.capturas.length).toBeGreaterThanOrEqual(7); // 4 fps durante 2 s
    expect(fa.codificadores[0].codificados[0]).toBe(true); // el primero va clave
    const frags = x.enviadosVideo.map((t) => leerFragmento(t)!);
    expect(frags.some((f) => f.n > 1 && f.clave)).toBe(true); // el clave de 3000 bytes se partió
    expect(frags.every((f) => f.datos.length <= MTU_VIDEO_DEFECTO)).toBe(true);
    expect(salidaB.pintadas.length).toBeGreaterThanOrEqual(5);
    expect(b.estado().recibiendo).toBe(true);
    a.detener();
    b.detener();
  });

  it("un clave cada ~2 s", async () => {
    const { reloj, a, b, fa } = await sesiones();
    reloj.avanzar(5000);
    await vaciar();
    const claves = fa.codificadores[0].codificados.filter(Boolean).length;
    expect(claves).toBeGreaterThanOrEqual(3);
    expect(claves).toBeLessThanOrEqual(4);
    a.detener();
    b.detener();
  });

  it("si se pierde un fragmento, el receptor pide un clave y el emisor manda el siguiente como clave", async () => {
    // El lado A pierde el fragmento 6 de los que salen (cae dentro de un diferencial).
    const { reloj, x, a, b, fa } = await sesiones({ a: { perderFragmentos: new Set([7]) } });
    reloj.avanzar(1200);
    await vaciar();
    reloj.avanzar(2500);
    await vaciar();
    expect(b.estado().clavesPedidas).toBeGreaterThanOrEqual(1);
    const peticiones = x.otro.enviadosVoz.filter((t) => leerControlVideo(t)?.k === "kf");
    expect(peticiones.length).toBeGreaterThanOrEqual(1);
    // Tras la petición, el emisor codificó un clave fuera de su cadencia normal.
    const cod = fa.codificadores[0].codificados;
    expect(cod.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    // Nunca se pinta un fotograma sin clave previa.
    expect(b.estado().fotogramasRx).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });

  it("con presión (voz esperando) se tiran fotogramas, no la voz: no sale vídeo mientras la cola de voz pase del umbral", async () => {
    const { reloj, x, a, b, fuente } = await sesiones();
    x.vozBytes = UMBRAL_VOZ_HUECO_BYTES + 100;
    reloj.avanzar(3000);
    await vaciar();
    expect(x.enviadosVideo.length).toBe(0);
    expect(fuente.capturas.length).toBe(0); // ni siquiera se captura: no hay hueco
    expect(a.estado().omitidos).toBeGreaterThan(0);
    // La voz libera el enlace: el vídeo vuelve.
    x.vozBytes = 0;
    reloj.avanzar(2000);
    await vaciar();
    expect(x.enviadosVideo.length).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });

  it("con el enlace ocupado o la cola de vídeo llena tampoco manda; con fragmentos descartados baja de escalón", async () => {
    const { reloj, x, a, b } = await sesiones({ a: { capacidadKbps: 480 } });
    // Primero sube (calma, capacidad de sobra).
    reloj.avanzar(14_000);
    await vaciar();
    const alto = a.estado().perfil;
    expect(PERFILES_VIDEO.indexOf(alto)).toBeGreaterThanOrEqual(2);
    // Ahora el enlace tira fragmentos: presión sostenida.
    x.resultadoVideo = "descartado";
    reloj.avanzar(4000);
    await vaciar();
    expect(PERFILES_VIDEO.indexOf(a.estado().perfil)).toBeLessThan(PERFILES_VIDEO.indexOf(alto));
    // Cola de vídeo llena: no se mete más.
    x.resultadoVideo = "ok";
    x.videoBytes = UMBRAL_COLA_VIDEO_BYTES + 1;
    const antes = x.enviadosVideo.length;
    reloj.avanzar(2000);
    await vaciar();
    expect(x.enviadosVideo.length).toBe(antes);
    a.detener();
    b.detener();
  });

  it("al bajar de escalón cambia la resolución de captura y el siguiente fotograma va clave", async () => {
    const { reloj, x, a, b, fuente, fa } = await sesiones({ a: { capacidadKbps: 480 } });
    reloj.avanzar(14_000);
    await vaciar();
    const nCapturas = fuente.capturas.length;
    expect(fuente.capturas[nCapturas - 1][0]).toBeGreaterThan(160);
    x.resultadoVideo = "descartado";
    reloj.avanzar(3000);
    await vaciar();
    x.resultadoVideo = "ok";
    const claves = fa.codificadores[0].codificados.length;
    reloj.avanzar(1000);
    await vaciar();
    const nuevos = fa.codificadores[0].codificados.slice(claves);
    expect(nuevos.length).toBeGreaterThan(0);
    a.detener();
    b.detener();
  });

  it("detener avisa al otro, suelta la cámara y cierra los códecs", async () => {
    const { reloj, a, b, fa, y } = await sesiones();
    reloj.avanzar(1000);
    await vaciar();
    a.detener();
    await vaciar();
    expect(fa.codificadores[0].cerrado).toBe(true);
    expect(b.estado().fin).toBe(true);
    expect(a.estado().activa).toBe(false);
    void y;
    b.detener();
  });
});

/* ═══════════════════ Audio > vídeo en un enlace con ancho limitado ═══════════════════ */

/** Un enlace que se parece al Bluetooth: control y voz primero, vídeo después, con topes que tiran lo más viejo. */
class EnlacePriorizado {
  voz: string[] = [];
  vid: string[] = [];
  bytesVoz = 0;
  bytesVid = 0;
  vozEnviada = 0;
  vozEntregada = 0;
  vozDescartada = 0;
  vidEnviado = 0;
  vidEntregado = 0;
  vidDescartado = 0;
  oyentesOtro = new Set<(t: string) => void>();
  otro!: EnlacePriorizado;
  oyentes = new Set<(t: string) => void>();
  constructor(private readonly bytesPorTic: number) {}
  lado(): TransporteVoz & TransporteVideo {
    const self = this;
    return {
      enviar(t: string) {
        self.vozEnviada++;
        self.voz.push(t);
        self.bytesVoz += t.length;
        let tiro = false;
        while (self.bytesVoz > 6 * 1024 && self.voz.length > 1) {
          self.bytesVoz -= self.voz.shift()!.length;
          self.vozDescartada++;
          tiro = true;
        }
        return tiro ? "descartado" : "ok";
      },
      enviarVideo(t: string) {
        self.vidEnviado++;
        self.vid.push(t);
        self.bytesVid += t.length;
        let tiro = false;
        while (self.bytesVid > 24 * 1024 && self.vid.length > 1) {
          self.bytesVid -= self.vid.shift()!.length;
          self.vidDescartado++;
          tiro = true;
        }
        return tiro ? "descartado" : "ok";
      },
      colaVozBytes: () => self.bytesVoz,
      colaVideoBytes: () => self.bytesVid,
      ocupado: () => self.bytesVoz > 2 * 1024,
      alRecibir(cb: (t: string) => void) {
        self.otro.oyentes.add(cb);
        return () => void self.otro.oyentes.delete(cb);
      },
      abierto: () => true,
      info: () => ({ tipo: "ble", cifrada: true }),
      capacidadKbps: () => (self.bytesPorTic * 100 * 8) / 1000,
    };
  }
  /** Un tic de 10 ms: sale lo que cabe, voz antes que vídeo. */
  tic() {
    let cupo = this.bytesPorTic;
    while (cupo > 0 && (this.voz.length || this.vid.length)) {
      const deVoz = this.voz.length > 0;
      const t = (deVoz ? this.voz : this.vid).shift()!;
      if (deVoz) {
        this.bytesVoz -= t.length;
        this.vozEntregada++;
      } else {
        this.bytesVid -= t.length;
        this.vidEntregado++;
      }
      cupo -= t.length;
      this.oyentes.forEach((cb) => cb(t));
    }
  }
}

describe("prioridad: audio > vídeo", () => {
  it("con un enlace estrecho y vídeo a tope, ni un paquete de voz se pierde: lo que se tira es vídeo", async () => {
    const reloj = relojManual();
    const enlaceAB = new EnlacePriorizado(300); // 30 KB/s
    const enlaceBA = new EnlacePriorizado(300);
    enlaceAB.otro = enlaceBA;
    enlaceBA.otro = enlaceAB;
    // Lo que A manda a B sale por enlaceAB y B lo oye por enlaceAB.oyentes: se cruza con `otro`.
    const ladoA = enlaceAB.lado();
    const ladoB = enlaceBA.lado();
    // A escucha lo que sale de B (enlaceBA) y B lo que sale de A (enlaceAB): alRecibir de cada lado engancha `otro.oyentes`.
    const audioA: AudioVoz = {
      iniciar: async (cb) => {
        reloj.cada(() => cb(new Int16Array(320).map((_, i) => ((i * 97) % 2000) - 1000)), 20);
        return true;
      },
      reproducir: () => undefined,
      detener: () => undefined,
    };
    const audioB: AudioVoz = { iniciar: async () => true, reproducir: () => undefined, detener: () => undefined };
    const vozA = new SesionVozDatos({ idLlamada: "s", transporte: ladoA, audio: audioA, codecs: fabricaCodecsSimples(), reloj });
    const vozB = new SesionVozDatos({ idLlamada: "s", transporte: ladoB, audio: audioB, codecs: fabricaCodecsSimples(), reloj });
    // Vídeo muy exigente: fotogramas grandes.
    const fa = fabricaFalsa(["vp8"], ["vp8"]);
    const fb = fabricaFalsa(["vp8"], ["vp8"]);
    const salidaB = salidaFalsa();
    const vidA = new SesionVideoDatos({ idLlamada: "s", transporte: ladoA, codecs: fa, salida: salidaFalsa(), reloj });
    const vidB = new SesionVideoDatos({ idLlamada: "s", transporte: ladoB, codecs: fb, salida: salidaB, reloj });
    await vozA.iniciar();
    await vozB.iniciar();
    vidA.iniciar();
    vidB.iniciar();
    vidA.ponerFuente(fuenteFalsa());
    // Reloj de enlace.
    reloj.cada(() => {
      enlaceAB.tic();
      enlaceBA.tic();
    }, 10);
    for (let i = 0; i < 30; i++) {
      reloj.avanzar(500);
      await vaciar();
    }
    // La voz sale entera: nada descartado y todo lo enviado llega (salvo lo que aún espera en cola).
    expect(enlaceAB.vozEnviada).toBeGreaterThan(100);
    expect(enlaceAB.vozDescartada).toBe(0);
    expect(enlaceAB.vozEnviada - enlaceAB.vozEntregada).toBeLessThanOrEqual(2);
    // El vídeo sí ha tenido que ceder: se omitieron fotogramas o se tiraron fragmentos, y aun así algo llegó.
    expect(vidA.estado().omitidos + enlaceAB.vidDescartado).toBeGreaterThan(0);
    expect(enlaceAB.vidEntregado).toBeGreaterThan(0);
    // Y la voz no esperó nunca por encima de su umbral de «ocupado» por culpa del vídeo.
    expect(enlaceAB.bytesVoz).toBeLessThan(2 * 1024);
    vozA.detener();
    vozB.detener();
    vidA.detener();
    vidB.detener();
  });
});
