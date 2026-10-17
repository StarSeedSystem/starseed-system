import { describe, expect, it } from "vitest";
import { crearTarea, asignarPasos, marcarCriterio, estadoDe, type EstadoVerif } from "../tareas-bot";

describe("crearTarea", () => {
  it("crea una tarea con criterio válido", () => {
    const t = crearTarea("Test Task", "director1", "genesis", ["agent1", "agent2"], "persona", ["Implementar función X", "Escribir pruebas unitarias"]);
    expect(t).not.toHaveProperty("problemas");
    expect(t.titulo).toBe("Test Task");
    expect(t.director).toBe("director1");
    expect(t.origen).toBe("genesis");
    expect(t.agentes).toEqual(["agent1", "agent2"]);
    expect(t.verificador).toBe("persona");
    expect(t.criterios).toEqual(["Implementar función X", "Escribir pruebas unitarias"]);
    expect(t.estado).toBe("propuesta");
  });

  it("devuelve problemas si el título es inválido", () => {
    const t = crearTarea("", "director1", "genesis");
    expect(t).toHaveProperty("problemas");
    expect(t.problemas).toContainEqual({ mensaje: "El título debe tener al menos 3 caracteres.", codigo: "TITULO_INVALIDO" });
  });

  it("devuelve problemas si el director está vacío", () => {
    const t = crearTarea("Task", "", "genesis");
    expect(t).toHaveProperty("problemas");
    expect(t.problemas).toContainEqual({ mensaje: "El director no puede estar vacío.", codigo: "DIRECTOR_INVALIDO" });
  });

  it("devuelve problemas si el origen es inválido", () => {
    const t = crearTarea("Task", "director1", "invalid" as any);
    expect(t).toHaveProperty("problemas");
    expect(t.problemas).toContainEqual({ mensaje: "Origen inválido.", codigo: "ORIGEN_INVALIDO" });
  });

  it("no hay tarea sin criterios", () => {
    const t = crearTarea("Task", "director1", "genesis");
    expect(t).toHaveProperty("problemas");
    expect(t.problemas).toContainEqual({ mensaje: "Se necesita al menos un criterio.", codigo: "SIN_CRITERIOS" });
  });

  it("respeta el tope de 12 criterios", () => {
    const longCrits = Array.from({ length: 13 }, (_, i) => `Criterio ${i + 1}`);
    const t = crearTarea("Task", "director1", "genesis", [], "persona", longCrits);
    expect(t).toHaveProperty("problemas");
    expect(t.problemas).toContainEqual({ mensaje: "Máx. 12 criterios.", codigo: "CRITERIOS_EXCESIVOS" });
  });

  it("valida cada criterio de ≤ 200 caracteres", () => {
    const crits = Array.from({ length: 3 }, (_, i) => `Criterio ${i + 1}: ${"x".repeat(200)}`);
    const t = crearTarea("Task", "director1", "genesis", [], "persona", crits);
    expect(t).toHaveProperty("problemas");
    expect(t.problemas.some(p => p.codigo === "CRITERIO_LARGO")).toBe(true);
  });

  it("elimina espacios en blanco de título y criterios", () => {
    const t = crearTarea("  Test Task  ", " director1 ", "genesis", [], "persona", ["  Criterio 1  ", " Criterio 2 "]);
    expect(t).not.toHaveProperty("problemas");
    expect(t.titulo).toBe("Test Task");
    expect(t.director).toBe("director1");
    expect(t.criterios).toEqual(["Criterio 1", "Criterio 2"]);
  });
});

