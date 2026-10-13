import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";

function atomo(herramientaId: string, categoria: CategoriaAtomo = "imagen", extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId, nombre: herramientaId, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [], ...extra };
}

type CategoriaAtomo = 
  | "imagen"
  | "audio"
  | "video"
  | "3d"
  | "arquitectura"
  | "fisicas"
  | "juegos"
  | "vr-ar"
  | "codigo"
  | "ia";

interface Parametro {
  id: string;
  nombre: string;
  tipo: "numero" | "entero" | "booleano" | "opcion" | "disparo";
}

interface DefinicionAtomo {
  herramientaId: string;
  nombre: string;
  categoria: CategoriaAtomo;
  integracion: string;
  control: string;
  parametros: Parametro[];
  entradas: string[];
  salidas: string[];
  vista?: any;
  proximamente?: string;
  ficha?: { web?: string; repo?: string; licencia?: string };
}

describe("fichasProtomolecula - 6 groups fixed", () => {
  beforeEach(() => limpiarRegistro());

  it("debería registrar 6 átomos y producir 6 fichas con las categorías correctas", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Fisicas" }, // sin acento
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 6 fichas
    expect(resultado.length).toBe(6);
    
    // Verificar que tenemos exactamente las categorías esperadas (en cualquier orden)
    const categorias = resultado.map(f => f.categoria);
    expect(new Set(categorias)).toEqual(new Set(["imagen", "audio", "video", "3d", "arquitectura", "fisicas"]));
  });
  
  it("debería ordenar correctamente según el orden especificado en el contrato", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Fisicas" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 6 fichas
    expect(resultado.length).toBe(6);
    
    // Verificar que la ficha en posición 0 pertenece al grupo "imagen" (índice 0)
    expect(resultado[0].categoria).toBe("imagen");
    // Verificar que la ficha en posición 3 pertenece al grupo "3d" (índice 3)
    expect(resultado[3].categoria).toBe("3d");
    // Verificar que la ficha en posición 4 pertenece al grupo "arquitectura" (índice 4)
    expect(resultado[4].categoria).toBe("arquitectura");
    // Verificar que la ficha en posición 5 pertenece al grupo "fisicas" (índice 5)
    expect(resultado[5].categoria).toBe("fisicas");
  });
});