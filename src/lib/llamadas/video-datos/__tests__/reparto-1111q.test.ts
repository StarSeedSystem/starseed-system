/**
 * LLA1111Q · el reparto de voz y vídeo sobre lo que el enlace de verdad dice. Prueba 37 (Mac ↔ tableta por Bluetooth):
 * la radio medía 192–380 kb/s con sus mensajes de 4–6 KB y el modelo de la llamada leía 8–35 kb/s, porque deducía la
 * duración de cada escritura de lo que bajaba la cola y ahí dentro iba la espera por fichas del emisor (7,2 escrituras/s).
 * La voz se quedaba en 6 kb/s y el vídeo en pausa.
 */
import { describe, expect, it } from "vitest";
import {
  ajustarModelo,
  ControlReparto,
  cicloEfectivoMs,
  esperaVozMs,
  kbpsMaxConCiclo,
  MedidorEnlace,
  muestraDeTransporte,
  RETRASO_ALTO_MS,
  RETRASO_BAJO_MS,
  retrasoAltoMs,
  retrasoBajoMs,
  SUELO_KBPS,
  ventanaBytes,
  ventanaParaTasa,
  VENTANA_MAX_BYTES,
  type EscrituraCarril,
  type ModeloEnlace,
  type ResumenEnlace,
} from "../reparto";
import { MAX_COLA_VOZ_BLE } from "@/lib/malla/bluetooth-directo-motor";
import { VENTANA_VIDEO_EN_CARRIL_VOZ } from "@/lib/llamadas/voz-datos/transporte";

/**
 * Un carril como el Bluetooth de la prueba 37 visto desde la web: escrituras que se juntan (todo lo que espera sale en
 * una), una ficha por escritura a 7,2/s, acuse de 50 ms y 40 B/ms de serialización. Devuelve lo que vería un medidor
 * cada 20 ms: la cola (hasta el acuse), lo que entró y las escrituras medidas por el emisor.
 */
function carrilConFichas(paquetes: Array<{ t: number; bytes: number }>, finMs: number) {
  const ficha = 1000 / 7.2;
  const r = 50;
  const c = 40;
  const pend = [...paquetes].sort((a, b) => a.t - b.t);
  const escrituras: Array<EscrituraCarril & { inicio: number }> = [];
  let libre = 0;
  let proximaFicha = 0;
  let i = 0;
  while (i < pend.length) {
    const inicio = Math.max(pend[i].t, libre, proximaFicha);
    let bytes = 0;
    while (i < pend.length && pend[i].t <= inicio) bytes += pend[i++].bytes;
    const ms = r + bytes / c;
    escrituras.push({ inicio, fin: inicio + ms, ms, bytes });
    libre = inicio + ms;
    proximaFicha = inicio + ficha;
  }
  const muestras: Array<{ t: number; cola: number; entrados: number; escrituras: EscrituraCarril[] }> = [];
  for (let t = 0; t <= finMs; t += 20) {
    const entrados = paquetes.filter((p) => p.t <= t).reduce((a, p) => a + p.bytes, 0);
    const acusado = escrituras.filter((e) => e.fin <= t).reduce((a, e) => a + e.bytes, 0);
    muestras.push({ t, cola: entrados - acusado, entrados, escrituras: escrituras.filter((e) => e.fin <= t).slice(-32).map(({ fin, ms, bytes }) => ({ fin, ms, bytes })) });
  }
  return { muestras, escrituras };
}

/** Voz de 6 kb/s en paquetes de 180 ms (≈ 280 B de texto) y un control cada 400 ms: lo que mandaba la Mac. */
function vozDeLaPrueba37(finMs: number) {
  const p: Array<{ t: number; bytes: number }> = [];
  for (let t = 5; t < finMs; t += 180) p.push({ t, bytes: 280 });
  for (let t = 90; t < finMs; t += 400) p.push({ t, bytes: 120 });
  return p;
}

