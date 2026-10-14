import { describe, expect, it } from "vitest";
import {
  abrirCapaReferenciada,
  ambitoDeReferencias,
  editarReferencia,
  fuentesDeBiblioteca,
  type EntidadInfo,
  type FuenteEntidad
} from "../referencias-entidad";
import type { Capa } from "../tipos";

// Mock de entidades falsas para testing
const entidadesFalsas: Record<string, EntidadInfo> = {
  "ent1": { id: "ent1", titulo: "Entidad 1", formato: "json", version: "1.0", ambito: "personal" },
  "ent2": { id: "ent2", titulo: "Entidad 2", formato: "png", version: "2.1", ambito: "publica" },
  "ent3": { id: "ent3", titulo: "Entidad 3", formato: "glb", version: "0.9", ambito: "grupo" }
};

// Fuente falsa que simula el comportamiento de una FuenteEntidad
function crearFuenteFalsa(entidades: Record<string, EntidadInfo>): FuenteEntidad {
  return {
    obtener: async (id: string, version?: string): Promise<EntidadInfo | null> => {
      const entidad = entidades[id];
      if (!entidad) return null;
      // Si se especifica versión y no coincide, retornar null (simular entidad no encontrada)
      if (version && entidad.version !== version) return null;
      return entidad;
    },
    ambito: (id: string): string => {
      const entidad = entidades[id];
      return entidad ? entidad.ambito : "personal"; // default a personal si no existe
    },
    crearRama: async (id: string): Promise<{ id: string; version: string } | null> => {
      const entidad = entidades[id];
      if (!entidad) return null;
      // Simular creación de rama con nueva versión
      const nuevaVersion = `${parseInt(entidad.version.split(".")[0]) + 1}.0`;
      return { id: `${id}-rama`, version: nuevaVersion };
    }
  };
}

// Capa de ejemplo para testing
function crearCapaReferenciada(tipo: string, id: string, version?: string): Capa {
  return {
    id: "capa1",
    tipo: "lienzo2d",
    titulo: "Capa de prueba",
    formato: "png",
    referencia: { tipo, id, version: version ?? undefined },
    orden: 0,
    visible: true,
    bloqueada: false
  };
}

describe("abrirCapaReferenciada", () => {
  it("debe abrir correctamente una entidad existente", async () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const capa = crearCapaReferenciada("test", "ent1");
    
    const resultado = await abrirCapaReferenciada(capa, fuentes);
    
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.entidad).toEqual(entidadesFalsas["ent1"]);
    }
  });

  it("debe fallar cuando la capa no tiene referencia", async () => {
    const capa: Capa = { ...crearCapaReferenciada("test", "ent1"), referencia: null };
    const fuentes: Record<string, FuenteEntidad> = {};
    
    const resultado = await abrirCapaReferenciada(capa, fuentes);
    
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      // TypeScript narrows the type here to { ok: false; motivo: string }
      expect((resultado as { ok: false; motivo: string }).motivo).toContain("no tiene referencia");
    }
  });

  it("debe fallar cuando el tipo de fuente es desconocido", async () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { otro: fuente };
    const capa = crearCapaReferenciada("desconocido", "ent1");
    
    const resultado = await abrirCapaReferenciada(capa, fuentes);
    
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      // TypeScript narrows the type here to { ok: false; motivo: string }
      expect((resultado as { ok: false; motivo: string }).motivo).toContain("Tipo de fuente desconocido");
    }
  });

  it("debe fallar cuando la entidad no existe", async () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const capa = crearCapaReferenciada("test", "entidad-inexistente");
    
    const resultado = await abrirCapaReferenciada(capa, fuentes);
    
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      // TypeScript narrows the type here to { ok: false; motivo: string }
      expect((resultado as { ok: false; motivo: string }).motivo).toContain("Entidad borrada o no encontrada");
    }
  });

  it("debe respetar la versión especificada al buscar una entidad", async () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const capa = crearCapaReferenciada("test", "ent1", "2.0"); // versión que no coincide
    
    const resultado = await abrirCapaReferenciada(capa, fuentes);
    
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      // TypeScript narrows the type here to { ok: false; motivo: string }
      expect((resultado as { ok: false; motivo: string }).motivo).toContain("Entidad borrada o no encontrada");
    }
  });
});

