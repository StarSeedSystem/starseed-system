import { describe, it, expect } from "vitest";
import { crearTarea } from "../tareas-bot";

describe("crearTarea", () => {
  it("debe crear una tarea válida sin problemas", () => {
    const args = {
      id: "tarea1",
      titulo: "Tarea de prueba",
      descripcion: "Descripción de prueba",
      director: "director1",
      origen: "origen1",
    };

    const resultado = crearTarea(args);

    expect(resultado).toHaveProperty("id");
    expect(resultado).toHaveProperty("titulo");
    expect(resultado).toHaveProperty("descripcion");
    expect(resultado).toHaveProperty("director");
    expect(resultado).toHaveProperty("origen");
    expect(resultado).toHaveProperty("criterios");
    expect(resultado).toHaveProperty("pasos");
    expect(resultado).toHaveProperty("verificaciones");
    expect(resultado.criterios).toEqual([]);
    expect(resultado.pasos).toEqual([]);
    expect(resultado.verificaciones).toEqual([]);
  });
});
