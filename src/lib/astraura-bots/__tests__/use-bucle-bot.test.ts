import { describe, expect, it, vi } from "vitest";
import { MAX_PERSISTIDO, crearControlBucle, type DepsControlBucle } from "../adaptadores/control-bucle";
import { anotarRegistroRemoto } from "../adaptadores/use-bucle-bot";
import type { EntradaRegistro, EventoBucle } from "../bucle";
import type { Decision } from "../permisos";
import { SENTIDOS, type Bot, type Sentido } from "../tipos";
import type { Previo } from "../acciones";
const bot = (extra: Partial<Bot> = {}): Bot => ({
  id: "b1", nombre: "Astraura", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: SENTIDOS, activo: true, ...extra,
});
const ok = (previo: Previo = {}) => ({ ok: true, previo, motivo: "Aplicada." }); const mal = (motivo: string) => ({ ok: false, previo: {}, motivo });
const SI: Decision = { permitido: true, requiere: "nada", motivo: "ok", indicador: true }; const NO: Decision = { permitido: false, requiere: "nunca", motivo: "no", indicador: false };
const entrada: EntradaRegistro = { at: 1000, botId: "b1", quien: "cuenta-A", tipo: "aplicada", motivo: "ok" };
function montar(extra: Partial<DepsControlBucle> = {}) {
  const guardados: EntradaRegistro[][] = [];
  const ejecutar = vi.fn(async () => ok());
  const dep: DepsControlBucle = {
    bot: bot(), ejecutar, guardar: (_id, r) => { guardados.push([...r]); }, ahora: () => 1000, ...extra,
  };
  return { control: crearControlBucle(dep), ejecutar, guardados };
}
describe("control del bucle por bot", () => {
  it("propone, espera a una persona, ejecuta y anota el registro", async () => {
    const ejecutar = vi.fn(async () => ok({ ruta: "/antes" }));
    const { control, guardados } = montar({ ejecutar });
    let e = await control.proponer({ tipo: "navegar", args: { ruta: "/destino" } }, "proponer");
    expect(e.fase).toBe("esperando");
    expect(ejecutar).not.toHaveBeenCalled();
    e = await control.confirmar("cuenta-A");
    expect(ejecutar).toHaveBeenCalledWith({ tipo: "navegar", args: { ruta: "/destino" } });
    expect(e.fase).toBe("hecho");
    expect(e.registro.map((r) => r.tipo)).toEqual(["propuesta", "confirmada", "aplicada"]);
    expect(e.registro.at(-1)?.deshacer).toEqual({ accion: { tipo: "navegar", args: { ruta: "/antes" } } });
    expect(guardados.at(-1)?.map((r) => r.tipo)).toEqual(["propuesta", "confirmada", "aplicada"]);
  });
  it("con el nivel por defecto aplica lo de riesgo bajo sin esperar", async () => {
    const { control, ejecutar } = montar();
    const e = await control.proponer({ tipo: "navegar", args: { ruta: "/hub" } });
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(e.fase).toBe("hecho");
  });
  it("lo prohibido nunca llega al ejecutor", async () => {
    const ejecutar = vi.fn(async () => ok());
    const { control } = montar({ bot: bot({ origen: "externo" }), ejecutar });
    const e = await control.proponer({ tipo: "computadora.ejecutar", args: { orden: "ls" } });
    expect(e.fase).toBe("rechazado");
    expect(ejecutar).not.toHaveBeenCalled();
  });
  it("una acción desconocida no llega al ejecutor y dice el problema", async () => {
    const { control, ejecutar } = montar();
    const e = await control.proponer({ tipo: "borrar-disco", args: {} });
    expect(e.fase).toBe("reposo");
    expect(ejecutar).not.toHaveBeenCalled();
    expect(control.problemas()[0]).toContain("desconocida");
  });
  it("si el ejecutor falla, vuelve a reposo y anota el fallo", async () => {
    const ejecutar = vi.fn(async () => mal("sin red"));
    const { control } = montar({ ejecutar });
    const e = await control.proponer({ tipo: "navegar", args: { ruta: "/hub" } });
    expect(e.fase).toBe("reposo");
    expect(e.registro.at(-1)).toMatchObject({ tipo: "fallo", motivo: "sin red" });
  });
  it("rechazar deja la propuesta rechazada sin ejecutar", async () => {
    const { control, ejecutar } = montar();
    await control.proponer({ tipo: "navegar", args: { ruta: "/hub" } }, "proponer");
    const e = control.rechazar("cuenta-A");
    expect(e.fase).toBe("rechazado");
    expect(ejecutar).not.toHaveBeenCalled();
    expect(e.registro.at(-1)).toMatchObject({ tipo: "rechazada", quien: "cuenta-A" });
  });
  it("deshacer ejecuta la acción inversa por el mismo ejecutor", async () => {
    const ejecutar = vi.fn(async () => ok({ ruta: "/antes" }));
    const { control } = montar({ ejecutar });
    await control.proponer({ tipo: "navegar", args: { ruta: "/destino" } });
    const r = await control.deshacer("cuenta-A");
    expect(ejecutar).toHaveBeenLastCalledWith({ tipo: "navegar", args: { ruta: "/antes" } });
    expect(r.motivo).toBe("Deshecho.");
    expect(r.estado.ultimaAplicada).toBeUndefined();
    expect(r.estado.registro.at(-1)).toMatchObject({ tipo: "deshecha", quien: "cuenta-A" });
  });
  it("deshacer sin nada aplicado dice por qué y no ejecuta", async () => {
    const { control, ejecutar } = montar();
    const r = await control.deshacer("cuenta-A");
    expect(r.motivo).toContain("No hay");
    expect(ejecutar).not.toHaveBeenCalled();
  });
  it("pausar apaga todos los sentidos y deja el bucle en reposo", async () => {
    const percibir = vi.fn(async (sentido: Sentido, alEvento: (ev: EventoBucle) => void) => {
      alEvento({ tipo: "observar", sentido, decision: SI, at: 1 });
      return { ok: true as const, texto: "ok" };
    });
    const { control } = montar({ percibir });
    let e = await control.encenderSentido("pantalla");
    expect(e.sentidosActivos).toEqual(["pantalla"]);
    e = control.pausar("cuenta-A");
    expect(e.sentidosActivos).toEqual([]);
    expect(e.fase).toBe("reposo");
  });
  it("el registro persistido se recorta a los últimos 200 pasos", async () => {
    const percibir = vi.fn(async (sentido: Sentido, alEvento: (ev: EventoBucle) => void) => {
      alEvento({ tipo: "observar", sentido, decision: NO, at: 1 });
      return { ok: false as const, motivo: "no" };
    });
    const { control, guardados } = montar({ percibir });
    for (let i = 0; i < MAX_PERSISTIDO + 30; i++) await control.encenderSentido("pantalla");
    expect(control.estado().registro.length).toBe(MAX_PERSISTIDO + 30);
    expect(guardados.at(-1)?.length).toBe(MAX_PERSISTIDO);
  });
  it("sin sesión no inserta ni lanza; si la red falla, también se traga el error", async () => {
    const insertar = vi.fn(async () => { throw new Error("red"); });
    expect(await anotarRegistroRemoto("b1", entrada, { sesion: async () => null, insertar })).toBe(false);
    expect(insertar).not.toHaveBeenCalled();
    expect(await anotarRegistroRemoto("b1", entrada, {
      sesion: async () => ({ cuentaId: "c1" }), insertar,
    })).toBe(false);
  });
});
