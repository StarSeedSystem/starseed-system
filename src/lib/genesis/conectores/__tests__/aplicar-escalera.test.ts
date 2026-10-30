import { describe, expect, it } from "vitest";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
import {
    elegirCandidatos,
    type OfertaContexto,
    type Preferencias,
    type Tarea,
} from "../escalera";
import { aplicarEscalera } from "../aplicar-escalera";

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
    return {
        id: overrides.id ?? "test",
        nombre: overrides.nombre ?? "Test",
        tipo: overrides.tipo ?? "modelo",
        papeles: overrides.papeles ?? ["escritor"],
        gratis: overrides.gratis ?? ({ rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "gratis" } as Gratis),
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
const SIN_PAGO: Preferencias = { permitirPago: false, topeDiario: null, prohibidos: [] };

describe("elegirCandidatos · casos rescatados de la rama nube", () => {
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
            preferencias: SIN_PAGO,
        });
        expect(candidatos.length).toBe(2);
        expect(candidatos[0].candidatoId).toBe("astraura-158-local");
        expect(candidatos[0].peldano).toBe(1);
        expect(candidatos[1].candidatoId).toBe("llm7");
        expect(candidatos[1].peldano).toBe(3);
    });

    it("una candidata prohibida no aparece", () => {
        const catalogo = [
            opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
            opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
        ];
        const preferencias: Preferencias = { ...SIN_PAGO, prohibidos: ["llm7"] };
        const candidatos = elegirCandidatos({
            tarea: TAREA_ESCRITOR,
            ofertas: [OFERTA_LOCAL],
            catalogo,
            vinculadas: new Set<string>(),
            preferencias,
        });
        expect(candidatos.find((c) => c.candidatoId === "llm7")).toBeUndefined();
        expect(candidatos.map((c) => c.candidatoId)).toEqual(["astraura-158-local"]);
    });
});

describe("aplicarEscalera · adaptador puro a enrutador", () => {
    it("la candidata local del peldaño 1 queda primera", () => {
        const candidatos = [
            { candidatoId: "astraura-158-local", peldano: 1 as const, motivo: "Astraura local disponible" },
            { candidatoId: "llm7", peldano: 3 as const, motivo: "Disponible en la bolsa de la malla" },
        ];
        const resultado = aplicarEscalera(candidatos, "escritor");
        expect(resultado.candidatos.length).toBe(2);
        expect(resultado.candidatos[0].source.id).toBe("astraura-158-local");
        expect(resultado.candidatos[0].score).toBeGreaterThan(resultado.candidatos[1].score);
        expect(resultado.papel).toBe("escritor");
    });

    it("una candidata prohibida no aparece", () => {
        const candidatos = [
            { candidatoId: "astraura-158-local", peldano: 1 as const, motivo: "Astraura local disponible" },
            { candidatoId: "llm7", peldano: 3 as const, motivo: "Disponible en la bolsa de la malla" },
        ];
        const resultado = aplicarEscalera(candidatos, "revisor", undefined, ["llm7"]);
        expect(resultado.candidatos.find((c) => c.source.id === "llm7")).toBeUndefined();
        expect(resultado.candidatos.map((c) => c.source.id)).toEqual(["astraura-158-local"]);
    });
});
