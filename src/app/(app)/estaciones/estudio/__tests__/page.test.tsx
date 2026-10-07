import { describe, it, expect } from "vitest";

describe("EstacionesEstudioPage", () => {
  it("debe exportar una función de página con el nombre esperado", async () => {
    const mod = await import("../page");
    const Componente = mod.default || mod.EstacionesEstudioPage;
    expect(typeof Componente).toBe("function");
    expect(Componente.name).toBe("EstacionesEstudioPage");
  });
});
