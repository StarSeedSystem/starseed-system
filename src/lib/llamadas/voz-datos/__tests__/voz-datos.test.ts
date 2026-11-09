import { describe, expect, it } from "vitest";
import {
  codificarAdpcm,
  codificarMuLaw,
  decodificarAdpcm,
  decodificarMuLaw,
  elegirCodecComun,
  MUESTRAS_TRAMA,
  relacionSenalRuido,
} from "../codec";
import { armarControl, armarPaquete, esTextoVoz, leerControl, leerPaquete } from "../paquete";
import { BufferJitter } from "../jitter";
import { agruparConsecutivas, ColaSalidaVoz } from "../cola-salida";
import {
  decidirAccionMedio,
  ESPERA_ICE_MS,
  LIMITE_CONECTANDO_MS,
  nivelCalidadVoz,
  textoCalidadVoz,
  textoMedioVoz,
} from "../decision";
import { fabricaCodecsSimples, SesionVozDatos, type AudioVoz, type RelojVoz, type TransporteVoz } from "../sesion";

/** Voz de mentira: dos armónicos con envolvente de sílabas, a 16 kHz. */
function voz(n: number, fase = 0): Int16Array {
  const o = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i + fase) / 16000;
    const env = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3 * t);
    o[i] = Math.round(9000 * env * (Math.sin(2 * Math.PI * 220 * t) + 0.5 * Math.sin(2 * Math.PI * 660 * t)));
  }
  return o;
}

describe("códecs de voz (puros)", () => {
  it("IMA-ADPCM: ida y vuelta de 1 s con SNR ≥ 20 dB y 163 B por trama", () => {
    const pcm = voz(16000);
    let sumaSnr = 0;
    let tramas = 0;
    for (let i = 0; i < pcm.length; i += MUESTRAS_TRAMA) {
      const t = pcm.subarray(i, i + MUESTRAS_TRAMA);
      const b = codificarAdpcm(t);
      expect(b.length).toBe(163);
      sumaSnr += relacionSenalRuido(t, decodificarAdpcm(b, MUESTRAS_TRAMA));
      tramas++;
    }
    expect(sumaSnr / tramas).toBeGreaterThan(20);
  });

  it("μ-law: ida y vuelta con SNR ≥ 30 dB y 1 byte por muestra", () => {
    const pcm = voz(MUESTRAS_TRAMA * 10);
    const b = codificarMuLaw(pcm);
    expect(b.length).toBe(pcm.length);
    expect(relacionSenalRuido(pcm, decodificarMuLaw(b))).toBeGreaterThan(30);
  });

  it("el silencio se queda en silencio y las tramas impares se decodifican enteras", () => {
    expect(Array.from(decodificarAdpcm(codificarAdpcm(new Int16Array(320)), 320)).every((x) => x === 0)).toBe(true);
    const impar = voz(101);
    expect(decodificarAdpcm(codificarAdpcm(impar), 101).length).toBe(101);
  });

  it("una trama perdida no estropea las siguientes (cada trama lleva su predictor)", () => {
    const pcm = voz(MUESTRAS_TRAMA * 6);
    const tramas = Array.from({ length: 6 }, (_, i) => codificarAdpcm(pcm.subarray(i * MUESTRAS_TRAMA, (i + 1) * MUESTRAS_TRAMA)));
    const sin = tramas.filter((_, i) => i !== 2);
    const ultima = decodificarAdpcm(sin[sin.length - 1], MUESTRAS_TRAMA);
    // Trama suelta y en frío (índice a 0): peor que la media de un segundo, pero sigue siendo voz clara.
    expect(relacionSenalRuido(pcm.subarray(5 * MUESTRAS_TRAMA), ultima)).toBeGreaterThan(15);
  });

  it("elige el mejor códec común; sin saludo, ADPCM", () => {
    expect(elegirCodecComun(["opus", "adpcm", "mulaw"], ["adpcm", "mulaw"])).toBe("adpcm");
    expect(elegirCodecComun(["opus", "adpcm", "mulaw"], ["opus", "adpcm"])).toBe("opus");
    expect(elegirCodecComun(["adpcm", "mulaw"], null)).toBe("adpcm");
    expect(elegirCodecComun(["adpcm", "mulaw"], ["mulaw"])).toBe("mulaw");
  });
});

