/** Flota editorial del Mando y su salud real de generación (Olas 231 y 288c). */

export interface ModeloFlota {
    id: string;
    contexto?: number;
    latenciaMs?: number;
    gratis: boolean;
}

export interface GeneracionProveedor {
    probada: boolean;
    ok: boolean;
    ms: number | null;
    motivo: string;
    cuando: string | null;
}

export interface ProveedorFlota {
    id: string;
    nombre: string;
    papel: "escritor" | "revisor" | "ambos";
    modelos: ModeloFlota[];
    limiteRpm?: number;
    limiteDia?: number;
    usoHoy?: number;
    estado: "listo" | "agotado" | "sin-clave" | "desconocido";
    nota: string;
    generacion: GeneracionProveedor;
    modelosMudos: string[];
}

export type TonoProveedor = "ok" | "aviso" | "peligro" | "normal";

const SIN_SONDA: GeneracionProveedor = {
    probada: false,
    ok: false,
    ms: null,
    motivo: "",
    cuando: null,
};

interface ProveedorBase extends Omit<ProveedorFlota, "usoHoy" | "generacion" | "modelosMudos"> {
    aliasUso: string[];
    aliasSalud: string[];
}

const modelo = (id: string, contexto?: number): ModeloFlota => ({ id, contexto, gratis: true });

const BASE: ProveedorBase[] = [
    { id: "xkiro", nombre: "xKiro", papel: "ambos", modelos: [modelo("qwen3-coder-plus"), modelo("minimax-m3"), modelo("devstral-medium")], limiteDia: 5_000_000, estado: "listo", nota: "Escritor y revisor gratuito con tool-calling.", aliasUso: ["xkiro"], aliasSalud: ["xkiro"] },
    { id: "nvidia", nombre: "NVIDIA NIM", papel: "escritor", modelos: [modelo("moonshotai/kimi-k3"), modelo("deepseek-ai/deepseek-v4-flash")], limiteRpm: 40, estado: "listo", nota: "Escritor principal de relevo mediante NIM.", aliasUso: ["nim", "nvidia", "nvidia-nim"], aliasSalud: ["nim", "nvidia"] },
    { id: "aihubmix", nombre: "AIHubMix", papel: "revisor", modelos: [modelo("coding-glm-5.3-free"), modelo("gemini-3.7-flash-free")], estado: "listo", nota: "Revisor principal entre los proveedores gratuitos.", aliasUso: ["aihubmix"], aliasSalud: ["aihubmix"] },
    { id: "llm7", nombre: "LLM7.io", papel: "revisor", modelos: [modelo("gpt-oss"), modelo("minimax-m2.7")], limiteRpm: 10, estado: "listo", nota: "Revisor de respaldo disponible sin clave.", aliasUso: ["llm7"], aliasSalud: ["llm7"] },
    { id: "tokenrouter", nombre: "TokenRouter", papel: "revisor", modelos: [modelo("z-ai/glm-5.3-free")], estado: "desconocido", nota: "Relevo cuando hay una clave de inferencia válida.", aliasUso: ["tokenrouter"], aliasSalud: ["tokenrouter"] },
    { id: "openrouter", nombre: "OpenRouter · :free", papel: "revisor", modelos: [modelo("modelos :free")], limiteDia: 50, estado: "listo", nota: "Reserva gratuita con cupo diario reducido.", aliasUso: ["openrouter"], aliasSalud: ["openrouter"] },
    { id: "gemini", nombre: "Google Gemini", papel: "revisor", modelos: [modelo("flash-lite")], limiteRpm: 15, estado: "listo", nota: "Última reserva para conservar el cupo de Google.", aliasUso: ["gemini"], aliasSalud: ["gemini"] },
    { id: "freetheai", nombre: "FreeTheAi", papel: "revisor", modelos: [modelo("gpt-oss-120b")], limiteDia: 250, estado: "desconocido", nota: "Reserva comunitaria cuando existe una clave activa.", aliasUso: ["freetheai"], aliasSalud: ["freetheai"] },
];

function objeto(valor: unknown): Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor)
        ? valor as Record<string, unknown>
        : {};
}

function texto(valor: unknown): string | null {
    return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** 2026-09-08 · Ola 288c · F7: la ausencia del campo no equivale a una sonda fallida. */
function generacionDe(entrada: Record<string, unknown>): GeneracionProveedor {
    const generacion = objeto(entrada.generacion);
    const probada = generacion.probada === true || entrada.generacion_probada === true;
    const msBrutos = generacion.ms ?? entrada.generacion_ms;
    return {
        probada,
        ok: probada && (generacion.ok === true || entrada.generacion_ok === true),
        ms: typeof msBrutos === "number" && Number.isFinite(msBrutos) ? msBrutos : null,
        motivo: texto(generacion.motivo ?? entrada.generacion_motivo) ?? "",
        cuando: texto(generacion.cuando ?? entrada.generacion_cuando),
    };
}

function mudosDe(entrada: Record<string, unknown>): string[] {
    const valor = entrada.modelosMudos ?? entrada.modelos_mudos;
    return Array.isArray(valor)
        ? valor.filter((m): m is string => typeof m === "string" && Boolean(m.trim()))
        : [];
}

/** Verde solo cuando lista y genera; un modelo apartado mantiene el aviso visible. */
export function tonoDeProveedor(estado: ProveedorFlota): TonoProveedor {
    if (estado.estado === "agotado" || (estado.generacion.probada && !estado.generacion.ok)) {
        return "peligro";
    }
    if (estado.estado === "listo" && (!estado.generacion.probada || estado.modelosMudos.length > 0)) {
        return "aviso";
    }
    if (estado.estado === "listo" && estado.generacion.ok) return "ok";
    return "normal";
}

/** Conserva la firma histórica; `salud` es opcional para aceptar fotos anteriores a F5. */
export function flotaConocida(uso: Record<string, number> = {}, salud: unknown = null): ProveedorFlota[] {
    const foto = objeto(salud);
    return BASE.map(({ aliasUso, aliasSalud, ...proveedor }) => {
        const usoHoy = aliasUso.reduce((total, alias) => total + (uso[alias] ?? 0), 0);
        const entrada = aliasSalud
            .map((alias) => objeto(foto[alias]))
            .find((valor) => Object.keys(valor).length > 0) ?? {};
        const agotado = proveedor.limiteDia !== undefined && usoHoy >= proveedor.limiteDia;
        return {
            ...proveedor,
            usoHoy,
            estado: agotado ? "agotado" : proveedor.estado,
            generacion: Object.keys(entrada).length > 0 ? generacionDe(entrada) : { ...SIN_SONDA },
            modelosMudos: mudosDe(entrada),
        };
    });
}
