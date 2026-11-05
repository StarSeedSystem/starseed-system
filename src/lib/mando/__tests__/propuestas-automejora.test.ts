import { describe, expect, it } from "vitest";

import {
  cambiarPropuesta,
  colaConTarea,
  leerPropuestas,
  marcarPropuestaDescartada,
  marcarPropuestaEnviada,
  normalizarPropuesta,
  tareaDePropuesta,
} from "../propuestas-automejora";

const CRUDO = {
  fecha: "2026-10-30",
  origen: "meta-n",
  propuestas: [
    {
      task_id: "AMJ202610301",
      description: "Implementa la función ayuda para la capa juicio",
      capa: "juicio",
      fecha: "2026-10-30",
      archivos: ["scripts/puente/ayudantes_juicio.py"],
      referencia_funcion: "ayuda",
    },
    { titulo: "Una ayuda sin id" },
  ],
};

describe("leerPropuestas", () => {
  it("lee las propuestas del archivo y les da id estable", () => {
    const props = leerPropuestas([{ archivo: "2026-10-30.json", crudo: CRUDO }]);
    expect(props).toHaveLength(2);
    expect(props[0]).toMatchObject({
      archivo: "2026-10-30.json",
      id: "AMJ202610301",
      capa: "juicio",
      referenciaFuncion: "ayuda",
      enviada: false,
    });
    expect(props[1].id).toBe("p2");
    expect(props[1].titulo).toBe("Una ayuda sin id");
  });

  it("acepta una lista directa y descarta lo ilegible", () => {
    const props = leerPropuestas([{ archivo: "x.json", crudo: [null, { id: "A" }] }]);
    expect(props).toHaveLength(1);
    expect(props[0].id).toBe("A");
  });
});

describe("normalizarPropuesta", () => {
  it("reconoce enviada y descartada por su campo o por estado", () => {
    expect(normalizarPropuesta({ estado: "enviada" }, 0, "a.json")?.enviada).toBe(true);
    expect(normalizarPropuesta({ descartada: true }, 0, "a.json")?.descartada).toBe(true);
  });
});

describe("cambiarPropuesta", () => {
  it("marca solo la propuesta pedida y conserva la forma del archivo", () => {
    const nuevo = marcarPropuestaEnviada(CRUDO, "AMJ202610301", "2026-11-05") as typeof CRUDO;
    expect(nuevo.propuestas[0]).toMatchObject({ estado: "enviada", enviada: true, enviadaEn: "2026-11-05" });
    expect(nuevo.propuestas[1]).toEqual(CRUDO.propuestas[1]);
    expect(leerPropuestas([{ archivo: "a.json", crudo: nuevo }])[0].enviada).toBe(true);
  });

  it("sin coincidencia devuelve null y no inventa propuestas", () => {
    expect(cambiarPropuesta(CRUDO, "no-existe", { x: 1 })).toBeNull();
    expect(marcarPropuestaDescartada({}, "A")).toBeNull();
  });
});

describe("tareaDePropuesta", () => {
  it("copia id, archivos y empieza con el aviso obligatorio", () => {
    const propuesta = leerPropuestas([{ archivo: "a.json", crudo: CRUDO }])[0];
    const tarea = tareaDePropuesta(propuesta, "2026-11-05");
    expect(tarea).toMatchObject({
      id: "AMJ202610301",
      origen: "automejora",
      archivos: ["scripts/puente/ayudantes_juicio.py"],
    });
    expect(tarea.prompt.startsWith("Comprueba primero si sigue haciendo falta")).toBe(true);
    expect(tarea.prompt).toContain("ayuda");
  });
});

describe("colaConTarea", () => {
  it("añade la tarea una sola vez y conserva las anteriores", () => {
    const propuesta = leerPropuestas([{ archivo: "a.json", crudo: CRUDO }])[0];
    const tarea = tareaDePropuesta(propuesta, "2026-11-05");
    const primera = colaConTarea(null, tarea, "2026-11-05");
    const segunda = colaConTarea(primera, tarea, "2026-11-05");
    expect(primera.tareas).toHaveLength(1);
    expect(segunda.tareas).toHaveLength(1);
    expect(segunda.ola).toBe("automejora-2026-11-05");
  });
});
