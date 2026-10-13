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
  tipo: "number" | "entero" | "booleano" | "opcion" | "disparo";
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

describe("fichasProtomolecula - átomo con proximamente", () => {
  beforeEach(() => limpiarRegistro());

  it("establece el campo proximamente cuando el átomo tiene el campo proximamente", () => {
    const atomoDef = atomo("proximate-tool", "juegos", { 
      nombre: "Herramienta Próxima",
      proximamente: "Falta implementar el envoltorio nativo"
    });
    registrarAtomo(atomoDef);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado.length).toBe(1);
    expect(resultado[0].proximamente).toBe("próximamente: Falta implementar el envoltorio nativo");
    expect(resultado[0].estado).toBe("integrada");
  });
});