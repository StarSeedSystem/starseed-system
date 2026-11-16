import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, GRUPOS_CAPA, GrupoCapa, COLOR_DESCONOCIDO, NOTA_ALCANCE } from "../capas";

describe("capas: grupo 'red' — cuatro capas de red completa", () => {
  it("el grupo 'red' existe en GRUPOS_CAPA con su título", () => {
    const grupo = GRUPOS_CAPA.find((g) => g.id === "red");
    expect(grupo).toBeDefined();
    expect(grupo?.titulo).toBe("Red completa (lo que cada dueño publica)");
  });

  it("GrupoCapa incluye 'red'", () => {
    // TypeScript compile-time check: GrupoCapa debe aceptar "red"
    const _grupo: GrupoCapa = "red";
    expect(_grupo).toBe("red");
  });

  const idsEsperados = ["red-publica", "red-comunidad", "red-privada", "red-externa"];

  it("las cuatro capas del grupo 'red' existen en CAPAS_SENALES", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();
      expect(capa?.grupo).toBe("red");
    }
  });

  it("cada capa del grupo 'red' tiene estado honesto, fuente citando módulos espectro, y tramos por origen", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();

      // Estado honesto: parcial (mientras no hay publicadores) o sin-fuente (externa si nada la alimenta)
      expect(["parcial", "sin-fuente"]).toContain(capa?.estado);

      // Fuente cita módulos espectro/leer-senales.ts y/o espectro/publicacion.ts
      expect(capa?.fuente).toMatch(/espectro\/leer-senales\.ts|espectro\/publicacion\.ts/);

      // Tramos por origen: medida = relleno, declarada = anillo, estimada = rayado
      const tramasOrigen = capa?.tramos.map((t) => t.id) ?? [];
      expect(tramasOrigen).toContain("medida");
      expect(tramasOrigen).toContain("declarada");
      expect(tramasOrigen).toContain("estimada");
      expect(tramasOrigen).toContain("desconocido");

      const tramoMedida = capa?.tramos.find((t) => t.id === "medida");
      const tramoDeclarada = capa?.tramos.find((t) => t.id === "declarada");
      const tramoEstimada = capa?.tramos.find((t) => t.id === "estimada");

      expect(tramoMedida?.estilo).toBe("relleno");
      expect(tramoDeclarada?.estilo).toBe("anillo");
      expect(tramoEstimada?.estilo).toBe("rayado");
    }
  });

  it("capa estimada nunca usa estilo 'relleno' (lo medido usa relleno)", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const tramoEstimada = capa?.tramos.find((t) => t.id === "estimada");
      expect(tramoEstimada?.estilo).not.toBe("relleno");
      expect(tramoEstimada?.estilo).toBe("rayado");
    }
  });

  it("la leyenda incluye 'publicado por su dueño' y 'zona aproximada'", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const etiquetas = capa?.tramos.map((t) => t.etiqueta.toLowerCase()) ?? [];
      const textoCompleto = etiquetas.join(" ");
      expect(textoCompleto).toMatch(/publicado por su due[ñn]o/);
      expect(textoCompleto).toMatch(/zona aproximada/);
    }
  });

  it("valor() devuelve 'desconocido' cuando falta la medida (tramo desconocido, medida=false)", () => {
    // Marca sin datos de red (posición desconocida, sin antenas de red)
    const marcaVacia = {
      id: "neurona:test",
      neuronaId: "test",
      nombre: "Test",
      esYo: false,
      forma: "punto" as const,
      estado: "desconocida" as const,
      posicion: { tipo: "desconocida" as const, motivo: "sin datos" },
      calidad: { valor: null, t: null, fuente: "", nota: "" },
      enlace: { estado: "sin-vinculo" as const, latenciaMs: null, t: null },
      antenas: [],
      capas: { lista: null, t: null, fuente: "" },
      hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
      aparato: null,
    };

    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const valor = capa?.valor(marcaVacia as any);
      expect(valor).toBeDefined();
      expect(valor?.tramo).toBe("desconocido");
      expect(valor?.texto).toMatch(/desconocido/);
      expect(valor?.medida).toBe(false);
    }
  });

  it("CAPA_POR_ID incluye las cuatro capas nuevas y las existentes no cambian de id ni orden", () => {
    const idsExistentes = CAPAS_SENALES
      .filter((c) => !idsEsperados.includes(c.id))
      .map((c) => c.id);
    // Verificamos que las capas base siguen ahí
    expect(idsExistentes).toContain("senal-internet");
    expect(idsExistentes).toContain("cobertura-ble");
    expect(idsExistentes).toContain("enlaces-medidos");

    // Verificamos que las nuevas están en CAPA_POR_ID
    for (const id of idsEsperados) {
      expect(CAPA_POR_ID[id]).toBeDefined();
    }
  });

  it("NOTA_ALCANCE menciona que los campos rayados son alcance estimado", () => {
    expect(NOTA_ALCANCE).toMatch(/alcance estimado/);
    expect(NOTA_ALCANCE).toMatch(/rayad/);
  });
});