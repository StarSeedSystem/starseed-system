import { describe, expect, it } from "vitest";
import { decidirReintentoIce, esperaReintentoIce, TOPE_REINTENTOS_ICE_RUTA, type EntradaReintentoIce } from "@/lib/llamadas/carriles";
import { MedidorEnlace, PARADA_MAX_MS, PARADA_MIN_MS, umbralParadaMs } from "@/lib/llamadas/video-datos/reparto";
import { ControlNivelVoz, NIVELES_OPUS } from "@/lib/llamadas/voz-datos/niveles";
import { BufferJitter } from "@/lib/llamadas/voz-datos/jitter";
import { rutaLlamadaNeurona } from "@/lib/llamadas/ruta-llamada-neurona";

/*
 * LLA1112A · prueba 39 (Mac ↔ tableta, 2026-11-12): (A) la voz de la Mac en 6 kb/s con su enlace leído a 160 kb/s y la de la
 * tableta llegando a ráfagas; (B) apagar el Wi-Fi de la tableta colgaba; (C) la Mac reintentaba WebRTC cada 15–35 s por una
 * ruta IP que no llevaba nada.
 */

const base: EntradaReintentoIce = { ahora: 100_000, ip: true, antes: true, conTrafico: true, fuente: "local:abc", fuenteAnterior: "local:abc", conexion: "fallida", intentos: 1, ultimoIntento: 0 };

describe("C · WebRTC no persigue una ruta que no lleva nada", () => {
  it("escala más larga: 3, 6, 12, 30, 60 y 120 s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(esperaReintentoIce)).toEqual([3_000, 6_000, 12_000, 30_000, 60_000, 120_000, 120_000]);
  });

  it("sin pruebas de tráfico no se reintenta (prueba 39: ocho intentos por llamada solo por Bluetooth)", () => {
    expect(decidirReintentoIce({ ...base, conTrafico: false })).toEqual({ reintentar: false, motivo: "sin-trafico" });
    expect(decidirReintentoIce({ ...base, conTrafico: false, antes: false })).toEqual({ reintentar: false, motivo: "sin-trafico" });
  });

  it("con tráfico: ruta nueva al momento, luego según la escala, y como mucho el tope por la misma fuente", () => {
    expect(decidirReintentoIce({ ...base, antes: false, intentos: 3 })).toEqual({ reintentar: true, n: 1, motivo: "ruta-nueva" });
    expect(decidirReintentoIce({ ...base, ahora: 5_000, intentos: 1 })).toEqual({ reintentar: false, motivo: "espera" });
    expect(decidirReintentoIce({ ...base, ahora: 6_000, intentos: 1 })).toEqual({ reintentar: true, n: 2, motivo: "vence" });
    expect(decidirReintentoIce({ ...base, intentos: TOPE_REINTENTOS_ICE_RUTA })).toEqual({ reintentar: false, motivo: "tope" });
    // Otra fuente (otro enlace local): cuenta nueva.
    expect(decidirReintentoIce({ ...base, intentos: TOPE_REINTENTOS_ICE_RUTA, fuente: "local:def" })).toEqual({ reintentar: true, n: 1, motivo: "ruta-nueva" });
  });

  it("sin saber si lleva tráfico (otro motor, el banco) se comporta como antes", () => {
    expect(decidirReintentoIce({ ...base, conTrafico: null, fuente: null, fuenteAnterior: null, antes: false, intentos: 0 })).toMatchObject({ reintentar: true });
    expect(decidirReintentoIce({ ...base, conexion: "conectado" })).toEqual({ reintentar: false, motivo: "conectado" });
  });

  it("en ocho minutos con una ruta que nunca deja pasar ICE: 4 intentos (antes, cada 15 s: 32)", () => {
    let intentos = 0;
    let ultimo = -Infinity;
    let fuenteAnterior: string | null = null;
    let n = 0;
    for (let t = 0; t <= 8 * 60_000; t += 500) {
      const d = decidirReintentoIce({ ahora: t, ip: true, antes: t === 0 ? false : true, conTrafico: true, fuente: "nativo", fuenteAnterior, conexion: t === 0 ? "nuevo" : "fallida", intentos: n, ultimoIntento: ultimo });
      if (d.reintentar) {
        intentos++;
        n = d.n;
        ultimo = t;
        fuenteAnterior = "nativo";
      }
    }
    expect(intentos).toBe(TOPE_REINTENTOS_ICE_RUTA);
  });
});

