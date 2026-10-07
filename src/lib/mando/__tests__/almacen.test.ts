import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria, crearAlmacenLocal, elegirAlmacen, type AlmacenMando } from "../almacen";
import type { EventoMando, MensajeChat, TareaOla } from "../protocolo";

const tareaValida: TareaOla = {
  id: "t1", ola: "1007P", depende: [], titulo: "Prueba",
  archivos: ["src/lib/mando/almacen.ts"], prompt: "hacer algo",
};

const eventosBase: EventoMando[] = [
  { t: 100, tipo: "ola", texto: "primera" },
  { t: 200, tipo: "ola", texto: "segunda" },
  { t: 300, tipo: "ola", texto: "tercera" },
];

const chatBase: MensajeChat[] = [
  { canal: "general", autor: "a", rol: "agente", texto: "hola" },
  { canal: "ola/t1", autor: "b", rol: "agente", texto: "avance" },
  { canal: "general", autor: "c", rol: "director", texto: "ok" },
];

async function expectLectoresVacios(a: AlmacenMando) {
  expect(await a.leerTareas()).toEqual([]);
  expect(await a.leerProgreso()).toEqual({});
  expect(await a.leerEventos()).toEqual([]);
  expect(await a.leerChat("general")).toEqual([]);
  expect(await a.leerMedidores()).toBeNull();
}

describe("crearAlmacenMemoria", () => {
  it("arranca vacío sin estado inicial", async () => {
    const a = crearAlmacenMemoria();
    expect(a.tipo).toBe("memoria");
    expect(a.ambitoId).toBe("memoria");
    await expectLectoresVacios(a);
  });

  it("devuelve copias del estado inicial", async () => {
    const a = crearAlmacenMemoria({ tareas: [tareaValida], progreso: { t1: { estado: "lista" } }, eventos: eventosBase, chat: chatBase, medidores: { cpu: 1 } });
    const tareas = await a.leerTareas();
    expect(tareas).toEqual([tareaValida]);
    tareas.push({ ...tareaValida, id: "t2" });
    expect(await a.leerTareas()).toHaveLength(1);
    expect(await a.leerMedidores()).toEqual({ cpu: 1 });
  });

  it("filtra eventos por fecha y limita por el final", async () => {
    const a = crearAlmacenMemoria({ eventos: eventosBase });
    expect(await a.leerEventos("150")).toEqual(eventosBase.slice(1));
    expect(await a.leerEventos(undefined, 2)).toEqual(eventosBase.slice(1));
    expect(await a.leerEventos("no-fecha")).toEqual(eventosBase);
    expect(await a.leerEventos(undefined, 0)).toEqual([]);
    expect(await a.leerEventos(undefined, Number.NaN)).toEqual([]);
  });

  it("filtra el chat por canal", async () => {
    const a = crearAlmacenMemoria({ chat: chatBase });
    expect(await a.leerChat("general")).toHaveLength(2);
    expect((await a.leerChat("general", 1))[0].texto).toBe("ok");
    expect(await a.leerChat("nadie")).toEqual([]);
  });
});

describe("encolarOrden en memoria", () => {
  it("rechaza tipos de orden y datos inválidos", async () => {
    const a = crearAlmacenMemoria();
    expect((await a.encolarOrden({ tipo: "borrar" as never, datos: {} })).ok).toBe(false);
    expect((await a.encolarOrden({ tipo: "encolar", datos: null })).ok).toBe(false);
    expect((await a.encolarOrden({ tipo: "encolar", datos: { id: "x" } })).motivo).toBeTruthy();
  });

  it("acepta aprobar/frenar sin validar tarea", async () => {
    const a = crearAlmacenMemoria();
    expect((await a.encolarOrden({ tipo: "aprobar", datos: { id: "t1" } })).ok).toBe(true);
    expect((await a.encolarOrden({ tipo: "frenar", datos: {} })).ok).toBe(true);
  });

  it("encola una tarea válida y la expone en leerTareas", async () => {
    const a = crearAlmacenMemoria();
    expect((await a.encolarOrden({ tipo: "encolar", datos: tareaValida })).ok).toBe(true);
    expect(await a.leerTareas()).toEqual([tareaValida]);
  });
});

describe("crearAlmacenLocal", () => {
  it("usa valores vacíos sin lectores y ante errores", async () => {
    await expectLectoresVacios(crearAlmacenLocal({}));
    const a = crearAlmacenLocal({
      tareas: () => { throw new Error("caído"); },
      eventos: async () => { throw new Error("caído"); },
    });
    expect(await a.leerTareas()).toEqual([]);
    expect(await a.leerEventos()).toEqual([]);
  });

  it("delega en los lectores con argumentos", async () => {
    const a = crearAlmacenLocal({
      tareas: () => [tareaValida],
      eventos: (desde) => eventosBase.filter((e) => e.t >= Number(desde ?? 0)),
      chat: (canal) => chatBase.filter((m) => m.canal === canal),
      medidores: () => ({ ram: 2 }),
    });
    expect(a.tipo).toBe("local");
    expect(await a.leerTareas()).toEqual([tareaValida]);
    expect(await a.leerEventos("150")).toEqual(eventosBase.slice(1));
    expect(await a.leerChat("general")).toHaveLength(2);
    expect(await a.leerMedidores()).toEqual({ ram: 2 });
  });

  it("ordenes: valida, exige lector y tolera su fallo", async () => {
    expect((await crearAlmacenLocal({}).encolarOrden({ tipo: "aprobar", datos: {} }))).toEqual({ ok: false, motivo: "sin lector de órdenes" });
    const falla = crearAlmacenLocal({ orden: () => { throw new Error("x"); } });
    expect((await falla.encolarOrden({ tipo: "aprobar", datos: {} }))).toEqual({ ok: false, motivo: "lector de órdenes falló" });
    const bien = crearAlmacenLocal({ orden: () => ({ ok: true }) });
    expect((await bien.encolarOrden({ tipo: "encolar", datos: tareaValida })).ok).toBe(true);
    expect((await bien.encolarOrden({ tipo: "encolar", datos: {} })).ok).toBe(false);
  });
});

describe("elegirAlmacen", () => {
  it("sin bandera siempre local", () => {
    expect(elegirAlmacen({ banderaTodos: false, esLocal: false, ambitoId: "abc" })).toBe("local");
  });
  it("con bandera: local si es local sin ámbito o con ámbito local", () => {
    expect(elegirAlmacen({ banderaTodos: true, esLocal: true })).toBe("local");
    expect(elegirAlmacen({ banderaTodos: true, esLocal: true, ambitoId: "local" })).toBe("local");
  });
  it("con bandera: supabase en remoto o con ámbito propio", () => {
    expect(elegirAlmacen({ banderaTodos: true, esLocal: false })).toBe("supabase");
    expect(elegirAlmacen({ banderaTodos: true, esLocal: true, ambitoId: "grupo-7" })).toBe("supabase");
  });
});
