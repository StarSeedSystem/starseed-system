import { describe, it, expect } from "vitest";
import type { Capa, Ambito } from "../tipos";
import { 
  abrirCapaReferenciada,
  editarReferencia,
  ambitoDeReferencias,
  fuentesDeBiblioteca,
  type FuenteEntidad,
  type EntidadInfo
} from "../referencias-entidad";

// Mock de una fuente de entidad para testing
const crearFuenteMock = ( 
  deberíaFallarObtener: boolean = false,
  deberíaFallarAmbito: boolean = false,
  deberíaFallarCrearRama: boolean = false,
  devuelveNullObtener: boolean = false,
  ambitoValor: "personal" | "perfil" | "grupo" | "publica" = "personal"
): FuenteEntidad => ({
  obtener: async (id: string, version?: string): Promise<EntidadInfo | null> => {
    if (deberíaFallarObtener) {
      throw new Error("Error simulado al obtener");
    }
    if (devuelveNullObtener) {
      return null;
    }
    return {
      id,
      titulo: `Entidad ${id}`,
      formato: "tipo de prueba",
      version: version || "1.0",
      ambito: ambitoValor,
    };
  },
  
  ambito: (id: string): Ambito => {
    if (deberíaFallarAmbito) {
      throw new Error("Error simulado al obtener ámbito");
    }
    return ambitoValor;
  },
  
  crearRama: async (id: string): Promise<{ id: string; version: string } | null> => {
    if (deberíaFallarCrearRama) {
      throw new Error("Error simulado al crear rama");
    }
    return { id: `${id}-rama`, version: "2.0" };
  },
});

