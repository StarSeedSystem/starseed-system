import { describe, expect, it } from "vitest";
import {
  FLAGS_PERMITIDOS, crearCola, leerProgreso, validarArgumentos, validarTrabajo,
} from "../../../servicios/hyperframes/src/cola-render.mjs";
type Opciones = { proyecto: string; env: Record<string, string>; senal: AbortSignal; alProgreso: (linea: string) => void };
type Llamada = Opciones & { args: string[] };
/** Reloj manual: los plazos solo vencen cuando la prueba avanza el tiempo. */
function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj = {
    ahora: () => t,
    tras: (ms: number) => {
      const p = { en: t + ms, r: (): void => undefined };
      timers.push(p);
      return { promesa: new Promise<void>((res) => { p.r = res; }), cancelar: () => { const i = timers.indexOf(p); if (i >= 0) timers.splice(i, 1); } };
    },
  };
  const avanzar = (ms: number) => {
    t += ms;
    for (const p of timers.filter((x) => x.en <= t)) { timers.splice(timers.indexOf(p), 1); p.r(); }
  };
  return { reloj, avanzar, timers };
}

/** Ejecutor falso: guarda cada llamada y deja que la prueba decida cuándo termina. */
function ejecutorFalso(guion: (c: Llamada) => unknown) {
  const llamadas: Llamada[] = [];
  const ejecutar = (args: string[], o: Opciones): Promise<unknown> => {
    const c = { args, ...o };
    llamadas.push(c);
    return Promise.resolve(guion(c));
  };
  return { ejecutar, llamadas };
}

