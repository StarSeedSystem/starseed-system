import { describe, expect, it } from "vitest";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
import type { SaludProveedor } from "@/lib/mando/modelos-disponibles";
import {
    aplicarEscalera,
    cadenaPorPapel,
    opcionesRankingDe,
} from "../aplicar-escalera";
import {
    elegirCandidatos,
    type Candidato,
    type OfertaContexto,
    type Preferencias,
    type Tarea,
} from "../escalera";

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

const LOCAL_AURA = opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" });
const LLM7 = opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] });

const SALUD_VIVA: SaludProveedor = {
    estado: "vivo",
    sinCupoHasta: null,
    motivo: null,
    ultimo429: null,
    claves: [],
    clavesActiva: null,
    t: "2026-10-28 10:00:00",
};

/** La escalera ya resuelta para el catálogo dado (Astraura local en el 1, gratis después). */
function candidatasDelCatalogo(catalogo: OpcionCatalogo[]): Candidato[] {
    return elegirCandidatos({
        tarea: TAREA_ESCRITOR,
        ofertas: [OFERTA_LOCAL],
        catalogo,
        vinculadas: new Set<string>(),
        preferencias: SIN_PAGO,
    });
}

describe("aplicarEscalera · puente con el enrutador de Astraura", () => {
    it("la candidata local del peldaño 1 queda primera en el orden del enrutador", () => {
        const catalogo = [LLM7, LOCAL_AURA];
        const rutas = aplicarEscalera({ candidatas: candidatasDelCatalogo(catalogo), catalogo });
        expect(rutas.map((r) => r.source.id)).toEqual(["astraura-158-local", "llm7"]);
        expect(rutas[0].score).toBe(60);
        expect(rutas[0].score).toBeGreaterThan(rutas[1].score);
        expect(rutas[0].source.privacy).toBe("local");
        expect(rutas[0].reason).toContain("Peldaño 1");
        expect(rutas[0].fromUser).toBe(false);
    });

    it("una candidata prohibida no aparece, ni aunque llegue elegida", () => {
        const candidatas: Candidato[] = [
            { candidatoId: "astraura-158-local", peldano: 1, motivo: "Astraura local disponible" },
            { candidatoId: "llm7", peldano: 3, motivo: "Disponible en la bolsa de la malla" },
        ];
        const rutas = aplicarEscalera({
            candidatas,
            catalogo: [LOCAL_AURA, LLM7],
            prohibidos: ["llm7"],
        });
        expect(rutas.map((r) => r.source.id)).toEqual(["astraura-158-local"]);
    });

    it("las preferencias del ámbito se traducen a opciones del rankCandidates", () => {
        expect(opcionesRankingDe(SIN_PAGO)).toEqual({ personaAllowsPaid: false });
        expect(opcionesRankingDe({ ...SIN_PAGO, permitirPago: true })).toEqual({});
    });

    it("la cadena por papel del enjambre respeta el orden de la escalera", () => {
        const catalogo = [LLM7, LOCAL_AURA];
        const plan = cadenaPorPapel({
            candidatas: candidatasDelCatalogo(catalogo),
            catalogo,
            papel: "escritor",
            salud: { "astraura-158-local": SALUD_VIVA },
            ahora: 1000,
        });
        expect(plan.papel).toBe("escritor");
        expect(plan.cadena.map((eslabon) => eslabon.proveedor)).toEqual(["astraura-158-local", "llm7"]);
        expect(plan.activo?.id).toBe("astraura-158-local");
        expect(plan.activo?.posicion).toBe(1);
        expect(plan.siguiente?.id).toBe("llm7");
    });
});
