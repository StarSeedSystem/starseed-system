/**
 * Partes puras del motor (tramos que suenan en una ventana, paso a tiempo de AudioContext) y del
 * puente postMessage con la app oficial (filtro del protocolo, orígenes, parámetros, foto sin
 * secretos).
 */
import { describe, expect, it } from "vitest";
import { aTiempoContexto, crearMapeoContexto, tramosEntre, volumenEn } from "../motor-estacion";
import { esMensajeDeApp, fotoParaApp, origenesPermitidos, parametrosDeApp } from "../puente-omnifrecuencias";
import { aplicarAccion, type AccionLinea, type EstadoSesion, type FichaSesion } from "../transmision-parametrica";
import type { FotoEstacionGlobal } from "../estacion-global";

const ficha: FichaSesion = {
  v: 1,
  id: "abcdefghijklmnopqrstuv",
  fuente: "omnifrecuencias",
  titulo: "Prueba",
  enlace: "https://omnifrecuencias.vercel.app/",
  pk: "B".repeat(87),
  privada: true,
  params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.6, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
  creada: 0,
};
let n = 0;
const acc = (t: number, tipo: AccionLinea["tipo"], extra: Partial<AccionLinea> = {}): AccionLinea => ({ n: ++n, t, tipo, ...extra });
const con = (...a: AccionLinea[]): EstadoSesion => a.reduce((e, x) => aplicarAccion(e, x), { ficha, linea: [], rev: 0 } as EstadoSesion);

describe("motor · tramos", () => {
  it("un tramo abierto mientras nada lo pare dentro de la ventana", () => {
    const e = con(acc(1000, "iniciar"), acc(3000, "pausar"));
    expect(tramosEntre(e, 500, 2000)).toMatchObject([{ desde: 1000, hasta: Infinity, ancla: 1000 }]);
    expect(tramosEntre(e, 500, 3500)).toMatchObject([{ desde: 1000, hasta: 3000 }]);
    expect(tramosEntre(e, 3100, 4000)).toEqual([]);
  });

  it("un cambio de parámetros parte el tramo exactamente en su instante", () => {
    const otra = { tipo: "omnifrecuencias" as const, entonacion: { volumen: 0.6, osciladores: [{ id: "b", f: 528, onda: "sine" as const, vol: 0.5, x: 0, y: 0, z: 0 }] } };
    const e = con(acc(0, "iniciar"), acc(2000, "parametros", { params: otra }));
    const t = tramosEntre(e, 1000, 2500);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ hasta: 2000 });
    expect(t[1]).toMatchObject({ desde: 2000, hasta: Infinity });
    expect(t[1].entonacion.osciladores[0].f).toBe(528);
  });

  it("un cambio de volumen NO corta el sonido", () => {
    const e = con(acc(0, "iniciar"), acc(1500, "volumen", { volumen: 0.1 }));
    expect(tramosEntre(e, 1000, 2500)).toHaveLength(1);
    expect(volumenEn(e, 1499)).toBe(0.6);
    expect(volumenEn(e, 1500)).toBe(0.1);
  });

  it("reanudar conserva el ancla desplazada por la pausa", () => {
    const e = con(acc(0, "iniciar"), acc(1000, "pausar"), acc(5000, "reanudar"));
    expect(tramosEntre(e, 4000, 6000)).toMatchObject([{ desde: 5000, ancla: 4000 }]);
  });

  it("instante común → tiempo del AudioContext", () => {
    expect(aTiempoContexto(10_500, 10_000, 3.25)).toBeCloseTo(3.75, 9);
    expect(aTiempoContexto(9_990, 10_000, 3.25)).toBeCloseTo(3.24, 9);
  });

  it("con la marca de salida del navegador, el sonido SALE en el instante común (latencia compensada)", () => {
    // El motor va 0,050 s por delante de lo que suena en el altavoz.
    const m = crearMapeoContexto({
      ahoraComun: 50_000,
      perfAhora: 2_000,
      ctxActual: 10.05,
      marca: { contextTime: 10.0, performanceTime: 2_000 },
    });
    expect(m.base).toBe("salida");
    expect(m.latenciaMs).toBeCloseTo(50, 6);
    // Lo que tiene que sonar dentro de 200 ms se programa en el contexto 10,0 + 0,2 (no 10,05 + 0,2).
    expect(m.aCtx(50_200)).toBeCloseTo(10.2, 9);
  });

  it("sin marca de salida: currentTime menos la latencia que declara el navegador", () => {
    const m = crearMapeoContexto({ ahoraComun: 1000, perfAhora: 0, ctxActual: 5, marca: null, latenciaDeclaradaS: 0.03 });
    expect(m.base).toBe("contexto");
    expect(m.latenciaMs).toBeCloseTo(30, 6);
    expect(m.aCtx(1100)).toBeCloseTo(5.07, 9);
  });
});

