import { describe, expect, it } from "vitest";
import {
  claveAppAceptada,
  idAppValido,
  nombreVariableValido,
  validarPeticionAppIa,
} from "@/lib/mando/apps-ia";

describe("apps-ia - contrato puro de la API", () => {
  it("acepta ids seguros y rechaza rutas", () => {
    expect(idAppValido("guia-1")).toBe(true);
    expect(idAppValido("../guia")).toBe(false);
    expect(idAppValido("Guia")).toBe(false);
  });

  it("solo acepta nombres de variable de entorno", () => {
    expect(nombreVariableValido("GUIA_API_KEY")).toBe(true);
    expect(nombreVariableValido("valor-secreto")).toBe(false);
  });

  it("comprueba Bearer contra la variable indicada", () => {
    const entorno: NodeJS.ProcessEnv = { GUIA_API_KEY: "secreta", NODE_ENV: "test" };
    expect(claveAppAceptada("Bearer secreta", "GUIA_API_KEY", entorno)).toBe(true);
    expect(claveAppAceptada("Bearer otra", "GUIA_API_KEY", entorno)).toBe(false);
    expect(claveAppAceptada("Bearer secreta", "NO_EXISTE", entorno)).toBe(false);
  });

  it("acepta el subconjunto blocking de chat-messages", () => {
    expect(validarPeticionAppIa({ inputs: { nombre: "Ana" }, query: "Hola", response_mode: "blocking" })).toBeNull();
  });

  it("rechaza consulta, inputs y modo inválidos", () => {
    expect(validarPeticionAppIa({ inputs: {}, query: " " })).toBe("Falta `query`.");
    expect(validarPeticionAppIa({ inputs: [], query: "Hola" })).toBe("`inputs` debe ser un objeto.");
    expect(validarPeticionAppIa({ inputs: {}, query: "Hola", response_mode: "streaming" }))
      .toBe("Solo se admite `response_mode: blocking`.");
  });
});
