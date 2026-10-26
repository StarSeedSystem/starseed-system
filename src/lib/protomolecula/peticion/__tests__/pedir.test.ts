// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextoProto } from "../contrato";
import { EVENTO_PLAN_PENDIENTE, descartarPlanPendiente, pedirComoAgente, planesPendientes, reiniciarPlanesPendientes, tomarPlanPendiente, type PlanPendiente } from "../pedir";
import type { AlmacenTope } from "../tope";
import { TOPE_AGENTE_POR_HORA } from "../tope";
import { manejarAccionProtomoleculaAsync, manejarAccionProtomolecula } from "../../accion-agente";

const GRUPO: ContextoProto = { ruta: "/grupo/semilla", entidad: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, gobernadaPor: { tipo: "grupo", id: "semilla" }, ambito: "grupo" };
const PERSONAL: ContextoProto = { ruta: "/profile", entidad: { tipo: "perfil", id: "propio" }, ambito: "personal" };

const memoria = (): AlmacenTope => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
const PLAN_IA = JSON.stringify({ resumen: "Traduzco", tipoCambio: "contenido", pasos: [{ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "semilla" }, cambio: "traduce la descripción" }], fuera: [] });
const sinIA = { completar: vi.fn(async () => null), almacenTope: memoria(), ahora: () => 5_000_000 };

beforeEach(() => reiniciarPlanesPendientes());
afterEach(() => reiniciarPlanesPendientes());

describe("pedir (agente) · solo planifica, nunca ejecuta", () => {
  it("una petición clara se planifica con reglas, queda pendiente y el mensaje dice que NO se hizo nada", async () => {
    const emitidos: PlanPendiente[] = [];
    const r = await pedirComoAgente({ texto: "hazme un cubo 3D girando" }, {}, { contexto: GRUPO, deps: sinIA, emitir: (p) => emitidos.push(p), ahora: () => 1000 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/NO se ha hecho nada/);
    expect(r.message).toMatch(/pendiente de que la persona lo confirme/);
    expect(r.message).toContain("reglas locales");
    expect(sinIA.completar).not.toHaveBeenCalled();
    const [p] = planesPendientes();
    expect(p).toMatchObject({ texto: "hazme un cubo 3D girando", agente: "astraura", creado: 1000, contexto: GRUPO });
    expect(p.plan.pasos).toEqual([{ tipo: "crear-objeto-3d", descripcion: "cubo 3D girando", animado: true }]);
    expect(emitidos).toEqual([p]);
  });

  it("emite el evento de la ventana con el plan pendiente", async () => {
    const vistos: PlanPendiente[] = [];
    const oir = (e: Event) => vistos.push((e as CustomEvent<PlanPendiente>).detail);
    window.addEventListener(EVENTO_PLAN_PENDIENTE, oir);
    try {
      await pedirComoAgente({ texto: "cambia el fondo a algo más cálido" }, {}, { contexto: PERSONAL, deps: sinIA });
    } finally { window.removeEventListener(EVENTO_PLAN_PENDIENTE, oir); }
    expect(vistos).toHaveLength(1);
    expect(vistos[0].plan.pasos[0].tipo).toBe("fondo");
  });

  it("el plan se queda con la pantalla en que se pidió, y se puede tomar una sola vez", async () => {
    await pedirComoAgente({ texto: "hazme un cubo 3D" }, {}, { contexto: GRUPO, deps: sinIA, emitir: () => undefined });
    const [p] = planesPendientes();
    expect(tomarPlanPendiente(p.id)?.contexto).toEqual(GRUPO);
    expect(tomarPlanPendiente(p.id)).toBeNull();
    expect(planesPendientes()).toEqual([]);
  });

  it("descartar quita el plan y dice si existía", async () => {
    await pedirComoAgente({ texto: "hazme un cubo 3D" }, {}, { contexto: GRUPO, deps: sinIA, emitir: () => undefined });
    const [p] = planesPendientes();
    expect(descartarPlanPendiente("no-existe")).toBe(false);
    expect(descartarPlanPendiente(p.id)).toBe(true);
    expect(planesPendientes()).toEqual([]);
  });

  it("guarda como mucho 5 pendientes: el más viejo sobra", async () => {
    for (let i = 0; i < 7; i++) await pedirComoAgente({ texto: `hazme un cubo 3D número ${i}` }, {}, { contexto: GRUPO, deps: sinIA, emitir: () => undefined });
    const ps = planesPendientes();
    expect(ps).toHaveLength(5);
    expect(ps[0].texto).toContain("número 2");
    expect(new Set(ps.map((p) => p.id)).size).toBe(5);
  });

  it("el nombre del agente se sanea; el modo directo solo llega si el agente lo pide y la validación lo respeta", async () => {
    await pedirComoAgente({ texto: "corrige la ortografía", agente: "<Mi Agente>!!", modo: "rama" }, {}, { contexto: { ...GRUPO, entidad: { tipo: "archivo", id: "f1" } }, deps: sinIA, emitir: () => undefined });
    expect(planesPendientes()[0].agente).toBe("miagente");
  });
});

describe("pedir (agente) · lo que se rechaza", () => {
  it("sin texto no hace nada", async () => {
    for (const args of [{}, { texto: "   " }, { texto: 5 }]) {
      const r = await pedirComoAgente(args as never, {}, { contexto: GRUPO, deps: sinIA });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/Falta «texto»/);
    }
    expect(planesPendientes()).toEqual([]);
  });

  it("un agente público no alcanza una pantalla personal ni de grupo; uno de grupo no alcanza lo personal", async () => {
    const publico = await pedirComoAgente({ texto: "hazme un cubo 3D" }, { actor: { tipo: "agente-publico" } }, { contexto: GRUPO, deps: sinIA });
    expect(publico.ok).toBe(false);
    expect(publico.message).toMatch(/ámbito «grupo»/);
    const deGrupoEnPersonal = await pedirComoAgente({ texto: "hazme un cubo 3D" }, { actor: { tipo: "agente-grupo", grupoId: "semilla" } }, { contexto: PERSONAL, deps: sinIA });
    expect(deGrupoEnPersonal.ok).toBe(false);
    const deGrupoEnGrupo = await pedirComoAgente({ texto: "hazme un cubo 3D" }, { actor: { tipo: "agente-grupo", grupoId: "semilla" } }, { contexto: GRUPO, deps: sinIA, emitir: () => undefined });
    expect(deGrupoEnGrupo.ok).toBe(true);
    expect(planesPendientes()).toHaveLength(1);
  });

  it("si no hay plan (sin IA y reglas que no entienden), lo dice y no deja nada pendiente", async () => {
    const r = await pedirComoAgente({ texto: "reorganiza todo como creas mejor" }, {}, { contexto: GRUPO, deps: sinIA });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No pude preparar el plan/);
    expect(planesPendientes()).toEqual([]);
  });

  it("una respuesta de IA maliciosa no llega a ser plan pendiente", async () => {
    const maliciosa = { ...sinIA, almacenTope: memoria(), completar: vi.fn(async () => ({ texto: JSON.stringify({ pasos: [{ tipo: "ejecutar", cmd: "rm -rf /" }] }), motor: "x" })) };
    const r = await pedirComoAgente({ texto: "haz algo raro con todo" }, {}, { contexto: GRUPO, deps: maliciosa });
    expect(r.ok).toBe(false);
    expect(planesPendientes()).toEqual([]);
  });
});

