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

describe("fichasProtomolecula - catalogo y átomo coinciden", () => {
  beforeEach(() => limpiarRegistro());

  it("usa la información del catálogo cuando se proporciona y hay átomo coincidente", () => {
    const atomoDef = atomo("catalog-tool", "codigo", { nombre: "Herramienta del Catálogo" });
    registrarAtomo(atomoDef);
    
    const catalogo = [{
      id: "catalog-tool",
      nombre: "Nombre desde Catálogo",
      descripcion: "Esta es una descripción detallada desde el catálogo",
      licencia: "GPL-3.0",
      codigo: "https://github.com/usuario/repo", // corregido: era repositorio
      web: "https://ejemplo.com",
      documento: "https://docs.ejemplo.com",
      integracion: "iframe-aislado",
      control: "total",
      estado: "integrable",
      motivo: ""
    }];
    
    const resultado = fichasProtomolecula({}, catalogo);
    
    expect(resultado.length).toBe(1);
    expect(resultado[0].nombre).toBe("Nombre desde Catálogo");
    expect(resultado[0].descripcion).toContain("Esta es una descripción detallada desde el catálogo");
    expect(resultado[0].licencia).toBe("GPL-3.0");
    expect(resultado[0].enlaces).toBeDefined();
    expect(resultado[0].enlaces!.web).toBe("https://ejemplo.com");
    expect(resultado[0].enlaces!.repo).toBe("https://github.com/usuario/repo");
    expect(resultado[0].estado).toBe("integrada"); // debido al átomo coincidente
    expect(resultado[0].controlReal).toBe("total"); // del átomo (control por defecto)
  });
});