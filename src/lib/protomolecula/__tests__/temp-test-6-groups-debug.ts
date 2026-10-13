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

describe("fichasProtomolecula - 6 groups debug", () => {
  beforeEach(() => limpiarRegistro());

  it("debería mostrar qué categorías se están registrando", () => {
    const gruposYNombres = [
      { categoria: "imagen", nombre: "Herramienta de Imagen" },
      { categoria: "audio", nombre: "Herramienta de Audio" },
      { categoria: "video", nombre: "Herramienta de Video" },
      { categoria: "3d", nombre: "Herramienta de 3D" },
      { categoria: "arquitectura", nombre: "Herramienta de Arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Físicas" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of gruposYNombres) {
      const result = registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
      console.log(`Registro de ${nombre}:`, result);
    }

    const resultado = fichasProtomolecula();
    console.log("Número de fichas:", resultado.length);
    console.log("Fichas:", resultado.map(f => ({ categoria: f.categoria, nombre: f.nombre })));
    
    // Debemos tener exactamente 6 fichas
    expect(resultado.length).toBe(6);
  });
});