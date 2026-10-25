import { describe, expect, it } from "vitest";
import {
    identidadVoz,
    ORDEN_CAPAS,
    VOZ_RT_DEFECTO,
    MOTOR_DEFECTO,
    describeOrigen,
    type MapasIdentidadVoz,
} from "@/lib/aurora/identidad-voz";
import { VOZ_POR_PERSONA } from "@/lib/aurora/voz-rt";

/** El mapa «persona» como vende voz-rt (una parte), vía el resolutor. */
const MAPAS: MapasIdentidadVoz = { vozRT: VOZ_POR_PERSONA };

describe("identidadVoz · sin configuración", () => {
    it("la voz F1 de Alex se conserva por defecto", () => {
        const id = identidadVoz();
        expect(id.vozRT).toBe("F1");
        expect(id.motor).toBe(MOTOR_DEFECTO);
        expect(id.timbre).toBeNull();
        expect(id.origen).toBe("defecto");
    });

    it("con ningún mapa disponible para la persona, cae al F1 de Alex", () => {
        const id = identidadVoz({ personaId: "alguien-desconocido" }, MAPAS);
        expect(id.vozRT).toBe(VOZ_RT_DEFECTO);
        expect(id.origen).toBe("defecto");
    });

    it("el mapa de persona resuelve antes que el defecto, con origen «persona»", () => {
        expect(identidadVoz({ personaId: "atenea" }, MAPAS).vozRT).toBe("F2");
        expect(identidadVoz({ personaId: "Hermes" }, MAPAS).vozRT).toBe("M2");
        const aurora = identidadVoz({ personaId: "aurora" }, MAPAS);
        expect(aurora.vozRT).toBe("F1");
        expect(aurora.origen).toBe("persona");
    });
});

describe("identidadVoz · precedencia de capas", () => {
    it("cada campo sale de la capa MÁS ALTA que lo fijó", () => {
        const id = identidadVoz({
            agente: { motor: "omnivoice" },
            personalidad: { vozRT: "F3", timbre: "aurora-organica" },
            cerebro: { vozRT: "F4" },
            neurona: { vozRT: "M1" },
            cuenta: { vozRT: "F5" },
        });
        expect(id.motor).toBe("omnivoice");
        expect(id.vozRT).toBe("F3");
        expect(id.timbre).toBe("aurora-organica");
        // La capa dominante es la MÁS ALTA que fijó algo (agente fijó el motor).
        expect(id.origen).toBe("agente");
    });

    it("el orden es exactamente agente › personalidad › cerebro › neurona › cuenta", () => {
        expect(ORDEN_CAPAS).toEqual(["agente", "personalidad", "cerebro", "neurona", "cuenta"]);
    });

    it("la capa dominante es la más alta que fijó ALGO, no solo vozRT", () => {
        const soloCuenta = identidadVoz({ cuenta: { vozRT: "F2" } });
        expect(soloCuenta.origen).toBe("cuenta");
        const agenteConMotor = identidadVoz({
            agente: { motor: "xai" },
            cuenta: { vozRT: "F2", timbre: "cálida" },
        });
        expect(agenteConMotor.motor).toBe("xai");
        expect(agenteConMotor.vozRT).toBe("F2");
        expect(agenteConMotor.origen).toBe("agente");
    });

    it("una capa vacía no bloquea a las inferiores", () => {
        const id = identidadVoz({
            agente: {},
            personalidad: {},
            cerebro: { vozRT: "M3" },
            neurona: { motor: "kokoro" },
            cuenta: { vozRT: "F5" },
        });
        expect(id.vozRT).toBe("M3");
        expect(id.motor).toBe("kokoro");
        expect(id.origen).toBe("cerebro");
    });
});

describe("identidadVoz · capas contra mapas de persona", () => {
    it("una capa explicita GANA sobre el mapa de la persona", () => {
        const id = identidadVoz({ personaId: "atenea", cuenta: { vozRT: "M4" } }, MAPAS);
        expect(id.vozRT).toBe("M4");
        expect(id.origen).toBe("cuenta");
    });

    it("el mapa rellena el campo que las capas dejaron libre", () => {
        const id = identidadVoz(
            { personaId: "aurora", agente: { motor: "xai" } },
            { ...MAPAS, timbre: { aurora: "semilla-aurora" } },
        );
        expect(id.motor).toBe("xai");
        expect(id.vozRT).toBe("F1");
        expect(id.timbre).toBe("semilla-aurora");
        expect(id.origen).toBe("agente");
    });

    it("la semilla de openvoice2 cae al timbre cuando no hay otro", () => {
        const id = identidadVoz({ personaId: "hermione" }, { semilla: { hermione: "hermione" } });
        expect(id.timbre).toBe("hermione");
        expect(id.origen).toBe("persona");
    });
});

describe("describeOrigen", () => {
    it("cada origen tiene su texto", () => {
        expect(describeOrigen("defecto")).toContain("F1");
        expect(describeOrigen("persona")).toContain("persona");
        expect(describeOrigen("neurona")).toContain("neurona");
    });
});
