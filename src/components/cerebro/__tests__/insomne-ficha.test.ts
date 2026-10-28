import { describe, it, expect } from "vitest";

import { capacidadInsomne } from "../../../lib/neurons/insomne";

describe("capacidadInsomne · ficha de la neurona insomne", () => {
  it("un servidor no depende de la plataforma que declare", () => {
    expect(capacidadInsomne("server").proveedor).toBe("siempre");
    expect(capacidadInsomne("vps").proveedor).toBe("siempre");
    expect(capacidadInsomne("server").disponible).toBe(true);
  });

  it("lo que no reconoce no se inventa", () => {
    for (const plataforma of ["", "FreeBSD", "ChromeOS"]) {
      const capacidad = capacidadInsomne(plataforma);
      expect(capacidad.proveedor).toBe("no");
      expect(capacidad.disponible).toBe(false);
      expect(capacidad.motivo).toContain("no reconocida");
    }
  });
});
