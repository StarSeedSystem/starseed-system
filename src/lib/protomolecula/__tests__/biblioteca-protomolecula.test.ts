import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula, ORDEN_GRUPOS_PROTO } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro, CategoriaAtomo } from "../registro-atomos";
import { CATEGORIAS_PROTOMOLECULA } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

function herramienta(parcial: Partial<HerramientaProto> & { id: string; categoria: HerramientaProto["categoria"] }): HerramientaProto {
  return {
    nombre: parcial.id,
    tipo: "app",
    origen: "otro",
    descripcion: `Descripción de ${parcial.id}.`,
    licencia: "MIT",
    codigo: `https://github.com/ejemplo/${parcial.id}`,
    web: null,
    medios: { web: "embebible", android: false, ios: false, macos: true, windows: true, linux: true, servidor: false },
    integracion: "iframe-aislado",
    formatos: { entrada: [], salida: [] },
    control: { via: ["postMessage"], notas: "" },
    actualizacion: { fuente: "github-releases", ref: `ejemplo/${parcial.id}`, ultimaVersion: null, fechaVersion: null },
    ia: [],
    estado: "integrable",
    motivo: "Licencia y vía comprobadas.",
    verificado: "2026-10-10",
    ...parcial,
  };
}

function atomo(herramientaId: string, categoria: CategoriaAtomo = "imagen", extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId, nombre: herramientaId, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [], ...extra };
}

function crearAtomoValido(id: string, nombre: string, categoria: CategoriaAtomo = "imagen"): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria,
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
}

describe("fichasProtomolecula", () => {
  beforeEach(() => limpiarRegistro());

  it("convierte un átomo registrado en una ficha de biblioteca", () => {
    const atomo = crearAtomoValido("test-tool", "Herramienta de Prueba");
    registrarAtomo(atomo);
    
    const resultado = fichasProtomolecula();
    
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("test-tool");
    expect(resultado[0].nombre).toBe("Herramienta de Prueba");
    expect(resultado[0].categoria).toBe("imagen");
    expect(resultado[0].categoriaEtiqueta).toBe("Imagen");
  });

  it("usa la información de versiones cuando se proporciona", () => {
    const catalogo = [herramienta({ id: "versioned-tool", nombre: "Herramienta con Versión", licencia: "GPL-3.0", categoria: "conversion-formatos" })];
    const versiones = {
      "versioned-tool": {
        licencia: "MIT"
      }
    };
    
    const resultado = fichasProtomolecula(versiones, catalogo);
    
    expect(resultado[0].licencia).toBe("MIT");
  });

  it("muestra 'Próximamente' cuando el átomo tiene el campo proximamente", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    // Nota: Los átomos con campo proximamente no se registran (regla del núcleo)
    const registroResult = registrarAtomo(atomo);
    expect(registroResult.ok).toBe(false);
    
    const resultado = fichasProtomolecula();
    expect(resultado).toHaveLength(0);
  });

  it("usa el nombre y descripción del catálogo cuando se proporciona", () => {
    const catalogo = [herramienta({
      id: "test-tool",
      nombre: "Nombre Personalizado",
      descripcion: "Esta es una descripción personalizada.",
      licencia: "MIT",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      categoria: "raster-pintura" as const,
      tipo: "app" as const,
    })];

    const [ficha] = fichasProtomolecula({}, catalogo);

    expect(ficha.nombre).toBe("Nombre Personalizado");
    expect(ficha.descripcion).toBe("Esta es una descripción personalizada.");
    expect(ficha.licencia).toBe("MIT");
    expect(ficha.enlaces.web).toBe("https://ejemplo.com");
    expect(ficha.enlaces.repo).toBe("https://github.com/usuario/repo");
  });

  it("agrupa los átomos por categoría", () => {
    registrarAtomo(atomo("tool1", "imagen"));
    registrarAtomo(atomo("tool2", "audio"));
    registrarAtomo(atomo("tool3", "video"));

    const fichas = fichasProtomolecula();

    expect(fichas).toHaveLength(3);
    expect(fichas.find(f => f.nombre === "tool1")?.categoria).toBe("imagen");
    expect(fichas.find(f => f.nombre === "tool2")?.categoria).toBe("audio");
    expect(fichas.find(f => f.nombre === "tool3")?.categoria).toBe("video");
  });

  it("ordena los átomos por categoría según el orden especificado", () => {
    registrarAtomo(atomo("juego-tool", "juegos"));
    registrarAtomo(atomo("img-tool", "imagen"));
    registrarAtomo(atomo("ia-tool", "ia"));

    const fichas = fichasProtomolecula();

    expect(fichas).toHaveLength(3);
    expect(fichas.map(f => f.categoria)).toEqual(["imagen", "juegos", "ia"]);
  });

  it("maneja correctamente cuando se proporcionan tanto versiones como catalogo", () => {
    const atm = atomo("full-tool", "imagen");
    registrarAtomo(atm);

    const versiones = {
      "full-tool": {
        version: "2.0.0",
        licencia: "Apache-2.0",
        sha: "abc123"
      }
    };

    const catalogo = [{
      id: "full-tool",
      nombre: "Nombre desde Católico",
      descripcion: "Descripción desde el catálogo",
      licencia: "GPL-3.0",
      codigo: "https://github.com/usuario/repo",
      web: "https://ejemplo.com",
      tipo: "app" as const,
      origen: "otro" as const,
            medios: { web: "embebible", android: false, ios: false, macos: true, windows: true, linux: true, servidor: false } as const,
      integracion: "iframe-aislado" as const,
      formatos: { entrada: [], salida: [] },
            control: { via: ["postMessage"] as const, notas: "" },
            actualizacion: { fuente: "github-releases" as const, ref: `ejemplo/full-tool`, ultimaVersion: null, fechaVersion: null },
      ia: [],
            estado: "integrable" as const,
      motivo: "",
      verificado: "2026-10-10",
      categoria: "raster-pintura" as const,
    }];

    const [ficha] = fichasProtomolecula(versiones, catalogo);

    expect(ficha.nombre).toBe("Nombre desde Católico");
    expect(ficha.descripcion).toBe("Descripción desde el catálogo");
    expect(ficha.licencia).toBe("Apache-2.0");
    expect(ficha.versionInstalada).toBe("2.0.0");
    expect(ficha.versionDisponible).toBeUndefined();
    expect(ficha.enlaces.web).toBe("https://ejemplo.com");
    expect(ficha.enlaces.repo).toBe("https://github.com/usuario/repo");
  });
});