/** DIR1125H · el censo de tiempo: mide sin cambiar nada, dice quién tarda, apunta los parones a lo último que corrió y lista las animaciones vivas. */
import { describe, expect, it } from "vitest";
import { instalarCensoTiempo, tramoDeEspera, VENTANA_TIEMPO_MS, VIGIA_MS, type EntornoTiempo } from "../censo-tiempo";
import { marcarEnHilo, medirEnHilo, ponerMedidorHilo } from "../medidor-hilo";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "http://127.0.0.1:47610/_next/static/chunks/";
/** Los marcos del propio censo en la pila, como los ve WebKit: [pila, claveDe, envoltorio] y luego quien llamó. */
const pilaDe = (fn: string, archivo: string, col: number) =>
  [`pila@${BASE}censo-9z.js:1:10`, `claveDe@${BASE}censo-9z.js:1:20`, `envoltorio@${BASE}censo-9z.js:1:30`, `${fn}@${BASE}${archivo}:1:${col}`, `otro@${BASE}main-1.js:1:1`].join("\n");

function banco() {
  let t = 1000;
  let pila = pilaDe("draw", "65241-abc.js", 253972);
  let anim: string[] = [];
  let visible = true;
  const lineas: string[] = [];
  const rafs: FrameRequestCallback[] = [];
  const esperas: { f: any; ms: any; a: any[] }[] = [];
  const relojes: { id: number; f: any; ms: number }[] = [];
  let nid = 0;
  const obj: any = {
    requestAnimationFrame(cb: FrameRequestCallback) {
      rafs.push(cb);
      return ++nid;
    },
    setTimeout(f: any, ms: any, ...a: any[]) {
      esperas.push({ f, ms, a });
      return ++nid;
    },
    setInterval(f: any, ms: number) {
      relojes.push({ id: ++nid, f, ms });
      return nid;
    },
    clearInterval(id: number) {
      const i = relojes.findIndex((r) => r.id === id);
      if (i >= 0) relojes.splice(i, 1);
    },
  };
  const e: EntornoTiempo = {
    obj,
    ahora: () => t,
    pila: () => pila,
    visible: () => visible,
    anotar: (l) => lineas.push(l),
    contexto: () => ({ ruta: "/senales", modo: "eficiente" }),
    animaciones: () => anim,
  };
  return {
    obj,
    e,
    lineas,
    rafs,
    esperas,
    relojes,
    pasar: (ms: number) => {
      t += ms;
    },
    ponerPila: (p: string) => {
      pila = p;
    },
    ponerAnim: (a: string[]) => {
      anim = a;
    },
    ponerVisible: (v: boolean) => {
      visible = v;
    },
    reloj: (ms: number) => relojes.find((r) => r.ms === ms)!.f,
    vigia: () => relojes.find((r) => r.ms === VIGIA_MS)!.f(),
    informar: () => relojes.find((r) => r.ms === VENTANA_TIEMPO_MS)!.f(),
    de: (prefijo: string) => lineas.filter((l) => l.startsWith(prefijo)),
  };
}

