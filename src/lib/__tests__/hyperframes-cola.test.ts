import { describe, it, expect } from "vitest";
import { crearCola, ESTADOS, ENTORNO, validarArgs, progresoDeLinea } from "../hyperframes-cola";
import {
  crearCola as crearColaServicio, ENTORNO as ENTORNO_HF, ESTADOS as ESTADOS_SERVICIO,
  progresoDeLinea as progresoLineaServicio, validarArgs as validarArgsServicio,
} from "../../../servicios/hyperframes/src/cola-render.mjs";
import type { Trabajo, Opciones } from "../hyperframes-cola";

function relojFalso(): { avanzar: (ms: number) => void; obtener: () => number } {
  let avanzado = 0;
  return { avanzar: (ms: number) => { avanzado += ms; }, obtener: () => avanzado };
}

function diferido<T>(): { promesa: Promise<T>; resolver: (valor: T) => void } {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((fijar) => { resolver = fijar; });
  return { promesa, resolver };
}

const esperar = (): Promise<void> => new Promise((resolver) => setTimeout(resolver, 0));

describe("hyperframes-cola", () => {
  it("solo acepta listas con banderas de la lista blanca y valores dentro del proyecto", () => {
    expect(validarArgs("-o salida.mp4")).toMatch(/lista|bandera/);
    expect(validarArgs(["-o", "salida.mp4", "--format=mp4"])).toBeNull();
    expect(validarArgs(["salida.mp4"])).toBe("argumento sin bandera");
    expect(validarArgs(["--rm", "x"])).toMatch(/no permitida/);
    expect(validarArgs(["-o", "/etc/passwd"])).toMatch(/fuera/);
    expect(validarArgs(["-o", "../x"])).toMatch(/fuera/);
    expect(validarArgs(["-o", "a\nb"])).toMatch(/control/);
  });

  it("lee las líneas @hf-progress y descarta el ruido", () => {
    expect(progresoDeLinea('render @hf-progress {"frame":12,"total":72}')).toEqual({ frame: 12, total: 72 });
    expect(progresoDeLinea("otra línea")).toBeNull();
    expect(progresoDeLinea("@hf-progress {roto")).toBeNull();
    expect(progresoDeLinea("@hf-progress [1]")).toBeNull();
  });

  it("renderiza en orden, copia args y apaga la telemetría", async () => {
    const d = diferido<{ codigo: number; salida: string }>();
    const llamadas: { trabajo: Trabajo; opciones: Opciones }[] = [];
    const ejecutar = (trabajo: Trabajo, opciones: Opciones) => { llamadas.push({ trabajo, opciones }); return d.promesa; };
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    const id = cola.encolar({ id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"] });
    await esperar();
    expect(cola.estado(id)!.estado).toBe(ESTADOS.RENDERIZANDO);
    expect(llamadas[0].trabajo).toEqual({
      id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"], env: { ...ENTORNO },
    });
    expect(llamadas[0].opciones.senal).toBeInstanceOf(AbortSignal);
    llamadas[0].opciones.alProgreso('@hf-progress {"frame":5,"total":10}');
    expect(cola.estado(id)!.progreso).toEqual({ frame: 5, total: 10 });
    d.resolver({ codigo: 0, salida: "a.mp4" });
    await esperar();
    expect(cola.estado(id)!).toMatchObject({ estado: ESTADOS.HECHO, resultado: { codigo: 0, salida: "a.mp4" } });
  });
  it("respeta el tope: el segundo espera en cola hasta que termina el primero", async () => {
    const a = diferido<{ codigo: number }>(), b = diferido<{ codigo: number }>();
    const lanzados: string[] = [];
    const ejecutar = (t: Trabajo) => { lanzados.push(t.id); return t.id === "a" ? a.promesa : b.promesa; };
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    await esperar();
    expect(lanzados).toEqual(["a"]);
    expect(cola.estado("b")!.estado).toBe(ESTADOS.EN_COLA);
    a.resolver({ codigo: 0 });
    await esperar();
    expect(lanzados).toEqual(["a", "b"]);
    expect(cola.estado("a")!.estado).toBe(ESTADOS.HECHO);
  });

  it("un código distinto de cero es fallo y no filtra rutas absolutas", async () => {
    const cola = crearCola({ ejecutar: async () => ({ codigo: 2, error: "no pudo /home/a/x.mp4" }), reloj: relojFalso() });
    cola.encolar({ id: "x", proyecto: "p", args: [] });
    await esperar();
    expect(cola.estado("x")!).toMatchObject({ estado: ESTADOS.FALLO, resultado: { codigo: 2 } });
    expect(cola.estado("x")!.error).toContain("<ruta>");
    expect(cola.estado("x")!.error).not.toContain("/home/");
  });

  it("cancela lo que espera sin lanzarlo y aborta lo que ya renderiza", async () => {
    const d = diferido<{ codigo: number }>();
    let senal: AbortSignal | undefined;
    const ejecutar = (_t: Trabajo, o: Opciones) => { senal = o.senal; return d.promesa; };
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    await esperar();
    expect(cola.cancelar("b")).toBe(true);
    expect(cola.estado("b")!.estado).toBe(ESTADOS.CANCELADO);
    expect(cola.cancelar("a")).toBe(true);
    expect(senal?.aborted).toBe(true);
    expect(cola.estado("a")!.estado).toBe(ESTADOS.CANCELADO);
    expect(cola.cancelar("a")).toBe(false);
    d.resolver({ codigo: 0 });
    await esperar();
    expect(cola.estado("a")!.estado).toBe(ESTADOS.CANCELADO);
  });

  it("el tiempo máximo cancela el render en curso", async () => {
    const reloj = relojFalso();
    const cola = crearCola({ ejecutar: () => diferido<{ codigo: number }>().promesa, reloj, maxSegundos: 2 });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    await esperar();
    reloj.avanzar(1999);
    expect(cola.estado("a")!.estado).toBe(ESTADOS.RENDERIZANDO);
    reloj.avanzar(1);
    expect(cola.estado("a")!).toMatchObject({ estado: ESTADOS.CANCELADO, motivo: "tiempo máximo" });
  });

  it("rechaza id repetido, proyecto fuera y args inseguros; lista en orden", async () => {
    const cola = crearCola({ ejecutar: async () => 0, reloj: relojFalso() });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    expect(() => cola.encolar({ id: "a", proyecto: "p", args: [] })).toThrow(/id/);
    expect(() => cola.encolar({ id: "b", proyecto: "/etc", args: [] })).toThrow(/proyecto/);
    expect(() => cola.encolar({ id: "c", proyecto: "p", args: ["--rm"] })).toThrow(/bandera/);
    expect(cola.listar().map((t: { id: string }) => t.id)).toEqual(["a"]);
    await esperar();
    expect(cola.estado("a")!.estado).toBe(ESTADOS.HECHO);
  });
});

describe("cola de render del servicio (cola-render.mjs)", () => {
  it("enciende HYPERFRAMES_NO_TELEMETRY=1 y argusa solo banderas blancas por lista", () => {
    expect(ENTORNO_HF).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    expect(validarArgsServicio("-o salida.mp4")).toMatch(/lista/);
    expect(validarArgsServicio(["--composition", "c", "-f", "mp4", "-q=alta"])).toBeNull();
    expect(validarArgsServicio(["--rm", "x"])).toMatch(/no permitida/);
    expect(validarArgsServicio(["-o", "/run/x"])).toMatch(/fuera/);
    expect(validarArgsServicio(["-o", "a\tb"])).toMatch(/control/);
    expect(progresoLineaServicio('clip @hf-progress {"frame":3,"total":9}')).toEqual({ frame: 3, total: 9 });
    expect(progresoLineaServicio("@hf-progress {roto")).toBeNull();
  });

  it("con tope 2 lanza dos a la vez, el tercero espera; telemetría apagada en el trabajo", async () => {
    const d = diferido<{ codigo: number; salida: string }>();
    const trabajos: Trabajo[] = [];
    const de = (): Promise<void> => new Promise((f) => setTimeout(f, 0));
    const cola = crearColaServicio({ ejecutar: (t: Trabajo) => { trabajos.push(t); return d.promesa; }, reloj: relojFalso(), maxSimultaneos: 2 });
    cola.encolar({ id: "a", proyecto: "p", args: ["--format", "webm"] });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    cola.encolar({ id: "c", proyecto: "p", args: [] });
    await de();
    expect(trabajos.map((t) => t.id)).toEqual(["a", "b"]);
    expect(trabajos[0].env).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    expect(trabajos[0].proyecto).toBe("p");
    expect(cola.estado("c")!.estado).toBe(ESTADOS_SERVICIO.EN_COLA);
    d.resolver({ codigo: 0, salida: "a.webm" });
    await de();
    expect(cola.estado("a")!.estado).toBe(ESTADOS_SERVICIO.HECHO);
    expect(trabajos.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("progreso leído, fallo sin rutas absolutas y cancelación en cola y en curso", async () => {
    const d = diferido<{ codigo: number; error: string }>();
    let opciones: Opciones | undefined;
    const de = (): Promise<void> => new Promise((f) => setTimeout(f, 0));
    const cola = crearColaServicio({ ejecutar: (_t: Trabajo, o: Opciones) => { opciones = o; return d.promesa; }, reloj: relojFalso() });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    await de();
    expect(cola.estado("b")!.estado).toBe(ESTADOS_SERVICIO.EN_COLA);
    opciones!.alProgreso("@hf-progress {\"frame\":7,\"total\":21}");
    expect(cola.estado("a")!.progreso).toEqual({ frame: 7, total: 21 });
    expect(cola.cancelar("b")).toBe(true);
    expect(cola.estado("b")!.estado).toBe(ESTADOS_SERVICIO.CANCELADO);
    cola.cancelar("a");
    expect(cola.cancelar("a")).toBe(false);
    d.resolver({ codigo: 2, error: "fallo /home/n/x.mp4" });
    await de();
    expect(cola.estado("a")!.estado).toBe(ESTADOS_SERVICIO.CANCELADO);
    expect(cola.estado("a")!.motivo).toBeUndefined();
    expect(JSON.stringify(cola.estado("a"))).not.toContain("/home/");
    const cola2 = crearColaServicio({ ejecutar: async () => ({ codigo: 3, error: "tres /var/y.mp4" }), reloj: relojFalso() });
    cola2.encolar({ id: "z", proyecto: "p", args: [] });
    await de();
    expect(cola2.estado("z")!).toMatchObject({ estado: ESTADOS_SERVICIO.FALLO, error: expect.stringContaining("<ruta>") });
  });

  it("el tiempo máximo cancela en el límite y rechaza id repetido, proyecto y args", () => {
    const reloj = relojFalso();
    const cola = crearColaServicio({ ejecutar: () => diferido<{ codigo: number }>().promesa, reloj, maxSegundos: 3 });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    reloj.avanzar(2999);
    expect(cola.estado("a")!.estado).toBe(ESTADOS_SERVICIO.RENDERIZANDO);
    reloj.avanzar(1);
    expect(cola.estado("a")!).toMatchObject({ estado: ESTADOS_SERVICIO.CANCELADO, motivo: "tiempo máximo" });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    expect(() => cola.encolar({ id: "b", proyecto: "p", args: [] })).toThrow(/id/);
    expect(() => cola.encolar({ id: "c", proyecto: "/etc", args: [] })).toThrow(/proyecto/);
    expect(() => cola.encolar({ id: "d", proyecto: "p", args: ["-o", "salida", "extra"] })).toThrow(/sin bandera/);
  });
});
