/** Pruebas del detector PURO de interrupción: muestras sintéticas, sin micro/red/procesos. */
import { describe, it, expect } from "vitest";
import {
  decidirInterrupcion,
  estadoInterrupcionNuevo,
  nivelDbTramo,
  enVentanaEco,
  MINIMO_MS_INTERRUPCION,
} from "@/lib/aurora/interrumpir-por-voz";
import { registrarDicho } from "@/lib/aurora/anti-bucle-voz";

/** Tramo sintético: muestras constantes con esa amplitud (RMS = amplitud). */
const tramo = (amplitud: number): Float32Array => new Float32Array(64).fill(amplitud);
const VOZ = tramo(0.05); // ≈ -26 dBFS: hablar cerca (sobre el umbral de -30)
const MEDIO = tramo(0.0251); // ≈ -32 dBFS: bajo el umbral, sobre umbral - margen
const SIL = tramo(0); // mudo: -100 dBFS

/** Llamada del detector con tramos de 40 ms de paso. */
const paso = (
  frame: Float32Array,
  estadoAnterior: ReturnType<typeof estadoInterrupcionNuevo>,
  t: number,
  opciones: Partial<Parameters<typeof decidirInterrupcion>[2]> = {},
): ReturnType<typeof decidirInterrupcion> =>
  decidirInterrupcion(frame, estadoAnterior, { ahora: t, minimoMs: MINIMO_MS_INTERRUPCION, ...opciones });

describe("interrupción por voz · detector de energía", () => {
  it("el nivel dB y la ventana de eco son coherentes", () => {
    expect(nivelDbTramo(SIL)).toBe(-100);
    expect(nivelDbTramo(VOZ)).toBeGreaterThanOrEqual(-30);
    expect(nivelDbTramo(MEDIO)).toBeLessThan(-30);
    // Escritorio: 1200 ms de ventana anti-eco; móvil: 2200 ms.
    expect(enVentanaEco(1000, 2199, {})).toBe(true);
    expect(enVentanaEco(1000, 2200, {})).toBe(false);
    expect(enVentanaEco(1000, 2199, { movil: true })).toBe(true);
    expect(enVentanaEco(1000, 3200, { movil: true })).toBe(false);
  });

  it("el silencio nunca abre el tramo ni interrumpe", () => {
    let estado = estadoInterrupcionNuevo();
    for (let t = 0; t <= 1000; t += 40) {
      const v = paso(SIL, estado, t);
      expect(v.interrumpir).toBe(false);
      expect(v.hablaronMs).toBe(0);
      estado = v.estado;
    }
  });

  it("habla sostenida de 250 ms corta UNA sola vez", () => {
    let estado = estadoInterrupcionNuevo();
    let cortes = 0;
    for (let t = 0; t <= 400; t += 40) {
      const v = paso(VOZ, estado, t);
      if (t === 240) expect(v.hablaronMs).toBe(240); // aún bajo el mínimo
      if (v.interrumpir) cortes++;
      estado = v.estado;
    }
    expect(cortes).toBe(1);
  });

  it("un ruido intermedio no recorta el tramo (histéresis)", () => {
    let estado = estadoInterrupcionNuevo();
    let cortes = 0;
    // Voz, un cruce por ruido intermedio y voz otra vez: la puerta sigue
    // abierta y la cuenta llega a 250 ms → corta.
    for (let t = 0; t <= 320; t += 40) {
      const v = paso(t === 200 ? MEDIO : VOZ, estado, t);
      if (v.interrumpir) cortes++;
      estado = v.estado;
    }
    expect(cortes).toBe(1);
  });

  it("ráfagas cortas < 250 ms nunca cortan", () => {
    let estado = estadoInterrupcionNuevo();
    // Dos ráfagas de 80 ms separadas por silencio real: el silencio cierra el
    // tramo y borra la cuenta; nunca se juntan 250 ms.
    for (const [desde, hasta, frame] of [[0, 80, VOZ], [120, 200, SIL], [240, 320, VOZ]] as Array<[number, number, Float32Array]>) {
      for (let t = desde; t <= hasta; t += 40) {
        const v = paso(frame, estado, t);
        expect(v.interrumpir).toBe(false);
        estado = v.estado;
      }
    }
    expect(estado.msVoz).toBeLessThan(MINIMO_MS_INTERRUPCION);
  });

  it("dentro de la ventana de eco el nivel no abre el tramo", () => {
    // Astraura empezó a hablar en t=1000: hasta 2200 (ventana de escritorio)
    // la voz que entra no cuenta aunque sea fuerte.
    let estado = estadoInterrupcionNuevo();
    let cortes = 0;
    for (let t = 1_000; t < 2_200; t += 40) {
      const v = paso(VOZ, estado, t, { inicioHabla: 1_000 });
      if (v.interrumpir) cortes++;
      estado = v.estado;
    }
    expect(cortes).toBe(0);
    expect(estado.msVoz).toBe(0);
    // Pasada la ventana, la voz ya cuenta y corta al llegar a 250 ms.
    for (let t = 2_200; t <= 3_000; t += 40) {
      const v = paso(VOZ, estado, t, { inicioHabla: 1_000 });
      cortes = v.interrumpir ? cortes + 1 : cortes;
      estado = v.estado;
    }
    expect(cortes).toBe(1);
  });

  it("un parcial que ya es eco propio no corta", () => {
    const t = 5_000;
    registrarDicho("buenas noches estrellas brillantes", t - 500);
    const v = decidirInterrupcion(VOZ, estadoInterrupcionNuevo(), {
      ahora: t,
      minimoMs: MINIMO_MS_INTERRUPCION,
      textoOido: "Buenas noches estrellas brillantes…",
    });
    expect(v.interrumpir).toBe(false);
    expect(v.estado.msVoz).toBe(0);
  });
});