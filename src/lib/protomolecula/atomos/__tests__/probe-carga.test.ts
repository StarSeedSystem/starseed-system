import { describe, it } from "vitest";

/** Sondeo temporal: descubre qué módulo del índice revienta al cargarse. Se borra al terminar. */
describe("sondeo de carga de módulos del índice", () => {
  it("registro-atomos", async () => {
    try {
      await import("../registro-atomos");
    } catch (error) {
      console.error("FALLO registro-atomos:", error);
    }
  });

  it("sintetizador", async () => {
    try {
      await import("../sintetizador");
    } catch (error) {
      console.error("FALLO sintetizador:", error);
    }
  });

  it("doblaje", async () => {
    try {
      await import("../doblaje");
    } catch (error) {
      console.error("FALLO doblaje:", error);
    }
  });

  it("texturas-webgl", async () => {
    try {
      await import("../texturas-webgl");
    } catch (error) {
      console.error("FALLO texturas-webgl:", error);
    }
  });

  it("animacion-manimgx", async () => {
    try {
      await import("../animacion-manimgx");
    } catch (error) {
      console.error("FALLO animacion-manimgx:", error);
    }
  });

  it("mausbot", async () => {
    try {
      await import("../mausbot");
    } catch (error) {
      console.error("FALLO mausbot:", error);
    }
  });

  it("index", async () => {
    try {
      await import("../index");
    } catch (error) {
      console.error("FALLO index:", error);
    }
  });
});