describe("lo que se lee del carril (prueba 37)", () => {
  it("deducido de la cola, la espera por fichas parece poca capacidad; con las escrituras medidas, no", () => {
    const { muestras } = carrilConFichas(vozDeLaPrueba37(12_000), 12_000);
    const deCola = new MedidorEnlace(261 / 8);
    const deEscrituras = new MedidorEnlace(261 / 8);
    let rCola: ResumenEnlace | null = null;
    let rEsc: ResumenEnlace | null = null;
    for (const m of muestras) {
      deCola.muestra(m.t, { cola: m.cola, entrados: m.entrados });
      deEscrituras.muestra(m.t, { cola: m.cola, entrados: m.entrados, escrituras: m.escrituras, escriturasPorS: 7.2, nativoKbps: 261 });
      if (m.t % 1000 === 0 && m.t > 0) {
        rCola = deCola.cerrarVentana(m.t);
        rEsc = deEscrituras.cerrarVentana(m.t);
      }
    }
    // Lo de antes: el acuse supuesto de 42 ms y lo que tarda «de cola a cola» (fichas incluidas) → decenas de kb/s.
    expect(rCola!.modelo).not.toBeNull();
    expect(Math.round(rCola!.modelo!.bytesPorMs * 8)).toBeLessThan(60);
    // Ahora: el acuse y la capacidad de verdad (sin ruido, la recta es exacta); el ciclo del emisor va en el modelo.
    const m = rEsc!.modelo!;
    expect(m.cicloMinMs).toBe(139);
    expect(m.rMs).toBeGreaterThanOrEqual(49);
    expect(m.rMs).toBeLessThanOrEqual(51);
    expect(m.bytesPorMs).toBeGreaterThan(39);
    expect(m.bytesPorMs).toBeLessThan(41);
    expect(rEsc!.maxKbps!).toBeGreaterThan(190);
    expect(rEsc!.nativoKbps).toBe(261);
    // La ventana llena el ciclo del emisor (no los 300 B de la prueba 37).
    expect(ventanaBytes(m, 261)).toBe(VENTANA_MAX_BYTES);
  });

  it("con vídeo en el carril (tamaños variados) ajusta R y C de las duraciones medidas", () => {
    const pares = [300, 2200, 900, 1800, 400, 1500, 700, 2000, 1200, 500].map((b) => ({ bytes: b, ms: 50 + b / 40 }));
    const m = ajustarModelo(pares, 261 / 8, true, true)!;
    expect(m.fuente).toBe("ajuste");
    expect(m.rMs).toBeGreaterThanOrEqual(48);
    expect(m.rMs).toBeLessThanOrEqual(52);
    expect(m.bytesPorMs).toBeGreaterThan(38);
    expect(m.bytesPorMs).toBeLessThan(42);
  });

  it("con acuses que varían como en el aparato (25–115 ms) y solo voz, la pendiente es ruido: C de la radio, R de la mediana", () => {
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    const acuse = () => Math.min(115, 25 - 30 * Math.log(1 - 0.999 * azar()));
    const voz = Array.from({ length: 40 }, () => {
      const bytes = 250 + Math.round(azar() * 200);
      return { bytes, ms: acuse() + bytes / 40 };
    });
    const m = ajustarModelo(voz, 261 / 8, true, true)!;
    expect(m.fuente).toBe("supuesto");
    expect(m.bytesPorMs).toBe(32.6);
    expect(m.rMs).toBeGreaterThan(30);
    expect(m.rMs).toBeLessThan(80);
    expect(kbpsMaxConCiclo({ ...m, cicloMinMs: 139 })).toBeGreaterThan(120);
    // Con vídeo (300–2000 B) los tamaños ya separan más que el ruido: sea ajuste o supuesto, la capacidad es la de verdad.
    const conVideo = Array.from({ length: 40 }, () => {
      const bytes = 300 + Math.round(azar() * 1700);
      return { bytes, ms: acuse() + bytes / 40 };
    });
    const m2 = ajustarModelo(conVideo, 261 / 8, true, true)!;
    expect(m2.bytesPorMs).toBeGreaterThan(25);
    expect(m2.bytesPorMs).toBeLessThan(60);
  });

  it("con duraciones medidas y solo voz no hay acuse fijo: sale de la mediana con la C de la radio", () => {
    // Acuses de 100 ms: con los 42 ms supuestos de antes se habría leído una C diminuta.
    const pares = Array.from({ length: 10 }, (_, k) => ({ bytes: 280 + (k % 3) * 20, ms: 100 + (280 + (k % 3) * 20) / 32 }));
    const m = ajustarModelo(pares, 32, true, true)!;
    expect(m.fuente).toBe("supuesto");
    expect(m.bytesPorMs).toBe(32);
    expect(m.rMs).toBeGreaterThanOrEqual(99);
    expect(m.rMs).toBeLessThanOrEqual(101);
  });

  it("muestraDeTransporte lee todo lo que el enlace sabe y nunca lanza", () => {
    const m = muestraDeTransporte({
      colaVozBytes: () => 10,
      bytesEntrados: () => 99,
      escrituras: () => [{ fin: 5, ms: 40, bytes: 300 }],
      escriturasPorS: () => 7.2,
      capacidadKbps: () => {
        throw new Error("sin app");
      },
    });
    expect(m).toEqual({ cola: 10, entrados: 99, escrituras: [{ fin: 5, ms: 40, bytes: 300 }], escriturasPorS: 7.2, nativoKbps: null });
    expect(muestraDeTransporte({}).escrituras).toBeUndefined();
  });

  it("cada escritura medida cuenta una vez y el p90 de la espera ignora una escritura suelta lenta", () => {
    const med = new MedidorEnlace(20);
    const e: EscrituraCarril[] = [];
    let entrados = 0;
    // Diez escrituras de 400 B, cada una esperó ≈ 60 ms salvo una de 300 ms.
    for (let k = 0; k < 10; k++) {
      const t0 = k * 400;
      entrados += 400;
      const espera = k === 4 ? 300 : 60;
      med.muestra(t0, { cola: 400, entrados, escrituras: e.slice(), escriturasPorS: 7.2 });
      med.muestra(t0 + espera - 1, { cola: 400, entrados, escrituras: e.slice(), escriturasPorS: 7.2 });
      e.push({ fin: t0 + espera, ms: espera, bytes: 400 });
      med.muestra(t0 + espera, { cola: 0, entrados, escrituras: e.slice(), escriturasPorS: 7.2 });
    }
    const r = med.cerrarVentana(4000);
    expect(med.paresRecientes().length).toBe(10);
    expect(r.retrasoMaxMs).toBeGreaterThanOrEqual(299);
    expect(r.esperaP90Ms!).toBeLessThan(100);
    expect(r.escriturasPorS).toBe(2.5);
    expect(r.bytesPorEscritura).toBe(400);
  });
});

