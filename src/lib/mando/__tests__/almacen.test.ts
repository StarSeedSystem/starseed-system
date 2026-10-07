import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria, crearAlmacenLocal, elegirAlmacen, type AlmacenMando } from "../almacen";
import type { TareaOla, EventoMando, MensajeChat } from "../protocolo";

const tareaOk: TareaOla = { id: "PT1", ola: "1007P", depende: [], titulo: "Prueba", archivos: ["a.ts"], prompt: "haz la prueba" };

describe("crearAlmacenMemoria", () => {
  it("lee lo sembrado y copia (no expone el estado interno)", async () => {
    const a = crearAlmacenMemoria({ tareas: [tareaOk], progreso: { PT1: { estado: "integrada" } } });
    expect(a.tipo).toBe("memoria");
    expect(await a.leerTareas()).toEqual([tareaOk]);
    expect(await a.leerProgreso()).toEqual({ PT1: { estado: "integrada" } });
    (await a.leerTareas()).pop();
    expect(await a.leerTareas()).toHaveLength(1);
  });
  it("vacío por defecto y sin medidores", async () => {
    const a = crearAlmacenMemoria();
    expect(await a.leerTareas()).toEqual([]);
    expect(await a.leerProgreso()).toEqual({});
    expect(await a.leerEventos()).toEqual([]);
    expect(await a.leerChat("general")).toEqual([]);
    expect(await a.leerMedidores()).toBeNull();
  });
  it("acepta órdenes válidas de los tres tipos", async () => {
    const a = crearAlmacenMemoria();
    expect(await a.encolarOrden({ tipo: "encolar", datos: tareaOk })).toEqual({ ok: true });
    expect((await a.encolarOrden({ tipo: "aprobar", datos: { id: "PT1" } })).ok).toBe(true);
    expect((await a.encolarOrden({ tipo: "frenar", datos: { motivo: "pausa" } })).ok).toBe(true);
  });
  it("rechaza órdenes inválidas con motivo", async () => {
    const a = crearAlmacenMemoria();
    // @ts-expect-error tipo fuera de la unión
    expect((await a.encolarOrden({ tipo: "borrar", datos: {} })).ok).toBe(false);
    expect((await a.encolarOrden({ tipo: "encolar", datos: { id: "x" } }))).toMatchObject({ ok: false });
    expect((await a.encolarOrden({ tipo: "encolar", datos: null })).ok).toBe(false);
  });
  it("leerEventos respeta desde y limite", async () => {
    const evs: EventoMando[] = [1, 2, 3, 4, 5].map((t) => ({ t, tipo: "paso", texto: `e${t}` }));
    const a = crearAlmacenMemoria({ eventos: evs });
    expect((await a.leerEventos()).map((e) => e.t)).toEqual([1, 2, 3, 4, 5]);
    expect((await a.leerEventos("3")).map((e) => e.t)).toEqual([3, 4, 5]);
    expect((await a.leerEventos(undefined, 2)).map((e) => e.t)).toEqual([4, 5]);
    expect(await a.leerEventos("99")).toEqual([]);
  });
  it("leerChat filtra por canal y límite", async () => {
    const chat: MensajeChat[] = [
      { canal: "general", autor: "a", rol: "director", texto: "uno" },
      { canal: "privado", autor: "b", rol: "agente", texto: "dos" },
      { canal: "general", autor: "a", rol: "director", texto: "tres" },
    ];
    const a = crearAlmacenMemoria({ chat });
    expect((await a.leerChat("general")).map((m) => m.texto)).toEqual(["uno", "tres"]);
    expect((await a.leerChat("general", 1)).map((m) => m.texto)).toEqual(["tres"]);
  });
});

describe("crearAlmacenLocal", () => {
  it("adapta los lectores inyectados con ambito local", async () => {
    const chats: MensajeChat[] = [{ canal: "c", autor: "a", rol: "r", texto: "hola" }];
    const a: AlmacenMando = crearAlmacenLocal({
      tareas: async () => [tareaOk],
      progreso: () => ({ PT1: { estado: "escribiendo", avance: 40 } }),
      eventos: (desde) => [{ t: 1, tipo: "x", texto: desde ?? "sin-desde" }],
      chat: (canal) => chats.filter((m) => m.canal === canal),
      medidores: () => ({ salud: 90 }),
      orden: async () => ({ ok: true }),
    });
    expect(a.tipo).toBe("local");
    expect(a.ambitoId).toBe("local");
    expect(await a.leerTareas()).toEqual([tareaOk]);
    expect(await a.leerProgreso()).toEqual({ PT1: { estado: "escribiendo", avance: 40 } });
    expect((await a.leerEventos("5"))[0].texto).toBe("5");
    expect(await a.leerChat("c")).toHaveLength(1);
    expect(await a.leerChat("otro")).toEqual([]);
    expect(await a.leerMedidores()).toEqual({ salud: 90 });
    expect(await a.encolarOrden({ tipo: "aprobar", datos: { id: "PT1" } })).toEqual({ ok: true });
  });
  it("sin lectores devuelve vacío y rechaza órdenes con motivo", async () => {
    const a = crearAlmacenLocal({});
    expect(await a.leerTareas()).toEqual([]);
    expect(await a.leerProgreso()).toEqual({});
    expect(await a.leerEventos()).toEqual([]);
    expect(await a.leerChat("c")).toEqual([]);
    expect(await a.leerMedidores()).toBeNull();
    expect(await a.encolarOrden({ tipo: "aprobar", datos: {} })).toMatchObject({ ok: false });
  });
  it("un lector que lanza devuelve vacío, nunca lanza", async () => {
    const a = crearAlmacenLocal({
      tareas: () => { throw new Error("disco roto"); },
      medidores: async () => { throw new Error("sin red"); },
    });
    expect(await a.leerTareas()).toEqual([]);
    expect(await a.leerMedidores()).toBeNull();
  });
  it("rechaza órdenes inválidas aunque haya lector", async () => {
    let llamado = false;
    const a = crearAlmacenLocal({ orden: () => { llamado = true; return { ok: true }; } });
    expect((await a.encolarOrden({ tipo: "encolar", datos: {} })).ok).toBe(false);
    expect(llamado).toBe(false);
  });
});

describe("elegirAlmacen", () => {
  type Entrada = Parameters<typeof elegirAlmacen>[0];
  const casos: Array<[string, Entrada, "local" | "supabase"]> = [
    ["sin bandera siempre local", { banderaTodos: false, esLocal: false, ambitoId: "abc" }, "local"],
    ["local sin bandera", { banderaTodos: false, esLocal: true }, "local"],
    ["petición local sin ámbito", { banderaTodos: true, esLocal: true }, "local"],
    ["local con ámbito local", { banderaTodos: true, esLocal: true, ambitoId: "local" }, "local"],
    ["local con otro ámbito", { banderaTodos: true, esLocal: true, ambitoId: "abc" }, "supabase"],
    ["remota sin ámbito", { banderaTodos: true, esLocal: false }, "supabase"],
    ["remota con ámbito", { banderaTodos: true, esLocal: false, ambitoId: "abc" }, "supabase"],
  ];
  it.each(casos)("%s → %s", (_n, entrada, esperado) => expect(elegirAlmacen(entrada)).toBe(esperado));
});
