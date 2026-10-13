import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro, obtenerAtomo } from "../registro-atomos";

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

describe("fichasProtomolecula - vr-ar category", () => {
  beforeEach(() => limpiarRegistro());

  it("debería permitir registrar un átomo con categoria 'vr-ar'", () => {
    const result = registrarAtomo(atomo("hermona-vrar", "vr-ar", { nombre: "Herramienta de VR/AR" }));
    console.log("Registro result:", result);
    expect(result.ok).toBe(true);
    
    const atom = obtenerAtomo("hermona-vrar");
    console.log("Átomo registrado:", atom);
    expect(atom).toBeDefined();
    expect(atom?.categoria).toBe("vr-ar");
  });
  
  it("debería incluir el átomo en las fichas", () => {
    registrarAtomo(atomo("hermona-vrar", "vr-ar", { nombre: "Herramienta de VR/AR" }));
    const resultado = fichasProtomolecula();
    console.log("Número de fichas:", resultado.length);
    console.log("Fichas:", resultado.map(f => f.categoria));
    expect(resultado.length).toBe(1);
    expect(resultado[0].categoria).toBe("vr-ar");
  });
});