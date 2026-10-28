import { describe, expect, it } from "vitest";
import type { CatalogModel, CatalogSource } from "@/ai/astraura/free-catalog";
import type { RouteCandidate } from "@/ai/astraura/router";
import {
    aplicarEscalera,
    cadenasPorPapel,
    opcionesDeRanking,
    preferenciaDelEnrutador,
} from "../aplicar-escalera";
import type { Gratis, OpcionCatalogo } from "../catalogo-opciones";
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

function modelo(id: string): CatalogModel {
    return { id, label: id, strengths: ["chat"], quality: 5 };
}

function fuente(id: string): CatalogSource {
    return {
        id, label: id, tier: "instant", providerId: "starseed", baseUrl: "",
        requiresKey: false, models: [modelo(id)], limits: "", why: "", privacy: "local", weight: 1,
    };
}

function candidatoRuta(id: string): RouteCandidate {
    return { source: fuente(id), model: modelo(id), score: 0, reason: "prueba", fromUser: false };
}

const CATALOGO_PUENTE = [
    opcion({ id: "llm7", nombre: "LLM7.io", tipo: "proveedor", papeles: ["escritor"] }),
    opcion({ id: "astraura-158-local", nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["escritor"], privacidad: "local" }),
];

describe("aplicarEscalera · puente con el enrutador de Astraura", () => {
    it("pone primera la candidata local del peldaño 1 aunque el enrutador la traiga después", () => {
        const candidatos = elegirCandidatos({
            tarea: TAREA_ESCRITOR, ofertas: [OFERTA_LOCAL], catalogo: CATALOGO_PUENTE,
            vinculadas: new Set<string>(), preferencias: SIN_PAGO,
        });
        const r = aplicarEscalera({
            candidatos,
            delEnrutador: [candidatoRuta("llm7"), candidatoRuta("astraura-158-local")],
            catalogo: CATALOGO_PUENTE,
            preferencias: SIN_PAGO,
        });
        expect(r.orden).toEqual(["astraura-158-local", "llm7"]);
        expect(r.preferencia.map((c) => c.source.id)).toEqual(["astraura-158-local", "llm7"]);
        expect(r.cadenas.escritor).toEqual(["astraura-158-local", "llm7"]);
    });

    it("no deja pasar una candidata prohibida aunque el enrutador la proponga", () => {
        const preferencias: Preferencias = { ...SIN_PAGO, prohibidos: ["llm7"] };
        const candidatos = elegirCandidatos({
            tarea: TAREA_ESCRITOR, ofertas: [OFERTA_LOCAL], catalogo: CATALOGO_PUENTE,
            vinculadas: new Set<string>(), preferencias,
        });
        const r = aplicarEscalera({
            candidatos,
            delEnrutador: [candidatoRuta("llm7"), candidatoRuta("astraura-158-local")],
            catalogo: CATALOGO_PUENTE,
            preferencias,
        });
        expect(r.orden).toEqual(["astraura-158-local"]);
        expect(r.preferencia.map((c) => c.source.id)).toEqual(["astraura-158-local"]);
        expect(r.cadenas.escritor).not.toContain("llm7");
    });

    it("reparte la cadena por papel y niega el pago cuando el ámbito no lo permite", () => {
        const catalogo = [
            opcion({ id: "a", papeles: ["escritor", "revisor"] }),
            opcion({ id: "b", papeles: ["chat"] }),
        ];
        const candidatos: Candidato[] = [
            { candidatoId: "a", peldano: 1, motivo: "local" },
            { candidatoId: "b", peldano: 3, motivo: "nube" },
        ];
        expect(cadenasPorPapel(candidatos, catalogo)).toEqual({
            escritor: ["a"], revisor: ["a"], director: ["b"],
        });
        expect(opcionesDeRanking(SIN_PAGO)).toEqual({ personaAllowsPaid: false });
        expect(opcionesDeRanking({ ...SIN_PAGO, permitirPago: true })).toEqual({});
    });

    it("nunca inventa candidatos que el enrutador no trajo", () => {
        const preferencia = preferenciaDelEnrutador(
            [candidatoRuta("astraura-158-local")],
            [
                { candidatoId: "astraura-158-local", peldano: 1, motivo: "local" },
                { candidatoId: "llm7", peldano: 3, motivo: "nube" },
            ],
        );
        expect(preferencia.map((c) => c.source.id)).toEqual(["astraura-158-local"]);
    });
});
