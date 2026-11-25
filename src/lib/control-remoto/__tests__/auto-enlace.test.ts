import { describe, it, expect } from "vitest";
import {
    enlacesAuto,
    elegirOrdenesAuto,
    elegirPantallaAuto,
    tocaReevaluar,
    lineaCambioMedio,
    type EnlaceAuto,
    type AutoPrevio,
    type OpcionesAuto,
    PERMANENCIA_MS,
    REEVALUAR_MS,
    MEJORA_RTT_FRACCION,
    MEJORA_RTT_MS,
    MEJORA_CAUDAL_FRACCION,
    RTT_SIN_MEDIR_MS,
    CAUDAL_NOMINAL_KBPS,
} from "../auto-enlace";
import type { CandidatoMedio, TipoMedio } from "../medio";

function candidato(overrides: Partial<CandidatoMedio> = {}): CandidatoMedio {
    return {
        enlaceId: overrides.enlaceId ?? "test-1",
        medio: overrides.medio ?? "local",
        etiqueta: overrides.etiqueta ?? "test",
        abierto: true,
        llega: true,
        rttMs: overrides.rttMs ?? 50,
        capacidadKbps: overrides.capacidadKbps ?? 4000,
        ...overrides,
    };
}

function crearOpciones(overrides: Partial<OpcionesAuto> = {}): OpcionesAuto {
    return {
        ahora: 1_000_000,
        esWifiDirecto: () => false,
        fallidos: new Set(),
        caudalMedido: new Map(),
        ...overrides,
    };
}

describe("auto-enlace · enlacesAuto", () => {
    it("filtra enlaces cerrados o que no llegan", () => {
        const cands = [
            candidato({ enlaceId: "a", abierto: true, llega: true }),
            candidato({ enlaceId: "b", abierto: false, llega: true }),
            candidato({ enlaceId: "c", abierto: true, llega: false }),
        ];
        const res = enlacesAuto(cands, crearOpciones());
        expect(res.length).toBe(1);
        expect(res[0].enlaceId).toBe("a");
    });

    it("excluye relevos", () => {
        const cands = [
            candidato({ enlaceId: "directo-1", medio: "local" }),
            candidato({ enlaceId: "relevo:algo", medio: "rele" }),
        ];
        const res = enlacesAuto(cands, crearOpciones());
        expect(res.length).toBe(1);
        expect(res[0].enlaceId).toBe("directo-1");
    });

    it("excluye enlaces fallidos", () => {
        const cands = [candidato({ enlaceId: "a", medio: "local" }), candidato({ enlaceId: "b", medio: "local" })];
        const res = enlacesAuto(cands, crearOpciones({ fallidos: new Set(["a"]) }));
        expect(res.length).toBe(1);
        expect(res[0].enlaceId).toBe("b");
    });

    it("marca como directo los enlaces bluetooth, local, wifi-local, p2p-internet, lora", () => {
        const cands = [
            candidato({ enlaceId: "bt", medio: "bluetooth" }),
            candidato({ enlaceId: "local", medio: "local" }),
            candidato({ enlaceId: "wifi-local", medio: "wifi-local" }),
            candidato({ enlaceId: "p2p", medio: "p2p-internet" }),
            candidato({ enlaceId: "lora", medio: "lora" }),
            candidato({ enlaceId: "turn", medio: "turn" }),
            candidato({ enlaceId: "servidor", medio: "servidor" }),
        ];
        const res = enlacesAuto(cands, crearOpciones());
        const directos = res.filter((e) => e.directo).map((e) => e.enlaceId).sort();
        // p2p-internet es directo (camino directo, medio null con nota)
        expect(directos).toEqual(["bt", "local", "lora", "p2p", "wifi-local"]);
    });
});

