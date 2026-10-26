import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextoProto, PlanPeticion, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { ESPERA_PLAN_MS, usePeticion } from "../use-peticion";

const ctx: ContextoProto = { ruta: "/grupo/semilla", ambito: "grupo", entidad: { tipo: "grupo", id: "g1", nombre: "Semilla" } };
const plan = (extra: Partial<PlanPeticion> = {}): PlanPeticion => ({
  resumen: "Editar el grupo", tipoCambio: "diseno", motor: "Needle", fuera: [],
  pasos: [{ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "g1" }, cambio: "tema oscuro", modo: "directo" }], ...extra,
});
const v = (decision: VeredictoGobierno["decision"]): VeredictoGobierno => ({ decision, motivo: "porque sí", confirmar: true });

function montar(over: { planificar?: ReturnType<typeof vi.fn>; ejecutar?: ReturnType<typeof vi.fn>; decidir?: ReturnType<typeof vi.fn> } = {}) {
  const planificar = over.planificar ?? vi.fn(async () => plan());
  const ejecutar = over.ejecutar ?? vi.fn(async () => ({ ok: true, hechos: ["Hecho"], pendientes: [] }));
  const decidir = over.decidir ?? vi.fn(() => v("aplicar"));
  const r = renderHook(() => usePeticion(ctx, { planificar, ejecutar, decidir } as never));
  return { ...r, planificar, ejecutar, decidir };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("usePeticion", () => {
  it("texto → plan con el veredicto del gobierno → confirmar → hecho", async () => {
    const { result, planificar, ejecutar, decidir } = montar();
    await act(async () => { await result.current.pedir("pon el tema oscuro", "rama"); });
    expect(planificar).toHaveBeenCalledWith({ texto: "pon el tema oscuro", contexto: ctx, modo: "rama" });
    expect(decidir).toHaveBeenCalledWith(ctx, expect.objectContaining({ origen: "ia" }), "diseno");
    expect(result.current.estado).toMatchObject({ fase: "plan", veredicto: { decision: "aplicar" }, origen: "ia" });
    expect(ejecutar).not.toHaveBeenCalled(); // nada se aplica sin confirmar
    await act(async () => { result.current.confirmar(); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("si el gobierno dice proponer o votar, confirmar abre la propuesta y NO ejecuta", async () => {
    for (const d of ["proponer", "votar"] as const) {
      const { result, ejecutar } = montar({ decidir: vi.fn(() => v(d)) });
      await act(async () => { await result.current.pedir("cambia el diseño"); });
      await act(async () => { result.current.confirmar(); });
      expect(result.current.estado.fase).toBe("propuesta");
      expect(ejecutar).not.toHaveBeenCalled();
      act(() => result.current.volverAlPlan());
      expect(result.current.estado.fase).toBe("plan");
    }
  });

  it("si el gobierno deniega, confirmar no hace nada", async () => {
    const { result, ejecutar } = montar({ decidir: vi.fn(() => v("denegar")) });
    await act(async () => { await result.current.pedir("borra todo"); });
    await act(async () => { result.current.confirmar(); });
    expect(result.current.estado.fase).toBe("plan");
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("un plan que solo abre una vista se ejecuta sin confirmar ni pasar por el gobierno", async () => {
    const { result, ejecutar, decidir } = montar();
    await act(async () => { result.current.lanzarPlan(plan({ pasos: [{ tipo: "abrir-en", donde: "xr" }], tipoCambio: "creacion" })); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(decidir).not.toHaveBeenCalled();
  });

  it("un plan de herramienta que cambia algo se enseña antes y su actor es una persona", async () => {
    const { result, decidir, ejecutar } = montar();
    await act(async () => { result.current.lanzarPlan(plan()); });
    expect(result.current.estado).toMatchObject({ fase: "plan", origen: "humano" });
    expect(decidir).toHaveBeenCalledWith(ctx, expect.objectContaining({ origen: "humano" }), "diseno");
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("los fallos del motor se cuentan con su tipo y su motivo", async () => {
    const { result } = montar({ planificar: vi.fn(async () => ({ error: "sin-ia", motivo: "No hay IA conectada" })) });
    await act(async () => { await result.current.pedir("haz algo"); });
    expect(result.current.estado).toMatchObject({ fase: "error", tipo: "sin-ia", motivo: "No hay IA conectada", texto: "haz algo" });
  });

  it("una excepción al planificar no deja la ventana colgada", async () => {
    const { result } = montar({ planificar: vi.fn(async () => { throw new Error("red caída"); }) });
    await act(async () => { await result.current.pedir("haz algo"); });
    expect(result.current.estado).toMatchObject({ fase: "error", tipo: "fallo", motivo: "red caída" });
    expect(result.current.ocupado).toBe(false);
  });

  it("si el gobierno revienta, no se aplica nada", async () => {
    const { result } = montar({ decidir: vi.fn(() => { throw new Error("sin reglas"); }) });
    await act(async () => { await result.current.pedir("haz algo"); });
    expect(result.current.estado).toMatchObject({ fase: "plan", veredicto: { decision: "denegar" } });
  });

  it("un texto vacío no llama a la IA", async () => {
    const { result, planificar } = montar();
    await act(async () => { await result.current.pedir("   "); });
    expect(planificar).not.toHaveBeenCalled();
    expect(result.current.estado).toMatchObject({ fase: "error", tipo: "vacia" });
  });

  it("una sola petición a la vez: pedir dos veces seguidas llama una vez", async () => {
    let soltar: (p: PlanPeticion) => void = () => {};
    const planificar = vi.fn(() => new Promise<PlanPeticion>((r) => { soltar = r; }));
    const { result } = montar({ planificar });
    act(() => { void result.current.pedir("uno"); void result.current.pedir("dos"); });
    expect(planificar).toHaveBeenCalledTimes(1);
    expect(result.current.estado.fase).toBe("planificando");
    await act(async () => { soltar(plan()); });
    expect(result.current.estado.fase).toBe("plan");
  });

  it("cancelar descarta una respuesta que llega tarde", async () => {
    let soltar: (p: PlanPeticion) => void = () => {};
    const planificar = vi.fn(() => new Promise<PlanPeticion>((r) => { soltar = r; }));
    const { result } = montar({ planificar });
    act(() => { void result.current.pedir("uno"); });
    act(() => result.current.cancelar());
    await act(async () => { soltar(plan()); });
    expect(result.current.estado.fase).toBe("reposo");
  });

  it("si Astraura tarda demasiado, se dice y no se aplica nada", async () => {
    vi.useFakeTimers();
    const planificar = vi.fn(() => new Promise<PlanPeticion>(() => {}));
    const { result } = montar({ planificar });
    act(() => { void result.current.pedir("uno"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(ESPERA_PLAN_MS + 10); });
    expect(result.current.estado).toMatchObject({ fase: "error", tipo: "tarda" });
  });

  it("reglas locales: el texto se convierte en una orden a la molécula, con su confirmación", async () => {
    const { result } = montar();
    await act(async () => { result.current.reglasLocales("sube la mezcla un 10 %"); });
    expect(result.current.estado).toMatchObject({ fase: "plan", plan: { motor: "reglas locales (sin IA)", pasos: [{ tipo: "dictar-molecula", orden: "sube la mezcla un 10 %" }] } });
  });

  it("deshacer solo existe si quien ejecutó lo ofrece", async () => {
    const deshacer = vi.fn();
    const { result } = montar({ ejecutar: vi.fn(async () => ({ ok: true, hechos: ["x"], pendientes: [], deshacer })) });
    await act(async () => { await result.current.pedir("algo"); });
    await act(async () => { result.current.confirmar(); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    await act(async () => { await result.current.deshacer(); });
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(result.current.estado.fase).toBe("reposo");
  });

  it("una ejecución que falla se cuenta como no aplicada", async () => {
    const { result } = montar({ ejecutar: vi.fn(async () => { throw new Error("sin permiso del servidor"); }) });
    await act(async () => { await result.current.pedir("algo"); });
    await act(async () => { result.current.confirmar(); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    expect(result.current.estado).toMatchObject({ resultado: { ok: false, motivo: "sin permiso del servidor" } });
  });
});
