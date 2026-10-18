import { describe, it, expect, vi } from "vitest";
import { estadoTunelMetaGenesis, tacharTexto } from "../tunel-metagenesis-estado";

describe("estadoTunelMetaGenesis", () => {
  it("devuelve cargado:false en sistemas no macOS", async () => {
    vi.stubGlobal("process", { platform: "linux" });
    const resultado = await estadoTunelMetaGenesis();
    expect(resultado.cargado).toBe(false);
    expect(resultado.pid).toBeNull();
    expect(resultado.ultimasLineas).toEqual([]);
    expect(typeof resultado.medidoEn).toBe("string");
  });

  it("tacharTexto reemplaza URLs trycloudflare correctamente", () => {
    expect(tacharTexto("Visita https://ejemplo.trycloudflare.com para más info"))
      .toBe("Visita [túnel] para más info");
     
    expect(tacharTexto("Múltiple: https://primero.trycloudflare.com y https://segundo.trycloudflare.com"))
      .toBe("Múltiple: [túnel] y [túnel]");
       
    expect(tacharTexto("Sin URL: ejemplo.com"))
      .toBe("Sin URL: ejemplo.com");
  });

  it("tacharTexto conserva ruta y query tras el dominio tachado", () => {
    expect(tacharTexto("https://subdominio-dash.trycloudflare.com/path?query=value"))
      .toBe("[túnel]/path?query=value");
  });

  it("tacharTexto no toca una URL https de otro dominio ni el texto vacío", () => {
    expect(tacharTexto("Sin cambio: https://example.com"))
      .toBe("Sin cambio: https://example.com");

    expect(tacharTexto("")).toBe("");
  });
});