describe("auto-enlace · elegirOrdenesAuto", () => {
    it("elige el directo de menor latencia", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "a", medio: "wifi-directo", directo: true, rttMs: 30, kbps: 20000, kbpsMedido: true },
            { enlaceId: "b", medio: "internet", directo: false, rttMs: 10, kbps: 4000, kbpsMedido: true },
            { enlaceId: "c", medio: "wifi-directo", directo: true, rttMs: 20, kbps: 20000, kbpsMedido: true },
        ];
        const res = elegirOrdenesAuto(enlaces, null, crearOpciones());
        expect(res.enlace?.enlaceId).toBe("c");
        expect(res.causa).toBe("inicial");
    });

    it("mantiene el enlace actual si no hay uno claramente mejor (histéresis)", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "actual", medio: "wifi-directo", directo: true, rttMs: 50, kbps: 20000, kbpsMedido: true },
            { enlaceId: "mejor", medio: "wifi-directo", directo: true, rttMs: 40, kbps: 20000, kbpsMedido: true }, // solo 20% mejor, no 30%
        ];
        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 10_000 }; // hace 10s, más de PERMANENCIA_MS
        const res = elegirOrdenesAuto(enlaces, previo, crearOpciones({ ahora: 1_000_000 }));
        expect(res.enlace?.enlaceId).toBe("actual");
        expect(res.causa).toBe("sigue");
    });

    it("cambia si el nuevo es claramente mejor (≥30% y ≥15ms)", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "actual", medio: "wifi-directo", directo: true, rttMs: 100, kbps: 20000, kbpsMedido: true },
            { enlaceId: "mejor", medio: "wifi-directo", directo: true, rttMs: 60, kbps: 20000, kbpsMedido: true }, // 40% mejor, 40ms
        ];
        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 10_000 };
        const res = elegirOrdenesAuto(enlaces, previo, crearOpciones({ ahora: 1_000_000 }));
        expect(res.enlace?.enlaceId).toBe("mejor");
        expect(res.causa).toBe("mejor-latencia");
    });

    it("no cambia si no pasó PERMANENCIA_MS", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "actual", medio: "wifi-directo", directo: true, rttMs: 100, kbps: 20000, kbpsMedido: true },
            { enlaceId: "mejor", medio: "wifi-directo", directo: true, rttMs: 60, kbps: 20000, kbpsMedido: true },
        ];
        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 1_000 }; // hace 1s, menos de PERMANENCIA_MS
        const res = elegirOrdenesAuto(enlaces, previo, crearOpciones({ ahora: 1_000_000 }));
        expect(res.enlace?.enlaceId).toBe("actual");
        expect(res.causa).toBe("sigue");
    });

    it("cambia si el enlace actual falló (simula flujo completo: enlacesAuto filtra y luego elegirOrdenesAuto)", () => {
        const cands = [
            candidato({ enlaceId: "actual", medio: "local", rttMs: 50, capacidadKbps: 20000 }),
            candidato({ enlaceId: "mejor", medio: "local", rttMs: 40, capacidadKbps: 20000 }),
        ];
        const opciones = crearOpciones({ ahora: 1_000_000, fallidos: new Set(["actual"]) });
        const filtrados = enlacesAuto(cands, opciones);
        expect(filtrados.length).toBe(1);
        expect(filtrados[0].enlaceId).toBe("mejor");

        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 10_000 };
        const res = elegirOrdenesAuto(filtrados, previo, opciones);
        expect(res.enlace?.enlaceId).toBe("mejor");
        expect(res.causa).toBe("fallo-del-anterior");
    });

    it("cambia si el enlace actual desapareció", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "otro", medio: "wifi-directo", directo: true, rttMs: 40, kbps: 20000, kbpsMedido: true },
        ];
        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 10_000 };
        const res = elegirOrdenesAuto(enlaces, previo, crearOpciones({ ahora: 1_000_000 }));
        expect(res.enlace?.enlaceId).toBe("otro");
        expect(res.causa).toBe("anterior-caido");
    });

    it("devuelve null si no hay directos", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "a", medio: "internet", directo: false, rttMs: 10, kbps: 4000, kbpsMedido: true },
        ];
        const res = elegirOrdenesAuto(enlaces, null, crearOpciones());
        expect(res.enlace).toBeNull();
        expect(res.causa).toBe("sin-directos");
    });
});

