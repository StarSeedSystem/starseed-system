import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro, obtenerAtomo } from "../registro-atomos";

function atomo(herramientaId: string, categoria: CategoriaAtomo = "imagen", extra: Partial<DefinicionAtomo> = {}): Definicionatomo {
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

describe("fichasProtomolecula - ia category", () => {
  beforeEach(() => limpiarRegistro());

  it("debería permitir registrar un átomo con categoria 'ia'", () => {
    const result = registrarAtomo(atomo("hermona-ia", "ia", { nombre: "Herramienta de IA" }));
    console.log("Registro result:", result);
    expect(result.ok).toBe(true);
    
    const atom = obtenerAtomo("hermona-ia");
    console.log("Átomo registrado:", atom);
    expect(atom).toBeDefined();
    expect(atom?.categoria).toBe("ia");
  });
  
  it("debería incluir el átomo en las fichas", () => {
    registrarAtomo(atomo("hermona-ia", "ia", { nombre: "Herramienta de IA" }));
    const resultado = fichasProtomolecula();
    console.log("Número de fichas:", resultado.length);
    console.log("Fichas:", resultado.map(f => f.categoria));
    expect(resultado.length).toBe(1);
    expect(resultado[0].categoria).toBe("ia");
  });
});