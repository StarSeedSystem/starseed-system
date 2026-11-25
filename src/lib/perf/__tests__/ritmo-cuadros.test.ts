/** DIR1125E · el ritmo común de los bucles de animación: sin tope es rAF tal cual; con tope no pasa de él ni va a cámara lenta. */
import { describe, expect, it } from "vitest";
import { PASOS_MAX, crearRitmoCuadros, type DepsRitmo } from "../ritmo-cuadros";

/** Un reloj con pantalla de 60 Hz: en cada refresco vencen primero las esperas y luego corren los cuadros pedidos. */
function banco(fpsInicial: number) {
  let t = 0;
  let fps = fpsInicial;
  let n = 0;
  const rafs: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const esperas: Array<{ id: number; f: () => void; en: number }> = [];
  const deps: DepsRitmo = {
    raf: (cb) => {
      n += 1;
      rafs.push({ id: n, cb });
      return n;
    },
    caf: (id) => {
      const i = rafs.findIndex((r) => r.id === id);
      if (i >= 0) rafs.splice(i, 1);
    },
    poner: (f, ms) => {
      n += 1;
      esperas.push({ id: n, f, en: t + ms });
      return n;
    },
    quitar: (id) => {
      const i = esperas.findIndex((e) => e.id === id);
      if (i >= 0) esperas.splice(i, 1);
    },
    ahora: () => t,
    fps: () => fps,
  };
  const avanzar = (ms: number) => {
    const fin = t + ms;
    while (t < fin - 1e-6) {
      t += 1000 / 60;
      for (const e of esperas.filter((x) => x.en <= t + 1e-6)) {
        esperas.splice(esperas.indexOf(e), 1);
        e.f();
      }
      for (const r of rafs.splice(0)) r.cb(t);
    }
  };
  return { deps, avanzar, saltar: (ms: number) => { t += ms; }, fijarFps: (x: number) => { fps = x; }, pendientes: () => rafs.length + esperas.length };
}

function bucle(b: ReturnType<typeof banco>) {
  const r = crearRitmoCuadros(b.deps);
  const pasos: number[] = [];
  const cuadro = () => {
    pasos.push(r.pasos());
    r.pedir(cuadro);
  };
  r.pedir(cuadro);
  return { r, pasos };
}

const suma = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

describe("DIR1125E · ritmo de cuadros según el modo de rendimiento", () => {
  it("sin tope (alto): exactamente un cuadro por refresco y un paso por cuadro, como requestAnimationFrame", () => {
    const b = banco(0);
    const { pasos } = bucle(b);
    b.avanzar(1000);
    expect(pasos.length).toBe(60);
    expect(pasos.every((p) => p === 1)).toBe(true);
  });

  it("eficiente (10): 10 cuadros por segundo, y cada uno vale por 6 pasos (la animación no va a cámara lenta)", () => {
    const b = banco(10);
    const { pasos } = bucle(b);
    b.avanzar(3000);
    expect(pasos.length).toBeGreaterThanOrEqual(29);
    expect(pasos.length).toBeLessThanOrEqual(31);
    expect(pasos.slice(1).every((p) => p === 6)).toBe(true);
    // 3 s de animación = 180 pasos de 1/60 s, con 10 cuadros/s o con 60.
    expect(suma(pasos)).toBeGreaterThanOrEqual(170);
    expect(suma(pasos)).toBeLessThanOrEqual(182);
  });

  it("eco (30): 30 cuadros por segundo, dos pasos por cuadro", () => {
    const b = banco(30);
    const { pasos } = bucle(b);
    b.avanzar(1000);
    expect(pasos.length).toBeGreaterThanOrEqual(29);
    expect(pasos.length).toBeLessThanOrEqual(31);
    expect(pasos.slice(1).every((p) => p === 2)).toBe(true);
  });

  it("un tope mayor que la pantalla no inventa cuadros: uno por refresco", () => {
    const b = banco(240);
    const { pasos } = bucle(b);
    b.avanzar(1000);
    expect(pasos.length).toBe(60);
    expect(pasos.every((p) => p === 1)).toBe(true);
  });

  it("el cambio de modo se nota en el cuadro siguiente, en los dos sentidos", () => {
    const b = banco(0);
    const { pasos } = bucle(b);
    b.avanzar(500);
    expect(pasos.length).toBe(30);
    b.fijarFps(10);
    b.avanzar(1000);
    expect(pasos.length).toBeGreaterThanOrEqual(39);
    expect(pasos.length).toBeLessThanOrEqual(41);
    b.fijarFps(0);
    const antes = pasos.length;
    b.avanzar(500);
    expect(pasos.length - antes).toBeGreaterThanOrEqual(29);
    expect(pasos.at(-1)).toBe(1);
  });

  it("cancelar no deja nada pendiente (ni cuadro ni espera) y se puede volver a empezar", () => {
    for (const fps of [0, 10]) {
      const b = banco(fps);
      const { r, pasos } = bucle(b);
      b.avanzar(250);
      r.cancelar();
      expect(b.pendientes()).toBe(0);
      const antes = pasos.length;
      b.avanzar(500);
      expect(pasos.length).toBe(antes);
      expect(r.pasos()).toBe(1);
      const otra: number[] = [];
      r.pedir(() => otra.push(r.pasos()));
      b.avanzar(50);
      expect(otra).toEqual([1]);
    }
  });

  it("tras una pausa larga no da un salto: como mucho PASOS_MAX pasos de golpe", () => {
    const b = banco(10);
    const r = crearRitmoCuadros(b.deps);
    const pasos: number[] = [];
    r.pedir(() => pasos.push(r.pasos()));
    b.avanzar(20);
    r.pedir(() => pasos.push(r.pasos()));
    b.saltar(5000); // la pestaña estuvo oculta: nadie corrió
    b.avanzar(200);
    expect(pasos).toEqual([1, PASOS_MAX]);
    expect(PASOS_MAX).toBe(12);
  });

  it("CAP1125D · un nodo sin pantalla (tope 1) pinta un cuadro por segundo, no sesenta", () => {
    const b = banco(1);
    const { pasos } = bucle(b);
    b.avanzar(3000);
    expect(pasos.length).toBeGreaterThanOrEqual(2);
    expect(pasos.length).toBeLessThanOrEqual(4);
  });
});
