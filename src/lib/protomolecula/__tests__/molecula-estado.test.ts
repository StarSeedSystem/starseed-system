import { describe, it, expect } from "vitest";
import {
  crearMolecula, anadirCapa, anadirAtomo,
  cambiarEstadoAtomo, fijarValores, aplicarEnMolecula,
} from "../molecula-estado";
import type { Molecula, AtomoEnUso, ParametroRef, Operacion } from "../tipos";

describe("molecula-estado", () => {
  it("crea una molécula con valores por defecto", () => {
    const m = crearMolecula({ id: "m1", titulo: "Primera" }, 1000);
    expect(m.id).toBe("m1");
    expect(m.titulo).toBe("Primera");
    expect(m.ambito).toBe("personal");
    expect(m.capas).toEqual([]);
    expect(m.atomos).toEqual([]);
    expect(m.valores).toEqual({});
    expect(m.version).toBe(0);
    expect(m.creadaEn).toBe(1000);
    expect(m.actualizadaEn).toBe(1000);
  });

  it("usa el ámbito explícito", () => {
    const m = crearMolecula({ id: "m2", titulo: "P", ambito: "publico" }, 500);
    expect(m.ambito).toBe("publico");
  });

  it("no modifica la molécula original (inmutabilidad)", () => {
    const original = crearMolecula({ id: "o", titulo: "O" }, 0);
    const m2 = anadirCapa(original, { id: "c1", nombre: "Capa 1" }, 10);
    expect(original.capas).toHaveLength(0);
    expect(m2.capas).toHaveLength(1);
    expect(original === m2).toBe(false);
  });

  it("anadirCapa ignora duplicados por id", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirCapa(m, { id: "c1", nombre: "C" }, 1);
    const m2 = anadirCapa(m1, { id: "c1", nombre: "Otra" }, 2);
    expect(m2.capas).toHaveLength(1);
    expect(m2.capas[0].nombre).toBe("C");
  });

  it("anadirCapa asigna orden = máximo+1 si no es número finito", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirCapa(m, { id: "c1", nombre: "C" }, 1);
    const m2 = anadirCapa(m1, { id: "c2", nombre: "C2", orden: NaN }, 2);
    expect(m2.capas[1].orden).toBe(2);
  });

  it("anadirCapa respeta orden finito explícito", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirCapa(m, { id: "c1", nombre: "C" }, 1);
    const m2 = anadirCapa(m1, { id: "c2", nombre: "C2", orden: 5 }, 2);
    expect(m2.capas[1].orden).toBe(5);
  });

  it("anadirAtomo ignora duplicados", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t" }, 1);
    const m2 = anadirAtomo(m1, { id: "a1", capaId: "c1", tipo: "t" }, 2);
    expect(m2.atomos).toHaveLength(1);
  });

  it("cambiarEstadoAtomo no hace nada si el átomo no existe", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m2 = cambiarEstadoAtomo(m, "inexistente", "nuevo", 1);
    expect(m2).toBe(m);
  });

  it("cambiarEstadoAtomo cambia el estado", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t", estado: "inicial" }, 1);
    const m2 = cambiarEstadoAtomo(m1, "a1", "activo", 2);
    expect(m2.atomos[0].estado).toBe("activo");
  });

  it("fijarValores reemplaza todo", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirCapa(m, { id: "c1", nombre: "C" }, 1);
    const m2 = fijarValores(m1, { p1: 42 }, 2);
    expect(m2.valores).toEqual({ p1: 42 });
  });

  it("aplicarEnMolecula falla si el átomo no existe", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const res = aplicarEnMolecula(
      m,
      () => undefined,
      { tipo: "fijar", valor: 10, referencia: { atomoId: "no", parametroId: "p1" } },
      1,
    );
    expect(res).toEqual({ ok: false, motivo: expect.stringContaining("no existe") });
  });

  it("aplicarEnMolecula falla si el parámetro es desconocido", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t" }, 1);
    const res = aplicarEnMolecula(
      m1,
      () => undefined,
      { tipo: "fijar", valor: 10, referencia: { atomoId: "a1", parametroId: "p1" } },
      2,
    );
    expect(res).toEqual({ ok: false, motivo: expect.stringContaining("desconocido") });
  });

  it("aplicarEnMolecula sube la versión solo con cambios reales", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t" }, 1);
    const param: import("../tipos").Parametro = { id: "p1", tipo: "numero", rango: [0, 100] };
    const res = aplicarEnMolecula(
      m1,
      () => param,
      { tipo: "fijar", valor: 30, referencia: { atomoId: "a1", parametroId: "p1" } },
      2,
    );
    expect(res.ok).toBe(true);
    expect((res as { ok: true; molecula: Molecula }).molecula.version).toBe(1);
  });

  it("aplicarEnMolecula: un disparo no sube la versión", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t" }, 1);
    const param: import("../tipos").Parametro = { id: "p1", tipo: "numero" };
    const res = aplicarEnMolecula(
      m1,
      () => param,
      { tipo: "disparo", referencia: { atomoId: "a1", parametroId: "p1" } },
      2,
    );
    expect(res.ok).toBe(true);
    const molecula = (res as { ok: true; molecula: Molecula }).molecula;
    expect(molecula.version).toBe(0);
    expect(molecula.valores).toEqual({});
  });

  it("aplicarEnMolecula: valor exacto fuera de rango queda acotado con acotado=true", () => {
    const m = crearMolecula({ id: "m", titulo: "T" }, 0);
    const m1 = anadirAtomo(m, { id: "a1", capaId: "c1", tipo: "t" }, 1);
    const param: import("../tipos").Parametro = { id: "p1", tipo: "numero", rango: [0, 10] };
    const res = aplicarEnMolecula(
      m1,
      () => param,
      { tipo: "fijar", valor: 50, referencia: { atomoId: "a1", parametroId: "p1" } },
      2,
    );
    expect(res.ok).toBe(true);
    const cambio = (res as { ok: true; cambio: import("../tipos").Cambio }).cambio;
    expect(cambio.acotado).toBe(true);
  });
});