describe("DIR1125H · censo de tiempo", () => {
  it("mide lo que tarda cada cuadro, le pasa lo mismo de siempre y dice de dónde salió", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    const recibidos: number[] = [];
    b.obj.requestAnimationFrame((t: number) => {
      recibidos.push(t);
      b.pasar(60);
    });
    b.rafs[0](123);
    expect(recibidos).toEqual([123]);
    b.informar();
    expect(b.lineas[0]).toMatch(/^censo-tiempo ruta=\/senales modo=eficiente medido=1ms\/s raf=0\.0\/s parones=0 \(max=0ms suma=0ms\) anim=0$/);
    expect(b.de("censo-quien")).toHaveLength(1);
    expect(b.de("censo-quien")[0]).toMatch(/^censo-quien 1\/1 1\.0ms\/s n=0\.0\/s max=60ms raf draw 65241-abc\.js:1:253972/);
  });

  it("mide temporizadores de cualquier periodo, con sus argumentos, su this y su resultado", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.ponerPila(pilaDe("pedir", "13227-x.js", 14400));
    const vistos: unknown[] = [];
    b.obj.setTimeout(
      function (this: unknown, a: string, c: number) {
        vistos.push(this, a, c);
        b.pasar(5);
        return "ok";
      },
      90,
      "x",
      7,
    );
    expect(b.esperas[0].ms).toBe(90);
    expect(b.esperas[0].a).toEqual(["x", 7]);
    const yo = { soy: "this" };
    expect(b.esperas[0].f.call(yo, "x", 7)).toBe("ok");
    expect(vistos).toEqual([yo, "x", 7]);

    b.ponerPila(pilaDe("useAhora", "layout-z.js", 500));
    let tics = 0;
    b.obj.setInterval(() => {
      tics += 1;
      b.pasar(2);
    }, 15000);
    for (let i = 0; i < 6; i++) b.reloj(15000)();
    expect(tics).toBe(6);

    b.obj.setTimeout("codigo en texto", 10);
    expect(b.esperas[1].f).toBe("codigo en texto"); // lo que no es una función pasa sin tocar

    b.informar();
    const quien = b.de("censo-quien");
    expect(quien.some((l) => / n=0\.1\/s max=2ms iv15000 useAhora layout-z\.js:1:500/.test(l))).toBe(true);
    expect(quien.some((l) => / max=5ms t250 pedir 13227-x\.js:1:14400/.test(l))).toBe(true);
  });

  it("lo que lanza sigue lanzando, y también se cuenta", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.obj.requestAnimationFrame(() => {
      b.pasar(120);
      throw new Error("pum");
    });
    expect(() => b.rafs[0](0)).toThrow("pum");
    b.informar();
    expect(b.de("censo-quien")[0]).toContain("max=120ms raf draw");
  });

  it("un parón se apunta a lo último que corrió antes («tras») o a la propia llamada si fue ella («en»)", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.pasar(VIGIA_MS);
    b.vigia(); // a su hora: nada que apuntar

    b.ponerPila(pilaDe("useAhora", "layout-z.js", 500));
    b.obj.setInterval(() => {
      b.pasar(1);
    }, 15000);
    b.pasar(10);
    b.reloj(15000)(); // corre 1 ms y deja trabajo para después (React, pintar el mapa…)
    b.pasar(900); // el hilo ocupado 900 ms
    b.vigia();

    b.pasar(VIGIA_MS);
    b.vigia(); // a su hora otra vez
    b.ponerPila(pilaDe("reconstruir", "mapa-q.js", 77));
    b.obj.setTimeout(() => {
      b.pasar(500);
    }, 0);
    b.pasar(5);
    b.esperas[0].f(); // esta llamada ES el parón
    b.vigia();

    b.informar();
    expect(b.lineas[0]).toMatch(/ parones=2 \(max=851ms suma=1296ms\) /);
    const p = b.de("censo-paron");
    expect(p).toHaveLength(2);
    expect(p[0]).toMatch(/^censo-paron 1\/2 1x suma=851ms max=851ms tras iv15000 useAhora layout-z\.js:1:500/);
    expect(p[1]).toMatch(/^censo-paron 2\/2 1x suma=445ms max=445ms en t16 reconstruir mapa-q\.js:1:77/);
  });

  it("lo que llega por eventos nativos se mide con `medir`, y `marcar` dice tras qué vino un parón", () => {
    const b = banco();
    const censo = instalarCensoTiempo(b.e);
    expect(
      censo.medir("ev:malla-local", () => {
        b.pasar(40);
        return 7;
      }),
    ).toBe(7);
    b.pasar(VIGIA_MS);
    b.vigia();
    b.pasar(20);
    censo.marcar("inv:malla_estado");
    b.pasar(300);
    b.vigia();
    b.informar();
    expect(b.de("censo-quien")[0]).toMatch(/ max=40ms ev:malla-local$/);
    expect(b.de("censo-paron")[0]).toMatch(/^censo-paron 1\/1 1x suma=260ms max=260ms tras inv:malla_estado$/);
  });

  it("un parón sin nada medido cerca queda como «?» (no se inventa culpable)", () => {
    const b = banco();
    const censo = instalarCensoTiempo(b.e);
    censo.marcar("inv:viejo");
    for (let i = 0; i < 5; i++) {
      b.pasar(VIGIA_MS);
      b.vigia();
    }
    b.pasar(400);
    b.vigia();
    b.informar();
    expect(b.de("censo-paron")[0]).toMatch(/^censo-paron 1\/1 1x suma=340ms max=340ms \?$/);
  });

  it("las dos primeras ventanas informan siempre; después solo si hay trabajo, y con tope por hora", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.informar();
    b.informar();
    expect(b.de("censo-tiempo")).toHaveLength(2);
    b.informar(); // tercera ventana, sin trabajo: calla
    expect(b.de("censo-tiempo")).toHaveLength(2);
    for (let i = 0; i < 12; i++) {
      b.obj.requestAnimationFrame(() => b.pasar(3000)); // 3 s de trabajo en la ventana = 50 ms/s
      b.rafs[b.rafs.length - 1](0);
      b.informar();
    }
    expect(b.de("censo-tiempo")).toHaveLength(8);
  });

  it("dice qué animaciones siguen vivas, agrupadas", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.ponerAnim(["anim:pulso @ span.punto", "anim:pulso @ span.punto", "waapi @ div.avatar"]);
    b.informar();
    expect(b.lineas[0]).toMatch(/ anim=3$/);
    expect(b.de("censo-anim")).toEqual(["censo-anim 1/2 2x anim:pulso @ span.punto", "censo-anim 2/2 1x waapi @ div.avatar"]);
  });

  it("con la página oculta un retraso del vigía no es un parón", () => {
    const b = banco();
    instalarCensoTiempo(b.e);
    b.ponerVisible(false);
    b.pasar(1000);
    b.vigia();
    b.ponerVisible(true);
    b.pasar(1000);
    b.vigia(); // primera mirada con la página a la vista: solo se rearma
    b.pasar(VIGIA_MS);
    b.vigia();
    b.informar();
    expect(b.lineas[0]).toMatch(/ parones=0 /);
  });

  it("lo anidado no se cuenta dos veces", () => {
    const b = banco();
    const censo = instalarCensoTiempo(b.e);
    b.obj.setTimeout(() => {
      censo.medir("ev:dentro", () => b.pasar(60));
    }, 0);
    b.esperas[0].f();
    b.informar();
    expect(b.de("censo-quien")).toHaveLength(1);
    expect(b.de("censo-quien")[0]).toContain("max=60ms t16 draw");
    expect(b.lineas[0]).toContain("medido=1ms/s");
  });

  it("sin pila sigue funcionando, y al parar deja todo como estaba", () => {
    const b = banco();
    const raf0 = b.obj.requestAnimationFrame;
    const espera0 = b.obj.setTimeout;
    const reloj0 = b.obj.setInterval;
    b.e.pila = () => {
      throw new Error("sin pila");
    };
    const censo = instalarCensoTiempo(b.e);
    expect(b.obj.requestAnimationFrame).not.toBe(raf0);
    let n = 0;
    b.obj.requestAnimationFrame(() => {
      n += 1;
    });
    b.rafs[0](0);
    expect(n).toBe(1);
    const segundo = instalarCensoTiempo(b.e); // ya puesto: no envuelve otra vez
    expect(segundo.medir("x", () => 5)).toBe(5);
    expect(b.relojes).toHaveLength(2); // el vigía y el informe, una sola vez
    censo.parar();
    expect(b.obj.requestAnimationFrame).toBe(raf0);
    expect(b.obj.setTimeout).toBe(espera0);
    expect(b.obj.setInterval).toBe(reloj0);
    expect(b.relojes).toHaveLength(0);
  });

  it("los tramos de espera", () => {
    expect([0, 16, 17, 50, 90, 250, 800, 3000, 15000].map(tramoDeEspera)).toEqual(["t16", "t16", "t50", "t50", "t250", "t250", "t1s", "t5s", "t>5s"]);
    expect(tramoDeEspera(Number.NaN)).toBe("t16");
  });
});

describe("DIR1125H · medidor del hilo", () => {
  it("sin medidor todo pasa tal cual; con medidor, delega; y marcar nunca lanza", () => {
    ponerMedidorHilo(null);
    expect(medirEnHilo("a", () => 3)).toBe(3);
    expect(() => marcarEnHilo("b")).not.toThrow();
    const claves: string[] = [];
    ponerMedidorHilo({
      medir: (c, f) => {
        claves.push(`medir ${c}`);
        return f();
      },
      marcar: (c) => {
        claves.push(`marcar ${c}`);
        throw new Error("no debe salir");
      },
    });
    expect(medirEnHilo("ev:x", () => "v")).toBe("v");
    expect(() => marcarEnHilo("inv:y")).not.toThrow();
    expect(claves).toEqual(["medir ev:x", "marcar inv:y"]);
    ponerMedidorHilo(null);
  });
});