describe("auto-enlace · elegirPantallaAuto", () => {
    it("elige el directo de más caudal", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "a", medio: "wifi-directo", directo: true, rttMs: 50, kbps: 10000, kbpsMedido: true },
            { enlaceId: "b", medio: "internet", directo: false, rttMs: 10, kbps: 4000, kbpsMedido: true },
            { enlaceId: "c", medio: "wifi-directo", directo: true, rttMs: 30, kbps: 20000, kbpsMedido: true },
        ];
        const res = elegirPantallaAuto(enlaces, null, crearOpciones());
        expect(res.enlace?.enlaceId).toBe("c");
        expect(res.causa).toBe("inicial");
    });

    it("cambia por caudal ≥50% más", () => {
        const enlaces: EnlaceAuto[] = [
            { enlaceId: "actual", medio: "wifi-directo", directo: true, rttMs: 50, kbps: 10000, kbpsMedido: true },
            { enlaceId: "mejor", medio: "wifi-directo", directo: true, rttMs: 60, kbps: 20000, kbpsMedido: true }, // 100% más
        ];
        const previo: AutoPrevio = { enlaceId: "actual", desde: 1_000_000 - 10_000 };
        const res = elegirPantallaAuto(enlaces, previo, crearOpciones({ ahora: 1_000_000 }));
        expect(res.enlace?.enlaceId).toBe("mejor");
        expect(res.causa).toBe("mas-caudal");
    });
});

describe("auto-enlace · tocaReevaluar", () => {
    it("true si falló el último envío", () => {
        expect(tocaReevaluar(1_000_000, 1_000_100, true)).toBe(true);
    });

    it("true si pasó REEVALUAR_MS", () => {
        expect(tocaReevaluar(1_000_000, 1_000_000 + REEVALUAR_MS, false)).toBe(true);
    });

    it("false si no falló y no pasó el tiempo", () => {
        expect(tocaReevaluar(1_000_000, 1_000_000 + REEVALUAR_MS - 1, false)).toBe(false);
    });
});

describe("auto-enlace · lineaCambioMedio", () => {
    it("formatea correctamente con EnlaceAuto", () => {
        const de: EnlaceAuto = { enlaceId: "a", medio: "wifi-directo", directo: true, rttMs: 50, kbps: 20000, kbpsMedido: true };
        const a: EnlaceAuto = { enlaceId: "b", medio: "internet", directo: false, rttMs: 100, kbps: 4000, kbpsMedido: true };
        const linea = lineaCambioMedio({ de, a, causa: "mejor-latencia", ms: 50, kbps: 20000, uso: "ordenes" });
        expect(linea).toContain("control-medio cambio");
        expect(linea).toContain("uso=ordenes");
        expect(linea).toContain("de=directo:wifi-directo");
        expect(linea).toContain("a=directo:internet");
        expect(linea).toContain("causa=mejor-latencia");
        expect(linea).toContain("ms=50");
        expect(linea).toContain("kbps=20000");
    });

    it("maneja null", () => {
        const linea = lineaCambioMedio({ de: null, a: null, causa: "inicial", ms: null, kbps: null });
        expect(linea).toContain("de=ninguno");
        expect(linea).toContain("a=ninguno");
        expect(linea).toContain("ms=sin-medir");
        expect(linea).toContain("kbps=sin-medir");
    });
});

describe("auto-enlace · constantes", () => {
    it("PERMANENCIA_MS es 6000", () => {
        expect(PERMANENCIA_MS).toBe(6_000);
    });

    it("REEVALUAR_MS es 4000", () => {
        expect(REEVALUAR_MS).toBe(4_000);
    });

    it("MEJORA_RTT_FRACCION es 0.3", () => {
        expect(MEJORA_RTT_FRACCION).toBe(0.3);
    });

    it("MEJORA_RTT_MS es 15", () => {
        expect(MEJORA_RTT_MS).toBe(15);
    });

    it("MEJORA_CAUDAL_FRACCION es 0.5", () => {
        expect(MEJORA_CAUDAL_FRACCION).toBe(0.5);
    });

    it("RTT_SIN_MEDIR_MS es 400", () => {
        expect(RTT_SIN_MEDIR_MS).toBe(400);
    });

    it("CAUDAL_NOMINAL_KBPS tiene todos los tipos", () => {
        const tipos: TipoMedio[] = ["wifi-directo", "red-local", "internet", "nodo", "turn", "servidor", "bluetooth", "lora"];
        for (const t of tipos) {
            expect(CAUDAL_NOMINAL_KBPS[t]).toBeGreaterThan(0);
        }
    });
});