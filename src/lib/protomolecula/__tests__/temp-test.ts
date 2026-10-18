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

describe("fichasProtomolecula - licencia from versiones for átomo", () => {
  beforeEach(() => limpiarRegistro());

  it("usa la información de versiones cuando se proporciona (átomo)", () => {
    const atomoDef = atomo("versioned-tool", "imagen", { nombre: "Herramienta con Versión" });
    registrarAtomo(atomoDef);
    
    const versiones = {
      "versioned-tool": {
        version: "1.2.3",
        fecha: "2026-10-10",
        licencia: "MIT",
        sha: "abc123",
        estado: "disponible"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, []);
    
    expect(resultado.length).toBe(1);
    expect(resultado[0].licencia).toBe("MIT");
    expect(resultado[0].descripcion).toContain("Herramienta con Versión");
  });
});