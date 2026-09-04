/**
 * Flota de proveedores de inteligencia (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo ESTÁTICO de los proveedores reales que sostienen la orquestación
 * multiagéntica, con su papel en la cadena de relevo y su cuota conocida.
 * No duplica el catálogo de Aurora (`src/ai/astraura/free-catalog.ts`): esto
 * es la vista de MANDO (quién escribe, quién revisa y cuánto le queda hoy),
 * alineada con `memory/orquestacion-economica.md`.
 *
 * Regla del área: gratis primero, relevo automático ante 429/402 y ningún
 * proveedor debe agotarse. Este módulo solo DECLARA: el estado «agotado» se
 * deriva del uso diario real que llega como argumento.
 */

/** Un modelo expuesto por un proveedor de la flota. */
export interface ModeloFlota {
    id: string;
    /** Ventana de contexto aproximada (tokens). */
    contexto?: number;
    /** Latencia medida en milisegundos (si se conoce). */
    latenciaMs?: number;
    /** ¿No cuesta créditos? */
    gratis: boolean;
}

/** Un proveedor de inteligencia de la flota de orquestación. */
export interface ProveedorFlota {
    id: string;
    nombre: string;
    /** Papel en la cadena: escribe código, revisa el de otros, o ambos. */
    papel: "escritor" | "revisor" | "ambos";
    modelos: ModeloFlota[];
    /** Peticiones por minuto conocidas (si el proveedor las publica). */
    limiteRpm?: number;
    /** Peticiones/créditos disponibles por día (si se conocen). */
    limiteDia?: number;
    /** Uso real de hoy (lo rellena `flotaConocida`). */
    usoHoy?: number;
    estado: "listo" | "agotado" | "sin-clave" | "desconocido";
    /** Por qué ocupa este puesto en la cadena de relevo. */
    nota: string;
}

/**
 * Alias que puede usar `uso-diario.json` para cada proveedor de la flota. El
 * balancín (`starseed-sub`) guarda el uso por nombre corto de motor, no por id
 * de la flota: aquí se traducen ambos mundos.
 */
const ALIAS_USO: Record<string, string[]> = {
    nvidia: ["nim", "nvidia", "nvidia-nim"],
    aihubmix: ["aihubmix"],
    tokenrouter: ["tokenrouter", "token-router"],
    openrouter: ["openrouter", "hermes"],
    gemini: ["gemini", "gemini-flash-lite"],
    "astraura-local": ["astraura-158-local", "astraura-local"],
    "astraura-nube": ["astraura-158-nube", "astraura-nube"],
};

/** La flota real del sistema, en orden de preferencia dentro de la cadena. */
const FLOTA: ProveedorFlota[] = [
    {
        id: "astraura-local",
        nombre: "Astraura 1.58-bit · local",
        papel: "ambos",
        estado: "listo",
        modelos: [
            { id: "astraura-158/auto", contexto: 4096, gratis: true },
            { id: "astraura-158/astraura_prime", contexto: 4096, gratis: true },
            { id: "astraura-158/hermione", contexto: 4096, gratis: true },
        ],
        nota: "Sistema PRIMARIO soberano (BitNet ternario en esta neurona): nunca gasta créditos y nunca se agota. Todo lo demás es secundario.",
    },
    {
        id: "nvidia",
        nombre: "NVIDIA NIM",
        papel: "escritor",
        estado: "listo",
        limiteRpm: 40,
        modelos: [
            { id: "moonshotai/kimi-k3", contexto: 256000, gratis: true },
            { id: "deepseek-ai/deepseek-v4-flash-0731", contexto: 128000, gratis: true },
            { id: "openai/gpt-oss-120b", contexto: 128000, gratis: true },
            { id: "nvidia/nemotron-3.5-lightning-30b-a3b", contexto: 131072, latenciaMs: 900, gratis: true },
            { id: "nvidia/nemotron-3-super-120b-a12b", contexto: 1000000, gratis: true },
        ],
        nota: "Escritor principal: 82 modelos gratis con clave comunitaria (NVIDIA_SHARED_KEY). El límite es por minuto, no por día: tras un 429 se retoma en segundos.",
    },
    {
        id: "aihubmix",
        nombre: "AIHubMix",
        papel: "revisor",
        estado: "listo",
        modelos: [
            { id: "reviewer-auto", gratis: true },
        ],
        nota: "Revisor principal de la flota: 412 modelos, 54 de ellos gratuitos, con clave AIHUBMIX_API_KEY. Revisa lo que escribe NVIDIA NIM.",
    },
    {
        id: "tokenrouter",
        nombre: "TokenRouter",
        papel: "ambos",
        estado: "listo",
        modelos: [
            { id: "z-ai/glm-5.3-free", contexto: 131072, gratis: true },
        ],
        nota: "Relevo gratuito intermedio: entra cuando el escritor principal se enfría o la revisión necesita segunda opinión sin gastar.",
    },
    {
        id: "openrouter",
        nombre: "OpenRouter · :free",
        papel: "ambos",
        estado: "listo",
        limiteDia: 50,
        modelos: [
            { id: "openrouter/free", gratis: true },
            { id: "tencent/hy3:free", contexto: 262144, gratis: true },
            { id: "qwen/qwen3-next-80b-a3b-instruct:free", contexto: 262144, gratis: true },
            { id: "meta-llama/llama-3.3-70b-instruct:free", contexto: 131072, gratis: true },
        ],
        nota: "Red de subagentes «Hermes» y relevo general: 50 peticiones al día con la clave comunitaria (proxy /api/ai/openrouter, solo modelos :free).",
    },
    {
        id: "gemini",
        nombre: "Gemini · flash-lite",
        papel: "ambos",
        estado: "listo",
        limiteDia: 1000,
        modelos: [
            { id: "gemini-2.5-flash-lite", contexto: 1000000, gratis: true },
        ],
        nota: "Reserva de largo aliento: ~1.000 peticiones al día, última red de nube antes de volver siempre al sistema primario local.",
    },
    {
        id: "astraura-nube",
        nombre: "Astraura 1.58-bit · nube",
        papel: "ambos",
        estado: "desconocido",
        modelos: [
            { id: "astraura-158/auto", contexto: 4096, gratis: true },
        ],
        nota: "El mismo sistema primario desplegado (ASTRAURA_CLOUD_URL → túnel → fuentes libres). Estado sin verificar desde este panel.",
    },
];

/** Suma el uso del día de un proveedor a partir de sus alias conocidos. */
function usoDe(alias: string[], uso: Record<string, number>): number {
    let total = 0;
    for (const clave of alias) {
        const valor = uso[clave];
        if (typeof valor === "number" && Number.isFinite(valor)) total += valor;
    }
    return total;
}

/**
 * Cruza la flota conocida con el uso real del día
 * (`Record<nombreMotor, peticiones>`, salido de `leerUsoDiario`) y marca
 * `agotado` a quien ya superó su límite diario conocido.
 */
export function flotaConocida(uso: Record<string, number>): ProveedorFlota[] {
    return FLOTA.map((proveedor) => {
        const usoHoy = usoDe(ALIAS_USO[proveedor.id] ?? [], uso);
        let estado = proveedor.estado;
        if (
            proveedor.limiteDia !== undefined &&
            proveedor.limiteDia > 0 &&
            usoHoy >= proveedor.limiteDia
        ) {
            estado = "agotado";
        }
        return { ...proveedor, usoHoy, estado };
    });
}
