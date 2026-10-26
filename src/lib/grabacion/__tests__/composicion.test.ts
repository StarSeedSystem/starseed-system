import { describe, expect, it } from "vitest";
import {
  calcularLienzo,
  crearComposicion,
  dibujarFotograma,
  encajar,
  FRACCION_CAMARA,
  MARGEN_CAMARA,
  recorteCuadrado,
  rectCamara,
  type Contexto2DMinimo,
} from "../composicion";
import { crearLatido } from "../latido";
import { mezclarAudio } from "../audio";
import { ContextoAudioFalso, FlujoFalso, PistaFalsa, elementoFalso, flujoDeCamara, flujoDePantalla } from "../falsos-prueba";

describe("grabación · imagen en imagen (geometría)", () => {
  it("el lienzo se topa a 1920×1080 en cualquier orientación y queda en medidas pares", () => {
    expect(calcularLienzo(3840, 2160)).toEqual({ w: 1920, h: 1080 });
    expect(calcularLienzo(1080, 1920)).toEqual({ w: 1080, h: 1920 });
    expect(calcularLienzo(1280, 720)).toEqual({ w: 1280, h: 720 });
    const raro = calcularLienzo(1001, 563);
    expect(raro.w % 2).toBe(0);
    expect(raro.h % 2).toBe(0);
    expect(calcularLienzo(0, Number.NaN)).toEqual({ w: 1280, h: 720 });
  });

  it("encajar conserva la proporción y centra", () => {
    expect(encajar({ w: 1000, h: 500 }, { w: 1920, h: 1080 })).toEqual({ x: 0, y: 60, w: 1920, h: 960 });
    expect(encajar({ w: 500, h: 1000 }, { w: 1000, h: 500 })).toEqual({ x: 375, y: 0, w: 250, h: 500 });
    expect(encajar({ w: 0, h: 0 }, { w: 100, h: 50 })).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("la cámara cuelga de la esquina elegida con su margen y su tamaño", () => {
    const L = { w: 1920, h: 1080 };
    const lado = Math.round(1920 * FRACCION_CAMARA.mediana);
    const margen = Math.round(1920 * MARGEN_CAMARA);
    expect(rectCamara(L, "abajo-derecha", "mediana")).toEqual({ x: 1920 - lado - margen, y: 1080 - lado - margen, w: lado, h: lado });
    expect(rectCamara(L, "arriba-izquierda", "mediana")).toEqual({ x: margen, y: margen, w: lado, h: lado });
    expect(rectCamara(L, "abajo-izquierda", "pequena").x).toBe(margen);
    expect(rectCamara(L, "arriba-derecha", "grande").y).toBe(margen);
    expect(rectCamara(L, "abajo-derecha", "grande").w).toBeGreaterThan(rectCamara(L, "abajo-derecha", "pequena").w);
  });

  it("el recorte de la cámara es el cuadrado central", () => {
    expect(recorteCuadrado({ w: 1280, h: 720 })).toEqual({ x: 280, y: 0, w: 720, h: 720 });
    expect(recorteCuadrado({ w: 480, h: 640 })).toEqual({ x: 0, y: 80, w: 480, h: 480 });
  });

  it("un fotograma dibuja fondo, pantalla, y la cámara recortada en círculo con aro", () => {
    const llamadas: string[] = [];
    const ctx: Contexto2DMinimo = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      fillRect: () => llamadas.push("fondo"),
      drawImage: (_i, ...a) => llamadas.push(`img${a.length}`),
      save: () => llamadas.push("save"),
      restore: () => llamadas.push("restore"),
      beginPath: () => llamadas.push("ruta"),
      arc: () => llamadas.push("arco"),
      clip: () => llamadas.push("clip"),
      stroke: () => llamadas.push("aro"),
    };
    dibujarFotograma(ctx, { w: 1920, h: 1080 }, { elemento: {}, w: 1920, h: 1080 }, { elemento: {}, w: 1280, h: 720 }, "abajo-derecha", "mediana");
    expect(llamadas[0]).toBe("fondo");
    expect(llamadas).toContain("img4"); // pantalla (x, y, w, h)
    expect(llamadas).toContain("img8"); // cámara recortada
    expect(llamadas.indexOf("clip")).toBeLessThan(llamadas.indexOf("img8"));
    expect(llamadas[llamadas.length - 1]).toBe("aro");
    expect(ctx.strokeStyle).toBe("#D4AF37");
  });

  it("sin imagen de cámara solo se dibuja la pantalla", () => {
    const llamadas: string[] = [];
    const ctx = { fillStyle: "", strokeStyle: "", lineWidth: 0, fillRect() {}, drawImage: () => llamadas.push("img"), save() {}, restore() {}, beginPath() {}, arc() {}, clip() {}, stroke: () => llamadas.push("aro") } as unknown as Contexto2DMinimo;
    dibujarFotograma(ctx, { w: 100, h: 100 }, { elemento: {}, w: 100, h: 100 }, { elemento: {}, w: 0, h: 0 }, "abajo-derecha", "mediana");
    expect(llamadas).toEqual(["img"]);
  });
});

describe("grabación · compositor", () => {
  it("crea el lienzo con la medida de la pantalla, su pista y un latido que se detiene", async () => {
    const elementos: ReturnType<typeof elementoFalso>[] = [];
    const latidos: Array<{ cb: () => void; fps: number; parado: boolean }> = [];
    const pantalla = flujoDePantalla();
    const camara = flujoDeCamara();
    const comp = await crearComposicion(
      { pantalla: pantalla as unknown as MediaStream, camara: camara as unknown as MediaStream, ancho: 3840, alto: 2160, fps: 30, posicion: "abajo-derecha", tamano: "mediana" },
      {
        crearElemento: (tag) => {
          const e = elementoFalso(tag);
          elementos.push(e);
          return e;
        },
        latido: (cb, fps) => {
          const l = { cb, fps, parado: false };
          latidos.push(l);
          return () => {
            l.parado = true;
          };
        },
      },
    );
    expect([comp.ancho, comp.alto]).toEqual([1920, 1080]);
    const lienzo = elementos.find((e) => e.tag === "canvas")!;
    expect([lienzo.width, lienzo.height]).toEqual([1920, 1080]);
    const antes = lienzo.dibujos;
    latidos[0].cb();
    expect(lienzo.dibujos).toBeGreaterThan(antes);
    expect(latidos[0].fps).toBe(30);
    comp.detener();
    expect(latidos[0].parado).toBe(true);
    expect(comp.pista.kind).toBe("video");
  });
});

describe("grabación · latido y mezcla de audio", () => {
  it("el latido usa un Worker (que no se frena en segundo plano) y lo cierra", () => {
    const creados: Array<{ url: string; terminado: boolean; onmessage: (() => void) | null }> = [];
    const revocadas: string[] = [];
    class W {
      onmessage: (() => void) | null = null;
      terminado = false;
      constructor(public url: string) {
        creados.push(this as never);
      }
      terminate() {
        this.terminado = true;
      }
    }
    let veces = 0;
    const parar = crearLatido(() => veces++, 30, { Worker: W as never, crearUrl: () => "blob:w", revocarUrl: (u) => revocadas.push(u) });
    creados[0].onmessage?.();
    creados[0].onmessage?.();
    expect(veces).toBe(2);
    parar();
    expect(creados[0].terminado).toBe(true);
    expect(revocadas).toEqual(["blob:w"]);
  });

  it("sin Worker cae a setInterval a ~fps y se puede parar", () => {
    const intervalos: number[] = [];
    const limpiados: unknown[] = [];
    const parar = crearLatido(() => {}, 25, {
      Worker: null,
      setInterval: (_f, ms) => {
        intervalos.push(ms);
        return 7;
      },
      clearInterval: (id) => limpiados.push(id),
    });
    expect(intervalos).toEqual([40]);
    parar();
    expect(limpiados).toEqual([7]);
  });

  it("si crear el Worker falla, cae a setInterval y no deja la URL sin revocar", () => {
    const revocadas: string[] = [];
    const parar = crearLatido(() => {}, 30, {
      Worker: class {
        constructor() {
          throw new Error("CSP");
        }
      } as never,
      crearUrl: () => "blob:x",
      revocarUrl: (u) => revocadas.push(u),
      setInterval: () => 1,
      clearInterval: () => {},
    });
    expect(revocadas).toEqual(["blob:x"]);
    parar();
  });

  it("una sola pista de audio pasa tal cual; dos se mezclan en un AudioContext que se cierra", () => {
    const a = new PistaFalsa("audio");
    const b = new PistaFalsa("audio");
    const crear = (p: MediaStreamTrack[]) => new FlujoFalso(p as unknown as PistaFalsa[]) as unknown as MediaStream;
    const una = mezclarAudio(ContextoAudioFalso, [a as never], crear);
    expect(una.pistas).toEqual([a]);

    ContextoAudioFalso.creados = 0;
    const mezcla = mezclarAudio(ContextoAudioFalso, [a as never, b as never], crear);
    expect(ContextoAudioFalso.creados).toBe(1);
    expect(mezcla.pistas).toHaveLength(1);
    expect(mezcla.pistas[0]).not.toBe(a);
    expect(mezcla.descartadas).toBe(0);
    mezcla.cerrar();
  });

  it("sin AudioContext (o si falla) se queda con la primera pista y lo cuenta", () => {
    const a = new PistaFalsa("audio");
    const b = new PistaFalsa("audio");
    const crear = (p: MediaStreamTrack[]) => new FlujoFalso(p as unknown as PistaFalsa[]) as unknown as MediaStream;
    expect(mezclarAudio(null, [a as never, b as never], crear)).toMatchObject({ pistas: [a], descartadas: 1 });
    const roto = class {
      constructor() {
        throw new Error("x");
      }
    };
    expect(mezclarAudio(roto, [a as never, b as never], crear)).toMatchObject({ pistas: [a], descartadas: 1 });
    expect(mezclarAudio(null, [], crear)).toMatchObject({ pistas: [], descartadas: 0 });
  });
});
