import { protegerMarcas } from "@/lib/traduccion/motor";

export interface EntradaTraductor {
    texto?: string;
    textos?: string[];
    origen?: "auto" | string;
    destino: string;
    tono?: "neutro" | "formal" | "cercano";
    contexto?: "chat" | "documento" | "voz";
}

export interface ResultadoTraductorHerramienta {
    traducciones: string[];
    origenDetectado: string | null;
    motor: string;
    local: boolean;
    aviso?: string;
}

export interface ErrorEjecucion {
    error: string;
}

export type ResultadoEjecucion = ResultadoTraductorHerramienta | ErrorEjecucion;

export interface ServicioTraductor {
    ejecutarTraductor: (entrada: EntradaTraductor) => Promise<ResultadoEjecucion>;
}

const MAX_TEXTO = 5000;
const MAX_TEXTOS = 20;
const MAX_CARACTERES = 5000;

export function validarEntradaTraductor(entrada: EntradaTraductor): { valido: boolean; error?: string } {
    const tieneTexto = entrada.texto !== undefined || entrada.textos !== undefined;
    if (!tieneTexto) {
        return { valido: false, error: "Debe proporcionar 'texto' o 'textos'" };
    }
    if (entrada.texto !== undefined && entrada.textos !== undefined) {
        return { valido: false, error: "No puede proporcionar ambos 'texto' y 'textos'" };
    }
    if (!entrada.destino || typeof entrada.destino !== "string") {
        return { valido: false, error: "'destino' es obligatorio y debe ser un código de idioma válido" };
    }
    const destinoNormalizado = entrada.destino.toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(destinoNormalizado)) {
        return { valido: false, error: "'destino' debe ser un código de idioma válido (ej: 'es', 'en', 'fr')" };
    }
    if (entrada.origen !== undefined && entrada.origen !== "auto") {
        if (typeof entrada.origen !== "string" || entrada.origen.length !== 2) {
            return { valido: false, error: "'origen' debe ser 'auto' o un código de idioma de 2 letras" };
        }
    }
    if (entrada.textos !== undefined) {
        if (!Array.isArray(entrada.textos)) {
            return { valido: false, error: "'textos' debe ser un array" };
        }
        if (entrada.textos.length > MAX_TEXTOS) {
            return { valido: false, error: `máximo ${MAX_TEXTOS} textos` };
        }
        const total = entrada.textos.join(" ").length;
        if (total > MAX_CARACTERES) {
            return { valido: false, error: `el total de caracteres no puede exceder ${MAX_CARACTERES}` };
        }
    }
    if (entrada.texto !== undefined) {
        if (entrada.texto.length > MAX_TEXTO) {
            return { valido: false, error: `el texto no puede exceder ${MAX_TEXTO} caracteres` };
        }
    }
    return { valido: true };
}

function obtenerTextos(entrada: EntradaTraductor): string[] {
    if (entrada.texto !== undefined) {
        return [entrada.texto];
    }
    return entrada.textos ?? [];
}

function normalizarOrigen(origen: "auto" | string | undefined, texto: string): string {
    if (origen === "auto" || origen === undefined) {
        return "auto";
    }
    return origen.toLowerCase().replace(/\s+/g, "-");
}

export async function ejecutarTraductor(
    entrada: EntradaTraductor,
    servicio: ServicioTraductor
): Promise<ResultadoEjecucion> {
    const validado = validarEntradaTraductor(entrada);
    if (!validado.valido) {
        return { error: validado.error ?? "Entrada inválida" };
    }
    return servicio.ejecutarTraductor(entrada);
}

export async function ejecutarTraductorConServicio(
    entrada: EntradaTraductor,
    traducirFn: (textos: string[], origen: string, destino: string) => Promise<string[]>
): Promise<ResultadoEjecucion> {
    const validado = validarEntradaTraductor(entrada);
    if (!validado.valido) {
        return { error: validado.error ?? "Entrada inválida" };
    }
    
    const textos = obtenerTextos(entrada);
    const origen = normalizarOrigen(entrada.origen, textos.join(" "));
    const destino = entrada.destino.toLowerCase().replace(/\s+/g, "-");
    
    if (origen !== "auto" && origen === destino) {
        return {
            traducciones: textos,
            origenDetectado: origen,
            motor: "sin-cambio",
            local: true,
            aviso: "El idioma de origen y destino coinciden"
        };
    }
    
    const textosProtegidos = textos.map((t) => protegerMarcas(t).texto);
    
    const traducciones = await traducirFn(textosProtegidos, origen, destino);
    
    const resultadoConRestauracion = traducciones.map((t, i) => {
        const marcas = protegerMarcas(textos[i]).marcas;
        return protegerMarcas(t).marcas.length > 0
            ? t.replace(/⟦M\d+⟧/g, (_, num) => marcas[Number(num) - 1] ?? _)
            : t;
    });
    
    return {
        traducciones: resultadoConRestauracion,
        origenDetectado: origen === "auto" ? null : origen,
        motor: "servicio-personalizado",
        local: true,
        aviso: origen === "auto" ? "idioma detectado automáticamente" : undefined
    };
}

export function descripcionHerramienta(): {
    nombre: string;
    descripcion: string;
    esquema: {
        tipo: "object";
        propiedades: Record<string, unknown>;
        required: string[];
    };
} {
    return {
        nombre: "traducir",
        descripcion: "Traduce texto entre idiomas usando Astraura 1.58-bit o motores gratuitos. Soporta traducción en bloque, detección automática de idioma y múltiples niveles de calidad (estudio/alta/ligera/mínima). No traduce nombres propios ni bloques de código.",
        esquema: {
            tipo: "object",
            propiedades: {
                texto: {
                    tipo: "string",
                    descripcion: "Texto a traducir (máximo 5000 caracteres)"
                },
                textos: {
                    tipo: "array",
                    items: { tipo: "string" },
                    descripcion: "Array de textos a traducir (máximo 20 textos, ≤5000 caracteres en total)"
                },
                origen: {
                    tipo: "string",
                    enum: ["auto"],
                    description: "Auto-detectar idioma de origen"
                },
                destino: {
                    tipo: "string",
                    descripcion: "Código ISO 639-1 del idioma destino (ej: 'es', 'en', 'fr')"
                },
                tono: {
                    tipo: "string",
                    enum: ["neutro", "formal", "cercano"],
                    descripcion: "Tono de la traducción"
                },
                contexto: {
                    tipo: "string",
                    enum: ["chat", "documento", "voz"],
                    descripcion: "Contexto de uso: chat, documento o voz"
                }
            },
            required: ["destino"]
        }
    };
}