// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { seccionDirectivas } from "@/lib/astraura/capas/directivas";
import { directivaActiva, leerDirectivas, guardarDirectivas, DIRECTIVAS_KEY } from "@/lib/astraura/capas/directivas-almacen";

afterEach(() => {
  if (typeof window !== "undefined") {
    localStorage.clear();
  }
});

describe("router-directivas · integración de directivas Meta^n en el system prompt", () => {
  it("con una directiva activa en la capa 'palabra', seccionDirectivas devuelve el bloque con cabecera", async () => {
    // Arrange: guardar una directiva activa para la capa "palabra"
    const archivoDirectiva = {
      v: 1 as const,
      capa: "palabra",
      activa: 1,
      historial: [
        {
          capa: "palabra",
          version: 1,
          texto: "Prioriza la claridad y la síntesis en cada respuesta.",
          sha256: "abc123",
          acierto: 0.85,
          base: 0.72,
          n: 30,
          fecha: "2026-11-03T00:00:00.000Z",
          origen: "meta-n",
          estado: "activa" as const,
        },
      ],
    };
    await guardarDirectivas("palabra", archivoDirectiva);

    // Act: obtener la sección de directivas para la capa "palabra"
    const capa = "palabra";
    const activa = directivaActiva(capa);
    const seccion = seccionDirectivas({ v: 1, capa, activa: activa?.version ?? null, historial: archivoDirectiva.historial });

    // Assert: el bloque incluye la cabecera fija y el texto de la directiva
    expect(seccion).toContain("Pautas aprendidas por la automejora de Astraura (versión 1)");
    expect(seccion).toContain("No cambian permisos ni reglas");
    expect(seccion).toContain("Prioriza la claridad y la síntesis en cada respuesta");
  });

  it("sin directiva activa en la capa, seccionDirectivas devuelve cadena vacía", () => {
    // Arrange: no hay directivas guardadas
    const capa = "palabra";
    const archivoVacio = { v: 1 as const, capa, activa: null, historial: [] };

    // Act
    const seccion = seccionDirectivas(archivoVacio);

    // Assert: no añade nada al system prompt
    expect(seccion).toBe("");
  });

  it("directivaActiva devuelve undefined cuando no hay directiva activa para la capa", () => {
    // Arrange: localStorage vacío
    const capa = "palabra";

    // Act
    const activa = directivaActiva(capa);

    // Assert
    expect(activa).toBeUndefined();
  });

  it("directivaActiva devuelve la directiva cuando está activa y su versión coincide", async () => {
    // Arrange
    const archivoDirectiva = {
      v: 1 as const,
      capa: "razonamiento",
      activa: 2,
      historial: [
        {
          capa: "razonamiento",
          version: 1,
          texto: "Directiva anterior.",
          sha256: "old",
          acierto: 0.7,
          base: 0.6,
          n: 20,
          fecha: "2026-10-01T00:00:00.000Z",
          origen: "meta-n",
          estado: "anterior" as const,
        },
        {
          capa: "razonamiento",
          version: 2,
          texto: "Desglosa el razonamiento paso a paso.",
          sha256: "new",
          acierto: 0.88,
          base: 0.75,
          n: 40,
          fecha: "2026-11-01T00:00:00.000Z",
          origen: "meta-n",
          estado: "activa" as const,
        },
      ],
    };
    await guardarDirectivas("razonamiento", archivoDirectiva);

    // Act
    const activa = directivaActiva("razonamiento");

    // Assert
    expect(activa).toBeDefined();
    expect(activa?.version).toBe(2);
    expect(activa?.texto).toBe("Desglosa el razonamiento paso a paso.");
    expect(activa?.estado).toBe("activa");
  });

  it("directivaActiva ignora directivas con estado 'propuesta' o 'retirada'", async () => {
    // Arrange: solo hay una propuesta, ninguna activa
    const archivoDirectiva = {
      v: 1 as const,
      capa: "herramientas",
      activa: null,
      historial: [
        {
          capa: "herramientas",
          version: 1,
          texto: "Esta es solo una propuesta.",
          sha256: "prop",
          acierto: 0.5,
          base: 0.5,
          n: 5,
          fecha: "2026-11-02T00:00:00.000Z",
          origen: "meta-n",
          estado: "propuesta" as const,
        },
      ],
    };
    await guardarDirectivas("herramientas", archivoDirectiva);

    // Act
    const activa = directivaActiva("herramientas");

    // Assert
    expect(activa).toBeUndefined();
  });
});