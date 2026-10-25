import { describe, it, expect } from 'vitest';
import { elegirCandidatos, Tarea, OfertaContexto, Preferencias, Candidato, aplicarEscalera, Puente, TAREA_ESCRITOR, OFERTA_LOCAL, opcion, papelRutaDe } from '../escalera';
import type { OpcionCatalogo, Papel } from '../catalogo-opciones';

describe('elegirCandidatos', () => {
  it('should return an empty array for now', () => {
    const tarea: Tarea = {
      papel: 'escritor',
      privado: false,
      tamano: 1000,
    };
    const ofertas: OfertaContexto[] = [];
    const catalogo: any[] = []; // We'll type this later
    const vinculadas = new Set<string>();
    const preferencias: Preferencias = {
      permitirPago: false,
      topeDiario: null,
      prohibidos: [],
    };

    const resultado = elegirCandidatos({ tarea, ofertas, catalogo, vinculadas, preferencias });
    expect(resultado).toEqual([]);
  });
});

describe('aplicarEscalera', () => {
  it("la candidata local del peldaño 1 queda primera", () => {
    const catalogo = [
      opcion("llm7", "LLM7.io", "proveedor", ["escritor"]),
      opcion("astraura-158-local", "Astraura 1.58 local", "modelo", ["escritor"]),
    ];
    const candidatos = elegirCandidatos({
      tarea: TAREA_ESCRITOR,
      ofertas: [OFERTA_LOCAL],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: { permitirPago: false, topeDiario: null, prohibidos: [] },
    });
    const puente = aplicarEscalera({ tarea: TAREA_ESCRITOR, candidatos, catalogo, preferencias: { permitirPago: false, topeDiario: null, prohibidos: [] } });
    expect(puente.candidaturas.length).toBe(2);
    expect(puente.candidaturas[0].source.id).toBe("astraura-158-local");
    expect(puente.candidaturas[0].source.privacy).toBe("local");
    expect(puente.candidaturas[0].score).toBeGreaterThan(puente.candidaturas[1].score);
  });

  it("una candidata prohibida no aparece", () => {
    const catalogo = [
      opcion("astraura-158-local", "Astraura 1.58 local", "modelo", ["escritor"]),
      opcion("llm7", "LLM7.io", "proveedor", ["escritor"]),
    ];
    const preferencias: Preferencias = { permitirPago: false, topeDiario: null, prohibidos: ["astraura-158-local"] };
    const candidatos = elegirCandidatos({
      tarea: TAREA_ESCRITOR,
      ofertas: [OFERTA_LOCAL],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias,
    });
    const puente = aplicarEscalera({ tarea: TAREA_ESCRITOR, candidatos, catalogo, preferencias });
    expect(puente.candidaturas.find((c) => c.source.id === "astraura-158-local")).toBeUndefined();
    expect(puente.candidaturas.map((c) => c.source.id)).toEqual(["llm7"]);
  });

  it("deriva la cadena por papel del enjambre y el permiso de pago", () => {
    const puente = aplicarEscalera({
      tarea: { papel: "código", privado: false, tamano: 0 },
      candidatos: [],
      catalogo: [],
      preferencias: { permitirPago: true, topeDiario: 5, prohibidos: [] },
    });
    expect(puente.papelRuta).toBe("escritor");
    expect(puente.opciones.personaAllowsPaid).toBe(null);
  });

  it("mascara papeles: revisor → revisor, chat → director", () => {
    expect(papelRutaDe("revisor")).toBe("revisor");
    expect(papelRutaDe("chat")).toBe("director");
    expect(papelRutaDe("visión")).toBe("director");
  });
});