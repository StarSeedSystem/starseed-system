/**
 * LLA1111B · voz y vídeo en el mismo carril estrecho: modelo del enlace, medidor, presupuesto, control con pausa e
 * histéresis, coste de cada escalón y la cubeta. Lo que vio la prueba 35: con el micro abierto el vídeo no salía nunca
 * por Bluetooth (la voz siempre tenía algo en su carril) y solo se movía con el micro silenciado.
 */
import { describe, expect, it } from "vitest";
import {
  ajustarModelo,
  BAJO_SUELO_PARA_PAUSAR_S,
  CALMA_REANUDAR_S,
  ControlReparto,
  CosteEscalon,
  Cubeta,
  kbpsMaxConCiclo,
  MedidorEnlace,
  mtuParaVentana,
  CABECERA_FRAGMENTO_BYTES,
  presupuestoVideo,
  RETRASO_ALTO_MS,
  SUBIR_ESCALON_CADA_MS,
  SUELO_KBPS,
  ventanaBytes,
  VENTANA_MAX_BYTES,
  VENTANA_MIN_BYTES,
  type ResumenEnlace,
} from "../reparto";
import { PERFILES_VIDEO_REPARTO } from "../tipos";
import { textoVideoLigero } from "@/lib/llamadas/superficie/adaptador-motor";
import { TEXTO_VIDEO_EN_PAUSA } from "../sesion-video";
import { armarControlVideo, leerControlVideo } from "../paquete";
import { vozOcupada } from "@/lib/llamadas/voz-datos/transporte";

const enlace = (o: Partial<ResumenEnlace> = {}): ResumenEnlace => ({
  modelo: { rMs: 42, bytesPorMs: 20, fuente: "ajuste" },
  maxKbps: 93,
  entregadoKbps: 80,
  vozKbps: 48,
  videoKbps: 30,
  retrasoMaxMs: 150,
  ocupacion: 0.9,
  ...o,
});

describe("modelo del enlace (parada y espera)", () => {
  it("separa el acuse fijo de la capacidad con escrituras de tamaños distintos", () => {
    // Bluetooth de la prueba 35: ≈ 160 kb/s (20 B/ms) y 42 ms de acuse.
    const pares = [300, 600, 900, 1200, 400, 1100, 800, 500].map((b) => ({ bytes: b, ms: 42 + b / 20 }));
    const m = ajustarModelo(pares)!;
    expect(m.fuente).toBe("ajuste");
    expect(m.rMs).toBeGreaterThanOrEqual(40);
    expect(m.rMs).toBeLessThanOrEqual(44);
    expect(m.bytesPorMs).toBeGreaterThan(18);
    expect(m.bytesPorMs).toBeLessThan(22);
    // Con escrituras de 100 ms cabe ≈ 160 × (1 − 0,42) ≈ 93 kb/s entre voz y vídeo.
    expect(kbpsMaxConCiclo(m, 100)).toBeGreaterThan(85);
    expect(kbpsMaxConCiclo(m, 100)).toBeLessThan(100);
  });

  it("con solo voz (tamaños iguales) supone la capacidad y saca el acuse de la mediana", () => {
    const pares = Array.from({ length: 10 }, () => ({ bytes: 375, ms: 42 + 375 / 20 }));
    const m = ajustarModelo(pares, 20)!;
    expect(m.fuente).toBe("supuesto");
    expect(Math.round(m.rMs)).toBe(42);
  });

  it("sin pares suficientes no hay modelo", () => {
    expect(ajustarModelo([{ bytes: 100, ms: 50 }])).toBeNull();
  });

  it("la ventana es lo que cabe en una escritura del ciclo, con topes; el fragmento cabe en ella", () => {
    expect(ventanaBytes({ rMs: 42, bytesPorMs: 20, fuente: "ajuste" })).toBe(1160);
    expect(ventanaBytes({ rMs: 90, bytesPorMs: 5, fuente: "ajuste" })).toBe(VENTANA_MIN_BYTES);
    expect(ventanaBytes({ rMs: 0, bytesPorMs: 100, fuente: "ajuste" })).toBe(VENTANA_MAX_BYTES);
    const v = 1160;
    const crudo = mtuParaVentana(v);
    expect(Math.ceil((crudo * 4) / 3) + CABECERA_FRAGMENTO_BYTES).toBeLessThanOrEqual(v);
  });
});

