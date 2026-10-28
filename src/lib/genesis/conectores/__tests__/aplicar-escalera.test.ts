import { describe, expect, it } from "vitest";
import type { RouteCandidate } from "@/ai/astraura/router";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
import {
    elegirCandidatos,
    type Candidato,
    type OfertaContexto,
    type Preferencias,
    type Tarea,
} from "../escalera";
import {
    aplicarEscaleraAlRanking,
    aplicarEscaleraConDetalle,
    cadenaPorPapel,
    opcionesRankDesdeEscalera,
} from "../aplicar-escalera";

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

/** Modelo de mentira con la forma exacta de `CatalogModel` (strengths: TaskKind). */
function modelo(id: string): RouteCandidate["model"] {
    return { id, label: id, strengths: ["chat"], quality: 6 };
}

/** Fuente de mentira con la forma exacta de `CatalogSource` (`providerId` es unión cerrada). */
function fuente(id: string, modeloId: string): RouteCandidate["source"] {
    return {
        id,
        label: id,
        tier: id === "astraura-158-local" ? "local" : "instant",
        providerId: "openai-compatible",
        baseUrl: "https://fuente-de-prueba.invalid",
        requiresKey: false,
        models: [modelo(modeloId)],
        limits: "sin límite verificado",
        why: "fuente de prueba",
        privacy: "cloud",
        weight: 1,
    };
}

/** Ruta de mentira como las que produce `rankCandidates`. */
function ruta(sourceId: string, score: number, fromUser = false): RouteCandidate {
    const modeloId = `${sourceId}/modelo`;
    return {
        source: fuente(sourceId, modeloId),
        model: modelo(modeloId),
        score,
        reason: `la puntuación del router eligió ${sourceId}`,
        fromUser,
    };
}

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

describe("aplicarEscaleraAlRanking · el puente con rankCandidates", () => {
    const CATALOGO_PUENTE = [
        opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
        opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
    ];

    it("la candidata local del peldaño 1 queda primera aunque el router la puntúe más bajo", () => {
        const elegidos = elegirCandidatos({
            tarea: TAREA_ESCRITOR,
            ofertas: [OFERTA_LOCAL],
            catalogo: CATALOGO_PUENTE,
            vinculadas: new Set<string>(),
            preferencias: SIN_PAGO,
        });
        const rutas = [ruta("llm7", 10), ruta("astraura-158-local", 2)];
        const aplicadas = aplicarEscaleraAlRanking(rutas, elegidos);

        expect(aplicadas).toHaveLength(2);
        expect(aplicadas[0].source.id).toBe("astraura-158-local");
        expect(aplicadas[0].score).toBe(2); // la puntuación no se toca, manda el peldaño
        expect(aplicadas[0].reason).toContain("peldaño 1");
        expect(aplicadas[1].source.id).toBe("llm7");
        expect(aplicadas[1].reason).toContain("peldaño 3");
    });

    it("una candidata prohibida no aparece tras aplicar la escalera", () => {
        const preferencias: Preferencias = { ...SIN_PAGO, prohibidos: ["llm7"] };
        const elegidos = elegirCandidatos({
            tarea: TAREA_ESCRITOR,
            ofertas: [OFERTA_LOCAL],
            catalogo: CATALOGO_PUENTE,
            vinculadas: new Set<string>(),
            preferencias,
        });
        const rutas = [ruta("astraura-158-local", 2), ruta("llm7", 10)];
        const aplicadas = aplicarEscaleraAlRanking(rutas, elegidos);

        expect(aplicadas.map((a) => a.source.id)).toEqual(["astraura-158-local"]);
    });

    it("el detalle marca peldano: null en la ruta prohibida, sin tocarla", () => {
        const detalle = aplicarEscaleraConDetalle(
            [ruta("astraura-158-local", 2), ruta("llm7", 10)],
            [{ candidatoId: "astraura-158-local", peldano: 1, motivo: "Astraura local disponible" }],
        );
        expect(detalle[0]).toMatchObject({ peldano: 1, motivo: "Astraura local disponible" });
        expect(detalle[1].peldano).toBeNull();
        expect(detalle[1].motivo).toBeNull();
        expect(detalle[1].ruta.score).toBe(10);
    });

    it("empate de peldaño: decide la puntuación del router", () => {
        const elegidos: Candidato[] = [
            { candidatoId: "llm7", peldano: 3, motivo: "Disponible en la bolsa de la malla" },
            { candidatoId: "otra-nube", peldano: 3, motivo: "Disponible en la bolsa de la malla" },
        ];
        const aplicadas = aplicarEscaleraAlRanking([ruta("llm7", 8), ruta("otra-nube", 9)], elegidos);
        expect(aplicadas.map((a) => a.source.id)).toEqual(["otra-nube", "llm7"]);
    });
});

