import { describe, it, expect } from "vitest";
import {
    MAX_BYTES_LATIDO,
    comprimirLatido,
    describirFrescura,
    esLatidoFresco,
    fusionarLatidos,
    sanearLatido,
    type LatidoRemoto,
} from "../mando/latido-remoto";

function latidoBase(sobre?: Partial<LatidoRemoto>): LatidoRemoto {
    return {
        maquina: "mac",
        cola: "308-puente",
        ola: "Ola 308",
        at: 1_750_000_000_000,
        orquestadorVivo: true,
        trabajadores: 2,
        enCurso: [],
        cuentas: { integradas: 1, enCurso: 0, fallidas: 0, sinCambios: 0, pendientes: 3 },
        medio: "enjambre",
        ...sobre,
    };
}

describe("comprimirLatido", () => {
    it("no recorta un latido que ya cabe en el tope", () => {
        const l = latidoBase({ enCurso: [{ id: "P1", fase: "tsc", modelo: "nim/kimi", minutos: 3 }] });
        expect(comprimirLatido(l).enCurso).toHaveLength(1);
        expect(JSON.stringify(comprimirLatido(l)).length).toBeLessThanOrEqual(MAX_BYTES_LATIDO);
    });

    it("recorta enCurso a las 12 tareas más recientes cuando se pasa del tope", () => {
        const enCurso = Array.from({ length: 40 }, (_, i) => ({
            id: `P${i}`,
            fase: "escritura",
            modelo: "nim/deepseek-v4-flash",
            minutos: 40 - i,
        }));
        const l = latidoBase({ enCurso });
        const recortado = comprimirLatido(l);
        expect(recortado.enCurso).toHaveLength(12);
        // Se queda con las más recientes (menos minutos = más recientes).
        expect(recortado.enCurso[0]?.id).toBe("P39");
    });

    it("no muta el original", () => {
        const l = latidoBase({ enCurso: Array.from({ length: 40 }, (_, i) => ({ id: `P${i}`, fase: "escribiendo", modelo: "xkiro/qwen3-coder-plus", minutos: 40 - i })) });
        const original = l.enCurso.length;
        comprimirLatido(l);
        expect(l.enCurso).toHaveLength(original);
    });
});

describe("esLatidoFresco", () => {
    const ahora = 1_750_000_000_000;

    it("un latido de hace 40 segundos es fresco", () => {
        expect(esLatidoFresco(latidoBase({ at: ahora - 40_000 }), ahora)).toBe(true);
    });

    it("un latido de hace 4 minutos sigue siendo fresco", () => {
        expect(esLatidoFresco(latidoBase({ at: ahora - 4 * 60_000 }), ahora)).toBe(true);
    });

    it("un latido de hace justo 5 minutos ya no es fresco", () => {
        expect(esLatidoFresco(latidoBase({ at: ahora - 5 * 60_000 }), ahora)).toBe(false);
    });

    it("un latido de hace 2 horas no es fresco", () => {
        expect(esLatidoFresco(latidoBase({ at: ahora - 2 * 3600_000 }), ahora)).toBe(false);
    });

    it("un latido del futuro (reloj saltado) no se trata como fresco", () => {
        expect(esLatidoFresco(latidoBase({ at: ahora + 60_000 }), ahora)).toBe(false);
    });
});

describe("describirFrescura", () => {
    const ahora = 1_750_000_000_000;

    it("dice «hace 40 segundos»", () => {
        expect(describirFrescura(latidoBase({ at: ahora - 40_000 }), ahora)).toBe("hace 40 segundos");
    });

    it("dice «hace un minuto» en singular", () => {
        expect(describirFrescura(latidoBase({ at: ahora - 60_000 }), ahora)).toBe("hace 1 minuto");
    });

    it("avisa del dato antiguo a los 6 minutos", () => {
        expect(describirFrescura(latidoBase({ at: ahora - 6 * 60_000 }), ahora)).toBe("hace 6 minutos (dato antiguo)");
    });

    it("dice «sin noticias desde hace 2 horas»", () => {
        expect(describirFrescura(latidoBase({ at: ahora - 2 * 3600_000 }), ahora)).toBe("sin noticias desde hace 2 horas");
    });
});

