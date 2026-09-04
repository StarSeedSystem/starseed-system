/**
 * Contrato y validación de los ajustes del enjambre (Ola 233 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────
 * Define la forma del archivo `~/.starseed/enjambre.json` que el orquestador
 * (`starseed-enjambre.py`) lee en cada ola para saber cuántos workers abrir,
 * qué modelos escribir y qué cadena de revisores pasar.
 *
 * La ruta `GET/PUT /api/mando/ajustes` (solo local, 404 en producción) es la
 * única ventana del OS sobre ese archivo: nunca expone rutas del disco, jamás
 * escribe claves, y rechaza cualquier valor fuera de los rangos y de la lista
 * blanca definidos aquí.
 *
 * ⚠️ Reglas (cláusulas pétreas del área de Mando):
 *  • workers 1-6
 *  • concurrenciaOpencode 1-6
 *  • cuposRpm por proveedor entre 1 y 120
 *  • modelos y revisores: solo cadenas de la lista blanca PROVEEDORES_PERMITIDOS
 *  • revisionActiva es un interruptor booleano
 *  • Sin rutas, sin comandos, sin claves.
 */

/** Lista blanca de proveedores conocidos (de `flota.ts` y `orquestacion-economica.md`). */
export const PROVEEDORES_PERMITIDOS = [
    "nvidia",
    "aihubmix",
    "tokenrouter",
    "openrouter",
    "gemini",
    "nim",
    "xkiro",
] as const;

export type ProveedorPermitido = (typeof PROVEEDORES_PERMITIDOS)[number];

/** Forma del `enjambre.json` tal como la entiende el orquestador. */
export interface ConfigEnjambre {
    workers: number;
    concurrenciaOpencode: number;
    modelos: string[];
    revisores: Array<[string, string]>;
    cuposRpm: Record<string, number>;
    revisionActiva: boolean;
}

/** Límites máximos y mínimos de la configuración. */
export const LIMITES = {
    workersMin: 1,
    workersMax: 6,
    concurrenciaMin: 1,
    concurrenciaMax: 6,
    cupoMin: 1,
    cupoMax: 120,
} as const;

