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

describe("fichasProtomolecula - orden simple", () => {
  beforeEach(() => limpiarRegistro());

  it("debería ordenar correctamente imagen antes de 3d", () => {
    // Registrar átomo con categoria "imagen"
    registrarAtomo(atomo("herramienta-imagen", "imagen", { nombre: "Herramienta de Imagen" }));
    // Registrar átomo con categoria "3d"
    registrarAtomo(atomo("herramienta-3d", "3d", { nombre: "Herramienta de 3D" }));
    
    const resultado = fichasProtomolecula();
    
    // Debemos tener exactamente 2 fichas
    expect(resultado.length).toBe(2);
    
    // La ficha con categoria "imagen" debería venir antes que la con categoria "3d"
    // Porque "imagen" está en índice 0 y "3d" está en índice 3 en ORDEN_GRUPOS_PROTO
    expect(resultado[0].categoria).toBe("imagen");
    expect(resultado[1].categoria).toBe("3d");
  });
});