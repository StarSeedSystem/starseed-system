/**
 * Configuración y funciones puras para los ajustes del motor BitNet (Ola 347)
 */

export interface AjustesBitnet {
    ctx: 1024 | 2048 | 4096;
    paralelo: 1 | 2 | 3 | 4;
    servidores: "shared" | "dual";
    suenoMin: number;
    hilos: number;
    nodo: "local" | "nube" | "vecino" | "auto";
    dormirSiSwapGb: number;
}

export interface HardwareInfo {
    ramGb?: number;
    cpu?: number;
    enjambreVivo?: boolean;
    esNube?: boolean;
}

export const AJUSTES_BITNET_DEFECTO: AjustesBitnet = {
    ctx: 2048,
    paralelo: 1,
    servidores: "shared",
    suenoMin: 15,
    hilos: 4,
    nodo: "auto",
    dormirSiSwapGb: 8,
};

export function validar(a: unknown): AjustesBitnet {
    if (!a || typeof a !== "object") return { ...AJUSTES_BITNET_DEFECTO };
    const obj = a as Record<string, unknown>;

    const ctx = obj.ctx === 1024 || obj.ctx === 2048 || obj.ctx === 4096
        ? obj.ctx
        : AJUSTES_BITNET_DEFECTO.ctx;

    const paralelo = obj.paralelo === 1 || obj.paralelo === 2 || obj.paralelo === 3 || obj.paralelo === 4
        ? obj.paralelo
        : AJUSTES_BITNET_DEFECTO.paralelo;

    const servidores = obj.servidores === "dual" ? "dual" : "shared";

    const suenoMin = typeof obj.suenoMin === "number" && !Number.isNaN(obj.suenoMin)
        ? Math.max(0, Math.min(1440, obj.suenoMin))
        : AJUSTES_BITNET_DEFECTO.suenoMin;

    const hilos = typeof obj.hilos === "number" && !Number.isNaN(obj.hilos)
        ? Math.max(1, Math.min(64, Math.floor(obj.hilos)))
        : AJUSTES_BITNET_DEFECTO.hilos;

    const nodoValid = obj.nodo === "local" || obj.nodo === "nube" || obj.nodo === "vecino" || obj.nodo === "auto";
    const nodo = nodoValid ? (obj.nodo as AjustesBitnet["nodo"]) : AJUSTES_BITNET_DEFECTO.nodo;

    const dormirSiSwapGb = typeof obj.dormirSiSwapGb === "number" && !Number.isNaN(obj.dormirSiSwapGb)
        ? Math.max(0, Math.min(128, obj.dormirSiSwapGb))
        : AJUSTES_BITNET_DEFECTO.dormirSiSwapGb;

    return { ctx, paralelo, servidores, suenoMin, hilos, nodo, dormirSiSwapGb };
}

export function recomendarPorHardware(hw: HardwareInfo): AjustesBitnet {
    const { ramGb = 8, cpu = 4, esNube = false } = hw;

    if (esNube || cpu <= 2) {
        return {
            ctx: 2048,
            paralelo: 1,
            servidores: "shared",
            suenoMin: 15,
            hilos: Math.max(1, Math.min(2, cpu)),
            nodo: "nube",
            dormirSiSwapGb: 8,
        };
    }

    if (ramGb >= 16) {
        return {
            ctx: 4096,
            paralelo: 2,
            servidores: "dual",
            suenoMin: 30,
            hilos: Math.max(1, Math.min(16, cpu - 1)),
            nodo: "local",
            dormirSiSwapGb: 12,
        };
    }

    return {
        ctx: 2048,
        paralelo: 1,
        servidores: "shared",
        suenoMin: 15,
        hilos: Math.max(1, Math.min(8, cpu - 1)),
        nodo: "local",
        dormirSiSwapGb: 8,
    };
}

export function aEntorno(a: AjustesBitnet): Record<string, string> {
    const saneado = validar(a);
    return {
        ASTRAURA_BITNET_CTX: String(saneado.ctx),
        ASTRAURA_BITNET_PAR: String(saneado.paralelo),
        ASTRAURA_BITNET_SERVIDORES: saneado.servidores,
        ASTRAURA_BITNET_SUENO_MIN: String(saneado.suenoMin),
        ASTRAURA_BITNET_HILOS: String(saneado.hilos),
        ASTRAURA_BITNET_NODO: saneado.nodo,
        ASTRAURA_BITNET_SWAP_GB: String(saneado.dormirSiSwapGb),
    };
}

export function desdeEntorno(
    env: Record<string, string | undefined>,
): AjustesBitnet {
    const ctxNum = Number(env.ASTRAURA_BITNET_CTX);
    const parNum = Number(env.ASTRAURA_BITNET_PAR);
    const suenoNum = Number(env.ASTRAURA_BITNET_SUENO_MIN);
    const hilosNum = Number(env.ASTRAURA_BITNET_HILOS);
    const swapNum = Number(env.ASTRAURA_BITNET_SWAP_GB);

    return validar({
        ctx: ctxNum,
        paralelo: parNum,
        servidores: env.ASTRAURA_BITNET_SERVIDORES,
        suenoMin: suenoNum,
        hilos: hilosNum,
        nodo: env.ASTRAURA_BITNET_NODO,
        dormirSiSwapGb: swapNum,
    });
}
