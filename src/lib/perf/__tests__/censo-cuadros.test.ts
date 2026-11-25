/** DIR1125F · el censo de cuadros: cuenta sin cambiar nada, dice de dónde salen las llamadas y solo habla si hay un bucle de verdad. */
import { describe, expect, it, vi } from "vitest";
import { INFORMES_POR_HORA, instalarCenso, rutaCorta, sitioDePila, type EntornoCenso, type RelojCenso } from "../censo-cuadros";

const BASE = "http://127.0.0.1:47610/_next/static/chunks/";
/** Los marcos del propio censo en la pila, como los ve WebKit: [pila, apuntar, envoltorio] y luego quien llamó. */
const pilaDe = (envoltorio: string, ...quien: string[]) =>
  [`pila@${BASE}censo-1a2b.js:1:10`, `apuntar@${BASE}censo-1a2b.js:1:20`, `${envoltorio}@${BASE}censo-1a2b.js:1:30`, ...quien].join("\n");
const ORBE = `draw@${BASE}65241-8c4921f31d23e24c.js:1:253720`;
const REACT = `h@${BASE}4bd1b696-2135e4d8b8354323.js:1:8822`;
const MAPA = `tick@${BASE}99729.48a99318dd70192b.js:1:7222`;

function banco() {
  const rafs: FrameRequestCallback[] = [];
  const timeouts: unknown[][] = [];
  const intervalos: Array<{ f: (...a: unknown[]) => unknown; ms: number; id: number }> = [];
  const parados: unknown[] = [];
  const obj: RelojCenso = {
    requestAnimationFrame: (cb) => {
      rafs.push(cb);
      return rafs.length;
    },
    setTimeout: (...a) => {
      timeouts.push(a);
      return 1000 + timeouts.length;
    },
    setInterval: (...a) => {
      const id = 2001 + intervalos.length;
      intervalos.push({ f: a[0], ms: a[1], id });
      return id;
    },
    clearInterval: (id) => {
      parados.push(id);
    },
  };
  const originales = { raf: obj.requestAnimationFrame, timeout: obj.setTimeout, intervalo: obj.setInterval };
  const lineas: string[] = [];
  const estado = { pila: pilaDe("raf1", ORBE, REACT), romper: false };
  const e: EntornoCenso = {
    obj,
    pila: () => {
      if (estado.romper) throw new Error("sin pila");
      return estado.pila;
    },
    anotar: (l) => void lineas.push(l),
    contexto: () => ({ ruta: "/red/senales", modo: "eficiente", tope: 10, visible: true, foco: false }),
  };
  const quitar = instalarCenso(e);
  const informar = () => intervalos.find((i) => i.ms === 60_000)!.f();
  return { obj, e, rafs, timeouts, intervalos, parados, originales, lineas, estado, quitar, informar };
}

const nada = () => undefined;

describe("DIR1125F · de la pila al sitio", () => {
  it("WebKit (`fn@url:l:c`): quien llamó y su llamador, sin los marcos del censo", () => {
    expect(sitioDePila(pilaDe("raf1", ORBE, REACT), 3)).toBe("draw 65241-8c4921f31d23e24c.js:1:253720 < h 4bd1b696-2135e4d8b8354323.js:1:8822");
    expect(sitioDePila(pilaDe("raf1", MAPA), 3)).toBe("tick 99729.48a99318dd70192b.js:1:7222");
  });
  it("V8 (`at fn (url:l:c)`), con consulta en la URL y marcos sin nombre", () => {
    const v8 = [
      "Error",
      "    at Object.pila (https://x.example/_next/static/chunks/censo-1.js:1:10)",
      "    at apuntar (https://x.example/_next/static/chunks/censo-1.js:1:20)",
      "    at raf1 (https://x.example/_next/static/chunks/censo-1.js:1:30)",
      "    at draw (https://x.example/_next/static/chunks/65241-8c49.js?dpl=abc:1:253720)",
      "    at https://x.example/_next/static/chunks/main-app-46.js:1:99",
    ].join("\n");
    expect(sitioDePila(v8, 3)).toBe("draw 65241-8c49.js:1:253720 < main-app-46.js:1:99");
  });
  it("sin nada que leer: «?» (nunca lanza)", () => {
    expect(sitioDePila("", 3)).toBe("?");
    expect(sitioDePila("esto no es una pila", 0)).toBe("?");
    expect(sitioDePila(pilaDe("raf1"), 3)).toBe("?");
  });
  it("la ruta va sin identificadores", () => {
    expect(rutaCorta("/red/senales")).toBe("/red/senales");
    expect(rutaCorta("/perfil/9a543488-7ba5-4a78-aba4-932b0c2aab5f/ajustes")).toBe("/perfil/…/ajustes");
    expect(rutaCorta("/grupo/12345")).toBe("/grupo/…");
    expect(rutaCorta("")).toBe("/");
  });
});

