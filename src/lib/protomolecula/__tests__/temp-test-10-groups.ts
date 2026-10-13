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

describe("fichasProtomolecula - 10 groups", () => {
  beforeEach(() => limpiarRegistro());

  it("debería registrar 10 átomos y producir 10 fichas", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Fisicas" },
      { categoria: "juegos", nombre: "Herramienta de Juegos" },
      { categoria: "vr-ar", nombre: "Herramienta de VR/AR" },
      { categoria: "codigo", nombre: "Herramienta de Codigo" },
      { categoria: "ia", nombre: "Herramienta de IA" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 10 fichas
    expect(resultado.length).toBe(10);
  });
  
  it("debería ordenar correctamente según el orden especificado en el contrato (posiciones 0, 6, 9)", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Fisicas" },
      { categoria: "juegos", nombre: "Herramienta de Juegos" },
      { categoria: "vr-ar", nombre: "Herramienta de VR/AR" },
      { categoria: "codigo", nombre: "Herramienta de Codigo" },
      { categoria: "ia", nombre: "Herramienta de IA" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 10 fichas
    expect(resultado.length).toBe(10);
    
    // Verificar que la ficha en posición 0 pertenece al grupo "imagen" (índice 0 en ORDEN_GRUPOS_PROTO)
    expect(resultado[0].categoria).toBe("imagen");
    // Verificar que la ficha en posición 6 pertenece al grupo "juegos" (índice 6 en ORDEN_GRUPOS_PROTO)
    expect(resultado[6].categoria).toBe("juegos");
    // Verificar que la ficha en posición 9 pertenece al grupo "ia" (índice 9 en ORDEN_GRUPOS_PROTO)
    expect(resultado[9].categoria).toBe("ia");
  });
});