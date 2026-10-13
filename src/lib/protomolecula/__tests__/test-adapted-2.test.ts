import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string, categoria: string = "raster-pintura"): DefinicionAtomo {
  const parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId: id, nombre, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [] };
}

describe("adapted test 2: usa la información de versiones cuando se proporciona", () => {
  beforeEach(() => limpiarRegistro());

  it("should use version information for licencia when provided", () => {
    const atomo = crearAtomoValido("versioned-tool", "Herramienta con Versión", "raster-pintura");
    registrarAtomo(atomo);
    
    const versiones = {
      "versioned-tool": {
        version: "2.0.0",
        licencia: "MIT"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, []);
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].licencia).toBe("MIT"); // Should come from versiones
    expect(resultado[0].versionInstalada).toBeUndefined();
    expect(resultado[0].versionDisponible).toBe("2.0.0"); // No sha, so disponible
  });
});