import { describe, expect, it } from "vitest";
import { resolverNivel } from "../niveles";

import { analizarContexto, type ContextoAnalisis } from "../contexto-analisis";
import { type MedidasVoz } from "../medidas";
import { type MotorSeleccionado } from "../motor";

/**
 * Test de la selección pura del nivel "estudio" cuando VoiceStudio está disponible
 * y la neurona tiene ≥8 GB libres.
 */
describe("selección del nivel estudio (estudio-permitido)", () => {
  it("elige estudio cuando VoiceStudio está vivo y la neurona tiene ≥8 GB libres", async () => {
    const resultado = await resolverNivel({
      tieneVoiceStudio: true,
      memoriaLibresGB: 8,
      servidoPorOtraNeurona: false,
    });
    expect(resultado).toBe("estudio");
  });

  it("elige estudio cuando VoiceStudio está vivo y la neurona es servida por otra", async () => {
    const resultado = await resolverNivel({
      tieneVoiceStudio: true,
      memoriaLibresGB: 5,
      servidoPorOtraNeurona: true,
    });
    expect(resultado).toBe("estudio");
  });

  it("cae a alta cuando VoiceStudio no está vivo aunque tenga ≥8 GB libres", async () => {
    const resultado = await resolverNivel({
      tieneVoiceStudio: false,
      memoriaLibresGB: 8,
      servidoPorOtraNeurona: false,
    });
    expect(resultado).toBe("alta");
  });

  it("cae a alta cuando tiene 7 GB libres y VoiceStudio no está vivo", async () => {
    const resultado = await resolverNivel({
      tieneVoiceStudio: false,
      memoriaLibresGB: 7,
      servidoPorOtraNeurona: false,
    });
    expect(resultado).toBe("alta");
  });
});

/**
 * Test del motor PERMITIDO para la primera frase de una conversación:
 * usa el voiceStudio con menor latencia medida.
 */
describe("selección del motor PERMITIDO", () => {
  const medidas: MedidasVoz[] = [
    { neurona: "n1", motor: "voicemorphic", latenciaMs: 120, calidad: 95, timestamp: Date.now() },
    { neurona: "n1", motor: "voicestudio", latenciaMs: 80, calidad: 98, timestamp: Date.now() },
    { neurona: "n1", motor: "openvoice2", latenciaMs: 90, calidad: 96, timestamp: Date.now() },
  ];

  it("elige el voiceStudio con menor latencia medida", async () => {
    const resultado = await seleccionarMotorPermitido({
      personaId: "user1",
      medidaVoz: medidas,
      tieneEstudio: true,
    });
    expect(resultado.motor).toBe("voicestudio");
    expect(resultado.latenciaMs).toBe(80);
  });

  it("elige voiceStudio aunque no tenga voz de la persona cuando es el más rápido", async () => {
    const medidas2: MedidasVoz[] = [
      { neurona: "n1", motor: "voicemorphic", latenciaMs: 200, calidad: 90, timestamp: Date.now() },
      { neurona: "n1", motor: "voicestudio", latenciaMs: 50, calidad: 95, timestamp: Date.now() },
    ];
    const resultado = await seleccionarMotorPermitido({
      personaId: "user1",
      medidaVoz: medidas2,
      tieneEstudio: true,
      vocesDelMotor: [],
    });
    expect(resultado.motor).toBe("voicestudio");
  });

  it("cae a voicebox cuando VoiceStudio no está disponible", async () => {
    const medidas3: MedidasVoz[] = [
      { neurona: "n1", motor: "voicemorphic", latenciaMs: 100, calidad: 95, timestamp: Date.now() },
      { neurona: "n1", motor: "voicebox", latenciaMs: 120, calidad: 96, timestamp: Date.now() },
    ];
    const resultado = await seleccionarMotorPermitido({
      personaId: "user1",
      medidaVoz: medidas3,
      tieneEstudio: false,
    });
    expect(resultado.motor).toBe("voicebox");
  });
});

/**
 * Test de las reglas de uso del nivel "estudio": solo lectura larga,
 * doblaje y audiolibros.
 */
describe("reglas de uso del nivel estudio", () => {
  it("permite uso de estudio para lectura larga", async () => {
    const analisis: ContextoAnalisis = {
      tipo: "lectura",
      duracionEstimadaHoras: 2,
      esActividadUnica: true,
      personaId: "user1",
      titulo: "Novela",
      esTemporada: false,
      esSegmentoCorto: false,
    };
    const resultado = await puedeUsarEstudio({
      analisis,
      tieneEstudio: true,
      idioma: "es",
    });
    expect(resultado).toBe(true);
  });

  it("permite uso de estudio para doblaje", async () => {
    const analisis: ContextoAnalisis = {
      tipo: "doblaje",
      idiomaOrigen: "en",
      idiomaDestino: "es",
      duracionEstimadaHoras: 1,
      esActividadUnica: false,
      personaId: "user1",
      titulo: "Película",
      esTemporada: false,
      esSegmentoCorto: false,
    };
    const resultado = await puedeUsarEstudio({
      analisis,
      tieneEstudio: true,
      idioma: "es",
    });
    expect(resultado).toBe(true);
  });

  it("permite uso de estudio para audiolibros", async () => {
    const analisis: ContextoAnalisis = {
      tipo: "audiolibro",
      duracionEstimadaHoras: 10,
      esActividadUnica: true,
      personaId: "user1",
      titulo: "Libro",
      esTemporada: false,
      esSegmentoCorto: false,
    };
    const resultado = await puedeUsarEstudio({
      analisis,
      tieneEstudio: true,
      idioma: "es",
    });
    expect(resultado).toBe(true);
  });

  it("niega uso de estudio para conversación normal (no permitido)", async () => {
    const analisis: ContextoAnalisis = {
      tipo: "conversacion",
      duracionEstimadaHoras: 0.1,
      esActividadUnica: true,
      personaId: "user1",
      titulo: "Chat",
      esTemporada: false,
      esSegmentoCorto: false,
    };
    const resultado = await puedeUsarEstudio({
      analisis,
      tieneEstudio: true,
      idioma: "es",
    });
    expect(resultado).toBe(false);
  });

  it("niega uso de estudio para comando breve", async () => {
    const analisis: ContextoAnalisis = {
      tipo: "comando",
      duracionEstimadaHoras: 0.01,
      esActividadUnica: true,
      personaId: "user1",
      titulo: "Ejecutar",
      esTemporada: false,
      esSegmentoCorto: false,
    };
    const resultado = await puedeUsarEstudio({
      analisis,
      tieneEstudio: true,
      idioma: "es",
    });
    expect(resultado).toBe(false);
  });
});
