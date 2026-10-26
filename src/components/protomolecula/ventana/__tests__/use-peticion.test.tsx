import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextoProto, PlanPeticion, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { EVENTO_PLAN_PENDIENTE, planesPendientes, reiniciarPlanesPendientes, type PlanPendiente } from "@/lib/protomolecula/peticion/pedir";
import { ESPERA_PLAN_MS, usePeticion } from "../use-peticion";

const ctx: ContextoProto = { ruta: "/grupo/semilla", ambito: "grupo", entidad: { tipo: "grupo", id: "g1", nombre: "Semilla" } };
const plan = (extra: Partial<PlanPeticion> = {}): PlanPeticion => ({
  resumen: "Editar el grupo", tipoCambio: "diseno", motor: "Needle", fuera: [],
  pasos: [{ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "g1" }, cambio: "tema oscuro", modo: "directo" }], ...extra,
});
const v = (decision: VeredictoGobierno["decision"]): VeredictoGobierno => ({ decision, motivo: "porque sí", confirmar: true });

type Mock = ReturnType<typeof vi.fn>;
function montar(over: { planificar?: Mock; ejecutar?: Mock; decidir?: Mock; resolverActor?: Mock; abrirRuta?: (r: string) => void } = {}) {
  const planificar = over.planificar ?? vi.fn(async () => plan());
  const ejecutar = over.ejecutar ?? vi.fn(async () => ({ ok: true, hechos: ["Hecho"], pendientes: [] }));
  const decidir = over.decidir ?? vi.fn(() => v("aplicar"));
  const resolverActor = over.resolverActor ?? vi.fn(async () => null);
  const r = renderHook(() => usePeticion(ctx, { planificar, ejecutar, decidir, resolverActor } as never, { abrirRuta: over.abrirRuta }));
  return { ...r, planificar, ejecutar, decidir, resolverActor };
}

const OTRA: ContextoProto = { ruta: "/grupo/raiz", ambito: "grupo", entidad: { tipo: "grupo", id: "g2", nombre: "Raíz" } };
const pendiente = (id = "plan-1"): PlanPendiente => ({ id, texto: "un cubo que gire", plan: plan(), contexto: OTRA, agente: "aurora", creado: 1 });
/** El aviso que emite `pedirComoAgente` en el navegador (la cola real se prueba aparte, abajo). */
function dejarPendiente(p: PlanPendiente) {
  window.dispatchEvent(new CustomEvent(EVENTO_PLAN_PENDIENTE, { detail: p }));
}

afterEach(() => { cleanup(); vi.useRealTimers(); reiniciarPlanesPendientes(); });

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

  it("el veredicto usa el actor REAL de la sesión (su rol en el grupo) cuando ya se leyó", async () => {
    const resolverActor = vi.fn(async () => ({ usuarioId: "u1", rol: "admin", esDueno: false, origen: "humano" as const }));
    const { result, decidir } = montar({ resolverActor });
    await waitFor(() => expect(resolverActor).toHaveBeenCalledWith(ctx, "humano"));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.pedir("pon el tema oscuro"); });
    expect(decidir).toHaveBeenLastCalledWith(ctx, { usuarioId: "u1", rol: "admin", esDueno: false, origen: "ia" }, "diseno");
  });

  it("sin actor real (null), el veredicto usa la deducción local", async () => {
    const { result, decidir } = montar();
    await act(async () => { await result.current.pedir("pon el tema oscuro"); });
    expect(decidir).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ usuarioId: null, rol: null, origen: "ia" }), "diseno");
  });

  it("ejecutar recibe la pantalla y la navegación de la ventana", async () => {
    const abrirRuta = vi.fn();
    const { result, ejecutar } = montar({ abrirRuta });
    await act(async () => { await result.current.pedir("algo"); });
    await act(async () => { result.current.confirmar(); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    expect(ejecutar).toHaveBeenCalledWith(expect.objectContaining({ resumen: "Editar el grupo" }), { contexto: ctx, abrirRuta });
  });

  it("un plan que pide un agente se enseña como suyo y se ejecuta contra SU pantalla al confirmar", async () => {
    const { result, ejecutar, decidir } = montar();
    act(() => dejarPendiente(pendiente()));
    expect(result.current.estado).toMatchObject({ fase: "plan", origen: "ia", texto: "un cubo que gire", pendiente: { id: "plan-1", agente: "aurora" } });
    expect(decidir).toHaveBeenLastCalledWith(OTRA, expect.objectContaining({ origen: "ia" }), "diseno");
    expect(ejecutar).not.toHaveBeenCalled(); // nada se aplica sin la persona
    await act(async () => { result.current.confirmar(); });
    await waitFor(() => expect(result.current.estado.fase).toBe("hecho"));
    expect(ejecutar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contexto: OTRA }));
  });

  it("un plan de agente no pisa el plan que la persona está mirando", async () => {
    const { result } = montar();
    await act(async () => { await result.current.pedir("mi propio cambio"); });
    act(() => dejarPendiente(pendiente()));
    expect(result.current.estado).toMatchObject({ fase: "plan", texto: "mi propio cambio" });
    expect(result.current.estado).not.toHaveProperty("pendiente");
  });

  it("al abrir la ventana se enseña lo que un agente dejó esperando, y Cancelar lo descarta de la cola", async () => {
    const { pedirComoAgente } = await import("@/lib/protomolecula/peticion/pedir");
    const r = await pedirComoAgente({ texto: "un cubo que gire", agente: "aurora" }, {}, { contexto: OTRA, planificar: async () => plan(), deps: {}, emitir: () => {} });
    expect(r.ok).toBe(true);
    expect(planesPendientes()).toHaveLength(1);
    const { result } = montar();
    expect(result.current.estado).toMatchObject({ fase: "plan", pendiente: { agente: "aurora", contexto: OTRA } });
    act(() => result.current.cancelar());
    expect(planesPendientes()).toHaveLength(0);
    expect(result.current.estado.fase).toBe("reposo");
  });
});