describe("ciclo del emisor: capacidad, ventana y umbrales", () => {
  const conCiclo: ModeloEnlace = { rMs: 50, bytesPorMs: 32, fuente: "supuesto", cicloMinMs: 139 };
  const sinCiclo: ModeloEnlace = { rMs: 42, bytesPorMs: 20, fuente: "ajuste" };

  it("sin tope de escrituras todo queda como en LLA1111B", () => {
    expect(cicloEfectivoMs(sinCiclo)).toBe(100);
    expect(retrasoAltoMs(sinCiclo)).toBe(RETRASO_ALTO_MS);
    expect(retrasoBajoMs(sinCiclo)).toBe(RETRASO_BAJO_MS);
    expect(kbpsMaxConCiclo(sinCiclo, 100)).toBe(93);
  });

  it("con 7,2 escrituras/s el ciclo es 139 ms: más bytes por escritura, umbrales a dos ciclos", () => {
    expect(cicloEfectivoMs(conCiclo)).toBe(139);
    expect(kbpsMaxConCiclo(conCiclo, 100)).toBe(Math.round(8 * 32 * (1 - 50 / 139)));
    expect(retrasoAltoMs(conCiclo)).toBe(278);
    expect(retrasoBajoMs(conCiclo)).toBe(222);
  });

  it("la ventana sigue a la tasa del vídeo (dos ciclos), sin pasar de lo que cabe en una escritura", () => {
    expect(ventanaParaTasa(conCiclo, 261, 40)).toBe(Math.round(((2 * 40) / 8) * 139));
    expect(ventanaParaTasa(conCiclo, 261, 400)).toBe(VENTANA_MAX_BYTES);
    expect(ventanaParaTasa(conCiclo, 261, 0)).toBe(300);
  });

  it("dos ventanas de vídeo y un paquete de voz caben en la cola de voz del Bluetooth sin que tire nada", () => {
    expect(2 * VENTANA_MAX_BYTES + 1536).toBeLessThanOrEqual(MAX_COLA_VOZ_BLE);
    expect(VENTANA_VIDEO_EN_CARRIL_VOZ).toBe(2 * VENTANA_MAX_BYTES);
  });

  it("con tope de escrituras manda el p90 de la espera; sin él, el máximo", () => {
    const base = { maxKbps: 150, entregadoKbps: 80, vozKbps: 36, videoKbps: 40, ocupacion: 0.6 };
    expect(esperaVozMs({ ...base, modelo: conCiclo, retrasoMaxMs: 400, esperaP90Ms: 180 })).toBe(180);
    expect(esperaVozMs({ ...base, modelo: sinCiclo, retrasoMaxMs: 400, esperaP90Ms: 180 })).toBe(400);
  });
});

