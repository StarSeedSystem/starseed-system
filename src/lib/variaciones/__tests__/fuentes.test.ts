import { describe, it, expect, vi } from "vitest";
import { 
  filtrarFuentesPorClave, 
  getFuentesPorClave,
  getFuentesPublicas,
  type FuenteVariacion,
  type PublicItem
} from "../fuentes";

// Mock de un PublicItem
const publicItemMock: PublicItem = {
  id: "1",
  owner: "owner-id",
  category: "design",
  folder: "",
  name: "Fuente de prueba",
  kind: "font",
  payload: {
    description: "Descripción de la fuente de prueba",
  },
  tags: ["sans-serif", "google"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

// Mock de una variación de fuente convertida desde el PublicItem
const fuenteMock: FuenteVariacion = {
  id: "1",
  titulo: "Fuente de prueba",
  descripcion: "Descripción de la fuente de prueba",
  version: "1.0.0",
  familia: "fuente",
  licencia: "OFL",
  etiquetas: ["sans-serif", "google"],
  creado: new Date("2026-01-01"),
  descargas: 0,
  valoracionMedia: 0,
  valoracionCount: 0,
};

// Función para crear un mock del cliente Supabase
function crearSupabaseMock(datos: unknown[] = [], error: unknown = null) {
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation((column: string, value: unknown) => ({
        eq: vi.fn().mockImplementation((column2: string, value2: unknown) => ({
          then: (resolve: (value: { data: unknown[]; error: unknown }) => void) => {
            resolve({ data: datos, error });
            return {};
          }
        }))
      }))
    })
  });

  return {
    from: fromMock
  };
}

describe("fuentes", () => {
  describe("filtrarFuentesPorClave", () => {
    it("should return an empty array when no matches (placeholder)", () => {
      const resultado = filtrarFuentesPorClave([fuenteMock], "widget:clima");
      expect(resultado).toEqual([]);
    });

    it("should return an empty array when input is empty", () => {
      const resultado = filtrarFuentesPorClave([], "widget:clima");
      expect(resultado).toEqual([]);
    });
  });

  describe("getFuentesPublicas", () => {
    it("should return an empty array when there are no design/font items", async () => {
      const clienteVacio = crearSupabaseMock([]);
      const resultado = await getFuentesPublicas(clienteVacio);
      expect(resultado).toEqual([]);
    });

    it("should convert public items to fuente variaciones", async () => {
      const clienteConDatos = crearSupabaseMock([publicItemMock]);
      const resultado = await getFuentesPublicas(clienteConDatos);
      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject(fuenteMock);
    });

    it("should handle errors gracefully", async () => {
      const clienteFallido = {
        from: () => {
          throw new Error("Error de base de datos simulado");
        }
      } as unknown as ReturnType<typeof createClient>;
      const resultado = await getFuentesPublicas(clienteFallido);
      expect(resultado).toEqual([]);
    });
  });

  describe("getFuentesPorClave", () => {
    it("should return an empty array (placeholder filtering)", async () => {
      const clienteConDatos = crearSupabaseMock([publicItemMock]);
      const resultado = await getFuentesPorClave("widget:clima", clienteConDatos);
      expect(resultado).toEqual([]);
    });

    it("should handle errors in getFuentesPublicas gracefully", async () => {
      const clienteFallido = {
        from: () => {
          throw new Error("Error de base de datos simulado");
        }
      } as unknown as ReturnType<typeof createClient>;
      const resultado = await getFuentesPorClave("widget:clima", clienteFallido);
      expect(resultado).toEqual([]);
    });
  });
});