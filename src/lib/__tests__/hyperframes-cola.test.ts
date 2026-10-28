import { describe, expect, it } from "vitest";
import { FLAGS_PERMITIDOS, crearCola, leerProgreso, proyectoValido, validarArgs } from "../../../servicios/hyperframes/src/cola-render.mjs";
type Trabajo = { id: string; proyecto: string; args: string[] };
type Opciones = { entorno: Record<string, string>; senal: AbortSignal; alProgreso: (linea: string) => void };
type Diferido<T> = { promesa: Promise<T>; resolver: (v: T) => void; rechazar: (e: unknown) => void };
function diferido<T>(): Diferido<T> {
  let resolver!: (v: T) => void, rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej; });
  return { promesa, resolver, rechazar };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
function colaDePrueba(maxSimultaneos = 1, maxSegundos = 900) {
  const llamadas: { trabajo: Trabajo; opciones: Opciones }[] = [], pendientes: Diferido<{ codigo: number; salida?: string }>[] = [];
  const cola = crearCola({
    reloj: () => 1000, maxSimultaneos, maxSegundos,
    ejecutar: (trabajo: Trabajo, opciones: Opciones) => {
      llamadas.push({ trabajo, opciones });
      const d = diferido<{ codigo: number; salida?: string }>();
      pendientes.push(d);
      return d.promesa;
    },
  });
  return { cola, llamadas, pendientes };
}
describe("cola de render de hyperframes", () => {
  it("respeta el tope, encola copias en lista y apaga la telemetría", async () => {
    const { cola, llamadas, pendientes } = colaDePrueba();
    const args = ["render", "-o", "salida.mp4"];
    const a = cola.encolar({ proyecto: "proyecto-a", args });
    const b = cola.encolar({ proyecto: "proyecto-b", args: ["render", "--format=webm"] });
    await esperar(0);
    expect(cola.estado(a)).toMatchObject({ estado: "renderizando" });
    expect(cola.estado(b)).toMatchObject({ estado: "en-cola" });
    expect(cola.estado("no-existe")).toBeNull();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].opciones.entorno).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    args.push("-q"); expect(llamadas[0].trabajo.args).toEqual(["render", "-o", "salida.mp4"]);
    llamadas[0].opciones.alProgreso("@hf-progress {\"fotograma\":3,\"total\":72}");
    expect(cola.estado(a)?.progreso).toEqual({ fotograma: 3, total: 72 });
    pendientes[0].resolver({ codigo: 0, salida: "@hf-progress {\"fotograma\":72,\"total\":72}" });
    await esperar(0);
    expect(cola.estado(a)?.estado).toBe("hecho");
    expect(cola.estado(a)?.progreso).toEqual({ fotograma: 72, total: 72 });
    expect(cola.estado(b)?.estado).toBe("renderizando");
    pendientes[1].resolver({ codigo: 0 });
    await esperar(0);
    expect(cola.estado(b)?.estado).toBe("hecho");
  });
  it("cancela lo que espera y aborta lo que se está renderizando", async () => {
    const senales: AbortSignal[] = [];
    const cola = crearCola({
      reloj: () => 0,
      ejecutar: (_trabajo: Trabajo, opciones: Opciones) => {
        senales.push(opciones.senal);
        return new Promise<{ codigo: number }>((_, rechazar) => {
          opciones.senal.addEventListener("abort", () => rechazar(new Error("abortado")));
        });
      },
    });
    const a = cola.encolar({ proyecto: "p", args: ["render"] });
    const b = cola.encolar({ proyecto: "p", args: ["render"] });
    await esperar(0);
    expect(cola.cancelar(b)).toBe(true);
    expect(cola.estado(b)?.estado).toBe("cancelado");
    expect(cola.cancelar(a)).toBe(true);
    expect(senales[0].aborted).toBe(true);
    expect(cola.estado(a)?.estado).toBe("cancelado");
    expect(cola.cancelar(a)).toBe(false);
  });
  it("marca fallo con el código o con un motivo sin rutas", async () => {
    let n = 0;
    const cola = crearCola({
      reloj: () => 0,
      ejecutar: async () => {
        n += 1;
        if (n === 1) return { codigo: 2 };
        throw new Error("falló en /Users/alex/x");
      },
    });
    const a = cola.encolar({ proyecto: "p", args: ["render"] }); await esperar(0);
    expect(cola.estado(a)).toMatchObject({ estado: "fallo", motivo: "el render salió con código 2" });
    const b = cola.encolar({ proyecto: "p", args: ["render"] }); await esperar(0);
    expect(cola.estado(b)).toMatchObject({ estado: "fallo", motivo: "el render no pudo ejecutarse" });
    expect(JSON.stringify(cola.estado(b))).not.toContain("/Users/");
  });
  it("corta por tiempo máximo y deja el trabajo en fallo", async () => {
    const cola = crearCola({
      reloj: () => Date.now(), maxSegundos: 0.02,
      ejecutar: (_trabajo: Trabajo, opciones: Opciones) => new Promise<{ codigo: number }>((_, rechazar) => {
        opciones.senal.addEventListener("abort", () => rechazar(new Error("abortado")));
      }),
    });
    const id = cola.encolar({ proyecto: "p", args: ["render"] });
    await esperar(80);
    expect(cola.estado(id)).toMatchObject({ estado: "fallo", motivo: "tiempo máximo excedido" });
  });
  it("rechaza cadenas de shell, flags fuera de la lista y proyectos que salen", () => {
    expect(validarArgs("render -o salida.mp4")).toMatch(/lista/);
    expect(validarArgs([])).toMatch(/faltan/);
    expect(validarArgs(["render", "--rm"])).toMatch(/flag/);
    expect(validarArgs(["render", "a\nb"])).toMatch(/control/);
    for (const bandera of FLAGS_PERMITIDOS) expect(validarArgs([bandera, "x"])).toBeNull();
    expect(validarArgs(["render", "-o=salida.mp4", "--format=mp4", "--variables={\"a\":1}"])).toBeNull();
    expect(proyectoValido("proyectos/a")).toBeNull();
    expect(proyectoValido("../fuera")).toMatch(/salir/);
    expect(proyectoValido("/etc")).toMatch(/relativa/);
    const cola = crearCola({ reloj: () => 0, ejecutar: async () => ({ codigo: 0 }) });
    expect(() => cola.encolar({ proyecto: "p", args: "render" })).toThrow(/lista/);
    expect(() => cola.encolar({ proyecto: "/p", args: ["render"] })).toThrow(/relativa/);
    expect(() => cola.encolar({ proyecto: "p", args: ["render"], id: "con espacio" })).toThrow(/id/);
  });
  it("lee solo las líneas @hf-progress con un objeto JSON", () => {
    expect(leerProgreso("ruido")).toBeNull();
    expect(leerProgreso("@hf-progress {\"fotograma\":3,\"total\":72}")).toEqual({ fotograma: 3, total: 72 });
    expect(leerProgreso("x @hf-progress {\"a\":1} y")).toEqual({ a: 1 });
    expect(leerProgreso("@hf-progress {roto")).toBeNull();
    expect(leerProgreso("@hf-progress [1,2]")).toBeNull();
  });
});
