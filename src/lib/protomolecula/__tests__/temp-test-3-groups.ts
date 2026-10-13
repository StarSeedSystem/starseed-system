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

describe("fichasProtomolecula - 3 groups", () => {
  beforeEach(() => limpiarRegistro());

  it("debería registrar 3 átomos y producir 3 fichas", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 3 fichas
    expect(resultado.length).toBe(3);
    
    // Verificar las categorías
    const categorias = resultado.map(f => f.categoria).sort();
    expect(categorias).toEqual(["audio", "imagen", "video"]);
  });
});