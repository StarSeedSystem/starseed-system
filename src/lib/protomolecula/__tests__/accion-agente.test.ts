import { describe, it, expect, beforeEach, vi } from "vitest";
import { manejarAccionProtomolecula as accion, TOPE_BYTES_ESTADO, TOPE_LINEAS_ESTADO, type ContextoAccionProto } from "../accion-agente";
import { crearControlador, type Controlador } from "../controlador";
import { registrarControlador, limpiarControladores } from "../controlador-activo";
import { registrarAtomo, limpiarRegistro, type DefinicionAtomo } from "../registro-atomos";
import type { Ambito, Molecula, Parametro, Rol } from "../tipos";
const P: Parametro[] = [
  { id: "brillo", nombre: "Brillo", sinonimos: ["luz"], tipo: "numero", min: 0, max: 100, unidad: "%" },
  { id: "graves", nombre: "Graves", tipo: "numero", min: -12, max: 12, unidad: "dB" },
  { id: "pulso", nombre: "Pulso", tipo: "numero", min: 30, max: 220, unidad: "bpm" },
  { id: "ritmo", nombre: "Ritmo", tipo: "numero", min: 0, max: 200, unidad: "bpm" }, { id: "flash", nombre: "Flash", tipo: "disparo" },
];
const def = (herramientaId: string, parametros: Parametro[]): DefinicionAtomo => ({
  herramientaId, nombre: `Átomo ${herramientaId}`, categoria: "audio", integracion: "libreria-js", control: "total", parametros, entradas: [], salidas: [],
});
const mol = (ambito: Ambito, atomos: Molecula["atomos"]): Molecula => ({ id: "mol-1", titulo: "Prueba", ambito, capas: [], atomos, valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 });
const uno = [{ id: "at-1", herramientaId: "eq", titulo: "Ecualizador", estado: "activo" as const }];
let n = 0;
function abrirMol(ambito: Ambito = "personal", rol: Rol = "dueno", atomos: Molecula["atomos"] = uno): Controlador {
  const c = crearControlador({ molecula: mol(ambito, atomos), rol, ahora: () => ++n, nuevoId: () => `id-${++n}` });
  registrarControlador("mol-1", c); return c;
}
const ctx = (extra: Omit<ContextoAccionProto, "abrirRuta"> = {}): ContextoAccionProto & { abrirRuta: ReturnType<typeof vi.fn> } =>
  ({ abrirRuta: vi.fn(), avisarOrbe: () => false, ahora: () => ++n, nuevoId: () => `op-${++n}`, ...extra });