describe("medidor del carril", () => {
  it("mide lo acusado, separa la voz del vídeo y aprende el modelo de las escrituras", () => {
    const m = new MedidorEnlace(20);
    let t = 0;
    let entrados = 0;
    let cola = 0;
    // Escrituras de 42 ms + bytes/20 con el carril siempre ocupado: 375 B de voz y, cada dos, 800 B de vídeo.
    for (let k = 0; k < 30; k++) {
      const bytes = 375 + (k % 2 ? 800 : 0);
      entrados += bytes;
      cola += bytes;
      if (k % 2) m.videoMetido(800);
      m.muestra(t, { cola, entrados });
      const dur = 42 + bytes / 20;
      // A mitad de la escritura entra la voz siguiente (el carril nunca se vacía).
      m.muestra(t + dur / 2, { cola: cola + 1, entrados: entrados + 1 });
      entrados += 1;
      cola += 1;
      t += dur;
      cola -= bytes;
      m.muestra(t, { cola, entrados });
    }
    const r = m.cerrarVentana(t);
    expect(r.modelo).not.toBeNull();
    expect(r.modelo!.rMs).toBeGreaterThan(35);
    expect(r.modelo!.rMs).toBeLessThan(50);
    expect(r.videoKbps).toBeGreaterThan(0);
    expect(r.vozKbps).toBeGreaterThan(0);
    expect(r.ocupacion).toBeGreaterThan(0.9);
    expect(r.retrasoMaxMs).toBeGreaterThan(0);
  });

  it("un carril sin cola medible (WebRTC) no da modelo ni techo: el vídeo no se limita", () => {
    const m = new MedidorEnlace();
    for (let t = 0; t < 2000; t += 20) m.muestra(t, { cola: 0, entrados: t * 10 });
    const r = m.cerrarVentana(2000);
    expect(r.modelo).toBeNull();
    expect(r.maxKbps).toBeNull();
    expect(presupuestoVideo(r)).toBeNull();
  });

  it("el presupuesto del vídeo es lo que cabe menos la voz, con margen", () => {
    expect(presupuestoVideo(enlace({ maxKbps: 93, vozKbps: 48 }))).toBe(41);
    expect(presupuestoVideo(enlace({ maxKbps: 40, vozKbps: 48 }))).toBe(0);
  });
});

describe("control del reparto: la voz primero, el vídeo con lo que sobra", () => {
  it("baja al presupuesto, baja más si la voz espera, y sube cuando hay sitio", () => {
    const c = new ControlReparto(115, 60);
    let t = 0;
    const paso = (e: Partial<ResumenEnlace>, limitado = true) => c.paso((t += 1000), { enlace: enlace(e), limitado, perdidaReceptor: null });
    expect(paso({ maxKbps: 93, vozKbps: 48 })?.motivo).toBe("capacidad");
    expect(c.objetivoKbps).toBe(41);
    expect(paso({ retrasoMaxMs: RETRASO_ALTO_MS + 50 })?.motivo).toBe("retraso-voz");
    expect(c.objetivoKbps).toBeLessThan(41);
    const bajo = c.objetivoKbps;
    expect(paso({ retrasoMaxMs: 120 })?.motivo).toBe("hay-sitio");
    expect(c.objetivoKbps).toBeGreaterThan(bajo);
    // Sin ganas de más (no limitado) no sube.
    const antes = c.objetivoKbps;
    expect(paso({ retrasoMaxMs: 120 }, false)).toBeNull();
    expect(c.objetivoKbps).toBe(antes);
  });

  it("la pérdida que informa el receptor baja la tasa", () => {
    const c = new ControlReparto(115, 40);
    const r = c.paso(1000, { enlace: enlace({ maxKbps: 200, vozKbps: 48 }), limitado: false, perdidaReceptor: 0.4 });
    expect(r?.motivo).toBe("perdida-receptor");
    expect(c.objetivoKbps).toBe(28);
  });

  it("pausa cuando no cabe ni el suelo unos segundos, y reanuda sola con calma (histéresis, sin parpadeo)", () => {
    const c = new ControlReparto(115, 30);
    let t = 0;
    const estrecho = enlace({ maxKbps: 50, vozKbps: 48, retrasoMaxMs: 300 });
    const holgado = enlace({ maxKbps: 93, vozKbps: 48, retrasoMaxMs: 100 });
    const paso = (e: ResumenEnlace) => c.paso((t += 1000), { enlace: e, limitado: true, perdidaReceptor: null });
    for (let i = 0; i < BAJO_SUELO_PARA_PAUSAR_S - 1; i++) paso(estrecho);
    expect(c.estado).toBe("activo");
    expect(c.objetivoKbps).toBe(SUELO_KBPS);
    expect(paso(estrecho)?.motivo).toBe("suelo");
    expect(c.estado).toBe("pausa");
    expect(c.objetivoKbps).toBe(0);
    // Un segundo holgado suelto no reanuda.
    paso(holgado);
    paso(estrecho);
    expect(c.estado).toBe("pausa");
    for (let i = 0; i < CALMA_REANUDAR_S - 1; i++) paso(holgado);
    expect(c.estado).toBe("pausa");
    expect(paso(holgado)?.motivo).toBe("sitio-de-nuevo");
    expect(c.estado).toBe("activo");
    // LLA1111Q: vuelve al suelo, como prueba (antes 2–3 veces el suelo); de ahí sube con lo medido.
    expect(c.objetivoKbps).toBe(SUELO_KBPS);
    // Vuelve a faltar enseguida: la próxima reanudación pide el doble de calma.
    for (let i = 0; i < BAJO_SUELO_PARA_PAUSAR_S; i++) paso(estrecho);
    expect(c.estado).toBe("pausa");
    expect(c.calmaPedidaS).toBe(2 * CALMA_REANUDAR_S);
    for (let i = 0; i < CALMA_REANUDAR_S; i++) paso(holgado);
    expect(c.estado).toBe("pausa");
    for (let i = 0; i < CALMA_REANUDAR_S; i++) paso(holgado);
    expect(c.estado).toBe("activo");
  });
});

