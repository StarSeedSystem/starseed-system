import { describe, it, expect } from "vitest";
import { crearCola, ESTADOS, ENTORNO, validarArgs, progresoDeLinea } from "../../../servicios/hyperframes/src/cola-render.mjs";

interface TrabajoFalso { id: string; proyecto: string; args: string[]; env: Record<string, string> }
interface OpcionesFalsas { senal: AbortSignal; alProgreso: (linea: string) => void }
type ResultadoFalso = { codigo: number; salida?: string; error?: string };

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

describe("hyperframes-cola (servicio)", () => {
  it("solo acepta listas con banderas de la lista blanca y valores dentro del proyecto", () => {
    expect(validarArgs("-o salida.mp4")).toMatch(/lista/);
    expect(validarArgs(["-o", "salida.mp4", "--format=mp4", "-q"])).toBeNull();
    expect(validarArgs(["salida.mp4"])).toBe("argumento sin bandera");
    expect(validarArgs(["--rm", "x"])).toMatch(/no permitida/);
    expect(validarArgs(["-o"])).toMatch(/necesita un valor/);
    expect(validarArgs(["-o", "/etc/passwd"])).toMatch(/fuera/);
    expect(validarArgs(["-o", "../x"])).toMatch(/fuera/);
    expect(validarArgs(["-o", "a\nb"])).toMatch(/valor|control/);
  });

  it("lee las líneas @hf-progress y descarta el ruido", () => {
    expect(progresoDeLinea('render @hf-progress {"frame":12,"total":72}')).toEqual({ frame: 12, total: 72 });
    expect(progresoDeLinea("otra línea")).toBeNull();
    expect(progresoDeLinea("@hf-progress {roto")).toBeNull();
    expect(progresoDeLinea("@hf-progress [1]")).toBeNull();
    expect(progresoDeLinea('@hf-progress {"frame":-1,"total":0}')).toBeNull();
  });

  it("renderiza en orden, copia args, apaga la telemetría y lee el progreso", async () => {
    const d = diferido<ResultadoFalso>();
    const llamadas: { trabajo: TrabajoFalso; opciones: OpcionesFalsas }[] = [];
    const ejecutar = (trabajo: TrabajoFalso, opciones: OpcionesFalsas) => { llamadas.push({ trabajo, opciones }); return d.promesa; };
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    const id = cola.encolar({ id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"] });
    await esperar();
    expect(cola.estado(id)!.estado).toBe(ESTADOS.RENDERIZANDO);
    expect(llamadas[0].trabajo).toEqual({ id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"], env: { ...ENTORNO } });
    expect(llamadas[0].trabajo.env).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    expect(llamadas[0].opciones.senal).toBeInstanceOf(AbortSignal);
    llamadas[0].opciones.alProgreso('@hf-progress {"frame":5,"total":10}');
    expect(cola.estado(id)!.progreso).toEqual({ frame: 5, total: 10 });
    d.resolver({ codigo: 0, salida: "a.mp4" });
    await esperar();
    expect(cola.estado(id)!).toMatchObject({ estado: ESTADOS.HECHO, resultado: { codigo: 0, salida: "a.mp4" } });
  });

  it("respeta el tope: con dos huecos arranca dos y el tercero espera en cola", async () => {
    const a = diferido<ResultadoFalso>(), b = diferido<ResultadoFalso>(), c = diferido<ResultadoFalso>();
    const promesas: Record<string, Promise<ResultadoFalso>> = { a: a.promesa, b: b.promesa, c: c.promesa };
    const lanzados: string[] = [];
    const ejecutar = (t: TrabajoFalso) => { lanzados.push(t.id); return promesas[t.id]; };
    const cola = crearCola({ ejecutar, reloj: relojFalso(), maxSimultaneos: 2 });
    for (const id of ["a", "b", "c"]) cola.encolar({ id, proyecto: "p", args: [] });
    await esperar();
    expect(lanzados).toEqual(["a", "b"]);
    expect(cola.estado("c")!.estado).toBe(ESTADOS.EN_COLA);
    a.resolver({ codigo: 0 });
    await esperar(); await esperar();
    expect(lanzados).toEqual(["a", "b", "c"]);
  });

  it("un código distinto de cero es fallo sin rutas absolutas, y rechaza entradas inseguras", async () => {
    const cola = crearCola({ ejecutar: async () => ({ codigo: 2, error: "no pudo /home/a/x.mp4" }), reloj: relojFalso() });
    expect(() => cola.encolar({ id: "x", proyecto: "p", args: ["--rm"] })).toThrow(/bandera/);
    expect(() => cola.encolar({ id: "y", proyecto: "/etc", args: [] })).toThrow(/proyecto/);
    cola.encolar({ id: "x", proyecto: "p", args: [] });
    expect(() => cola.encolar({ id: "x", proyecto: "p", args: [] })).toThrow(/id/);
    await esperar();
    expect(cola.estado("x")!).toMatchObject({ estado: ESTADOS.FALLO, resultado: { codigo: 2 } });
    expect(cola.estado("x")!.error).toContain("<ruta>");
    expect(cola.estado("x")!.error).not.toContain("/home/");
    expect(cola.listar().map((t: { id: string }) => t.id)).toEqual(["x"]);
  });

  it("cancela lo que espera sin lanzarlo y aborta lo que ya renderiza", async () => {
    const d = diferido<ResultadoFalso>();
    const lanzados: string[] = [];
    let senal: AbortSignal | undefined;
    const ejecutar = (_t: TrabajoFalso, o: OpcionesFalsas) => { lanzados.push("a"); senal = o.senal; return d.promesa; };
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    cola.encolar({ id: "b", proyecto: "p", args: [] });
    await esperar();
    expect(lanzados).toEqual(["a"]);
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
    const cola = crearCola({ ejecutar: () => diferido<ResultadoFalso>().promesa, reloj, maxSegundos: 2 });
    cola.encolar({ id: "a", proyecto: "p", args: [] });
    await esperar();
    reloj.avanzar(1999);
    expect(cola.estado("a")!.estado).toBe(ESTADOS.RENDERIZANDO);
    reloj.avanzar(1);
    expect(cola.estado("a")!).toMatchObject({ estado: ESTADOS.CANCELADO, motivo: "tiempo máximo" });
  });
});
