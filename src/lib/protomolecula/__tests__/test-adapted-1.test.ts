import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string, categoria: string = "raster-pintura"): DefinicionAtomo {
  const parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId: id, nombre, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [] };
}

describe("adapted test 1: convierte un átomo registrado en una ficha de biblioteca", () => {
  beforeEach(() => limpiarRegistro());

  it("should convert registered atom to library ficha (not in catalog)", () => {
    const atomo = crearAtomoValido("test-tool", "Herramienta de Prueba", "raster-pintura");
    registrarAtomo(atomo);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("test-tool");
    expect(resultado[0].nombre).toBe("Herramienta de Prueba");
    expect(resultado[0].categoria).toBe("imagen"); // Should be grupo id, not categoria id
    expect(resultado[0].categoriaEtiqueta).toBe("Imagen"); // Should be grupo label
    expect(resultado[0].estado).toBe("integrada");
    expect(resultado[0].controlReal).toBe("total");
  });
});