describe("coste de cada escalón", () => {
  it("con un códec que gasta el doble de lo configurado elige un escalón más bajo; bajar es inmediato", () => {
    const k = new CosteEscalon();
    for (let i = 0; i < 8; i++) k.medir(36, { kbps: 18 }, 4);
    expect(k.factor).toBeGreaterThan(1.8);
    const i = k.escalon(40, PERFILES_VIDEO_REPARTO, 6, 0);
    expect(PERFILES_VIDEO_REPARTO[i].kbps * k.factor).toBeLessThanOrEqual(40);
    expect(i).toBeLessThan(6);
  });

  it("baja los fps antes que el tamaño en la parte de abajo y sube con holgura y sin prisa", () => {
    const k = new CosteEscalon();
    for (let i = 0; i < 8; i++) k.medir(10, { kbps: 10 }, 2);
    expect(k.factor).toBeLessThan(1.1);
    const abajo = PERFILES_VIDEO_REPARTO.slice(0, 6);
    expect(abajo.every((p) => p.w === 160 && p.h === 120)).toBe(true);
    expect(abajo.map((p) => p.fps)).toEqual([1, 2, 3, 4, 5, 6]);
    const a = k.escalon(23, PERFILES_VIDEO_REPARTO, 1, 10_000);
    expect(a).toBeGreaterThan(1);
    // Recién subido: no vuelve a subir antes de `SUBIR_ESCALON_CADA_MS`.
    expect(k.escalon(200, PERFILES_VIDEO_REPARTO, a, 10_000 + SUBIR_ESCALON_CADA_MS - 1)).toBe(a);
    expect(k.escalon(200, PERFILES_VIDEO_REPARTO, a, 10_000 + SUBIR_ESCALON_CADA_MS)).toBeGreaterThan(a);
    // Bajar, al momento.
    expect(k.escalon(5, PERFILES_VIDEO_REPARTO, 5, 10_001)).toBe(0);
  });
});

describe("cubeta de fichas: un clave grande sale a la tasa objetivo, nunca de golpe", () => {
  it("deja salir a la tasa y no acumula más que su profundidad", () => {
    const c = new Cubeta();
    c.recargar(0, 40);
    c.recargar(10_000, 40);
    let sale = 0;
    while (c.puede()) {
      c.gastar(500);
      sale += 500;
    }
    expect(sale).toBeLessThanOrEqual(2500);
    expect(c.puede()).toBe(false);
    // 100 ms a 40 kb/s: ≈ 500 B más, no otro golpe de 2 KiB.
    c.recargar(10_100, 40);
    let otra = 0;
    while (c.puede()) {
      c.gastar(100);
      otra += 100;
    }
    expect(otra).toBeLessThanOrEqual(600);
  });
});

describe("lo que ve la persona y lo que viaja", () => {
  it("la línea de estado dice lo medido o el aviso de pausa tal cual", () => {
    expect(textoVideoLigero({ enviando: true, recibiendo: true, calidadTexto: "160×120 · 4 fps · 30 kbps · VP8" })).toBe(" · vídeo ligero 160×120 · 4 fps · 30 kbps · VP8");
    expect(textoVideoLigero({ enviando: true, recibiendo: false, calidadTexto: TEXTO_VIDEO_EN_PAUSA })).toBe(` · ${TEXTO_VIDEO_EN_PAUSA}`);
    expect(textoVideoLigero(null)).toBe("");
    expect(TEXTO_VIDEO_EN_PAUSA).toBe("Vídeo en pausa: la señal solo alcanza para la voz");
  });

  it("los controles nuevos (pausa, sigue, informe) van y vuelven; uno desconocido se ignora", () => {
    const p = leerControlVideo(armarControlVideo({ s: "l1", k: "pausa", m: "suelo" }));
    expect(p).toEqual({ s: "l1", k: "pausa", m: "suelo" });
    expect(leerControlVideo(armarControlVideo({ s: "l1", k: "sigue" }))?.k).toBe("sigue");
    expect(leerControlVideo(armarControlVideo({ s: "l1", k: "rep", vis: 7, per: 1 }))).toEqual({ s: "l1", k: "rep", vis: 7, per: 1 });
    expect(leerControlVideo('{"t":"voz.w","s":"l1","k":"otro"}')).toBeNull();
  });

  it("la voz no se retiene por los bytes de vídeo que caben en la ventana", () => {
    expect(vozOcupada(3000, 2048, 1000, 1500)).toBe(false);
    expect(vozOcupada(3000, 2048, undefined, 1500)).toBe(true);
    expect(vozOcupada(3000, 2048, 1000, 4000)).toBe(true);
    // LLA1111Q: la ventana del vídeo en el carril de la voz son ahora dos ventanas de 2304 B (4608 B).
    expect(vozOcupada(4000, 2048, 1000, 1500)).toBe(false);
    expect(vozOcupada(7000, 2048, 1000, 1500)).toBe(true);
  });
});
