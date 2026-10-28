import { describe, expect, it } from "vitest";
import type { ProcesoActivo } from "@/lib/cerebros/procesos";
import {
  filtrarProcesos,
  tiposVisibles,
  ventanaDeProceso,
} from "@/lib/cerebros/procesos-filtros";

const proc = (id: string, tipo: ProcesoActivo["tipo"]): ProcesoActivo => ({
  id,
  tipo,
  nombre: id,
  estado: "en-marcha",
  progreso: null,
  donde: "aquí",
  desde: null,
  fuente: "prueba",
});

const TODOS = ["genesis", "sueno", "app-fondo"] as ProcesoActivo["tipo"][];

describe("tiposVisibles", () => {
  it("sin preferidos devuelve vacío (se enseñan todos)", () => {
    expect(tiposVisibles([], TODOS)).toEqual([]);
  });

  it("devuelve los preferidos válidos sin duplicados", () => {
    expect(tiposVisibles(["sueno", "sueno", "genesis", "x" as never], TODOS)).toEqual([
      "sueno",
      "genesis",
    ]);
  });
});

describe("filtrarProcesos", () => {
  const procesos = [proc("a", "genesis"), proc("b", "sueno")];

  it("sin selección enseña todos", () => {
    expect(filtrarProcesos(procesos, [])).toHaveLength(2);
  });

  it("con selección deja solo el tipo activo", () => {
    expect(filtrarProcesos(procesos, ["sueno"]).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("ventanaDeProceso", () => {
  it("extrae escritorio y ventana de un id válido", () => {
    expect(ventanaDeProceso("ventana:esc-1:win-7")).toEqual({
      escritorio: "esc-1",
      ventana: "win-7",
    });
  });

  it("devuelve null para otros tipos de proceso", () => {
    expect(ventanaDeProceso("agente:c7755fd9")).toBeNull();
    expect(ventanaDeProceso("ventana:esc")).toBeNull();
  });
});
