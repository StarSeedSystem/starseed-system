/**
 * Medidor de Jev (PURO): arma lo que enseña Genesis a partir de
 * `~/.starseed/jev-uso.json`, que escribe `scripts/puente/jev.py`.
 *
 * (2026-09-25) Alex: «los datos del medidor de Jev no son correctos». Lo que fallaba:
 *   · «decisiones» contaba TODO el mes, pero el reparto por medio solo existía desde
 *     el 21-09: 1466 decisiones y «0 local · 523 OpenRouter» no sumaban. Ahora lo
 *     anterior sale aparte como «sin desglose».
 *   · Laya (el otro motor local) no existía en el reparto.
 *   · Las respuestas de la caché (gratis, instantáneas) no se veían.
 *   · El p50 de OpenRouter incluía los 6 s del intento local fallido (lo arregla
 *     jev.py al anotar; aquí solo se lee).
 *   · No se sabía QUIÉN pregunta ni con qué habilidad (sí/no, elección, puntuación).
 */

export interface PeriodoJev {
    llamadas: number;
    local: number;
    laya: number;
    openrouter: number;
    /** Decisiones anotadas antes de que jev.py guardara el medio (anteriores al 21-09). */
    sin_desglose: number;
    /** Respuestas servidas de la caché de 6 h: no cuestan ni esperan. */
    cache: number;
    /** Intentos del motor local que no dieron respuesta (y siguieron a otro medio). */
    local_sin_respuesta: number;
    coste_usd: number;
    p50_local_ms: number;
    p50_laya_ms: number;
    p50_openrouter_ms: number;
    /** Quién pregunta a Jev (módulo que llama), desde el 25-09. */
    por_quien: Record<string, number>;
    /** Habilidad usada: noul (sí/no), choice (elección), score (puntuación). */
    por_tipo: Record<string, number>;
}

export interface UltimaJev {
    t: string;
    medio: string;
    modelo: string | null;
    ms: number;
}

export interface RespuestaJev {
    hoy: PeriodoJev;
    mes: PeriodoJev;
    total: { llamadas: number; tokens: number; coste_usd: number; cache: number };
    techos: { dia: number; mes: number };
    local_vivo: boolean;
    laya_viva: boolean;
    /** Si el motor local está apartado por no contestar, hasta cuándo (texto de jev.py). */
    local_pausado_hasta: string | null;
    ultima: UltimaJev | null;
    saldo_restante_usd: number | null;
    /** MGM1110B: avance de la captura local de decisiones (solo cifras, nunca los textos). */
    captura?: CapturaJev | null;
}

/** MGM1110B: lo que `jev_captura.py resumen --json` deja ver al Mando. Solo contadores y veredictos. */
export interface CapturaJev {
    activa: boolean;
    llamadas: number;
    objetivo: number;
    estratos_presentes: number;
    estratos_total: number;
    objetivo_alcanzado: boolean;
    /** Veredicto de la última prueba en sombra por peldaño: «se queda», «se descarta» o «faltan datos». */
    veredictos: Record<string, string>;
    fecha_sombra: string | null;
}

type Registro = Record<string, unknown>;

interface AcumuladoMedio {
    llamadas: number;
    ms: number[];
}

function vacio(): PeriodoJev {
    return {
        llamadas: 0,
        local: 0,
        laya: 0,
        openrouter: 0,
        sin_desglose: 0,
        cache: 0,
        local_sin_respuesta: 0,
        coste_usd: 0,
        p50_local_ms: 0,
        p50_laya_ms: 0,
        p50_openrouter_ms: 0,
        por_quien: {},
        por_tipo: {},
    };
}