describe("A · una parada del enlace no es un atasco", () => {
  it("umbral de parada: 2 escrituras del modelo, nunca menos de PARADA_MIN_MS ni de 1,5 ciclos del emisor", () => {
    expect(umbralParadaMs({ rMs: 40, bytesPorMs: 40, fuente: "ajuste" }, 800, 139)).toBe(PARADA_MIN_MS);
    expect(umbralParadaMs({ rMs: 100, bytesPorMs: 20, fuente: "ajuste" }, 4000, 139)).toBe(600);
    expect(umbralParadaMs(null, 0, 0)).toBe(PARADA_MIN_MS);
  });

  /** Un carril de voz: entra un paquete cada 160 ms y se acusa a los 60 ms, salvo durante la parada. */
  function correr(parada: { desde: number; ms: number } | null) {
    const m = new MedidorEnlace(20, { aisladas: false });
    let entrados = 0;
    let acusado = 0;
    const pendientes: Array<{ t: number; b: number }> = [];
    const resumenes = [];
    for (let t = 0; t <= 6000; t += 20) {
      if (t % 160 === 0) {
        entrados += 300;
        pendientes.push({ t, b: 300 });
      }
      const parado = parada && t >= parada.desde && t < parada.desde + parada.ms;
      while (!parado && pendientes.length && t - pendientes[0].t >= 60) acusado += pendientes.shift()!.b;
      m.muestra(t, { cola: entrados - acusado, entrados });
      if (t > 0 && t % 1000 === 0) resumenes.push(m.cerrarVentana(t));
    }
    return resumenes;
  }

  it("una parada de 400 ms: se cuenta como parada y el máximo no pasa del umbral (antes, toda la parada)", () => {
    const sin = correr(null);
    const con = correr({ desde: 3100, ms: 400 });
    expect(sin.reduce((a, r) => a + (r.paradas ?? 0), 0)).toBe(0);
    expect(con.reduce((a, r) => a + (r.paradas ?? 0), 0)).toBe(1);
    const peor = (l: typeof sin) => Math.max(...l.map((r) => r.retrasoMaxMs));
    expect(peor(sin)).toBeLessThanOrEqual(80);
    expect(peor(con)).toBeLessThanOrEqual(PARADA_MIN_MS);
  });

  it("sin acuses más de PARADA_MAX_MS ya no es parada: el atasco se ve como antes", () => {
    const con = correr({ desde: 3100, ms: PARADA_MAX_MS + 600 });
    expect(Math.max(...con.map((r) => r.retrasoMaxMs))).toBeGreaterThan(PARADA_MAX_MS);
  });
});