describe("pedir (agente) · tope por hora más corto", () => {
  it(`un agente tiene ${TOPE_AGENTE_POR_HORA} consultas por hora a la IA; la siguiente se rechaza, pero las reglas locales siguen valiendo`, async () => {
    const completar = vi.fn(async () => ({ texto: PLAN_IA, motor: "gratis" }));
    const deps = { completar, almacenTope: memoria(), ahora: () => 9_000_000 };
    const opciones = { contexto: GRUPO, deps, emitir: () => undefined };
    for (let i = 0; i < TOPE_AGENTE_POR_HORA; i++) {
      expect((await pedirComoAgente({ texto: "haz algo raro con todo", agente: "astraura" }, {}, opciones)).ok).toBe(true);
    }
    const r = await pedirComoAgente({ texto: "haz algo raro con todo", agente: "astraura" }, {}, opciones);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/tope/);
    expect(completar).toHaveBeenCalledTimes(TOPE_AGENTE_POR_HORA);
    // otro agente tiene su propia cuenta
    expect((await pedirComoAgente({ texto: "haz algo raro con todo", agente: "otro" }, {}, opciones)).ok).toBe(true);
    // y una petición sencilla no gasta tope
    expect((await pedirComoAgente({ texto: "hazme un cubo 3D", agente: "astraura" }, {}, opciones)).ok).toBe(true);
  });

  it("el planificador recibe el id del agente y su tope", async () => {
    const planificar = vi.fn(async () => ({ error: "sin-ia" as const, motivo: "sin IA" }));
    await pedirComoAgente({ texto: "algo", agente: "Hermes" }, {}, { contexto: GRUPO, deps: sinIA, planificar });
    expect(planificar).toHaveBeenCalledWith("algo", GRUPO, expect.objectContaining({ agenteId: "agente:hermes", topePorHora: TOPE_AGENTE_POR_HORA }));
  });
});

describe("herramienta del agente · acción «pedir» de protomolecula", () => {
  it("la puerta síncrona la rechaza con un mensaje claro (no puede esperar a la IA)", () => {
    const r = manejarAccionProtomolecula({ accion: "pedir", texto: "hazme un cubo" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("manejarAccionProtomoleculaAsync");
  });

  it("la asíncrona delega en pedir; el resto sigue por la puerta de siempre", async () => {
    const vacio = await manejarAccionProtomoleculaAsync({ accion: "pedir" });
    expect(vacio.ok).toBe(false);
    expect(vacio.message).toMatch(/Falta «texto»/);
    const otra = await manejarAccionProtomoleculaAsync({ accion: "borrar-todo" });
    expect(otra.ok).toBe(false);
    expect(otra.message).toContain("No conozco la acción");
    expect(otra.message).toContain("pedir");
  });
});