describe("asignarPasos", () => {
  const agentes = [
    { id: "director1", capacidades: ["javascript", "react", "typescript"] },
    { id: "agent2", capacidades: ["python", "docker", "sql"] },
    { id: "agent3", capacidades: ["javascript", "nodejs", "express"] },
  ];

  it("distribuye criterios por palabras clave deterministas", () => {
    const agentes = [
      { id: "director1", capacidades: ["implementar", "endpoints", "api"] },
      { id: "agent2", capacidades: ["escribir", "documentación", "probar"] },
      { id: "agent3", capacidades: ["javascript", "nodejs", "express"] },
    ];

    const tarea = {
      id: "t1",
      titulo: "Crear API",
      director: "director1",
      agentes: ["agent2", "agent3"],
      criterios: ["Implementar endpoints de API", "Escribir documentación de API", "Probar manejo de errores"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const reparto = asignarPasos(tarea, agentes);

    expect(reparto.director1).toBeUndefined() || reparto.director1!.length === 0;
    expect(reparto.agent2).toBeDefined();
    expect(reparto.agent3).toBeDefined();
    expect(reparto.agent2!.length + reparto.agent3!.length).toBe(3);
  });

  it("el director no recibe pasos si hay más de un agente", () => {
    const agentes = [
      { id: "director1", capacidades: ["implementar", "endpoints", "api"] },
      { id: "agent2", capacidades: ["escribir", "documentación", "probar"] },
    ];
    const tarea = {
      id: "t2",
      titulo: "Test",
      director: "director1",
      agentes: ["agent2"],
      criterios: ["Criterio 1", "Criterio 2"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const reparto = asignarPasos(tarea, agentes);

    expect(reparto.director1).toBeUndefined() || reparto.director1!.length === 0;
    expect(reparto.agent2).toBeDefined();
    expect(reparto.agent2!.length).toBe(2);
  });

  it("todas las palabras clave distribuyen criterios entre agentes", () => {
    const agentes = [
      { id: "agent1", capacidades: ["implementar", "ui", "componente"] },
      { id: "agent2", capacidades: ["configurar", "backend", "servidor"] },
      { id: "agent3", capacidades: ["escribir", "pruebas", "unitarios"] },
    ];

    const tarea = {
      id: "t3",
      titulo: "Project X",
      director: "director1",
      agentes: ["agent1", "agent2", "agent3"],
      criterios: ["Implementar componente de UI", "Configurar servidor backend", "Escribir pruebas unitarias"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const reparto = asignarPasos(tarea, agentes);

    expect(reparto.agent1).toBeDefined();
    expect(reparto.agent2).toBeDefined();
    expect(reparto.agent3).toBeDefined();
    expect(reparto.agent1!.length + reparto.agent2!.length + reparto.agent3!.length).toBe(3);
  });

  it("todas las capacidades se normalizan a minúsculas y se dividen por espacios/comas", () => {
    const agentes = [
      { id: "agent1", capacidades: ["javascript, react, typescript"] },
      { id: "agent2", capacidades: ["python / docker / sql"] },
    ];

    const tarea = {
      id: "t4",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1", "agent2"],
      criterios: ["JavaScript component", "Python backend"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const reparto = asignarPasos(tarea, agentes);

    expect(reparto.agent1).toBeDefined();
    expect(reparto.agent2).toBeDefined();
    expect(reparto.agent1!.length + reparto.agent2!.length).toBe(2);
  });
});

describe("marcarCriterio", () => {
  it("marca un criterio como verificado (ok)", () => {
    const estadoInicial: EstadoVerif = { hecho: "Criterio A|Criterio B", problemas: [] };
    const estado = marcarCriterio(estadoInicial, "Criterio A", { tipo: "persona", id: "persona1" }, true);
    expect(estado.hecho).toContain("Criterio A|v");
    expect(estado.problemas.length).toBe(0);
  });

  it("marca un criterio como rechazado (false)", () => {
    const estadoInicial: EstadoVerif = { hecho: "Criterio A|Criterio B", problemas: [] };
    const estado = marcarCriterio(estadoInicial, "Criterio A", { tipo: "persona", id: "persona1" }, false);
    expect(estado.hecho).toContain("Criterio A|x");
    expect(estado.problemas).toContainEqual({ mensaje: 'Criterio "Criterio A" rechazado por persona persona1.', codigo: "CRITERIO_RECHAZADO" });
  });

  it("añade un nuevo criterio cuando no existe", () => {
    const estadoInicial: EstadoVerif = { hecho: "Criterio A|Criterio B", problemas: [] };
    const estado = marcarCriterio(estadoInicial, "Criterio C", { tipo: "persona", id: "persona1" }, true);
    expect(estado.hecho).toContain("Criterio C|v");
    expect(estado.problemas.length).toBe(0);
  });

  it("incluye evidencia cuando se proporciona", () => {
    const estadoInicial: EstadoVerif = { hecho: "Criterio A|Criterio B", problemas: [] };
    const estado = marcarCriterio(
      estadoInicial,
      "Criterio A",
      { tipo: "persona", id: "persona1" },
      true,
      "Implementado correctamente en la versión 1.2"
    );
    expect(estado.hecho).toContain("Criterio A|v|Implementado correctamente en la versión 1.2");
  });

  it("limita la evidencia a 1000 caracteres", () => {
    const longEvidencia = "x".repeat(1500);
    const estadoInicial: EstadoVerif = { hecho: "Criterio A|Criterio B", problemas: [] };
    const estado = marcarCriterio(
      estadoInicial,
      "Criterio A",
      { tipo: "persona", id: "persona1" },
      true,
      longEvidencia
    );
    expect(estado.hecho).toContain("Criterio A|v|" + longEvidencia.slice(0, 1000));
  });
});

describe("estadoDe", () => {
  const persona = "persona1";
  const bot = "bot1";

  it("tarea propuesta por defecto sin verificador válido", () => {
    const tarea = {
      id: "t5",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1"],
      criterios: ["Criterio 1"],
      verificador: "bot" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    expect(estadoDe(tarea, "otro" as any, null)).toBe("propuesta");
  });

  it("tarea en-curso cuando el verificador tiene pasos pendientes", () => {
    const tarea = {
      id: "t6",
      titulo: "Test",
      director: "director1",
      agentes: ["director1", "agent2"],
      criterios: ["Criterio 1", "Criterio 2"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const estado = estadoDe(tarea, "persona1", null);

    expect(estado).toBe("en-curso");
  });

  it("tarea verificando cuando hay marcas intermedias", () => {
    const tarea = {
      id: "t7",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1"],
      criterios: ["Criterio 1", "Criterio 2"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const hecho = "Criterio 1|v|Criterio 2";

    const estado = estadoDe(tarea, "persona1", hecho);

    expect(estado).toBe("verificando");
  });

  it("tarea hecha cuando todos los criterios están marcados", () => {
    const tarea = {
      id: "t8",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1"],
      criterios: ["Criterio 1", "Criterio 2"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    const hecho = "Criterio 1|v|Criterio 2|v";

    const estado = estadoDe(tarea, "persona1", hecho);

    expect(estado).toBe("hecha");
  });

  it("rechazada sin pasar por otros estados", () => {
    const tarea = {
      id: "t9",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1"],
      criterios: ["Criterio 1"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "rechazada" as const,
    };

    expect(estadoDe(tarea, "persona1")).toBe("rechazada");
  });

  it("propuesta cuando el verificador coincide", () => {
    const tarea = {
      id: "t10",
      titulo: "Test",
      director: "director1",
      agentes: ["agent1"],
      criterios: ["Criterio 1"],
      verificador: "persona" as const,
      origen: "genesis" as const,
      estado: "propuesta" as const,
    };

    expect(estadoDe(tarea, "persona1")).toBe("propuesta");
  });
});