describe("opcionesRankDesdeEscalera · tipos RankCandidatesOptions", () => {
    it("sin permiso de pago la personalidad NO puede gastar", () => {
        expect(opcionesRankDesdeEscalera(SIN_PAGO)).toEqual({ personaAllowsPaid: false });
    });

    it("con permiso y presupuesto vivos deja el permiso de cuenta en pie", () => {
        const preferencias: Preferencias = { permitirPago: true, topeDiario: 5, prohibidos: [] };
        expect(opcionesRankDesdeEscalera(preferencias)).toEqual({ personaAllowsPaid: true });
    });

    it("permiso de pago con presupuesto declarado en 0 no deja gastar", () => {
        const preferencias: Preferencias = { permitirPago: true, topeDiario: 0, prohibidos: [] };
        expect(opcionesRankDesdeEscalera(preferencias)).toEqual({ personaAllowsPaid: false });
    });
});

describe("cadenaPorPapel · el puente con la cadena del enjambre", () => {
    const CATALOGO_CADENA: OpcionCatalogo[] = [
        opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
        opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
        opcion({ id: "qwen-revisor", nombre: "Qwen revisor", tipo: "proveedor", papeles: ["revisor"] }),
        opcion({ id: "motor-voz", nombre: "Motor de voz", tipo: "modelo", papeles: ["voz"] }),
    ];
    const ELEGIDOS_CADENA: Candidato[] = [
        { candidatoId: "astraura-158-local", peldano: 1, motivo: "Astraura local disponible" },
        { candidatoId: "qwen-revisor", peldano: 3, motivo: "Disponible en la bolsa de la malla" },
        { candidatoId: "llm7", peldano: 5, motivo: "Proveedor gratuito vinculado disponible" },
    ];

    it("la cadena de escritor pone el local del peldaño 1 primero y numera desde 1", () => {
        const cadena = cadenaPorPapel(ELEGIDOS_CADENA, CATALOGO_CADENA, "escritor");
        expect(cadena.map((e) => e.id)).toEqual(["astraura-158-local", "llm7"]);
        expect(cadena[0]).toMatchObject({ posicion: 1, peldano: 1, nombre: "Astraura 1.58 local" });
        expect(cadena[1]).toMatchObject({ posicion: 2, peldano: 5 });
    });

    it("el papel revisor solo acepta sus opciones", () => {
        const cadena = cadenaPorPapel(ELEGIDOS_CADENA, CATALOGO_CADENA, "revisor");
        expect(cadena.map((e) => e.id)).toEqual(["qwen-revisor"]);
        expect(cadena[0].posicion).toBe(1);
    });

    it("«código» entra en la cadena de escritor del enjambre", () => {
        const catalogo: OpcionCatalogo[] = [
            opcion({ id: "devstral", nombre: "Devstral", tipo: "modelo", papeles: ["código"] }),
        ];
        const cadena = cadenaPorPapel(
            [{ candidatoId: "devstral", peldano: 1, motivo: "Modelo local disponible" }],
            catalogo,
            "escritor",
        );
        expect(cadena.map((e) => e.id)).toEqual(["devstral"]);
    });
});