describe("puente con la app oficial", () => {
  it("solo atiende el protocolo v1 con tipos conocidos", () => {
    expect(esMensajeDeApp({ ss: "estacion", v: 1, tipo: "hola" })).toBe(true);
    expect(esMensajeDeApp({ ss: "estacion", v: 2, tipo: "hola" })).toBe(false);
    expect(esMensajeDeApp({ ss: "estacion", v: 1, tipo: "borrar-todo" })).toBe(false);
    expect(esMensajeDeApp("hola")).toBe(false);
  });

  it("orígenes: las webs oficiales y, para desarrollo, solo https o localhost", () => {
    const m = origenesPermitidos("http://localhost:5173, http://evil.example, https://pruebas.omni.dev, nada");
    expect(m.get("https://omnifrecuencias.vercel.app")).toBe("omnifrecuencias");
    expect(m.get("https://audiomorphic.vercel.app")).toBe("audiomorphic");
    expect(m.has("http://localhost:5173")).toBe(true);
    expect(m.has("https://pruebas.omni.dev")).toBe(true);
    expect(m.has("http://evil.example")).toBe(false);
  });

  it("acepta los osciladores tal como los tiene la app", () => {
    const p = parametrosDeApp({ osciladores: [{ frequency: 528, type: "triangle", volume: 0.4, panX: 0.5, panY: 0, panZ: 0 }], volumen: 0.3 }, "omnifrecuencias");
    expect(p).toMatchObject({ tipo: "omnifrecuencias", entonacion: { volumen: 0.3, osciladores: [{ f: 528, onda: "triangle", x: 0.5 }] } });
    expect(parametrosDeApp({ osciladores: [{ frequency: "x" }] }, "omnifrecuencias")).toBeNull();
    expect(parametrosDeApp({ params: { tipo: "audiomorphic", visual: { k: 1.2 } } }, "omnifrecuencias")).toBeNull();
  });

  it("la foto que recibe la app no lleva llaves, tokens ni la llave pública", () => {
    const estado = con(acc(0, "iniciar"));
    const foto = {
      href: "/estaciones/vivo/x#k=SECRETO",
      sesion: {
        ficha, estado, posicion: {} as never,
        reloj: { modo: "sincronizado", desfaseMs: 1, derivaPpm: 0, precisionMs: 0.4, cotaMs: 6, retardoMinMs: 12, muestras: 8, ultimaMuestra: 1 },
        control: true, referencia: true, canales: [], oyentes: 3, anfitrionVisto: 1, descartados: 0,
      },
    } as unknown as FotoEstacionGlobal;
    const f = fotoParaApp(foto, 1500)!;
    const texto = JSON.stringify(f);
    expect(texto).not.toContain("SECRETO");
    expect(texto).not.toContain(ficha.pk);
    expect(f).toMatchObject({ fase: "sonando", posicionMs: 1500, control: true, conectados: 3, reloj: { precisionMs: 0.4, cotaMs: 6 } });
  });
});
