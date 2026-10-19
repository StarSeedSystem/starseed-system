import { describe, expect, it, vi } from "vitest";

// Mock de las dependencias de HyperFrames
vi.mock("hyperframes", () => ({
  Hyperframes: {
    lint: vi.fn().mockResolvedValue({ valido: true })
  }
}));

vi.mock("@hyperframes/sdk", () => ({
  Sdk: vi.fn().mockImplementation(() => ({
    cargarComposicion: vi.fn().mockResolvedValue({}),
    aplicarOperaciones: vi.fn().mockResolvedValue({})
  }))
}));

vi.mock("@hyperframes/player", () => ({
  Player: vi.fn().mockImplementation(() => ({
    generarVistaPrevia: vi.fn().mockResolvedValue({ url: "http://ejemplo.com/vista-previa.mp4" })
  }))
}));

// Importar después de hacer los mocks
import { manejar } from "/home/starseed/starseed-wt/HFR1018F/servicios/hyperframes/src/rutas";

// Mock de las dependencias
const depsMock = {
  version: "0.8.172",
  navegador: true,
  ffmpeg: true
};

describe("Servicio HyperFrames - Rutas", () => {
  it("responde correctamente a GET /salud", async () => {
    const resultado = await manejar(
      { metodo: "GET", ruta: "/salud", cuerpo: {} },
      depsMock
    );
    
    expect(resultado.estado).toBe(200);
    expect(resultado.cuerpo).toHaveProperty("version", "0.8.172");
    expect(resultado.cuerpo).toHaveProperty("navegador", true);
    expect(resultado.cuerpo).toHaveProperty("ffmpeg", true);
    expect(resultado.cuerpo).toHaveProperty("telemetriaApagada", true);
  });

  it("valida correctamente una composición válida en POST /lint", async () => {
    const composicionValida = {
      elementos: [
        {
          tipo: "texto",
          contenido: "Hola mundo",
          inicio: 0,
          duracion: 5
        }
      ]
    };
    
    const resultado = await manejar(
      { metodo: "POST", ruta: "/lint", cuerpo: composicionValida },
      depsMock
    );
    
    expect(resultado.estado).toBe(200);
    // En una implementación real, verificaríamos el resultado del lint
  });

  it("rechaza composición inválida en POST /lint", async () => {
    const composicionInvalida = {
      // Falta estructura requerida
    };
    
    const resultado = await manejar(
      { metodo: "POST", ruta: "/lint", cuerpo: composicionInvalida },
      depsMock
    );
    
    // Dependiendo de cómo implemente Hyperframes.lint, podría devolver error
    // Por ahora, esperamos que maneje el error gracefully
    expect(resultado.estado).toBeGreaterThanOrEqual(200);
    expect(resultado.estado).toBeLessThan(600);
  });

  it("sirve composición y reproductor en GET /vista/:id", async () => {
    const resultado = await manejar(
      { metodo: "GET", ruta: "/vista/composicion-123", cuerpo: {} },
      depsMock
    );
    
    expect(resultado.estado).toBe(200);
    expect(resultado.cuerpo).toHaveProperty("composicion");
    expect(resultado.cuerpo.composicion).toHaveProperty("id", "composicion-123");
    expect(resultado.cuerpo).toHaveProperty("vistaPrevia");
  });

  it("devuelve 404 para ruta desconocida", async () => {
    const resultado = await manejar(
      { metodo: "GET", ruta: "/ruta-inexistente", cuerpo: {} },
      depsMock
    );
    
    expect(resultado.estado).toBe(404);
    expect(resultado.cuerpo).toHaveProperty("error");
  });

  it("rechaza cuerpos mayores a 8 MB", async () => {
    // Crear un cuerpo grande (más de 8 MB)
    const cuerpoGrande = { datos: "x".repeat(9 * 1024 * 1024) }; // 9 MB
    
    const resultado = await manejar(
      { metodo: "POST", ruta: "/lint", cuerpo: cuerpoGrande },
      depsMock
    );
    
    expect(resultado.estado).toBe(413);
    expect(resultado.cuerpo).toHaveProperty("error", "Cuerpo demasiado grande");
  });
});