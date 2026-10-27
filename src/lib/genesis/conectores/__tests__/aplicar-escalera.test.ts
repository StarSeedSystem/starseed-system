import { describe, expect, it } from "vitest";
import { OpcionCatalogo, Papel, Privacidad, Gratis } from "../catalogo-opciones";
import { elegirCandidatos, aplicarEscalera, papelRutaDe, type Tarea, type OfertaContexto, type Preferencias, type Candidato } from "../escalera";

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
    return {
        id: overrides.id ?? "test",
        nombre: overrides.nombre ?? "Test",
        tipo: overrides.tipo ?? "modelo",
        papeles: overrides.papeles ?? ["escritor"],
        gratis: overrides.gratis ?? { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "gratis" } as Gratis,
        requiereCuenta: overrides.requiereCuenta ?? false,
        enlaceAlta: overrides.enlaceAlta ?? null,
        enlaceClave: overrides.enlaceClave ?? null,
        variables: overrides.variables ?? [],
        privacidad: overrides.privacidad ?? "local",
        licencia: overrides.licencia ?? null,
        verificado: overrides.verificado ?? null,
        fuente: overrides.fuente ?? "test",
    };
}

const TAREA_ESCRITOR: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const OFERTA_LOCAL: OfertaContexto = { id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor"] };

describe("aplicarEscalera · rescate de pruebas de la rama nube", () => {
    it("la candidata local del peldaño 1 queda primera", () => {
        const catalogo = [
            opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
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
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
            opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
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
        expect(puente.opciones.personaAllowsPaid).toBe(true);
    });

    it("mascara papeles: revisor → revisor, chat → director", () => {
        expect(papelRutaDe("revisor")).toBe("revisor");
        expect(papelRutaDe("chat")).toBe("director");
        expect(papelRutaDe("visión")).toBe("director");
    });
});