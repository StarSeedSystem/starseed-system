import { describe, expect, it, vi } from "vitest";
import { FLAGS_PERMITIDAS, TOPE_EN_COLA, crearCola, leerProgreso, validarArgs } from "../../../servicios/hyperframes/src/cola-render.mjs";

const HTML = "<div data-composition-id=\"a\"></div>";
const ARGS = ["--format", "mp4", "-o", "salida.mp4"];
type Opciones = { entorno: Record<string, string>; linea: (t: string) => void; cancelado: () => boolean };

/** Reloj falso con avance manual. */
const relojFalso = () => {
  let t = 0;
  return { avanzar: (ms: number) => { t += ms; }, ahora: () => t };
};

/** Ejecutor que se cuelga en los ids señalados hasta que se le suelta uno a uno. */
const ejecutorColgado = (idsColga: string[]) => {
  const soltador: Record<string, () => void> = {};
  const fn = vi.fn(async (t: unknown, op: Opciones) => {
    const id = (t as { id: string }).id;
    op.linea(`@hf-progress {"fotograma": ${id === "hf-0002" ? 7 : 1}, "total": 9}`);
    expect(op.entorno.HYPERFRAMES_NO_TELEMETRY).toBe("1");
    if (idsColga.includes(id)) await new Promise<void>((r) => { soltador[id] = r; });
    return "listo";
  });
  return { fn, soltar: (id: string) => soltador[id]?.() };
};

/** Ejecutor que va despacio en microtareas: sirve para cancelarlo en pleno render. */
const ejecutorLento = () =>
  vi.fn(async (_t: unknown, op: Opciones) => {
    for (let i = 0; i < 60; i++) {
      if (op.cancelado()) throw new Error("parado");
      op.linea(`@hf-progress {"fotograma": ${i}, "total": 9}`);
      await Promise.resolve();
    }
    return "listo";
  });

/** El trabajo activo ya terminó o sigue en su microtarea: da margen para los estados finales. */
const listos = () => new Promise((r) => setTimeout(r, 2));

describe("servicio hyperframes · validación de args y progreso", () => {
  it("los args van SIEMPRE en lista y con flags de la lista blanca", () => {
    expect(FLAGS_PERMITIDAS.has("--composition")).toBe(true);
    expect(validarArgs(ARGS)).toBeNull();
    expect(validarArgs(["--format=mp4", "-q"])).toBeNull();
    expect(validarArgs("render x.mp4" as unknown as string[])).toMatch(/lista/);
    expect(validarArgs([])).toMatch(/lista/);
    expect(validarArgs(["--batch"]).startsWith("flag no permitida")).toBe(true);
    expect(validarArgs(["-o", "\0"])).toMatch(/no válido/);
    expect(validarArgs(["--format", "mp4", "mp4", "extra"])).toMatch(/suelto/);
  });

  it("solo hace progreso con el prefijo @hf-progress y sanea los campos conocidos", () => {
    expect(leerProgreso("@hf-progress {\"fotograma\": 12, \"total\": 72}")).toEqual({ fotograma: 12, total: 72 });
    expect(leerProgreso("@hf-progress {\"fotograma\": 1, \"secreto\": \"x\"}")).toEqual({ fotograma: 1 });
    expect(leerProgreso("@hf-progress {no json")).toBeNull();
    expect(leerProgreso("renderizando…")).toBeNull();
    expect(leerProgreso("@hf-progress [1, 2]")).toBeNull();
  });
});

