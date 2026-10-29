import { describe, it, expect } from "vitest";
import {
  ETIQUETA_ESTADO,
  cuentasPorTipo,
  partesVentana,
  procesosSeleccionados,
} from "../procesos-vista";
import type { ProcesoActivo, TipoProceso } from "../procesos";

const proceso = (id: string, tipo: TipoProceso): ProcesoActivo => ({
  id,
  tipo,
  nombre: id,
  estado: "en-marcha",
  progreso: null,
  donde: "prueba",
  desde: null,
  fuente: "prueba",
});

describe("cuentasPorTipo", () => {
  it("sin preferencias enseña los tipos con procesos reales, en el orden de ETIQUETA_TIPO", () => {
    const lista = [proceso("a", "sueno"), proceso("b", "genesis"), proceso("c", "genesis")];
    const cuentas = cuentasPorTipo(lista, []);
    expect(cuentas.map((c) => c.tipo)).toEqual(["genesis", "sueno"]);
    expect(cuentas.find((c) => c.tipo === "genesis")?.cuenta).toBe(2);
    expect(cuentas.find((c) => c.tipo === "sueno")?.cuenta).toBe(1);
  });

  it("con tipos preferidos solo cuenta esos tipos y descarta claves desconocidas", () => {
    const lista = [proceso("a", "genesis"), proceso("b", "sueno"), proceso("c", "cuenta-desconocida" as TipoProceso)];
    const cuentas = cuentasPorTipo(lista, ["sueno", "no-existe" as TipoProceso]);
    expect(cuentas.map((c) => c.tipo)).toEqual(["sueno"]);
  });

  it("un tipo visible sin procesos reales no sale", () => {
    expect(cuentasPorTipo([proceso("a", "genesis")], ["sueno", "genesis"])).toHaveLength(1);
    expect(cuentasPorTipo([], [])).toEqual([]);
    // las etiquetas vienen de ETIQUETA_TIPO, con acentos
    expect(cuentasPorTipo([proceso("a", "imaginacion")], [])[0]?.etiqueta).toBe("Imaginación");
  });
});

describe("procesosSeleccionados", () => {
  const lista = [proceso("a", "genesis"), proceso("b", "sueno")];

  it("sin filtros activos devuelve todo", () => {
    expect(procesosSeleccionados(lista, [])).toEqual(lista);
  });

  it("con filtros activos devuelve solo aquellos tipos", () => {
    expect(procesosSeleccionados(lista, ["sueno"]).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("partesVentana", () => {
  it("parsea el id ventana:<escritorio>:<ventana>", () => {
    expect(partesVentana("ventana:d1:w7")).toEqual({ desktopId: "d1", winId: "w7" });
  });

  it("el id de la ventana puede contener «:»", () => {
    expect(partesVentana("ventana:escritorio:ventana:con:dos")).toEqual({
      desktopId: "escritorio",
      winId: "ventana:con:dos",
    });
  });

  it("devuelve null si no es de ventana o le falta una parte", () => {
    expect(partesVentana("presencia:medio")).toBeNull();
    expect(partesVentana("ventana:solo-escritorio")).toBeNull();
    expect(partesVentana("ventana:d1:")).toBeNull();
  });
});

describe("ETIQUETA_ESTADO", () => {
  it("traduce los cuatro estados a palabras en español", () => {
    expect(ETIQUETA_ESTADO["en-marcha"]).toBe("en marcha");
    expect(ETIQUETA_ESTADO.esperando).toBe("esperando");
    expect(ETIQUETA_ESTADO.pausado).toBe("pausado");
    expect(ETIQUETA_ESTADO.fallando).toBe("fallando");
  });
});