describe("editarReferencia", () => {
  it("debe crear una rama y devolver una nueva capa cuando la fuente admite ramas", async () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const capa = crearCapaReferenciada("test", "ent1");
    
    const resultado = await editarReferencia(capa, fuentes);
    
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      // La nueva capa debe tener una referencia a la rama
      expect(resultado.capa.referencia).not.toBeNull();
      if (resultado.capa.referencia) {
        expect(resultado.capa.referencia.id).toBe("ent1-rama");
        expect(resultado.capa.referencia.version).toBe("2.0"); // 1.0 -> 2.0
        // El resto de las propiedades debe permanecer igual
        expect(resultado.capa.titulo).toBe(capa.titulo);
        expect(resultado.capa.formato).toBe(capa.formato);
      }
    }
  });

   it("debe fallar cuando la capa no tiene referencia para editar", async () => {
     const capa: Capa = { ...crearCapaReferenciada("test", "ent1"), referencia: null };
     const fuentes: Record<string, FuenteEntidad> = {};
     
     const resultado = await editarReferencia(capa, fuentes);
     
     expect(resultado.ok).toBe(false);
     if (!resultado.ok) {
       // TypeScript narrows the type here to { ok: false; motivo: string }
       expect((resultado as { ok: false; motivo: string }).motivo).toContain("no tiene referencia");
     }
   });

   it("debe devolver 'próximamente' cuando la fuente no admite ramas", async () => {
     // Fuente que retorna null para crearRama (no admite ramas)
     const fuenteSinRamas: FuenteEntidad = {
       obtener: async (): Promise<EntidadInfo | null> => null,
       ambito: (): string => "personal",
       crearRama: async (): Promise<{ id: string; version: string } | null> => null
     };
     const fuentes: Record<string, FuenteEntidad> = { test: fuenteSinRamas };
     const capa = crearCapaReferenciada("test", "ent1");
     
     const resultado = await editarReferencia(capa, fuentes);
     
     expect(resultado.ok).toBe(false);
     if (!resultado.ok) {
       // TypeScript narrows the type here to { ok: false; motivo: string }
       expect((resultado as { ok: false; motivo: string }).motivo).toContain("próximamente: esta fuente aún no admite ramas");
     }
   });

    it("debe devolver 'próximamente' cuando el tipo de fuente es desconocido", async () => {
      const fuentes: Record<string, FuenteEntidad> = {};
      const capa = crearCapaReferenciada("desconocido", "ent1");
      
      const resultado = await editarReferencia(capa, fuentes);
      
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        // TypeScript narrows the type here to { ok: false; motivo: string }
        expect((resultado as { ok: false; motivo: string }).motivo).toContain("próximamente: esta fuente aún no admite ramas");
      }
    });
});

describe("ambitoDeReferencias", () => {
  it("debe devolver el ámbito correcto para entidades conocidas", () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const ambitoFunc = ambitoDeReferencias(fuentes);
    
    expect(ambitoFunc("test", "ent1")).toBe("personal");
    expect(ambitoFunc("test", "ent2")).toBe("publica");
    expect(ambitoFunc("test", "ent3")).toBe("grupo");
  });

  it("debe devolver 'personal' para tipos de fuente desconocidos", () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const ambitoFunc = ambitoDeReferencias(fuentes);
    
    expect(ambitoFunc("desconocido", "cualquier-id")).toBe("personal");
  });

  it("debe devolver 'personal' para entidades que no existen en la fuente", () => {
    const fuente = crearFuenteFalsa(entidadesFalsas);
    const fuentes: Record<string, FuenteEntidad> = { test: fuente };
    const ambitoFunc = ambitoDeReferencias(fuentes);
    
    expect(ambitoFunc("test", "entidad-inexistente")).toBe("personal");
  });
});

describe("integración con referenciasRotas", () => {
  it("ambitoDeReferencias funciona con referenciasRotas para detectar capas con ámbitos más reservados", () => {
    // Simulamos el comportamiento de referenciasRotas desde permisos.ts
    const indiceAmbito = (a: string): number => ["personal", "perfil", "grupo", "publica"].indexOf(a);
    const referenciasRotas = (capas: any[], ambitoMolecula: string, ambitoDe: (tipo: string, id: string) => string): string[] => {
      return capas.filter((c) => c.referencia && indiceAmbito(ambitoDe(c.referencia.tipo, c.referencia.id)) < indiceAmbito(ambitoMolecula)).map((c) => c.id);
    };

    const fuentePersonal = crearFuenteFalsa({ "ent1": { id: "ent1", titulo: "Entidad 1", formato: "json", version: "1.0", ambito: "personal" } });
    const fuentePublica = crearFuenteFalsa({ "ent2": { id: "ent2", titulo: "Entidad 2", formato: "png", version: "2.1", ambito: "publica" } });
    
    const fuentes: Record<string, FuenteEntidad> = {
      personal: fuentePersonal,
      publica: fuentePublica
    };
    
    const ambitoDe = ambitoDeReferencias(fuentes);
    
    // Capa que referencia una entidad personal en una molécula pública
    const capaPersonalEnPublica = crearCapaReferenciada("personal", "ent1");
    // Capa que referencia una entidad pública en una molécula pública (válido)
    const capaPublicaEnPublica = crearCapaReferenciada("publica", "ent2");
    // Capa sin referencia
    const capaSinRef = { ...crearCapaReferenciada("personal", "ent1"), referencia: null };

    const capas = [capaPersonalEnPublica, capaPublicaEnPublica, capaSinRef];
    
    // Cuando la molécula es pública, solo la capa que referencia entidad personal debería estar "rota"
    const rotas = referenciasRotas(capas, "publica", ambitoDe);
    expect(rotas).toEqual(["capa1"]); // Solo la primera capa (personal->publica)
    
    // Cuando la molécula es personal, ninguna debería estar rota (personal es el más reservado)
    const rotasPersonal = referenciasRotas(capas, "personal", ambitoDe);
    expect(rotasPersonal).toEqual([]);
  });
});

describe("fuentesDeBiblioteca", () => {
  it("debe devolver un objeto con las fuentes esperadas", () => {
    const fuentes = fuentesDeBiblioteca();
    
    expect(fuentes).toHaveProperty("entidad");
    expect(fuentes).toHaveProperty("media");
    
    // Verificar que cada fuente tenga los métodos requeridos
    expect(typeof fuentes.entidad.obtener).toBe("function");
    expect(typeof fuentes.entidad.ambito).toBe("function");
    expect(typeof fuentes.entidad.crearRama).toBe("function");
    
    expect(typeof fuentes.media.obtener).toBe("function");
    expect(typeof fuentes.media.ambito).toBe("function");
    expect(typeof fuentes.media.crearRama).toBe("function");
  });
});