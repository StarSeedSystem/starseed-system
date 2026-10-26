// @vitest-environment jsdom
/**
 * Simulación del mundo · Ola 1025U · U1. Cada prueba cubre un defecto que el mundo tenía y que su arreglo cierra:
 *  · `avanzar` mutaba los `vinculos` del estado anterior;
 *  · `creaciones` y `encuentros` crecían sin límite;
 *  · caminar sacaba al habitante del suelo (la altura se acumulaba sin tope) o del radio del mundo;
 *  · el mundo nunca se guardaba (`guardarMundo`/`cargarMundo` sin llamadas).
 * Más lo nuevo: la atracción de las zonas, la reconciliación con quien vive hoy y un guardado por escenario.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALTURA_MAX,
  RADIO_MUNDO,
  TOPE_CREACIONES,
  TOPE_ENCUENTROS,
  TOPE_GUARDADO,
  TOPE_TICKS_AUSENCIA,
  avanzar,
  cargarMundo,
  claveMundo,
  guardarMundo,
  mundoInicial,
  olvidarMundo,
  reconciliarHabitantes,
  sanearEstado,
  type EstadoMundo,
  type ZonaSim,
} from "@/lib/avatares/mundo/simulacion";

const gente = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nombre: `Agente ${i}`, agenteId: `personalidad:p${i}` }));

function congelar<T>(valor: T): T {
  if (valor && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor as Record<string, unknown>)) congelar(v);
  }
  return valor;
}

beforeEach(() => {
  localStorage.clear();
});

describe("avanzar · no muta lo que recibe", () => {
  it("con el estado congelado entero, 40 pasos no lanzan ni cambian nada del original", () => {
    // Todos juntos en el mismo punto: se encuentran enseguida y generan vínculos (el caso que mutaba).
    const base = mundoInicial(gente(6));
    base.habitantes.forEach((h) => {
      h.posicion = [0, 0, 0];
      h.ocupacion = "conversar";
    });
    const antes = JSON.stringify(base);
    const congelado = congelar(structuredClone(base));
    expect(() => avanzar(congelado, 40)).not.toThrow();
    expect(JSON.stringify(congelado)).toBe(antes);
  });

  it("los vínculos nuevos viven en el estado nuevo, no en el anterior", () => {
    const base = mundoInicial(gente(6));
    base.habitantes.forEach((h) => {
      h.posicion = [0, 0, 0];
      h.ocupacion = "conversar";
      h.energia = 0.9;
    });
    const vinculosAntes = base.habitantes.map((h) => ({ ...h.vinculos }));
    const despues = avanzar(base, 40);
    expect(base.habitantes.map((h) => h.vinculos)).toEqual(vinculosAntes);
    despues.habitantes.forEach((h, i) => expect(h.vinculos).not.toBe(base.habitantes[i].vinculos));
    // La prueba no es vacía: en el estado nuevo sí hay vínculos.
    expect(despues.habitantes.reduce((suma, h) => suma + Object.keys(h.vinculos).length, 0)).toBeGreaterThan(0);
  });
});

describe("avanzar · crecimiento acotado", () => {
  it("creaciones y encuentros no pasan de su tope aunque el estado ya viniera desbordado", () => {
    const base = mundoInicial(gente(3));
    const lleno: EstadoMundo = {
      ...base,
      creaciones: Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, autor: base.habitantes[0].id, tipo: "arte", titulo: `Obra ${i}`, tick: i })),
      encuentros: Array.from({ length: 500 }, (_, i) => ({ a: base.habitantes[0].id, b: base.habitantes[1].id, tick: i, tema: "vida" })),
    };
    const despues = avanzar(lleno, 1);
    expect(despues.creaciones.length).toBeLessThanOrEqual(TOPE_CREACIONES);
    expect(despues.encuentros.length).toBeLessThanOrEqual(TOPE_ENCUENTROS);
  });

  it("tras miles de pasos el estado sigue acotado y conserva lo MÁS reciente", () => {
    const despues = avanzar(mundoInicial(gente(12)), 1500);
    expect(despues.creaciones.length).toBeLessThanOrEqual(TOPE_CREACIONES);
    expect(despues.encuentros.length).toBeLessThanOrEqual(TOPE_ENCUENTROS);
    const ticks = despues.creaciones.map((c) => c.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });
});

describe("avanzar · el suelo", () => {
  it("la altura se queda entre 0 y ALTURA_MAX y nadie sale del radio, por muchos pasos que den", () => {
    const despues = avanzar(mundoInicial(gente(10)), 800);
    for (const h of despues.habitantes) {
      expect(h.posicion[1]).toBeGreaterThanOrEqual(0);
      expect(h.posicion[1]).toBeLessThanOrEqual(ALTURA_MAX);
      expect(Math.hypot(h.posicion[0], h.posicion[2])).toBeLessThanOrEqual(RADIO_MUNDO + 1e-9);
    }
  });

  it("quien venía fuera del suelo (altura 3, lejos) vuelve a él en un solo paso", () => {
    const base = mundoInicial(gente(1));
    base.habitantes[0].posicion = [100, 3, 100];
    const despues = avanzar(base, 1);
    const [x, y, z] = despues.habitantes[0].posicion;
    expect(y).toBeLessThanOrEqual(ALTURA_MAX);
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(RADIO_MUNDO + 1e-9);
  });

  it("respeta el radio que pida el escenario", () => {
    const despues = avanzar(mundoInicial(gente(8)), 300, { radioMundo: 6 });
    for (const h of despues.habitantes) expect(Math.hypot(h.posicion[0], h.posicion[2])).toBeLessThanOrEqual(6 + 1e-9);
  });
});

describe("avanzar · las zonas atraen a quien hace lo suyo", () => {
  it("quien crea va al taller y quien descansa a los sueños", () => {
    const zonas: ZonaSim[] = [
      { id: "taller", centro: { x: 12, z: 0 }, radio: 3, afinidad: "crear" },
      { id: "suenos", centro: { x: -12, z: 0 }, radio: 3, afinidad: "descansar" },
    ];
    const despues = avanzar(mundoInicial(gente(10)), 120, { zonas });
    const enTaller = despues.habitantes.filter((h) => h.zonaId === "taller");
    const enSuenos = despues.habitantes.filter((h) => h.zonaId === "suenos");
    expect(enTaller.length + enSuenos.length).toBeGreaterThan(0);
    for (const h of enTaller) expect(h.ocupacion).toBe("crear");
    for (const h of enSuenos) expect(h.ocupacion).toBe("descansar");
    // Y de verdad están allí: más cerca de su zona que del lado contrario.
    for (const h of enTaller) expect(Math.hypot(h.posicion[0] - 12, h.posicion[2])).toBeLessThan(Math.hypot(h.posicion[0] + 12, h.posicion[2]));
  });

  it("sin zonas nadie queda asignado a ninguna", () => {
    const despues = avanzar(mundoInicial(gente(5)), 30);
    expect(despues.habitantes.every((h) => !h.zonaId)).toBe(true);
  });
});

describe("reconciliarHabitantes · el mundo de hoy", () => {
  it("conserva a quien sigue, da de alta a quien llega y quita a quien se fue con sus vínculos", () => {
    const base = avanzar(mundoInicial(gente(3)), 20);
    const sigue = base.habitantes[0];
    const nuevo = reconciliarHabitantes(base, [
      { id: "p0", nombre: "Agente 0 renombrado", agenteId: "personalidad:p0" },
      { id: "p9", nombre: "Recién llegada", agenteId: "bot:b9" },
    ]);
    expect(nuevo.habitantes.map((h) => h.id)).toEqual(["personalidad:p0", "bot:b9"]);
    expect(nuevo.habitantes[0].nombre).toBe("Agente 0 renombrado");
    expect(nuevo.habitantes[0].obras).toBe(sigue.obras);
    for (const h of nuevo.habitantes) for (const id of Object.keys(h.vinculos)) expect(["personalidad:p0", "bot:b9"]).toContain(id);
    expect(nuevo.creaciones.every((c) => c.autor === "personalidad:p0")).toBe(true);
    expect(nuevo.tick).toBe(base.tick);
  });
});

describe("guardar y cargar el mundo", () => {
  it("lo guardado vuelve igual (con el mismo tick) y vive bajo la clave de su escenario", () => {
    const estado = avanzar(mundoInicial(gente(4)), 25);
    expect(guardarMundo(estado, "esc-1")).toBe(true);
    expect(localStorage.getItem(claveMundo("esc-1"))).toBeTruthy();
    expect(localStorage.getItem(claveMundo("esc-2"))).toBeNull();
    const cargado = cargarMundo("esc-1", { recuperarAusencia: false });
    expect(cargado?.tick).toBe(25);
    expect(cargado?.habitantes.map((h) => h.id)).toEqual(estado.habitantes.map((h) => h.id));
    expect(cargarMundo("esc-2")).toBeNull();
  });

  it("al abrir tras una ausencia recupera los pasos que faltan, con tope", () => {
    const estado = mundoInicial(gente(3));
    guardarMundo(estado, "esc");
    const registro = JSON.parse(localStorage.getItem(claveMundo("esc")) as string) as { timestamp: number };
    const ahora = registro.timestamp + 7_000;
    expect(cargarMundo("esc", { ahora })?.tick).toBe(7);
    expect(cargarMundo("esc", { ahora: registro.timestamp + 30 * 24 * 3600 * 1000 })?.tick).toBe(TOPE_TICKS_AUSENCIA);
  });

  it("en disco solo se guarda lo reciente de obras y encuentros", () => {
    const base = mundoInicial(gente(2));
    const grande: EstadoMundo = {
      ...base,
      creaciones: Array.from({ length: 150 }, (_, i) => ({ id: `o${i}`, autor: base.habitantes[0].id, tipo: "arte", titulo: `Obra ${i}`, tick: i })),
      encuentros: [],
    };
    guardarMundo(grande, "e");
    expect(cargarMundo("e", { recuperarAusencia: false })?.creaciones.length).toBe(TOPE_GUARDADO);
  });

  it("un guardado dañado o de otra forma se ignora sin lanzar", () => {
    localStorage.setItem(claveMundo("roto"), "{no es json");
    localStorage.setItem(claveMundo("raro"), JSON.stringify({ estado: { tick: "x", habitantes: 3 }, timestamp: 1 }));
    expect(cargarMundo("roto")).toBeNull();
    expect(cargarMundo("raro")).toBeNull();
    expect(sanearEstado(null)).toBeNull();
  });

  it("olvidarMundo borra el guardado de ese escenario y de ningún otro", () => {
    guardarMundo(mundoInicial(gente(1)), "a");
    guardarMundo(mundoInicial(gente(1)), "b");
    olvidarMundo("a");
    expect(cargarMundo("a")).toBeNull();
    expect(cargarMundo("b", { recuperarAusencia: false })).not.toBeNull();
  });

  it("sin almacenamiento disponible guardar dice false (no lo calla)", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("cuota");
    };
    try {
      expect(guardarMundo(mundoInicial(gente(1)), "x")).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