describe("DIR1125F · el censo no cambia nada de lo que envuelve", () => {
  it("cada llamada pasa tal cual: misma función, mismos argumentos, mismo identificador", () => {
    const b = banco();
    expect(b.obj.requestAnimationFrame(nada)).toBe(1);
    expect(b.rafs[0]).toBe(nada);
    expect(b.obj.setTimeout(nada, 30, "a", 7)).toBe(1001);
    expect(b.timeouts[0]).toEqual([nada, 30, "a", 7]);
    expect(b.obj.setTimeout(nada, 5000)).toBe(1002);
    const id = b.obj.setInterval(nada, 5000);
    expect(b.intervalos.at(-1)).toMatchObject({ f: nada, ms: 5000, id });
  });
  it("un temporizador rápido sigue llamando a su función con sus argumentos y devolviendo lo suyo", () => {
    const b = banco();
    const tic = vi.fn((x: string) => x + "!");
    b.obj.setInterval(tic, 16);
    const reg = b.intervalos.at(-1)!;
    expect(reg.ms).toBe(16);
    expect(reg.f("a")).toBe("a!");
    expect(tic).toHaveBeenCalledWith("a");
  });
  it("si no se puede leer la pila, quien llama ni se entera", () => {
    const b = banco();
    b.estado.romper = true;
    for (let i = 0; i < 64; i++) expect(b.obj.requestAnimationFrame(nada)).toBe(i + 1);
    expect(b.obj.setInterval(nada, 16)).toBeGreaterThan(2000);
  });
  it("quitarlo deja todo como estaba y para su informe; instalarlo dos veces no envuelve dos veces", () => {
    const b = banco();
    const envuelto = b.obj.requestAnimationFrame;
    expect(envuelto).not.toBe(b.originales.raf);
    const otro = instalarCenso(b.e);
    expect(b.obj.requestAnimationFrame).toBe(envuelto);
    otro();
    expect(b.obj.requestAnimationFrame).toBe(envuelto);
    b.quitar();
    expect(b.obj.requestAnimationFrame).toBe(b.originales.raf);
    expect(b.obj.setTimeout).toBe(b.originales.timeout);
    expect(b.obj.setInterval).toBe(b.originales.intervalo);
    expect(b.parados).toEqual([2001]);
  });
});

describe("DIR1125F · qué dice el censo", () => {
  it("página tranquila (unas pocas llamadas en el minuto): nada", () => {
    const b = banco();
    for (let i = 0; i < 5; i++) b.obj.requestAnimationFrame(nada);
    for (let i = 0; i < 2000; i++) b.obj.setTimeout(nada, 1000);
    b.informar();
    expect(b.lineas).toEqual([]);
  });
  it("un bucle de verdad: cuántos cuadros por segundo y de dónde salen, en líneas que caben en el registro", () => {
    const b = banco();
    b.estado.pila = pilaDe("raf1", ORBE, REACT);
    for (let i = 0; i < 3600; i++) b.obj.requestAnimationFrame(nada);
    b.estado.pila = pilaDe("raf1", MAPA);
    for (let i = 0; i < 608; i++) b.obj.requestAnimationFrame(nada);
    b.informar();
    expect(b.lineas).toEqual([
      "censo-cuadros ruta=/red/senales modo=eficiente tope=10 visible=si foco=no raf=70.1/s rapidos=0.0/s",
      "censo-sitio 1/2 60.0/s raf draw 65241-8c4921f31d23e24c.js:1:253720 < h 4bd1b696-2135e4d8b8354323.js:1:8822",
      "censo-sitio 2/2 10.1/s raf tick 99729.48a99318dd70192b.js:1:7222",
    ]);
    expect(b.lineas.every((l) => l.length <= 200)).toBe(true);
    b.informar(); // la cuenta empieza de cero en cada ventana
    expect(b.lineas.length).toBe(3);
  });
  it("temporizadores rápidos: un intervalo de 16 ms y una cadena de setTimeout(0)", () => {
    const b = banco();
    b.estado.pila = [`pila@${BASE}censo-1a2b.js:1:10`, `intervalo1@${BASE}censo-1a2b.js:1:40`, MAPA].join("\n");
    b.obj.setInterval(nada, 16);
    const reg = b.intervalos.at(-1)!;
    for (let i = 0; i < 1200; i++) reg.f();
    b.informar();
    expect(b.lineas).toEqual([
      "censo-cuadros ruta=/red/senales modo=eficiente tope=10 visible=si foco=no raf=0.0/s rapidos=20.0/s",
      "censo-sitio 1/1 20.0/s iv16 tick 99729.48a99318dd70192b.js:1:7222",
    ]);
    b.lineas.length = 0;
    b.estado.pila = pilaDe("timeout1", REACT);
    for (let i = 0; i < 1200; i++) b.obj.setTimeout(nada, 0);
    b.informar();
    expect(b.lineas[0]).toContain("raf=0.0/s rapidos=20.0/s");
    expect(b.lineas[1]).toBe("censo-sitio 1/1 20.0/s t h 4bd1b696-2135e4d8b8354323.js:1:8822");
  });
  it("no llena el registro: como mucho unos pocos informes por hora", () => {
    const b = banco();
    for (let v = 0; v < 20; v++) {
      for (let i = 0; i < 1000; i++) b.obj.requestAnimationFrame(nada);
      b.informar();
    }
    expect(b.lineas.filter((l) => l.startsWith("censo-cuadros ")).length).toBe(INFORMES_POR_HORA);
  });
});