const valor = (c: Controlador, k: string, atomo = "at-1") => c.obtener().molecula.valores[`${atomo}::${k}`];
beforeEach(() => { limpiarRegistro(); limpiarControladores(); expect(registrarAtomo(def("eq", P)).ok).toBe(true); });
describe("acción de agente de la Protomolécula", () => {
  it("estado: una línea compacta por control con valor, unidad y rango", () => {
    abrirMol();
    const r = accion({ accion: "estado" }, ctx());
    expect(r.ok).toBe(true); expect(r.message).toContain("Brillo (Ecualizador): 0 % [0–100]"); expect(r.message).toContain("Graves (Ecualizador): -12 dB [-12–12]");
  });
  it("estado: tope de 40 líneas y 4 KB aunque haya muchos controles", () => {
    const muchos = Array.from({ length: 64 }, (_, i): Parametro => ({ id: `p${i}`, nombre: `Control largo numero ${i} con nombre extenso`, tipo: "numero", min: 0, max: 1000, unidad: "Hz" }));
    expect(registrarAtomo(def("sinte", muchos)).ok).toBe(true);
    abrirMol("personal", "dueno", [{ id: "a", herramientaId: "sinte", estado: "activo" }, { id: "b", herramientaId: "sinte", estado: "activo" }]);
    const r = accion({ accion: "estado" }, ctx());
    expect(r.message.split("\n").length).toBeLessThanOrEqual(TOPE_LINEAS_ESTADO); expect(new TextEncoder().encode(r.message).length).toBeLessThanOrEqual(TOPE_BYTES_ESTADO);
    expect(r.message).toMatch(/… y \d+ controles más/);
  });
  it("estado: nunca enseña valores de salud (por nombre ni movidos por un wearable)", () => {
    const c = abrirMol();
    c.mover({ id: "w1", objetivo: { atomoId: "at-1", parametroId: "ritmo" }, accion: { tipo: "exacta", valor: 87 }, autor: { tipo: "persona", id: "u-1" }, origen: "sensor", fuente: "wearable:pulso", t: 1 });
    expect(valor(c, "ritmo")).toBe(87);
    const r = accion({ accion: "estado" }, ctx());
    expect(r.message).not.toContain("87"); expect(r.message).toContain("Ritmo (Ecualizador): oculto, posible dato de salud");
    expect(r.message).toContain("Pulso (Ecualizador): oculto, posible dato de salud");
    const m = accion({ accion: "mover", parametro: "ritmo", valor: 50 }, ctx()), d = accion({ accion: "deshacer" }, ctx());
    expect(m.ok && d.ok).toBe(true); expect(`${m.message} ${d.message}`).not.toContain("87"); expect(valor(c, "ritmo")).toBe(87);
  });
  it("estado: un agente público no ve una molécula personal", () => {
    abrirMol("personal");
    const r = accion({ accion: "estado" }, ctx({ actor: { tipo: "agente-publico" } }));
    expect(r.ok).toBe(false); expect(r.message).toContain("no lo alcanza"); expect(r.message).not.toContain("Brillo");
  });
  it("dictar aplica con autor agente y dice qué se aplicó", () => {
    const c = abrirMol();
    const r = accion({ accion: "dictar", frase: "pon el brillo a 50 y sube el quark 3" }, ctx());
    expect(valor(c, "brillo")).toBe(50);
    expect(r.ok).toBe(true); expect(r.message).toContain("Aplicado: Brillo"); expect(r.message).toContain("No aplicado");
    expect(c.obtener().historial.hechos[0].operacion).toMatchObject({ origen: "agente", autor: { tipo: "agente", id: "astraura" } });
  });
  it("mover exacto por sinónimo y relativo con modo", () => {
    const c = abrirMol();
    expect(accion({ accion: "mover", parametro: "luz", valor: "30" }, ctx()).ok).toBe(true);
    const r = accion({ accion: "mover", parametro: "graves", cambio: 2, modo: "delta" }, ctx());
    expect(valor(c, "brillo")).toBe(30); expect(valor(c, "graves")).toBe(-10); expect(r.message).toContain("Graves: -12 dB → -10 dB");
    expect(accion({ accion: "mover", parametro: "graves", cambio: 1, modo: "a ojo" }, ctx()).message).toContain("Modo desconocido");
    expect(accion({ accion: "mover", parametro: "flash" }, ctx()).message).toBe("Hecho: disparé «Flash».");
  });
  it("mover ambiguo no adivina: dice qué átomos y no toca nada; con {atomo} sí", () => {
    const c = abrirMol("personal", "dueno", [...uno, { id: "at-2", herramientaId: "eq", titulo: "Voz", estado: "activo" }]);
    const r = accion({ accion: "mover", parametro: "brillo", valor: 40 }, ctx());
    expect(r.ok).toBe(false); expect(r.message).toContain("Hay 2 controles"); expect(r.message).toContain("at-2");
    expect(c.obtener().molecula.valores).toEqual({});
    expect(accion({ accion: "mover", parametro: "brillo", valor: 40, atomo: "Voz" }, ctx()).ok).toBe(true);
    expect(valor(c, "brillo", "at-2")).toBe(40); expect(valor(c, "brillo")).toBeUndefined();
  });
  it("deshacer solo lo propio del agente, nunca lo de la persona", () => {
    const c = abrirMol();
    accion({ accion: "mover", parametro: "brillo", valor: 50 }, ctx());
    c.mover({ id: "p1", objetivo: { atomoId: "at-1", parametroId: "graves" }, accion: { tipo: "exacta", valor: 5 }, autor: { tipo: "persona", id: "u-1" }, origen: "mano", t: 2 });
    const r = accion({ accion: "deshacer" }, ctx());
    expect(r.message).toContain("Brillo vuelve a 0 %"); expect(valor(c, "brillo")).toBe(0); expect(valor(c, "graves")).toBe(5);
    expect(accion({ accion: "deshacer" }, ctx()).ok).toBe(false); expect(valor(c, "graves")).toBe(5);
    expect(accion({ accion: "deshacer", agente: "otro" }, ctx()).message).toContain("«otro»");
    expect(accion({ accion: "deshacer", agente: "u-1" }, ctx()).message).toContain("lo hizo una persona"); expect(valor(c, "graves")).toBe(5);
  });
  it("sin molécula abierta: lo dice y abre la Protomolécula", () => {
    const k = ctx(), r = accion({ accion: "mover", parametro: "brillo", valor: 1 }, k);
    expect(r.ok).toBe(false); expect(r.message).toContain("Abre una molécula primero."); expect(k.abrirRuta).toHaveBeenCalledWith("/protomolecula");
  });
  it("abrir: si la orbe lo atiende no navega; si no, va a la página", () => {
    const conOrbe = ctx({ avisarOrbe: () => true });
    expect(accion({ accion: "abrir" }, conOrbe).message).toContain("orbe"); expect(conOrbe.abrirRuta).not.toHaveBeenCalled();
    const sinOrbe = ctx();
    expect(accion({ accion: "abrir", molecula: "m 2" }, sinOrbe).ok).toBe(true); expect(sinOrbe.abrirRuta).toHaveBeenCalledWith("/protomolecula?molecula=m%202");
  });
  it("proponer-codigo guarda un candidato SIN ejecutar nada y pide lo que falta", () => {
    const c = abrirMol(), antes = c.obtener(), falta = accion({ accion: "proponer-codigo", codigo: "alert(1)" }, ctx());
    expect(falta.ok).toBe(false); expect(c.obtener()).toBe(antes);
    expect(falta.message).toContain("Falta «capa»");
    const r = accion({ accion: "proponer-codigo", capa: "capa-1", original: "const a = 1;", propuesto: "const a = 2;" }, ctx());
    expect(r.ok).toBe(true); expect(r.message).toContain("candidato"); expect(r.message).toContain("no se ejecuta");
    expect(c.obtener()).toBe(antes);
    expect(accion({ accion: "borrar-todo" }, ctx()).message).toContain("No conozco la acción");
  });
  it("una operación del agente en espacio compartido queda pendiente de la persona", () => {
    const c = abrirMol("grupo", "editor");
    const r = accion({ accion: "abrir", herramienta: "eq", titulo: "Otro" }, ctx());
    expect(r.ok).toBe(false); expect(r.message).toContain("pendiente de que la persona la confirme en el panel");
    expect(c.obtener().molecula.atomos).toHaveLength(1); expect(c.obtener().pendientes).toHaveLength(1);
    expect(accion({ accion: "estado" }, ctx()).message).toContain("1 pendientes de confirmar");
  });
});
describe("integración con las acciones de Aurora", () => {
  it("actionsSystemPromptSection lista la acción y su handler delega en la Protomolécula", async () => {
    const { actionsSystemPromptSection, AURORA_ACTIONS } = await import("@/lib/aurora/actions");
    expect(actionsSystemPromptSection()).toMatch(/^- protomolecula: .*proponer-codigo/m);
    const push = vi.fn(), def = AURORA_ACTIONS.find((a) => a.name === "protomolecula");
    const r = await def!.handler({ accion: "abrir" }, { router: { push, replace: vi.fn(), back: vi.fn(), forward: vi.fn() } });
    expect(r.ok).toBe(true); expect(push).toHaveBeenCalledWith("/protomolecula");
  });
});
