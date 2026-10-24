import { describe, it, expect } from "vitest";
import type { OpcionCatalogo } from "../catalogo-opciones";
import type { Tarea, OfertaContexto, Preferencias } from "../escalera";
import { elegirCandidatos } from "../escalera";
import { aplicarEscalera, papelRutaDe } from "../aplicar-escalera";

function opcion(id: string, nombre: string, tipo: OpcionCatalogo["tipo"], papeles: OpcionCatalogo["papeles"]): OpcionCatalogo {
  return {
    id,
    nombre,
    tipo,
    papeles,
    gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "gratis" },
    requiereCuenta: false,
    enlaceAlta: null,
    enlaceClave: null,
    variables: [],
    privacidad: "desconocida",
    licencia: null,
    verificado: null,
    fuente: "prueba",
  };
}

const TAREA_ESCRITOR: Tarea = { papel: "escritor", privado: false, tamano: 1000 };

const OFERTA_LOCAL: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };

describe("aplicarEscalera · puente con el enrutador de Astraura", () => {
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
