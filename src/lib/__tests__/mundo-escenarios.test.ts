// @vitest-environment jsdom
/**
 * Escenarios del mundo de los avatares · Ola 1025U · U1: crear, renombrar, duplicar y borrar (con confirmación),
 * visibilidad y por dónde viajaría cada una (`elegirTransporte`), zonas, y el guardado en este aparato.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_ESCENARIOS,
  MAX_ZONAS,
  ZONAS_POR_DEFECTO,
  agregarZona,
  almacenInicial,
  borrarEscenario,
  cambiarVisibilidad,
  crearEscenario,
  duplicarEscenario,
  elegirEscenario,
  escenarioActivo,
  guardarEscenarios,
  leerEscenarios,
  quitarZona,
  renombrarEscenario,
  renombrarZona,
  sanearAlmacen,
  transporteDeEscenario,
  type AlmacenEscenarios,
} from "@/lib/avatares/mundo/escenarios";

const T = 1_700_000_000_000;
const ok = (r: ReturnType<typeof crearEscenario>): AlmacenEscenarios => {
  if (!r.ok) throw new Error(r.motivo);
  return r.almacen;
};

beforeEach(() => {
  localStorage.clear();
});

describe("el escenario de partida", () => {
  it("nace privado, con las cuatro zonas del mundo (ágora, taller, biblioteca, sueños)", () => {
    const a = almacenInicial(T);
    const e = escenarioActivo(a);
    expect(a.escenarios).toHaveLength(1);
    expect(e.visibilidad).toBe("privada");
    expect(e.zonas.map((z) => z.id)).toEqual(["agora", "taller", "biblioteca", "suenos"]);
    // Una copia, no la constante compartida.
    e.zonas[0].nombre = "tocada";
    expect(ZONAS_POR_DEFECTO[0].nombre).toBe("Ágora");
  });
});

describe("crear", () => {
  it("no hay tope de escenarios: se pueden crear docenas", () => {
    let a = almacenInicial(T);
    for (let i = 0; i < 60; i++) a = ok(crearEscenario(a, { nombre: `Mundo ${i}` }, T + i));
    expect(a.escenarios).toHaveLength(61);
    expect(new Set(a.escenarios.map((e) => e.id)).size).toBe(61);
  });

  it("deja activo el nuevo y no repite nombres", () => {
    let a = almacenInicial(T);
    a = ok(crearEscenario(a, { nombre: "Mi mundo" }, T + 1));
    expect(escenarioActivo(a).nombre).toBe("Mi mundo (2)");
  });

  it("pide un nombre; uno de grupo pide el grupo", () => {
    const a = almacenInicial(T);
    expect(crearEscenario(a, { nombre: "   " }, T).ok).toBe(false);
    const sinGrupo = crearEscenario(a, { nombre: "Del grupo", visibilidad: "grupo" }, T);
    expect(sinGrupo.ok).toBe(false);
    const conGrupo = ok(crearEscenario(a, { nombre: "Del grupo", visibilidad: "grupo", grupoId: "g1" }, T));
    expect(escenarioActivo(conGrupo).grupoId).toBe("g1");
  });

  it("recorta el nombre largo y las zonas a MAX_ZONAS", () => {
    const zonas = Array.from({ length: 30 }, (_, i) => ({ id: `z${i}`, nombre: `Zona ${i}`, afinidad: null }));
    const a = ok(crearEscenario(almacenInicial(T), { nombre: "x".repeat(200), zonas }, T));
    expect(escenarioActivo(a).nombre.length).toBeLessThanOrEqual(60);
    expect(escenarioActivo(a).zonas).toHaveLength(MAX_ZONAS);
  });
});

describe("renombrar y duplicar", () => {
  it("renombrar cambia el nombre y rechaza el vacío", () => {
    const a = almacenInicial(T);
    const id = a.activoId;
    const r = renombrarEscenario(a, id, "Mi taller", T + 5);
    expect(r.ok && escenarioActivo(r.almacen).nombre).toBe("Mi taller");
    expect(renombrarEscenario(a, id, "  ", T).ok).toBe(false);
    expect(renombrarEscenario(a, "no-existe", "x", T).ok).toBe(false);
  });

  it("duplicar copia las zonas y la copia nace PRIVADA aunque el original sea público", () => {
    let a = almacenInicial(T);
    a = ok(cambiarVisibilidad(a, a.activoId, "publica", T));
    const original = escenarioActivo(a);
    const d = ok(duplicarEscenario(a, original.id, T + 9));
    const copia = escenarioActivo(d);
    expect(copia.id).not.toBe(original.id);
    expect(copia.visibilidad).toBe("privada");
    expect(copia.zonas).toEqual(original.zonas);
    expect(copia.zonas).not.toBe(original.zonas);
    expect(copia.nombre).toContain("copia");
    expect(d.escenarios).toHaveLength(2);
  });
});

describe("borrar", () => {
  it("sin confirmación no borra nada", () => {
    const a = ok(crearEscenario(almacenInicial(T), { nombre: "Otro" }, T + 1));
    const r = borrarEscenario(a, a.activoId, false);
    expect(r.ok).toBe(false);
    expect(a.escenarios).toHaveLength(2);
  });

  it("con confirmación borra y el activo pasa a otro que existe", () => {
    const a = ok(crearEscenario(almacenInicial(T), { nombre: "Otro" }, T + 1));
    const r = borrarEscenario(a, a.activoId, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.almacen.escenarios).toHaveLength(1);
      expect(r.almacen.escenarios.some((e) => e.id === r.almacen.activoId)).toBe(true);
    }
  });

  it("siempre queda al menos uno", () => {
    const a = almacenInicial(T);
    const r = borrarEscenario(a, a.activoId, true);
    expect(r.ok).toBe(false);
  });

  it("borrar uno inactivo no mueve el activo", () => {
    const a = ok(crearEscenario(almacenInicial(T), { nombre: "Otro" }, T + 1));
    const primero = a.escenarios[0].id;
    const r = borrarEscenario(a, primero, true);
    expect(r.ok && r.almacen.activoId).toBe(a.activoId);
  });
});

describe("visibilidad y camino de sincronía", () => {
  it("cambiar a «de un grupo» exige el grupo; a privado lo olvida", () => {
    let a = almacenInicial(T);
    expect(cambiarVisibilidad(a, a.activoId, "grupo", T).ok).toBe(false);
    a = ok(cambiarVisibilidad(a, a.activoId, "grupo", T, "g7"));
    expect(escenarioActivo(a)).toMatchObject({ visibilidad: "grupo", grupoId: "g7" });
    a = ok(cambiarVisibilidad(a, a.activoId, "privada", T));
    expect(escenarioActivo(a).grupoId).toBeUndefined();
  });

  it("lo decide elegirTransporte: privado prefiere servidor privado o malla antes que uno público", () => {
    let a = almacenInicial(T);
    a = ok(cambiarVisibilidad(a, a.activoId, "privada", T));
    const e = { ...escenarioActivo(a), servidorUrl: "https://mi-servidor.example" };
    expect(transporteDeEscenario(e, { internet: true, servidorPrivado: true, malla: true }).transporte).toBe("servidor-privado");
    expect(transporteDeEscenario(escenarioActivo(a), { internet: true, servidorPrivado: false, malla: true }).transporte).toBe("malla-p2p");
    expect(transporteDeEscenario(escenarioActivo(a), { internet: false, servidorPrivado: false, malla: false }).transporte).toBe("local");
  });

  it("uno público con internet usa el servidor público, con su motivo", () => {
    const a = ok(cambiarVisibilidad(almacenInicial(T), "mi-mundo", "publica", T));
    const d = transporteDeEscenario(escenarioActivo(a), { internet: true, servidorPrivado: false, malla: false });
    expect(d.transporte).toBe("servidor-publico");
    expect(d.motivo.length).toBeGreaterThan(10);
  });
});

describe("zonas", () => {
  it("añadir, renombrar y quitar; queda al menos una; tope de MAX_ZONAS", () => {
    let a = almacenInicial(T);
    const id = a.activoId;
    a = ok(agregarZona(a, id, "Observatorio", "explorar", T));
    expect(escenarioActivo(a).zonas.map((z) => z.id)).toContain("observatorio");
    a = ok(renombrarZona(a, id, "observatorio", "Mirador", T));
    expect(escenarioActivo(a).zonas.find((z) => z.id === "observatorio")?.nombre).toBe("Mirador");
    a = ok(quitarZona(a, id, "observatorio", T));
    expect(escenarioActivo(a).zonas.some((z) => z.id === "observatorio")).toBe(false);

    for (let i = 0; i < MAX_ZONAS; i++) {
      const r = agregarZona(a, id, `Extra ${i}`, null, T);
      if (r.ok) a = r.almacen;
    }
    expect(escenarioActivo(a).zonas).toHaveLength(MAX_ZONAS);
    expect(agregarZona(a, id, "Una más", null, T).ok).toBe(false);

    let solo = ok(crearEscenario(almacenInicial(T), { nombre: "Una zona", zonas: [{ id: "a", nombre: "A", afinidad: null }] }, T));
    expect(quitarZona(solo, solo.activoId, "a", T).ok).toBe(false);
    solo = ok(elegirEscenario(solo, solo.escenarios[0].id));
    expect(solo.activoId).toBe(solo.escenarios[0].id);
  });
});

describe("guardado en este aparato", () => {
  it("lo guardado vuelve igual", () => {
    let a = almacenInicial(T);
    a = ok(crearEscenario(a, { nombre: "Guardado", visibilidad: "publica" }, T + 3));
    expect(guardarEscenarios(a)).toBe(true);
    expect(localStorage.getItem(CLAVE_ESCENARIOS)).toBeTruthy();
    const leido = leerEscenarios(T + 10);
    expect(leido.activoId).toBe(a.activoId);
    expect(leido.escenarios.map((e) => e.nombre)).toEqual(a.escenarios.map((e) => e.nombre));
    expect(escenarioActivo(leido).visibilidad).toBe("publica");
  });

  it("lo dañado o de otra forma cae al escenario de partida, sin lanzar", () => {
    localStorage.setItem(CLAVE_ESCENARIOS, "{roto");
    expect(leerEscenarios(T).escenarios).toHaveLength(1);
    expect(sanearAlmacen({ escenarios: "no", activoId: 3 }, T).escenarios).toHaveLength(1);
  });

  it("al leer, un escenario «de un grupo» sin grupo vuelve a privado y un servidor sin https se descarta", () => {
    const a = sanearAlmacen(
      {
        activoId: "x",
        escenarios: [{ id: "x", nombre: "X", visibilidad: "grupo", servidorUrl: "http://inseguro.example", zonas: [{ id: "z", nombre: "Z", afinidad: "inventada" }] }],
      },
      T,
    );
    const e = escenarioActivo(a);
    expect(e.visibilidad).toBe("privada");
    expect(e.servidorUrl).toBeUndefined();
    expect(e.zonas[0].afinidad).toBeNull();
  });

  it("sin almacenamiento guardar dice false", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("cuota");
    };
    try {
      expect(guardarEscenarios(almacenInicial(T))).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
