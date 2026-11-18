import { describe, it, expect } from "vitest";
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET } from "@/lib/malla/internet/textos-internet";

describe("palabras del módulo internet", () => {
  it("expone los textos de modo banco y modo mesh", () => {
    expect(TEXTOS_INTERNET.bancoTitulo).toBe("Modo banco");
    expect(TEXTOS_INTERNET.meshTitulo).toBe("Modo mesh");
  });

  it("expone la ayuda del banco", () => {
    expect(TEXTOS_INTERNET.bancoAyuda).toContain("reparte");
  });

  it("expone los textos extra para la sección", () => {
    expect(TEXTOS_EXTRA_INTERNET.desde).toBe("Desde");
    expect(TEXTOS_EXTRA_INTERNET.hasta).toBe("Hasta");
    expect(TEXTOS_EXTRA_INTERNET.limite).toBe("Límite");
    expect(TEXTOS_EXTRA_INTERNET.compartirConOtros).toBe("Compartir con otros");
    expect(TEXTOS_EXTRA_INTERNET.declararDePago).toBe("Declarar conexión de pago");
    expect(TEXTOS_EXTRA_INTERNET.declararNoDePago).toBe("Declarar conexión no de pago");
  });

  it("expone la sugerencia para conexión cellular", () => {
    expect(TEXTOS_INTERNET.sugerirTitulo).toBe("Conexión limitada detectada");
    expect(TEXTOS_INTERNET.sugerirCuerpo).toContain("sugerencia");
    expect(TEXTOS_INTERNET.sugerirActivar).toBe("Activar modo banco");
    expect(TEXTOS_INTERNET.sugerirAhoraNo).toBe("Ahora no");
  });
});