function esRegistro(valor: unknown): valor is Registro {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function numero(valor: unknown): number {
    const convertido = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(convertido) && convertido >= 0 ? convertido : 0;
}

function medio(valor: unknown): AcumuladoMedio {
    if (!esRegistro(valor)) return { llamadas: numero(valor), ms: [] };
    const ms = Array.isArray(valor.ms) ? valor.ms.map(numero).filter((n) => n > 0) : [];
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

function sumarMapa(destino: Record<string, number>, origen: unknown): void {
    if (!esRegistro(origen)) return;
    for (const [clave, valor] of Object.entries(origen)) {
        const n = numero(valor);
        if (n > 0) destino[clave] = (destino[clave] ?? 0) + n;
    }
}

function periodoDe(dias: Registro, claves: string[]): PeriodoJev {
    const p = vacio();
    let local: AcumuladoMedio = { llamadas: 0, ms: [] };
    let laya: AcumuladoMedio = { llamadas: 0, ms: [] };
    let openrouter: AcumuladoMedio = { llamadas: 0, ms: [] };
    let coste = 0;

    for (const clave of claves) {
        const dia = esRegistro(dias[clave]) ? dias[clave] : {};
        p.llamadas += numero(dia.llamadas);
        p.cache += numero(dia.cache);
        p.local_sin_respuesta += numero(dia.local_sin_respuesta);
        coste += numero(dia.coste_usd);
        const porMedio = esRegistro(dia.por_medio) ? dia.por_medio : {};
        const l = medio(porMedio.local);
        const y = medio(porMedio["laya-local"]);
        const o = medio(porMedio.openrouter);
        local = { llamadas: local.llamadas + l.llamadas, ms: [...local.ms, ...l.ms] };
        laya = { llamadas: laya.llamadas + y.llamadas, ms: [...laya.ms, ...y.ms] };
        openrouter = { llamadas: openrouter.llamadas + o.llamadas, ms: [...openrouter.ms, ...o.ms] };
        sumarMapa(p.por_quien, dia.por_quien);
        sumarMapa(p.por_tipo, dia.por_tipo);
    }

    p.local = local.llamadas;
    p.laya = laya.llamadas;
    p.openrouter = openrouter.llamadas;
    const conMedio = p.local + p.laya + p.openrouter;
    if (p.llamadas < conMedio) p.llamadas = conMedio;
    p.sin_desglose = p.llamadas - conMedio;
    p.coste_usd = Math.round(coste * 100_000_000) / 100_000_000;
    p.p50_local_ms = p50(local.ms);
    p.p50_laya_ms = p50(laya.ms);
    p.p50_openrouter_ms = p50(openrouter.ms);
    return p;
}

function fechaDeEpoch(epoch: unknown, ahora: number): string | null {
    const n = numero(epoch);
    if (!n || n * 1000 <= ahora) return null;
    return new Date(n * 1000).toISOString();
}

export function construirRespuestaJev(
    uso: unknown,
    fecha: string,
    techos: RespuestaJev["techos"],
    localVivo: boolean,
    layaViva = false,
    ahora = Date.now(),
): RespuestaJev {
    if (!esRegistro(uso)) {
        return {
            hoy: vacio(),
            mes: vacio(),
            total: { llamadas: 0, tokens: 0, coste_usd: 0, cache: 0 },
            techos,
            local_vivo: localVivo,
            laya_viva: layaViva,
            local_pausado_hasta: null,
            ultima: null,
            saldo_restante_usd: null,
        };
    }
    const dias = esRegistro(uso.dias) ? uso.dias : {};
    const prefijoMes = fecha.slice(0, 7);
    const clavesMes = Object.keys(dias).filter((clave) => clave.startsWith(prefijoMes));
    const ultima = esRegistro(uso.ultima) ? uso.ultima : null;
    const saldo = esRegistro(uso.saldo) ? uso.saldo : null;
    return {
        hoy: periodoDe(dias, [fecha]),
        mes: periodoDe(dias, clavesMes),
        total: {
            llamadas: numero(uso.llamadas),
            tokens: numero(uso.tokens),
            coste_usd: Math.round(numero(uso.coste_usd) * 100_000_000) / 100_000_000,
            cache: numero(uso.cache),
        },
        techos,
        local_vivo: localVivo,
        laya_viva: layaViva,
        local_pausado_hasta: fechaDeEpoch(uso.local_pausa_hasta, ahora),
        ultima: ultima
            ? {
                  t: typeof ultima.t === "string" ? ultima.t : "",
                  medio: typeof ultima.medio === "string" ? ultima.medio : "",
                  modelo: typeof ultima.modelo === "string" ? ultima.modelo : null,
                  ms: numero(ultima.ms),
              }
            : null,
        saldo_restante_usd: saldo && saldo.restante !== undefined ? Number(saldo.restante) : null,
    };
}

/** Limpia el JSON de `jev_captura.py resumen --json` a lo que el Mando muestra (null si no es válido). */
export function construirCapturaJev(valor: unknown): CapturaJev | null {
    if (!esRegistro(valor)) return null;
    const objetivo = numero(valor.objetivo) || 1000;
    const sombra = esRegistro(valor.sombra) ? valor.sombra : null;
    const veredictos: Record<string, string> = {};
    if (sombra && esRegistro(sombra.veredictos)) {
        for (const [peldano, v] of Object.entries(sombra.veredictos)) {
            if (typeof v === "string") veredictos[peldano.slice(0, 24)] = v.slice(0, 24);
        }
    }
    return {
        activa: valor.activa !== false,
        llamadas: numero(valor.llamadas),
        objetivo,
        estratos_presentes: numero(valor.estratos_presentes),
        estratos_total: Array.isArray(valor.estratos_objetivo) ? valor.estratos_objetivo.length : 0,
        objetivo_alcanzado: valor.objetivo_alcanzado === true,
        veredictos,
        fecha_sombra: sombra && typeof sombra.fecha === "string" ? sombra.fecha.slice(0, 10) : null,
    };
}

/** «Captura de Jev: 312 de 1.000 · estratos 3 de 5» (con los veredictos si ya hubo prueba en sombra). */
export function textoCapturaJev(c: CapturaJev): string {
    const n = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); // 1.000 (es-ES no agrupa 4 cifras)
    const base = c.activa
        ? `Captura de Jev: ${n(c.llamadas)} de ${n(c.objetivo)} · estratos ${c.estratos_presentes} de ${c.estratos_total}`
        : "Captura de Jev: apagada";
    const peldanos = Object.entries(c.veredictos);
    return peldanos.length ? `${base} · sombra: ${peldanos.map(([p, v]) => `${p} ${v}`).join(", ")}` : base;
}

/** Nombres legibles de quien pregunta a Jev (el módulo que llama). */
export const CONSUMIDORES_JEV: Record<string, string> = {
    veredictos: "Director · atascadas",
    "telegram-puente": "Avisos a Telegram",
    "starseed-enjambre": "Enjambre de agentes",
    "renovador-pasarelas": "Renovador de pasarelas",
    razonador: "Razonador (Trinidad)",
    jev_enrutado: "Enrutado de modelos",
    director_jev: "Director · lanzamientos",
    "opus_director": "Director Opus",
    jev: "Contrato openjev",
};

export const HABILIDADES_JEV: Record<string, string> = {
    noul: "sí / no",
    choice: "elegir una opción",
    score: "puntuar por niveles",
};

/** «hoy · 3 gratis · 31 OpenRouter · $0,0006» para la pastilla del medidor. */
export function resumenPastillaJev(r: RespuestaJev): string {
    const p = r.hoy;
    const gratis = p.local + p.laya + p.cache;
    if (p.llamadas + p.cache === 0) return `este mes · ${r.mes.llamadas} decisiones · hoy aún ninguna`;
    return `hoy · ${gratis} gratis (local ${p.local} · Laya ${p.laya} · caché ${p.cache}) · ${p.openrouter} OpenRouter`;
}