describe("paquetes de voz", () => {
  it("armar y leer devuelve las mismas tramas, y el texto se reconoce como voz", () => {
    const tramas = [codificarAdpcm(voz(320)), codificarAdpcm(voz(320, 320)), codificarAdpcm(voz(320, 640))];
    const t = armarPaquete({ s: "ll-1", q: 40, ts: 1234, c: "adpcm", f: 20, tramas });
    expect(esTextoVoz(t)).toBe(true);
    const p = leerPaquete(t);
    expect(p).toMatchObject({ s: "ll-1", q: 40, ts: 1234, c: "adpcm", f: 20 });
    expect(p?.tramas.map((x) => Array.from(x))).toEqual(tramas.map((x) => Array.from(x)));
  });

  it("lo que llega del otro aparato se valida: basura, códec raro o trama cortada no pasan", () => {
    const ok = armarPaquete({ s: "ll-1", q: 1, ts: 0, c: "adpcm", f: 20, tramas: [new Uint8Array([1, 2, 3])] });
    expect(leerPaquete(ok.replace('"adpcm"', '"gsm"'))).toBeNull();
    expect(leerPaquete(ok.replace('"f":20', '"f":9999'))).toBeNull();
    expect(leerPaquete(ok.replace(/"d":"[^"]*"/, '"d":"@@@@"'))).toBeNull();
    expect(leerPaquete('{"t":"voz.p","s":"x"')).toBeNull();
    expect(leerPaquete("no es json")).toBeNull();
    // longitud de trama que se sale del cuerpo
    expect(leerPaquete(ok.replace(/"d":"[^"]*"/, '"d":"AP8="'))).toBeNull();
  });

  it("los controles se leen con campos acotados", () => {
    expect(leerControl(armarControl({ s: "ll-1", k: "hola", codecs: ["adpcm", "mulaw"] }))).toEqual({ s: "ll-1", k: "hola", codecs: ["adpcm", "mulaw"] });
    expect(leerControl('{"t":"voz.c","s":"ll-1","k":"explota"}')).toBeNull();
    expect(leerControl(armarControl({ s: "ll-1", k: "fin", m: "x".repeat(500) }))?.m?.length).toBe(120);
  });
});

describe("búfer de fluctuación", () => {
  const trama = (n: number) => new Int16Array(320).fill(1000 + n);

  it("reordena: lo que llega desordenado sale en orden", () => {
    const j = new BufferJitter();
    for (const q of [1, 0, 3, 2, 5, 4]) j.meter(q, trama(q));
    const salida: number[] = [];
    for (let i = 0; i < 6; i++) {
      const s = j.sacar();
      expect(s?.oculta).toBe(false);
      salida.push(s?.pcm[0] ?? -1);
    }
    expect(salida).toEqual([1000, 1001, 1002, 1003, 1004, 1005]);
    expect(j.estadisticas().reordenadas).toBeGreaterThan(0);
  });

  it("espera a llenar el objetivo (60 ms) antes de sonar", () => {
    const j = new BufferJitter();
    j.meter(0, trama(0));
    j.meter(1, trama(1));
    expect(j.sacar()).toBeNull();
    j.meter(2, trama(2));
    expect(j.sacar()?.oculta).toBe(false);
  });

  it("una pérdida se tapa con la anterior atenuada y se cuenta; no se pierde el hilo", () => {
    const j = new BufferJitter();
    for (const q of [0, 1, 3, 4, 5, 6]) j.meter(q, trama(q));
    const s = Array.from({ length: 6 }, () => j.sacar());
    expect(s.map((x) => x?.oculta)).toEqual([false, false, true, false, false, false]);
    expect(s[2]?.pcm[0]).toBeLessThan(1001);
    expect(s[2]?.pcm[0]).toBeGreaterThan(0);
    expect(s[3]?.pcm[0]).toBe(1003);
    expect(j.estadisticas().perdidas).toBe(1);
  });

  it("duplicadas y tardías se descartan", () => {
    const j = new BufferJitter();
    for (const q of [0, 1, 2]) j.meter(q, trama(q));
    j.meter(1, trama(1));
    j.sacar();
    j.sacar();
    j.meter(0, trama(0));
    const e = j.estadisticas();
    expect(e.duplicadas).toBe(1);
    expect(e.tardias).toBe(1);
  });

  it("un vaciado sube el objetivo (hasta 200 ms) y las repeticiones acaban en silencio", () => {
    const j = new BufferJitter();
    for (const q of [0, 1, 2]) j.meter(q, trama(q));
    for (let i = 0; i < 3; i++) j.sacar();
    const hueco = Array.from({ length: 5 }, () => j.sacar());
    expect(j.estadisticas().vaciados).toBe(1);
    expect(j.estadisticas().objetivoMs).toBe(80);
    // La primera trama del vacío se tapa con la anterior atenuada; después, silencio hasta volver a llenar.
    expect(hueco[0]?.oculta).toBe(true);
    expect(hueco[0]?.pcm[0]).toBeLessThan(1002);
    expect(hueco[1]).toBeNull();
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 3; i++) j.meter(100 + k * 10 + i, trama(i));
      for (let i = 0; i < 6; i++) j.sacar();
    }
    expect(j.estadisticas().objetivoMs).toBeLessThanOrEqual(200);
  });

  it("el retardo no crece sin tope: lo que pasa de 200 ms por delante se salta", () => {
    const j = new BufferJitter();
    for (let q = 0; q < 3; q++) j.meter(q, trama(q));
    j.sacar();
    for (let q = 3; q < 60; q++) j.meter(q, trama(q));
    expect(j.estadisticas().ocupadoMs).toBeLessThanOrEqual(200);
    expect(j.estadisticas().saltadas).toBeGreaterThan(0);
  });

  it("con pérdida simulada del 10 % y desorden, la salida mantiene el ritmo y la pérdida se mide", () => {
    const j = new BufferJitter();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const envio: number[] = [];
    for (let q = 0; q < 300; q++) if (rnd() > 0.1) envio.push(q);
    for (let i = 0; i + 1 < envio.length; i += 4) {
      // pequeño desorden dentro de cada grupo de 4
      const g = envio.slice(i, i + 4).reverse();
      g.forEach((q) => j.meter(q, trama(q)));
      for (let k = 0; k < 4; k++) j.sacar();
    }
    const e = j.estadisticas();
    expect(e.perdidas).toBeGreaterThan(10);
    expect(e.ocultadas).toBeGreaterThanOrEqual(e.perdidas);
    expect(j.perdidaPct()).toBeGreaterThan(5);
    expect(j.perdidaPct()).toBeLessThan(20);
  });
});

describe("cola de salida con contrapresión", () => {
  const t = (q: number) => ({ q, ts: q * 20, bytes: new Uint8Array([q]) });

  it("si el enlace no da abasto, cae lo MÁS VIEJO y el retraso queda acotado a 240 ms", () => {
    const c = new ColaSalidaVoz({ maxMs: 240, msTrama: 20 });
    let tiradas = 0;
    for (let q = 0; q < 100; q++) tiradas += c.encolar(t(q));
    expect(c.longitud).toBe(12);
    expect(tiradas).toBe(88);
    expect(c.sacar(1)[0].q).toBe(88);
  });

  it("agrupa solo tramas consecutivas en cada paquete", () => {
    const g = agruparConsecutivas([t(5), t(6), t(7), t(10), t(11), t(20)]);
    expect(g.map((x) => x.map((y) => y.q))).toEqual([[5, 6, 7], [10, 11], [20]]);
    expect(agruparConsecutivas(Array.from({ length: 20 }, (_, i) => t(i)), 8).map((x) => x.length)).toEqual([8, 8, 4]);
  });
});

describe("decisión de medio", () => {
  const base = { transcurridoMs: 0, webrtc: "conectando" as const, datos: "disponible" as const, hayRutaIp: null };
  it("sin ruta IP (solo Bluetooth) va directo al enlace de datos", () => {
    expect(decidirAccionMedio({ ...base, hayRutaIp: false })).toBe("usar-datos");
  });
  it("con ruta IP espera a ICE y a los 6 s pasa al enlace de datos sin colgar", () => {
    expect(decidirAccionMedio({ ...base, hayRutaIp: true, transcurridoMs: ESPERA_ICE_MS - 1 })).toBe("esperar");
    expect(decidirAccionMedio({ ...base, hayRutaIp: true, transcurridoMs: ESPERA_ICE_MS })).toBe("usar-datos");
  });
  it("si ICE falla pasa al instante; si luego conecta WebRTC, vuelve a él", () => {
    expect(decidirAccionMedio({ ...base, webrtc: "fallida", hayRutaIp: true })).toBe("usar-datos");
    expect(decidirAccionMedio({ ...base, webrtc: "conectado", datos: "activo", hayRutaIp: true })).toBe("volver-webrtc");
    expect(decidirAccionMedio({ ...base, webrtc: "conectado", datos: "sin-enlace" })).toBe("mantener");
    expect(decidirAccionMedio({ ...base, webrtc: "conectando", datos: "activo", transcurridoMs: 60_000 })).toBe("mantener");
  });
  it("nunca «conectando» para siempre: a los 15 s sin medio, falla; sin enlace de datos y ICE caído, falla ya", () => {
    expect(decidirAccionMedio({ ...base, datos: "sin-enlace", transcurridoMs: LIMITE_CONECTANDO_MS - 1 })).toBe("esperar");
    expect(decidirAccionMedio({ ...base, datos: "sin-enlace", transcurridoMs: LIMITE_CONECTANDO_MS })).toBe("fallar");
    expect(decidirAccionMedio({ ...base, datos: "sin-enlace", webrtc: "fallida", transcurridoMs: 100 })).toBe("fallar");
  });
});

describe("textos de la superficie", () => {
  it("medio y calidad", () => {
    expect(textoMedioVoz({ tipo: "ble", cifrada: true })).toBe("Voz por Bluetooth directo · cifrada");
    expect(textoMedioVoz({ tipo: "ble", cifrada: false })).toBe("Voz por Bluetooth directo · sin cifrar");
    expect(textoCalidadVoz({ rttMs: 360, perdidaPct: 2.4, codec: "adpcm", jitterMs: 60 })).toBe("latencia 180 ms · pérdida 2 % · ADPCM");
    expect(textoCalidadVoz({ rttMs: null, perdidaPct: 0, codec: "opus", jitterMs: 60 })).toBe("latencia sin medir · pérdida 0 % · Opus");
    expect(nivelCalidadVoz({ rttMs: 100, perdidaPct: 1, codec: "adpcm", jitterMs: 60 })).toBe("buena");
    expect(nivelCalidadVoz({ rttMs: 700, perdidaPct: 1, codec: "adpcm", jitterMs: 60 })).toBe("regular");
    expect(nivelCalidadVoz({ rttMs: 100, perdidaPct: 20, codec: "adpcm", jitterMs: 60 })).toBe("mala");
  });
});

/* ───────────────────────── sesión de punta a punta, con enlaces en memoria ───────────────────────── */

class RelojFalso implements RelojVoz {
  t = 0;
  private tareas: Array<{ fn: () => void; ms: number; prox: number; viva: boolean }> = [];
  ahora = () => this.t;
  cada(fn: () => void, ms: number) {
    const x = { fn, ms, prox: this.t + ms, viva: true };
    this.tareas.push(x);
    return () => {
      x.viva = false;
    };
  }
  avanzar(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      this.tareas = this.tareas.filter((x) => x.viva);
      const sig = this.tareas.reduce<(typeof this.tareas)[number] | undefined>((m, x) => (!m || x.prox < m.prox ? x : m), undefined);
      if (!sig || sig.prox > fin) break;
      this.t = sig.prox;
      sig.prox += sig.ms;
      sig.fn();
    }
    this.t = fin;
  }
}

interface Extremo {
  tr: TransporteVoz & { enviados: string[]; ocupadoAhora: boolean; recibir(t: string): void };
}

interface ExtremoMemoria extends TransporteVoz {
  enviados: string[];
  ocupadoAhora: boolean;
  otro: ExtremoMemoria | null;
  n: number;
  recibir(t: string): void;
}

function enlaceMemoria(reloj: RelojFalso, opts: { perdida?: (n: number) => boolean; retrasoMs?: number } = {}) {
  const mk = (): ExtremoMemoria => {
    const oyentes = new Set<(t: string) => void>();
    const e: ExtremoMemoria = {
      enviados: [] as string[],
      ocupadoAhora: false,
      otro: null,
      n: 0,
      enviar(t: string): "ok" | "descartado" | "cerrado" {
        e.enviados.push(t);
        const o = e.otro;
        if (o && !(opts.perdida?.(e.n++) ?? false)) {
          // entrega diferida con el reloj falso
          const cuando = reloj.t + (opts.retrasoMs ?? 0);
          const quitar = reloj.cada(() => {
            if (reloj.t >= cuando) {
              quitar();
              o.recibir(t);
            }
          }, 1);
        }
        return "ok";
      },
      ocupado: () => e.ocupadoAhora,
      alRecibir(cb: (t: string) => void) {
        oyentes.add(cb);
        return () => oyentes.delete(cb);
      },
      abierto: () => true,
      info: () => ({ tipo: "ble", cifrada: true }),
      recibir(t: string) {
        for (const f of Array.from(oyentes)) f(t);
      },
    };
    return e;
  };
  const a = mk();
  const b = mk();
  a.otro = b;
  b.otro = a;
  return [a, b] as const;
}

function audioFalso() {
  const reproducido: Int16Array[] = [];
  let alTrama: (p: Int16Array) => void = () => undefined;
  const audio: AudioVoz = {
    iniciar: async (cb) => {
      alTrama = cb;
      return true;
    },
    reproducir: (p) => reproducido.push(p),
    detener: () => undefined,
  };
  return { audio, reproducido, hablar: (p: Int16Array) => alTrama(p) };
}

describe("sesión de voz por enlace de datos (dos extremos en memoria)", () => {
  async function par(opts: Parameters<typeof enlaceMemoria>[1] = {}) {
    const reloj = new RelojFalso();
    const [ea, eb] = enlaceMemoria(reloj, opts);
    const aa = audioFalso();
    const ab = audioFalso();
    const sa = new SesionVozDatos({ idLlamada: "ll-1", transporte: ea, audio: aa.audio, codecs: fabricaCodecsSimples(), reloj });
    const sb = new SesionVozDatos({ idLlamada: "ll-1", transporte: eb, audio: ab.audio, codecs: fabricaCodecsSimples(), reloj });
    expect(await sa.iniciar()).toBe(true);
    expect(await sb.iniciar()).toBe(true);
    return { reloj, ea, eb, aa, ab, sa, sb };
  }

  /** Habla `ms` de voz desde `desde`, trama a trama, avanzando el reloj. */
  function hablar(x: Awaited<ReturnType<typeof par>>, desde: "a" | "b", ms: number) {
    const fuente = desde === "a" ? x.aa : x.ab;
    for (let i = 0; i < ms / 20; i++) {
      fuente.hablar(voz(MUESTRAS_TRAMA, i * MUESTRAS_TRAMA));
      x.reloj.avanzar(20);
    }
  }

  it("la voz de A llega a B, se oye y la SNR de punta a punta es buena", async () => {
    const x = await par();
    hablar(x, "a", 1000);
    x.reloj.avanzar(200);
    expect(x.sb.estado().recibiendo).toBe(true);
    expect(x.sb.estado().codecRx).toBe("adpcm");
    const oidas = x.ab.reproducido.filter((p) => p.some((v) => v !== 0));
    expect(oidas.length).toBeGreaterThan(35);
    expect(x.sb.estado().perdidaPct).toBeLessThan(5);
    // Cuantas más tramas reales, mejor: la primera trama oída coincide con la enviada (SNR alta).
    const esperada = voz(MUESTRAS_TRAMA, 0);
    expect(relacionSenalRuido(esperada, oidas[0])).toBeGreaterThan(18);
  });

  it("los dos hablan a la vez y miden la latencia con ping/pong", async () => {
    const x = await par({ retrasoMs: 80 });
    hablar(x, "a", 400);
    hablar(x, "b", 400);
    x.reloj.avanzar(4000);
    expect(x.sa.estado().recibiendo).toBe(true);
    expect(x.sb.estado().recibiendo).toBe(true);
    expect(x.sa.estado().rttMs).toBeGreaterThanOrEqual(150);
    expect(x.sa.estado().rttMs).toBeLessThan(400);
  });

  it("negocia el códec con el saludo y manda paquetes de varias tramas (≥ 2 por escritura)", async () => {
    const x = await par();
    hablar(x, "a", 400);
    const paquetes = x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.p"')).map(leerPaquete);
    expect(paquetes.length).toBeGreaterThan(0);
    expect(paquetes.every((p) => p && p.tramas.length >= 1 && p.tramas.length <= 8)).toBe(true);
    expect(Math.max(...paquetes.map((p) => p!.tramas.length))).toBeGreaterThanOrEqual(2);
    expect(x.ea.enviados.some((t) => t.includes('"k":"hola"'))).toBe(true);
  });

  it("contrapresión: con el enlace ocupado la voz NO se acumula; al liberarse, sale solo lo reciente", async () => {
    const x = await par();
    x.ea.ocupadoAhora = true;
    hablar(x, "a", 3000); // 3 s hablando con el enlace atascado
    const antes = x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.p"')).length;
    expect(antes).toBe(0);
    expect(x.sa.estado().descartadas).toBeGreaterThan(100);
    x.ea.ocupadoAhora = false;
    x.reloj.avanzar(200);
    const tramasEnviadas = x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.p"')).flatMap((t) => leerPaquete(t)?.tramas ?? []);
    // Como mucho 240 ms de audio (12 tramas) más lo que se generó mientras vaciaba.
    expect(tramasEnviadas.length).toBeLessThanOrEqual(15);
    expect(tramasEnviadas.length).toBeGreaterThanOrEqual(10);
  });

  it("con un 10 % de paquetes perdidos la conversación sigue y se mide la pérdida", async () => {
    let n = 0;
    const x = await par({ perdida: () => ++n % 10 === 0 });
    hablar(x, "a", 3000);
    x.reloj.avanzar(300);
    expect(x.sb.estado().recibiendo).toBe(true);
    expect(x.ab.reproducido.length).toBeGreaterThan(100);
  });

  it("silenciar corta el envío; detener avisa con «fin» y no vuelve a sonar", async () => {
    const x = await par();
    x.sa.silenciar(true);
    hablar(x, "a", 400);
    expect(x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.p"')).length).toBe(0);
    x.sa.silenciar(false);
    hablar(x, "a", 200);
    expect(x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.p"')).length).toBeGreaterThan(0);
    x.sa.detener("colgada");
    expect(x.ea.enviados.some((t) => t.includes('"k":"fin"'))).toBe(true);
    x.reloj.avanzar(5);
    expect(x.sb.estado().fin).toBe("colgada");
    const n = x.ea.enviados.length;
    hablar(x, "a", 200);
    expect(x.ea.enviados.length).toBe(n);
  });

  it("ignora paquetes de otra llamada", async () => {
    const x = await par();
    x.eb.recibir(armarPaquete({ s: "otra", q: 0, ts: 0, c: "adpcm", f: 20, tramas: [codificarAdpcm(voz(320))] }));
    expect(x.sb.estado().recibidas).toBe(0);
  });
});