/** Catálogo de modelos sugeridos por proveedor (para el selector del panel). */
export const MODELOS_SUGERIDOS: Record<ProveedorPermitido, readonly string[]> = {
    nvidia: [
        "nvidia/nemotron-3-super-120b-a12b",
        "nvidia/nemotron-3.5-lightning-30b-a3b",
        "moonshotai/kimi-k3",
        "deepseek-ai/deepseek-v4-flash-0731",
        "openai/gpt-oss-120b",
    ],
    nim: [
        "nim/kimi-k3",
        "nim/deepseek-v4-flash",
        "nim/deepseek-v4-pro",
    ],
    aihubmix: [
        "aihubmix/coding-glm-5.3-free",
        "aihubmix/gemini-3.7-flash-free",
    ],
    tokenrouter: [
        "tokenrouter/z-ai/glm-5.3-free",
        "tokenrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ],
    openrouter: [
        "openrouter/free",
        "openrouter/tencent/hy3:free",
        "openrouter/qwen/qwen3-next-80b-a3b-instruct:free",
    ],
    gemini: [
        "gemini-2.5-flash-lite",
    ],
    xkiro: [
        "xkiro/qwen3-coder-plus",
        "xkiro/minimax-m3",
        "xkiro/devstral-medium",
        "xkiro/qwen3.7-plus",
        "xkiro/minimax-m2.7-highspeed",
    ],
};

/** Configuración por defecto, documentada y usada cuando no existe el archivo. */
export const AJUSTES_POR_DEFECTO: ConfigEnjambre = {
    workers: 3,
    concurrenciaOpencode: 2,
    modelos: [
        "xkiro/qwen3-coder-plus",
        "nim/kimi-k3",
        "xkiro/minimax-m3",
        "nim/deepseek-v4-flash",
    ],
    revisores: [
        ["xkiro", "xkiro/qwen3.7-plus"],
        ["aihubmix", "aihubmix/coding-glm-5.3-free"],
    ],
    cuposRpm: {
        nvidia: 40,
        aihubmix: 30,
        tokenrouter: 30,
        openrouter: 20,
        gemini: 15,
        nim: 40,
        xkiro: 60,
    },
    revisionActiva: true,
};

/** Texto seguro. */
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Entero dentro de un rango, con valor por defecto. */
function enteroEnRango(
    v: unknown,
    mínimo: number,
    máximo: number,
    porDefecto: number,
): number {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : Number.NaN;
    if (!Number.isFinite(n)) return porDefecto;
    if (n < mínimo) return mínimo;
    if (n > máximo) return máximo;
    return n;
}

/** ¿Esta cadena es un modelo permitido? (proveedor en lista blanca + algo detrás). */
function esModeloPermitido(modelo: string): boolean {
    const limpio = modelo.trim();
    if (!limpio) return false;
    const slash = limpio.indexOf("/");
    if (slash <= 0) return false;
    const proveedor = limpio.slice(0, slash).trim().toLowerCase();
    if (!(PROVEEDORES_PERMITIDOS as readonly string[]).includes(proveedor)) return false;
    const resto = limpio.slice(slash + 1).trim();
    return resto.length > 0;
}

/** ¿Es un par [proveedor, modelo] permitido? */
function esRevisorPermitido(par: unknown): par is [string, string] {
    if (!Array.isArray(par) || par.length !== 2) return false;
    const [proveedor, modelo] = par;
    if (typeof proveedor !== "string" || typeof modelo !== "string") return false;
    const prov = proveedor.trim().toLowerCase();
    if (!(PROVEEDORES_PERMITIDOS as readonly string[]).includes(prov)) return false;
    return modelo.trim().length > 0;
}

/**
 * Valida y sanea una configuración bruta (la que llega del PUT o del archivo).
 * Pure function: no toca el disco, no lanza. Cualquier valor fuera de rango o
 * de la lista blanca se descarta y se reemplaza por el valor por defecto.
 */
export function validarConfig(bruto: unknown): ConfigEnjambre {
    const obj =
        typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)
            ? (bruto as Record<string, unknown>)
            : {};

    const modelosCrudos = Array.isArray(obj.modelos) ? (obj.modelos as unknown[]) : [];
    const modelos = modelosCrudos
        .map((m) => texto(m))
        .filter(esModeloPermitido)
        .slice(0, 32);

    const revisoresCrudos = Array.isArray(obj.revisores) ? (obj.revisores as unknown[]) : [];
    const revisores: Array<[string, string]> = [];
    for (const r of revisoresCrudos) {
        if (esRevisorPermitido(r)) {
            const prov = (r[0] as string).trim().toLowerCase() as ProveedorPermitido;
            const modelo = (r[1] as string).trim();
            revisores.push([prov, modelo]);
        }
        if (revisores.length >= 8) break;
    }

    const cuposCrudos = obj.cuposRpm;
    const cupos: Record<string, number> = {};
    if (
        typeof cuposCrudos === "object" &&
        cuposCrudos !== null &&
        !Array.isArray(cuposCrudos)
    ) {
        for (const [clave, valor] of Object.entries(cuposCrudos as Record<string, unknown>)) {
            const prov = clave.trim().toLowerCase();
            if (!(PROVEEDORES_PERMITIDOS as readonly string[]).includes(prov)) continue;
            const n =
                typeof valor === "number" && Number.isFinite(valor)
                    ? Math.trunc(valor)
                    : Number.NaN;
            if (!Number.isFinite(n)) continue;
            cupos[prov] = Math.min(LIMITES.cupoMax, Math.max(LIMITES.cupoMin, n));
        }
    }

    return {
        workers: enteroEnRango(
            obj.workers,
            LIMITES.workersMin,
            LIMITES.workersMax,
            AJUSTES_POR_DEFECTO.workers,
        ),
        concurrenciaOpencode: enteroEnRango(
            obj.concurrenciaOpencode,
            LIMITES.concurrenciaMin,
            LIMITES.concurrenciaMax,
            AJUSTES_POR_DEFECTO.concurrenciaOpencode,
        ),
        modelos: modelos.length > 0 ? modelos : AJUSTES_POR_DEFECTO.modelos.slice(),
        revisores:
            revisores.length > 0
                ? revisores
                : AJUSTES_POR_DEFECTO.revisores.map((p) => [...p] as [string, string]),
        cuposRpm:
            Object.keys(cupos).length > 0 ? cupos : { ...AJUSTES_POR_DEFECTO.cuposRpm },
        revisionActiva:
            typeof obj.revisionActiva === "boolean"
                ? obj.revisionActiva
                : AJUSTES_POR_DEFECTO.revisionActiva,
    };
}