describe("cola de render de HyperFrames", () => {
  it("solo acepta argumentos en lista y flags de la lista blanca", () => {
    expect(validarArgumentos("-o x.mp4")).toMatch(/lista/);
    expect(validarArgumentos(["-o", "salida.mp4", "--format", "webm"])).toBeNull();
    expect(validarArgumentos(["--rm", "-rf"])).toContain("--rm");
    expect(validarArgumentos(["-o", "/etc/passwd"])).toMatch(/fuera del proyecto/);
    expect(validarArgumentos(["a\nb"])).toMatch(/control/);
    expect(FLAGS_PERMITIDOS).toContain("--composition");
  });

  it("valida el trabajo completo: id, proyecto y argumentos", () => {
    expect(validarTrabajo({ id: "t1", proyecto: "obra", args: [] })).toBeNull();
    expect(validarTrabajo({ id: "../x", proyecto: "obra", args: [] })).toMatch(/id/);
    expect(validarTrabajo({ id: "t1", proyecto: "../obra", args: [] })).toMatch(/fuera del proyecto/);
    expect(validarTrabajo({ id: "t1", proyecto: "obra", args: "-o x" })).toMatch(/lista/);
    expect(validarTrabajo(null)).toMatch(/objeto/);
  });

  it("lee @hf-progress, acota el progreso y quita rutas de los mensajes", () => {
    expect(leerProgreso('@hf-progress {"progress": 42.5, "stage": "captura"}')).toEqual({ progreso: 42.5, etapa: "captura" });
    expect(leerProgreso('@hf-progress {"progreso": 150}')).toEqual({ progreso: 100 });
    expect(leerProgreso('@hf-progress {"progreso": -2, "mensaje": "falló en /Users/ana/x"}')).toEqual({ progreso: 0, mensaje: "falló en <ruta>" });
    expect(leerProgreso("hola")).toBeNull();
    expect(leerProgreso("@hf-progress {roto}")).toBeNull();
  });

  it("exige ejecutor y topes válidos", () => {
    expect(() => crearCola({})).toThrow(/ejecutor/);
    expect(() => crearCola({ ejecutar: () => 0, maxSimultaneos: 0 })).toThrow(/maxSimultaneos/);
    expect(() => crearCola({ ejecutar: () => 0, maxSegundos: 0 })).toThrow(/maxSegundos/);
  });

  it("encola, lee progreso, apaga telemetría y rechaza ids repetidos", async () => {
    const { ejecutar, llamadas } = ejecutorFalso((c) => { c.alProgreso('@hf-progress {"progreso": 25, "etapa": "captura"}'); c.alProgreso('@hf-progress {"progreso": 75}'); return { codigo: 0 }; });
    const cola = crearCola({ ejecutar });
    expect(cola.encolar({ id: "t1", proyecto: "obra", args: "-o x" })).toMatchObject({ ok: false });
    expect(cola.encolar({ id: "t1", proyecto: "obra", args: ["-o", "salida.mp4"] })).toEqual({ ok: true, id: "t1" });
    expect(cola.encolar({ id: "t1", proyecto: "obra", args: [] })).toMatchObject({ ok: false });
    await cola.esperarInactividad();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ proyecto: "obra", args: ["-o", "salida.mp4"], env: { HYPERFRAMES_NO_TELEMETRY: "1" } });
    expect(cola.estado("t1")).toMatchObject({ estado: "hecho", progreso: 100, etapa: "captura" });
    expect(cola.listar().map((x: { id: string }) => x.id)).toEqual(["t1"]); expect(cola.estado("nadie")).toBeNull();
  });

  it("respeta maxSimultaneos y arranca el siguiente al liberar un hueco", async () => {
    const pendientes: (() => void)[] = [];
    const { ejecutar, llamadas } = ejecutorFalso(() => new Promise((res) => pendientes.push(() => res({ codigo: 0 }))));
    const cola = crearCola({ ejecutar, maxSimultaneos: 2 });
    for (const id of ["a", "b", "c"]) cola.encolar({ id, proyecto: "obra", args: [] });
    expect(llamadas).toHaveLength(2); expect(cola.estado("c")).toMatchObject({ estado: "en-cola" });
    pendientes[0](); await Promise.resolve(); await Promise.resolve();
    expect(llamadas).toHaveLength(3);
    pendientes[1](); pendientes[2](); await cola.esperarInactividad();
    expect(["a", "b", "c"].map((id) => cola.estado(id)?.estado)).toEqual(["hecho", "hecho", "hecho"]);
  });

  it("corta por tiempo máximo y lo marca fallo aunque no termine", async () => {
    const { reloj, avanzar } = relojFalso(); let senal: AbortSignal | undefined;
    const { ejecutar } = ejecutorFalso((c) => { senal = c.senal; return new Promise(() => undefined); });
    const cola = crearCola({ ejecutar, reloj, maxSegundos: 5 });
    cola.encolar({ id: "t", proyecto: "obra", args: [] });
    avanzar(4_999); await Promise.resolve(); expect(cola.estado("t")?.estado).toBe("renderizando");
    avanzar(1); await cola.esperarInactividad();
    expect(senal?.aborted).toBe(true); expect(cola.estado("t")).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("tiempo máximo") });
  });

  it("cancela en cola sin ejecutar y corta el que está renderizando", async () => {
    const { ejecutar, llamadas } = ejecutorFalso((c) => new Promise((_, rej) => c.senal.addEventListener("abort", () => rej(new Error("abortado")))));
    const cola = crearCola({ ejecutar });
    cola.encolar({ id: "a", proyecto: "obra", args: [] }); cola.encolar({ id: "b", proyecto: "obra", args: [] });
    expect(cola.cancelar("b")).toMatchObject({ ok: true }); expect(cola.estado("b")).toMatchObject({ estado: "cancelado" }); expect(llamadas).toHaveLength(1);
    expect(cola.cancelar("a")).toMatchObject({ ok: true }); await cola.esperarInactividad();
    expect(cola.estado("a")).toMatchObject({ estado: "cancelado" });
    expect(cola.cancelar("a")).toMatchObject({ ok: false }); expect(cola.cancelar("nadie")).toMatchObject({ ok: false });
  });
  it("un código distinto de cero es fallo y el motivo no filtra rutas", async () => {
    const { ejecutar } = ejecutorFalso(() => ({ codigo: 2, error: "falló en /Users/ana/obra/index.html" }));
    const cola = crearCola({ ejecutar }); cola.encolar({ id: "t", proyecto: "obra", args: [] });
    await cola.esperarInactividad();
    const e = cola.estado("t");
    expect(e).toMatchObject({ estado: "fallo" }); expect(e?.motivo).toContain("<ruta>"); expect(JSON.stringify(e)).not.toContain("/Users/");
  });
});
