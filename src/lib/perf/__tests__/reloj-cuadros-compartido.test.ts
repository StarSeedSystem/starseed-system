/**
 * SEN1126B · el reloj compartido: varios bucles, UN solo requestAnimationFrame por cuadro,
 * dibujos puntuales agrupados, tope del modo y parada con la pestaña oculta. Reloj falso.
 */
import { describe, expect, it } from "vitest";
import { crearRelojCuadrosCompartido, type DepsRelojCuadros } from "../reloj-cuadros-compartido";

/** Reloj falso de 60 Hz: primero vencen las esperas y después corren los cuadros pedidos. */
function banco(fps = 0, visible = true) {
  let t = 0;
  let n = 0;
  let peticiones = 0;
  let esVisible = visible;
  const rafs = new Map<number, FrameRequestCallback>();
  const esperas = new Map<number, { f: () => void; en: number }>();
  const oyentesVisibilidad = new Set<() => void>();
  const deps: DepsRelojCuadros = {
    raf: (cb) => {
      peticiones += 1;
      const id = ++n;
      rafs.set(id, cb);
      return id;
    },
    caf: (id) => { rafs.delete(id); },
    poner: (f, ms) => {
      const id = ++n;
      esperas.set(id, { f, en: t + ms });
      return id;
    },
    quitar: (id) => { esperas.delete(id); },
    ahora: () => t,
    fps: () => fps,
    visible: () => esVisible,
    alCambiarVisibilidad: (cb) => {
      oyentesVisibilidad.add(cb);
      return () => { oyentesVisibilidad.delete(cb); };
    },
  };
  const avanzar = (ms: number) => {
    const fin = t + ms;
    while (t < fin - 1e-6) {
      t += 1000 / 60;
      for (const [id, e] of [...esperas]) {
        if (e.en <= t + 1e-6) {
          esperas.delete(id);
          e.f();
        }
      }
      for (const [id, cb] of [...rafs]) {
        rafs.delete(id);
        cb(t);
      }
    }
  };
  const visibilidad = (v: boolean) => {
    esVisible = v;
    for (const cb of [...oyentesVisibilidad]) cb();
  };
  return {
    deps,
    avanzar,
    visibilidad,
    peticiones: () => peticiones,
    pendientes: () => rafs.size + esperas.size,
  };
}

describe("SEN1126B · un solo reloj de cuadros", () => {
  it("tres oyentes comparten UN requestAnimationFrame por cuadro, no uno cada uno", () => {
    const b = banco();
    const reloj = crearRelojCuadrosCompartido(b.deps);
    let a = 0;
    let c = 0;
    let d = 0;
    reloj.suscribir(() => { a += 1; });
    reloj.suscribir(() => { c += 1; });
    reloj.suscribir(() => { d += 1; });
    b.avanzar(1000);
    expect([a, c, d]).toEqual([60, 60, 60]);
    // 60 cuadros ejecutados + el que queda pedido para el siguiente refresco.
    expect(b.peticiones()).toBe(61);
    expect(reloj.cuadros()).toBe(60);
    expect(reloj.oyentes()).toBe(3);
  });

  it("veinte dibujos puntuales se agrupan en un solo cuadro y después no queda bucle", () => {
    const b = banco();
    const reloj = crearRelojCuadrosCompartido(b.deps);
    const vistos: number[] = [];
    for (let i = 0; i < 20; i++) reloj.unaVez(() => vistos.push(i));
    b.avanzar(20);
    expect(vistos).toEqual([...Array(20).keys()]);
    expect(b.peticiones()).toBe(1);
    expect(reloj.cuadros()).toBe(1);
    b.avanzar(500);
    expect(b.peticiones()).toBe(1);
    expect(b.pendientes()).toBe(0);
  });

  it("con la pestaña oculta no pide ni un cuadro; al volver arranca y al ocultarse otra vez para", () => {
    const b = banco(0, false);
    const reloj = crearRelojCuadrosCompartido(b.deps);
    let n = 0;
    reloj.suscribir(() => { n += 1; });
    b.avanzar(500);
    expect(b.peticiones()).toBe(0);
    expect(n).toBe(0);
    b.visibilidad(true);
    b.avanzar(100);
    expect(b.peticiones()).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
    b.visibilidad(false);
    const antes = b.peticiones();
    b.avanzar(500);
    expect(b.peticiones()).toBe(antes);
  });

  it("en modo eficiente el reloj baja a 10 cuadros por segundo", () => {
    const b = banco(10);
    const reloj = crearRelojCuadrosCompartido(b.deps);
    let n = 0;
    reloj.suscribir(() => { n += 1; });
    b.avanzar(3000);
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(31);
    expect(b.peticiones()).toBeGreaterThanOrEqual(n);
    expect(b.peticiones()).toBeLessThanOrEqual(n + 1);
  });

  it("un dibujo puntual viaja en el cuadro que ya tenía pedido el bucle continuo", () => {
    const b = banco();
    const reloj = crearRelojCuadrosCompartido(b.deps);
    let n = 0;
    reloj.suscribir(() => { n += 1; });
    b.avanzar(100);
    const antes = b.peticiones();
    let u = 0;
    reloj.unaVez(() => { u += 1; });
    b.avanzar(1000 / 60);
    expect(u).toBe(1);
    expect(b.peticiones()).toBe(antes + 1);
  });

  it("al soltar el último oyente no queda nada pendiente ni se piden más cuadros", () => {
    const b = banco();
    const reloj = crearRelojCuadrosCompartido(b.deps);
    const soltar = reloj.suscribir(() => undefined);
    b.avanzar(100);
    soltar();
    expect(reloj.oyentes()).toBe(0);
    expect(b.pendientes()).toBe(0);
    const antes = b.peticiones();
    b.avanzar(500);
    expect(b.peticiones()).toBe(antes);
  });

  it("un oyente roto no impide que corran los demás", () => {
    const b = banco();
    const reloj = crearRelojCuadrosCompartido(b.deps);
    let n = 0;
    reloj.suscribir(() => { throw new Error("roto"); });
    reloj.suscribir(() => { n += 1; });
    b.avanzar(100);
    expect(n).toBe(6);
  });
});