describe("referencias-entidad", () => {
  describe("abrirCapaReferenciada", () => {
     it("debería retornar éxito cuando la fuente existe y la entidad se encuentra", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(),
       };
      
      const resultado = await abrirCapaReferenciada(capa, fuentes);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.entidad.id).toBe("ent1");
        expect(resultado.entidad.titulo).toBe("Entidad ent1");
      }
    });

     it("debería fallar con motivo cuando el tipo de fuente es desconocido", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "datos",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "datos", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(),
       };
      
       const resultado = await abrirCapaReferenciada(capa, fuentes);
       if (resultado.ok) {
         throw new Error("Expected ok to be false");
       }
       expect((resultado as { ok: false; motivo: string }).motivo).toContain("Tipo de fuente desconocido");
    });

     it("debería fallar con motivo cuando la entidad está borrada o no se encuentra", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
        const fuentes: Record<string, FuenteEntidad> = {
          codigo: crearFuenteMock(false, false, false, true), // devuelve null al obtener
        };
        
         const resultado = await abrirCapaReferenciada(capa, fuentes);
         if (resultado.ok) {
           throw new Error("Expected ok to be false");
         }
         expect((resultado as { ok: false; motivo: string }).motivo).toContain("Entidad borrada o no encontrada");
    });

     it("debería manejar errores inesperados en la fuente", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
        const fuentes: Record<string, FuenteEntidad> = {
          codigo: crearFuenteMock(true), // falla al obtener
        };
        
        const resultado = await abrirCapaReferenciada(capa, fuentes);
        if (resultado.ok) {
          throw new Error("Expected ok to be false");
        }
        expect((resultado as { ok: false; motivo: string }).motivo).toContain("Entidad borrada o no encontrada"); // El error se convierte en este mensaje
    });
  });

  describe("editarReferencia", () => {
     it("debería crear una rama y retornar una capa nueva cuando es posible", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1", version: "1.0" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(),
       };
      
      const resultado = await editarReferencia(capa, fuentes);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.capa.referencia?.id).toBe("ent1-rama");
        expect(resultado.capa.referencia?.version).toBe("2.0");
        // La capa original debería permanecer sin cambios
        expect(capa.referencia?.id).toBe("ent1");
        expect(capa.referencia?.version).toBe("1.0");
      }
    });

     it("debería fallar con motivo cuando la fuente es desconocida", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "datos",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "datos", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(),
       };
       
         const resultado = await editarReferencia(capa, fuentes);
         if (resultado.ok) {
           throw new Error("Expected ok to be false");
         }
         expect((resultado as { ok: false; motivo: string }).motivo).toContain("Tipo de fuente desconocido");
    });

     it("debería indicar que la fuente no admite ramas cuando corresponda", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
        const fuentes: Record<string, FuenteEntidad> = {
          codigo: crearFuenteMock(false, false, true), // falla al crear rama
        };
        
        const resultado = await editarReferencia(capa, fuentes);
        if (resultado.ok) {
          throw new Error("Expected ok to be false");
        }
        expect((resultado as { ok: false; motivo: string }).motivo).toContain("próximamente: esta fuente aún no admite ramas");
    });

     it("debería manejar errores inesperados al crear rama", async () => {
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa de prueba",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
       
        const fuentes: Record<string, FuenteEntidad> = {
          codigo: crearFuenteMock(false, false, true, false, "personal"), // falla al crear rama
        };
        
        const resultado = await editarReferencia(capa, fuentes);
        if (resultado.ok) {
          throw new Error("Expected ok to be false");
        }
        expect((resultado as { ok: false; motivo: string }).motivo).toContain("próximamente: esta fuente aún no admite ramas"); // El error se convierte en este mensaje
    });
  });

  describe("ambitoDeReferencias", () => {
    it("debería retornar el ámbito correcto cuando la fuente existe", () => {
      const fuentes: Record<string, FuenteEntidad> = {
        test: crearFuenteMock(false, false, false, false, "grupo"),
      };
       
      const obtenerAmbito = ambitoDeReferencias(fuentes);
      const ambito = obtenerAmbito("test", "algúnId");
      expect(ambito).toBe("grupo");
    });

     it("debería retornar 'personal' para tipos de fuente desconocidos", () => {
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(),
       };
       
       const obtenerAmbito = ambitoDeReferencias(fuentes);
       const ambito = obtenerAmbito("datos", "algúnId");
       expect(ambito).toBe("personal"); // opción más reservada
     });

     it("debería manejar errores en la fuente de ámbito", () => {
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(false, true), // falla al obtener ámbito
       };
      
      const obtenerAmbito = ambitoDeReferencias(fuentes);
      // Incluso si la fuente falla, debería devolver 'personal' como fallback
      const ambito = obtenerAmbito("test", "algúnId");
      expect(ambito).toBe("personal");
    });
  });

  describe("fuentesDeBiblioteca", () => {
    it("debería retornar un objeto con las fuentes esperadas", () => {
      const fuentes = fuentesDeBiblioteca();
      expect(fuentes).toHaveProperty("entity");
      expect(fuentes).toHaveProperty("media");
      
      // Verificar que las fuentes tengan los métodos requeridos
      expect(typeof fuentes.entity.obtener).toBe("function");
      expect(typeof fuentes.entity.ambito).toBe("function");
      expect(typeof fuentes.entity.crearRama).toBe("function");
      
      expect(typeof fuentes.media.obtener).toBe("function");
      expect(typeof fuentes.media.ambito).toBe("function");
      expect(typeof fuentes.media.crearRama).toBe("function");
    });
  });

  describe("Integración con referenciasRotas", () => {
    it("debería trabajar junto a referenciasRotas del módulo de permisos", async () => {
      // Importamos aquí para evitar dependencias circulares en los tests
      const { referenciasRotas } = await import("../permisos");
      
       // Creamos una capa que referencia una entidad en ámbito "personal"
       const capa: Capa = {
         id: "capa1",
         tipo: "codigo",
         titulo: "Capa que referencia entidad personal",
         formato: "formato de prueba",
         referencia: { tipo: "codigo", id: "ent1" },
         orden: 0,
         visible: true,
         bloqueada: false,
       };
      
       // Creamos fuentes donde el tipo "codigo" tiene ámbito "personal"
       const fuentes: Record<string, FuenteEntidad> = {
         codigo: crearFuenteMock(false, false, false, false, "personal"),
       };
      
      // Obtenemos la función que mapea (tipo, id) → Ambito
      const ambitoDe = ambitoDeReferencias(fuentes);
      
      // Verificamos que ambitoDe devuelva "personal" para nuestra referencia
       const ambitoEntidad = ambitoDe(capa.referencia!.tipo, capa.referencia!.id);
      expect(ambitoEntidad).toBe("personal");
      
      // Ahora probamos con referenciasRotas: si el ámbito de la molécula es "grupo",
      // entonces la capa debería aparecer como rota porque su entidad está en "personal" 
      // (más reservado que "grupo" en el orden personal › perfil › grupo › pública)
      const capasRotas = referenciasRotas([capa], "grupo", ambitoDe);
      expect(capasRotas).toHaveLength(1);
      expect(capasRotas[0]).toBe("capa1");
      
      // Si el ámbito de la molécula es "personal", no debería haber capas rotas (nada es más reservado)
      const capasNoRotas = referenciasRotas([capa], "personal", ambitoDe);
      expect(capasNoRotas).toHaveLength(0);
      
      // Si el ámbito de la molécula es "perfil", entonces las entidades en "personal" SÍ son más reservadas
      const capasPerfilRotas = referenciasRotas([capa], "perfil", ambitoDe);
      expect(capasPerfilRotas).toHaveLength(1);
      expect(capasPerfilRotas[0]).toBe("capa1");
    });
  });
});