export interface PeriodoJev {
    llamadas: number;
    local: number;
    openrouter: number;
    coste_usd: number;
    p50_local_ms: number;
    p50_openrouter_ms: number;
}

export interface RespuestaJev {
    hoy: PeriodoJev;
    mes: PeriodoJev;
    techos: { dia: number; mes: number };
    local_vivo: boolean;
}

type Registro = Record<string, unknown>;

interface AcumuladoMedio {
    llamadas: number;
    ms: number[];
}

const VACIO: PeriodoJev = {
    llamadas: 0,
    local: 0,
    openrouter: 0,
    coste_usd: 0,
    p50_local_ms: 0,
    p50_openrouter_ms: 0,
};

function esRegistro(valor: unknown): valor is Registro {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function numero(valor: unknown): number {
    const convertido = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(convertido) && convertido >= 0 ? convertido : 0;
}

function medio(valor: unknown): AcumuladoMedio {
    if (!esRegistro(valor)) return { llamadas: numero(valor), ms: [] };
    const ms = Array.isArray(valor.ms)
        ? valor.ms.map(numero).filter((n) => n > 0)
        : [];
    return { llamadas: numero(valor.llamadas), ms };
}

function p50(valores: number[]): number {
    if (valores.length === 0) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    const mitad = Math.floor(ordenados.length / 2);
    const valor = ordenados.length % 2
        ? ordenados[mitad]
        : ((ordenados[mitad - 1] ?? 0) + (ordenados[mitad] ?? 0)) / 2;
    return Math.round(valor * 10) / 10;
}

function periodoDe(dias: Registro, claves: string[], global: Registro): PeriodoJev {
    let llamadas = 0;
    let coste = 0;
    let local: AcumuladoMedio = { llamadas: 0, ms: [] };
    let openrouter: AcumuladoMedio = { llamadas: 0, ms: [] };
    let tieneDesglose = false;

    for (const clave of claves) {
        const dia = esRegistro(dias[clave]) ? dias[clave] : {};
        llamadas += numero(dia.llamadas);
        coste += numero(dia.coste_usd);
        const porMedio = esRegistro(dia.por_medio) ? dia.por_medio : dia;
        if ("local" in porMedio || "openrouter" in porMedio) tieneDesglose = true;
        const localDia = medio(porMedio.local);
        const openrouterDia = medio(porMedio.openrouter);
        local = { llamadas: local.llamadas + localDia.llamadas, ms: [...local.ms, ...localDia.ms] };
        openrouter = {
            llamadas: openrouter.llamadas + openrouterDia.llamadas,
            ms: [...openrouter.ms, ...openrouterDia.ms],
        };
    }

    const globalLocal = medio(global.local);
    const globalOpenrouter = medio(global.openrouter);
    if (!tieneDesglose && llamadas === globalLocal.llamadas + globalOpenrouter.llamadas) {
        local = globalLocal;
        openrouter = globalOpenrouter;
    }
    if (llamadas === 0) llamadas = local.llamadas + openrouter.llamadas;
    return {
        llamadas,
        local: local.llamadas,
        openrouter: openrouter.llamadas,
        coste_usd: Math.round(coste * 100_000_000) / 100_000_000,
        p50_local_ms: p50(local.ms),
        p50_openrouter_ms: p50(openrouter.ms),
    };
}

export function construirRespuestaJev(
    uso: unknown,
    fecha: string,
    techos: RespuestaJev["techos"],
    localVivo: boolean,
): RespuestaJev {
    if (!esRegistro(uso)) {
        return { hoy: { ...VACIO }, mes: { ...VACIO }, techos, local_vivo: localVivo };
    }
    const dias = esRegistro(uso.dias) ? uso.dias : {};
    const porMedio = esRegistro(uso.por_medio) ? uso.por_medio : {};
    const prefijoMes = fecha.slice(0, 7);
    const clavesMes = Object.keys(dias).filter((clave) => clave.startsWith(prefijoMes));
    return {
        hoy: periodoDe(dias, [fecha], porMedio),
        mes: periodoDe(dias, clavesMes, porMedio),
        techos,
        local_vivo: localVivo,
    };
}