describe("A · las dos escaleras de la voz ya no se empujan al suelo", () => {
  const modelo = { rMs: 30, bytesPorMs: 20, fuente: "ajuste" as const, cicloMinMs: 139 };
  const tarde = { perd: 0, tarde: 57.5, corte: false, edadMs: 500 };

  it("el otro dice «tarde» pero mi voz apenas espera y el escalón cabe: no bajo (prueba 39: la Mac a 6 kb/s con 160 leídos)", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    c.fijarCiclo(139);
    for (let s = 1; s <= 10; s++) expect(c.paso(s * 1000, { modelo, retrasoMaxMs: 80, esperaP90Ms: 72, descartes: 0, informe: tarde })).toBeNull();
    expect(c.indice).toBe(0);
  });

  it("el otro dice «tarde» y MI carril va atascado: sí bajo (como antes)", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    c.fijarCiclo(139);
    expect(c.paso(1000, { modelo, retrasoMaxMs: 300, esperaP90Ms: 260, descartes: 0, informe: tarde })?.motivo).toBe("tarde-rx");
  });

  it("descartes durante una parada con el escalón cabiendo: no bajo; sin parada: bajo", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    c.fijarCiclo(139);
    expect(c.paso(1000, { modelo, retrasoMaxMs: 100, esperaP90Ms: 90, descartes: 3, informe: null, paradas: 1 })).toBeNull();
    expect(c.paso(2000, { modelo, retrasoMaxMs: 100, esperaP90Ms: 90, descartes: 3, informe: null, paradas: 0 })?.motivo).toBe("descartes");
  });

  it("una bajada rápida que resulta ser una parada se deshace; sin parada confirmada, no", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    c.fijarCiclo(139);
    expect(c.bajadaRapida(5000, 700, 139)?.hasta).toBe(2);
    expect(c.paso(5500, { modelo, retrasoMaxMs: 80, esperaP90Ms: 60, descartes: 0, informe: null, paradas: 1 })).toEqual({ desde: 2, hasta: 0, motivo: "parada" });
    const d = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    d.fijarCiclo(139);
    d.bajadaRapida(5000, 700, 139);
    expect(d.paso(5500, { modelo, retrasoMaxMs: 80, esperaP90Ms: 60, descartes: 0, informe: null, paradas: 0 })).toBeNull();
    expect(d.indice).toBe(2);
  });

  it("con el vídeo en pausa la voz cede a Opus 12 kb/s y no sube de ahí; sin ceder, vuelve a poder subir", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0);
    expect(c.fijarTecho(2, 1000)).toEqual({ desde: 0, hasta: 2, motivo: "cede-video" });
    const holgado = { modelo: { rMs: 20, bytesPorMs: 60, fuente: "ajuste" as const }, retrasoMaxMs: 50, descartes: 0, informe: null };
    for (let s = 2; s <= 40; s++) c.paso(s * 1000, holgado);
    expect(c.indice).toBe(2);
    c.fijarTecho(0, 41_000);
    for (let s = 42; s <= 60; s++) c.paso(s * 1000, holgado);
    expect(c.indice).toBe(0);
  });
});

describe("A · el búfer sigue a cómo llega el audio", () => {
  it("paquetes de 160 ms que llegan a ráfagas tras paradas de 400 ms: el objetivo cubre la ráfaga sin esperar diez vaciados", () => {
    const j = new BufferJitter({ msTrama: 20, maxMs: 640 });
    j.fijarMinimo(180);
    let t = 0;
    for (let k = 0; k < 60; k++) {
      // Cada 6 paquetes, uno llega 400 ms tarde (con los que se juntaron detrás).
      const retraso = k % 6 === 5 ? 400 : 0;
      j.llegada(t + retraso, k * 8);
      t += 160;
    }
    expect(j.estadisticas().objetivoMs).toBeGreaterThanOrEqual(400);
    expect(j.estadisticas().objetivoMs).toBeLessThanOrEqual(640);
  });

  it("un carril regular no sube el objetivo por encima de lo de siempre", () => {
    const j = new BufferJitter({ msTrama: 20, maxMs: 640 });
    j.fijarMinimo(180);
    for (let k = 0; k < 60; k++) j.llegada(k * 160 + (k % 2) * 30, k * 8);
    expect(j.estadisticas().objetivoMs).toBe(180);
  });
});

describe("B · con Bluetooth además del enlace local, la llamada va por el motor con carriles", () => {
  it("enlace local + Bluetooth → motor de llamadas; solo enlace local → llamada directa", () => {
    expect(rutaLlamadaNeurona({ via: "enlace-local", permiteLocal: true, enlacesSinIp: 1 })).toMatchObject({ motor: "sistema-llamadas", cambiada: true });
    expect(rutaLlamadaNeurona({ via: "enlace-local", permiteLocal: true, enlacesSinIp: 0 })).toMatchObject({ motor: "directa", cambiada: false });
    expect(rutaLlamadaNeurona({ via: "sistema-llamadas", permiteLocal: true, enlacesSinIp: 1 })).toMatchObject({ motor: "sistema-llamadas", cambiada: false });
    expect(rutaLlamadaNeurona({ via: null, permiteLocal: true, enlacesSinIp: 1 })).toMatchObject({ motor: null });
  });
});