describe("control del vídeo con lo medido", () => {
  const conCiclo: ModeloEnlace = { rMs: 50, bytesPorMs: 32, fuente: "supuesto", cicloMinMs: 139 };
  const r = (o: Partial<ResumenEnlace>): ResumenEnlace => ({ modelo: conCiclo, maxKbps: kbpsMaxConCiclo(conCiclo), entregadoKbps: 60, vozKbps: 36, videoKbps: 30, retrasoMaxMs: 200, esperaP90Ms: 150, ocupacion: 0.7, ...o });

  it("una escritura lenta suelta no baja el vídeo; la voz esperando de verdad, sí", () => {
    const c = new ControlReparto(150, 40);
    expect(c.paso(1000, { enlace: r({ retrasoMaxMs: 330, esperaP90Ms: 160 }), limitado: true, perdidaReceptor: null })?.motivo).toBe("hay-sitio");
    const antes = c.objetivoKbps;
    const cambio = c.paso(2000, { enlace: r({ retrasoMaxMs: 330, esperaP90Ms: 300 }), limitado: true, perdidaReceptor: null });
    expect(cambio?.motivo).toBe("retraso-voz");
    expect(c.objetivoKbps).toBeLessThan(antes);
    // Un máximo por encima del atasco de la escalera de la voz (2,5 ciclos) también baja, aunque el p90 sea bajo.
    const c2 = new ControlReparto(150, 40);
    expect(c2.paso(1000, { enlace: r({ retrasoMaxMs: 360, esperaP90Ms: 120 }), limitado: true, perdidaReceptor: null })?.motivo).toBe("retraso-voz");
  });

  it("en pausa vuelve SOLO, sin que nadie hable, cuando el enlace medido deja sitio", () => {
    const c = new ControlReparto(150, 30);
    let t = 0;
    // Atasco: la voz espera mucho; el vídeo baja hasta pausarse.
    while (c.estado === "activo" && t < 30_000) {
      t += 1000;
      c.paso(t, { enlace: r({ maxKbps: 20, retrasoMaxMs: 500, esperaP90Ms: 400 }), limitado: false, perdidaReceptor: null });
    }
    expect(c.estado).toBe("pausa");
    // Micros en silencio: solo controles en el carril (voz 1 kb/s), escrituras rápidas: el modelo medido deja sitio.
    let vuelve = 0;
    for (let k = 0; k < 15 && c.estado === "pausa"; k++) {
      t += 1000;
      c.paso(t, { enlace: r({ vozKbps: 1, videoKbps: 0, retrasoMaxMs: 60, esperaP90Ms: 50 }), limitado: false, perdidaReceptor: null });
      vuelve = k + 1;
    }
    expect(c.estado).toBe("activo");
    expect(vuelve).toBeLessThanOrEqual(10);
    // Vuelve al suelo (una prueba) y, si la voz sigue holgada, sube con lo medido.
    expect(c.objetivoKbps).toBe(SUELO_KBPS);
    for (let k = 0; k < 6; k++) c.paso((t += 1000), { enlace: r({ vozKbps: 30, videoKbps: 12, retrasoMaxMs: 150, esperaP90Ms: 120 }), limitado: true, perdidaReceptor: null });
    expect(c.objetivoKbps).toBeGreaterThan(2 * SUELO_KBPS);
  });

  it("una prueba que atasca a la voz vuelve a la pausa al momento, con la calma doblada", () => {
    const c = new ControlReparto(150, 30);
    let t = 0;
    while (c.estado === "activo") c.paso((t += 1000), { enlace: r({ maxKbps: 20, retrasoMaxMs: 500, esperaP90Ms: 400 }), limitado: false, perdidaReceptor: null });
    const calma = c.calmaPedidaS;
    while (c.estado === "pausa") c.paso((t += 1000), { enlace: r({ vozKbps: 1, retrasoMaxMs: 60, esperaP90Ms: 50 }), limitado: false, perdidaReceptor: null });
    const cambio = c.paso((t += 1000), { enlace: r({ retrasoMaxMs: 400, esperaP90Ms: 320 }), limitado: true, perdidaReceptor: null });
    expect(cambio).toEqual({ estado: "pausa", objetivoKbps: 0, motivo: "prueba-fallida" });
    expect(c.calmaPedidaS).toBe(2 * calma);
  });
});
