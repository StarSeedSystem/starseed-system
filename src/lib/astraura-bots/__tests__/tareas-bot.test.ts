import { describe, expect, it } from "vitest";
import {
  crearTarea,
  asignarPasos,
  marcarCriterio,
  estadoDe,
  type Tarea,
  type EstadoTarea
} from "../tareas-bot";

describe("tareas-bot", () => {
  describe("crearTarea", () => {
    it("sin criterios no hay tarea", () => {
      const r = crearTarea({ titulo: "T", criterios: "[]", director: "d", origen: "genesis" }, "d", "genesis");
      if ("problemas" in r) {
        expect(r.problemas).toContain("Sin criterios no hay tarea");
      } else {
        expect(true).toBe(false); // This will fail
      }
    });

    it("máximo 12 criterios permitidos", () => {
      const r = crearTarea({ titulo: "T", criterios: JSON.stringify(Array.from({ length: 13 })), director: "d", origen: "genesis" }, "d", "genesis");
      if ("problemas" in r) {
        expect(r.problemas).toContain("Máximo 12 criterios permitidos");
      } else {
        expect(true).toBe(false); // This will fail
      }
    });

    it("cada criterio máximo 200 caracteres", () => {
      const r = crearTarea({ titulo: "T", criterios: JSON.stringify(["a".repeat(201)]), director: "d", origen: "genesis" }, "d", "genesis");
      if ("problemas" in r) {
        expect(r.problemas).toContain("Cada criterio debe tener máximo 200 caracteres");
      } else {
        expect(true).toBe(false); // This will fail
      }
    });

    it("crea tarea válida", () => {
      const r = crearTarea({ titulo: "T", criterios: JSON.stringify(["c1", "c2"]), director: "d", origen: "genesis" }, "d", "genesis");
      expect("problemas" in r).toBe(false);
      const t = r as Tarea;
      expect(t.titulo).toBe("T");
      expect(t.criterios).toEqual(["c1", "c2"]);
      expect(t.director).toBe("d");
      expect(t.origen).toBe("genesis");
      expect(t.verificador).toBe("persona");
      expect(t.estado).toBe("propuesta");
      expect(t.agentes).toEqual([]);
    });
  });

  describe("asignarPasos", () => {
    const tareaBase: Tarea = { id: "t1", titulo: "T", director: "dir", agentes: [], criterios: ["js prog", "diseño ui", "docs"], verificador: "persona", origen: "genesis", estado: "propuesta" as EstadoTarea };
    const agentes = [
      { id: "a1", capacidades: ["javascript", "programación"] },
      { id: "a2", capacidades: ["diseño", "ui"] },
      { id: "a3", capacidades: ["redacción", "documentación"] }
    ];

    it("reparte por palabras clave determinísticamente", () => {
      const r1 = asignarPasos(tareaBase, agentes);
      const r2 = asignarPasos(tareaBase, agentes);
      expect(r1.agentes.length).toBeGreaterThan(0);
      expect(r1.agentes).toEqual(r2.agentes);
    });

    it("nunca asigna al director si hay otros agentes", () => {
      const soloDir = [{ id: "dir", capacidades: ["cualquier cosa"] }];
      expect(asignarPasos(tareaBase, soloDir).agentes).toEqual([]);
      
      const conOtros = [...agentes, { id: "dir", capacidades: ["x"] }];
      const r = asignarPasos(tareaBase, conOtros);
      expect(r.agentes).not.toContain("dir");
      expect(r.agentes.length).toBeGreaterThan(0);
    });

    it("no asigna si no hay agentes", () => {
      expect(asignarPasos(tareaBase, []).agentes).toEqual([]);
    });
  });

  describe("marcarCriterio", () => {
    const estadoInicial: Record<string, { ok: boolean; por: { tipo: "persona" | "bot" | "pruebas"; id: string } }> = {};

    it("permite que persona verifique", () => {
      const r = marcarCriterio(estadoInicial, "c1", { tipo: "persona", id: "p1" }, true, "");
      expect(r["c1"].ok).toBe(true);
      expect(r["c1"].por.tipo).toBe("persona");
    });

    it("permite que pruebas verifiquen", () => {
      const r = marcarCriterio(estadoInicial, "c1", { tipo: "pruebas", id: "t1" }, false, "");
      expect(r["c1"].ok).toBe(false);
      expect(r["c1"].por.tipo).toBe("pruebas");
    });

    it("un bot puede verificar trabajo de otros bots", () => {
      const r = marcarCriterio(estadoInicial, "c1", { tipo: "bot", id: "b1" }, true, "");
      expect(r["c1"].ok).toBe(true);
      expect(r["c1"].por.tipo).toBe("bot");
    });
  });

  describe("estadoDe", () => {
    const tarea: Tarea = { id: "t1", titulo: "T", director: "dir", agentes: ["a1"], criterios: ["c1", "c2"], verificador: "persona", origen: "genesis", estado: "en-curso" as EstadoTarea };

    it("un criterio falso impide `hecha`", () => {
      let v = marcarCriterio({}, "c1", { tipo: "persona", id: "p1" }, true, "");
      v = marcarCriterio(v, "c2", { tipo: "persona", id: "p1" }, false, "");
      const e = estadoDe(tarea, v);
      expect(e).not.toBe("hecha");
      expect(e).toBe("verificando");
    });

    it("verificando si hay marcas", () => {
      expect(estadoDe(tarea, {})).toBe("en-curso");
      const v = marcarCriterio({}, "c1", { tipo: "persona", id: "p1" }, true, "");
      expect(estadoDe(tarea, v)).toBe("verificando");
    });

    it("en-curso si hay pasos", () => {
      const tConAgentes = { ...tarea, agentes: ["a1", "a2"] };
      const tSinAgentes = { ...tarea, agentes: [] };
      expect(estadoDe(tConAgentes, {})).toBe("en-curso");
      expect(estadoDe(tSinAgentes, {})).toBe("propuesta");
    });

    it("hecha solo con todos los criterios ok", () => {
      let v = marcarCriterio({}, "c1", { tipo: "persona", id: "p1" }, true, "");
      v = marcarCriterio(v, "c2", { tipo: "pruebas", id: "t1" }, true, "");
      expect(estadoDe(tarea, v)).toBe("hecha");
    });

    it("rechazada mantiene su estado", () => {
      const tRechazada = { ...tarea, estado: "rechazada" as EstadoTarea };
      const v = marcarCriterio({}, "c1", { tipo: "persona", id: "p1" }, true, "");
      expect(estadoDe(tRechazada, v)).toBe("rechazada");
    });
  });
});