describe("fusionarLatidos", () => {
    const ahora = 1_750_000_000_000;

    it("una entrada por maquina+cola, quedándose con la más reciente", () => {
        const viejos = latidoBase({ maquina: "mac", cola: "308-puente", at: ahora - 120_000, cuentas: { integradas: 1, enCurso: 0, fallidas: 0, sinCambios: 0, pendientes: 5 } });
        const nuevos = latidoBase({ maquina: "mac", cola: "308-puente", at: ahora, cuentas: { integradas: 2, enCurso: 0, fallidas: 0, sinCambios: 0, pendientes: 1 } });
        const fusionados = fusionarLatidos([viejos], [nuevos]);
        expect(fusionados).toHaveLength(1);
        expect(fusionados[0]?.at).toBe(ahora);
        expect(fusionados[0]?.cuentas.pendientes).toBe(1);
    });

    it("la misma máquina con colas distintas son dos entradas", () => {
        const a = latidoBase({ maquina: "mac", cola: "308-puente" });
        const b = latidoBase({ maquina: "mac", cola: "310-config" });
        expect(fusionarLatidos([a], [b])).toHaveLength(2);
    });

    it("ordena por at descendente (lo más nuevo primero)", () => {
        const viejo = latidoBase({ maquina: "nube", cola: "308-puente", at: ahora - 300_000 });
        const nuevo = latidoBase({ maquina: "mac", cola: "311-resto", at: ahora });
        const fusionados = fusionarLatidos([viejo], [nuevo]);
        expect(fusionados.map((l) => l.maquina)).toEqual(["mac", "nube"]);
    });

    it("ignora entradas sin maquina ni cola (no pueden deduplicarse)", () => {
        const raro = { ...latidoBase(), maquina: "", cola: "" } as LatidoRemoto;
        expect(fusionarLatidos([raro], [])).toHaveLength(0);
    });
});

describe("sanearLatido", () => {
    it("devuelve null para basura que no es un objeto", () => {
        expect(sanearLatido(null)).toBeNull();
        expect(sanearLatido("texto")).toBeNull();
        expect(sanearLatido([1, 2, 3])).toBeNull();
    });

    it("devuelve null si no hay identidad mínima (maquina ni cola)", () => {
        expect(sanearLatido({ at: Date.now(), cuentas: {} })).toBeNull();
    });

    it("quita una clave sk- incrustada en un campo de texto", () => {
        const limpiado = sanearLatido(defaultLatido({ maquina: "nube-servidor-sk-ABC123xyz9" }));
        expect(limpiado).not.toBeNull();
        expect(limpiado?.maquina).not.toMatch(/sk-/);
    });

    it("quita una clave gsk_ y una cabecera Bearer", () => {
        const limpiado = sanearLatido(defaultLatido({
            cola: "308-puente",
            enCurso: [{ id: "P1", fase: "escritura", modelo: "Bearer tokensecreto", minutos: 2 }],
            medio: "Bearer ABA-token",
            ola: "Ola 308 · clave gsk_123456",
        }));
        expect(limpiado?.medio).not.toMatch(/Bearer/);
        expect(limpiado?.enCurso[0]?.modelo).not.toMatch(/Bearer|tokensecreto/);
        expect(limpiado?.ola).not.toMatch(/gsk_/);
    });

    it("elimina rutas de disco que delatarían el sistema", () => {
        const limpiado = sanearLatido(defaultLatido({ maquina: "mac-//Users/alex/Documents" }));
        expect(limpiado?.maquina).not.toMatch(/Users|Home|\/home\//i);
    });

    it("normaliza números: los negativos y NaN no cuentan", () => {
        const limpiado = sanearLatido(defaultLatido({
            trabajadores: -5,
            cuentas: { integradas: -1, enCurso: Number.NaN, fallidas: 3, sinCambios: 0, pendientes: 7 },
        }));
        expect(limpiado?.trabajadores).toBe(0);
        expect(limpiado?.cuentas.integradas).toBe(0);
        expect(limpiado?.cuentas.enCurso).toBe(0);
        expect(limpiado?.cuentas.fallidas).toBe(3);
        expect(limpiado?.cuentas.pendientes).toBe(7);
    });

    it("valida enCurso y conserva la forma del latido", () => {
        const limpiado = sanearLatido(defaultLatido({ at: 1_750_000_000_000, enCurso: [{ id: "P1", fase: "tsc", modelo: "nim/kimi", minutos: 4 }] }));
        expect(limpiado?.at).toBe(1_750_000_000_000);
        expect(limpiado?.enCurso).toHaveLength(1);
        expect(limpiado?.orquestadorVivo).toBe(true);
    });
});

function defaultLatido(sobre?: Record<string, unknown>): unknown {
    return {
        maquina: "mac",
        cola: "308-puente",
        ola: "Ola 308",
        at: Date.now(),
        orquestadorVivo: true,
        trabajadores: 2,
        enCurso: [],
        cuentas: { integradas: 1, enCurso: 0, fallidas: 0, sinCambios: 0, pendientes: 3 },
        medio: "enjambre",
        ...sobre,
    };
}