describe("servicio hyperframes · cola de render", () => {
  it("exige ejecutor, reloj y topes razonables", () => {
    expect(() => crearCola({ reloj: relojFalso() })).toThrow(/ejecutor/);
    expect(() => crearCola({ ejecutar: vi.fn(), reloj: {} as { ahora: () => number } })).toThrow(/reloj/);
    expect(() => crearCola({ ejecutar: vi.fn(), reloj: relojFalso(), maxSimultaneos: 0 })).toThrow(/maxSimultaneos/);
    expect(() => crearCola({ ejecutar: vi.fn(), reloj: relojFalso(), maxSegundos: 0.4 })).toThrow(/maxSegundos/);
  });

  it("ejecuta el trabajo con sus args en lista, telemetría apagada y termina «hecho»", async () => {
    const reloj = relojFalso();
    const ejecutar = vi.fn(async (t: unknown, op: Opciones) => {
      op.linea("línea sin prefijo");
      op.linea("@hf-progress {\"fotograma\": 30, \"total\": 72, \"raro\": 1}");
      expect((t as { proyecto: string }).proyecto).toBe(HTML);
      expect((t as { args: string[] }).args).toEqual(ARGS);
      expect(op.entorno.HYPERFRAMES_NO_TELEMETRY).toBe("1");
      return "video.mp4";
    });
    const cola = crearCola({ ejecutar, reloj });
    await expect(cola.encolar({ args: ARGS })).rejects.toThrow(/proyecto/);
    const id = await cola.encolar({ proyecto: HTML, args: ARGS });
    await listos();
    const e = await cola.estado(id);
    expect(e?.estado).toBe("hecho");
    expect(e?.progreso).toEqual({ fotograma: 30, total: 72 });
    expect(e?.terminado).toBeGreaterThanOrEqual(e?.creado ?? 0);
    expect(e?.error).toBeNull();
    expect(await cola.estado("no-existe")).toBeNull();
  });

  it("un ejecutor que falla da «fallo» sin rutas absolutas en el mensaje", async () => {
    const cola = crearCola({ ejecutar: async () => { throw new Error("murió en /home/otra/cosa.mp4"); }, reloj: relojFalso() });
    const id = await cola.encolar({ proyecto: HTML, args: ARGS });
    await listos();
    const e = await cola.estado(id);
    expect(e?.estado).toBe("fallo");
    expect(e?.error).toBe("murió en <ruta>");
  });

  it("respeta el tope de simultaneidad y cancela uno que aún está en cola", async () => {
    const { fn, soltar } = ejecutorColgado(["hf-0001"]);
    const cola = crearCola({ ejecutar: fn, reloj: relojFalso(), maxSimultaneos: 1 });
    const id1 = await cola.encolar({ proyecto: HTML, args: ARGS });
    const id2 = await cola.encolar({ proyecto: HTML, args: ARGS });
    expect((await cola.estado(id1))?.estado).toBe("renderizando");
    expect((await cola.estado(id2))?.estado).toBe("en-cola");
    expect(await cola.cancelar(id2)).toBe(true);
    expect((await cola.estado(id2))?.estado).toBe("cancelado");
    expect((await cola.estado(id2))?.error).toBe("cancelada a petición");
    expect(await cola.cancelar("no-existe")).toBe(false);
    soltar("hf-0001");
    await listos();
    expect((await cola.estado(id1))?.estado).toBe("hecho");
    expect(cola.listar()).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancela un render en marcha: el ejecutor ve la señal y acaba «cancelado»", async () => {
    const ejecutar = ejecutorLento();
    const cola = crearCola({ ejecutar, reloj: relojFalso() });
    const id = await cola.encolar({ proyecto: HTML, args: ARGS });
    expect((await cola.estado(id))?.estado).toBe("renderizando");
    expect(await cola.cancelar(id)).toBe(true);
    await listos();
    const e = await cola.estado(id);
    expect(e?.estado).toBe("cancelado");
    expect(e?.error).toBe("cancelada a petición");
    expect(await cola.cancelar(id)).toBe(false);
  });

  it("corta por tiempo máximo: el reloj avanza y el trabajo queda «cancelado»", async () => {
    const reloj = relojFalso();
    const ejecutar = vi.fn(async (_t: unknown, op: Opciones) => {
      reloj.avanzar(2_500);
      op.linea("@hf-progress {\"fotograma\": 1, \"total\": 9}");
      expect(op.cancelado()).toBe(true);
      return "tarde";
    });
    const cola = crearCola({ ejecutar, reloj, maxSegundos: 2 });
    const id = await cola.encolar({ proyecto: HTML, args: ARGS });
    await listos();
    const e = await cola.estado(id);
    expect(e?.estado).toBe("cancelado");
    expect(e?.error).toBe("tiempo máximo superado");
    expect(e?.progreso).toEqual({ fotograma: 1, total: 9 });
  });

  it("ejecuta en paralelo según maxSimultaneos y libera la cola al terminar", async () => {
    const { fn, soltar } = ejecutorColgado(["hf-0001", "hf-0002"]);
    const cola = crearCola({ ejecutar: fn, reloj: relojFalso(), maxSimultaneos: 2 });
    const a = await cola.encolar({ proyecto: HTML, args: ARGS });
    const b = await cola.encolar({ proyecto: HTML, args: ARGS });
    const c = await cola.encolar({ proyecto: HTML, args: ARGS });
    await listos();
    expect(fn).toHaveBeenCalledTimes(2);
    expect((await cola.estado(a))?.estado).toBe("renderizando");
    expect((await cola.estado(b))?.estado).toBe("renderizando");
    expect((await cola.estado(c))?.estado).toBe("en-cola");
    soltar("hf-0001");
    await listos();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(await cola.estado(b)).not.toBeNull();
    expect((await cola.estado(c))?.estado).toBe("hecho");
    expect(cola.listar()).toHaveLength(3);
    expect(TOPE_EN_COLA).toBeGreaterThan(2);
  });
});
