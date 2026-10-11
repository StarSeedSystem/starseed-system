import { describe, it, expect } from "vitest";
import { crearTarea, Tarea } from "../tareas-bot";

describe("simple test", () => {
  it("debe crear una tarea", () => {
    const args = {
      id: "test",
      titulo: "Test",
      descripcion: "Test",
      director: "director1",
      origen: "origen1",
    };
    const resultado = crearTarea(args);
    expect(resultado).toHaveProperty("id");
  });
});
