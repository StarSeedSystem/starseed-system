// REGLA FUNDAMENTAL: El valor de una clave no se registra, no se manda en un evento,
// no se guarda en una memoria y no vuelve al navegador jamás. Solo viajan el nombre
// de la variable, la huella y la máscara.

export type Confianza = "alta" | "media" | "ninguna";

export type Reconocida = {
    proveedor: string;
    variable: string;
    confianza: Confianza;
};

const PREFIJOS: Record<string, { proveedor: string; variable: string; confianza: Confianza }> = {
    "gsk_": { proveedor: "groq", variable: "GROQ_API_KEY", confianza: "alta" },
    "xai-": { proveedor: "xai", variable: "XAI_API_KEY", confianza: "alta" },
    "nvapi-": { proveedor: "nvidia", variable: "NVIDIA_API_KEY", confianza: "alta" },
    "sk-or-": { proveedor: "openrouter", variable: "OPENROUTER_API_KEY", confianza: "alta" },
};

export function reconocer(clave: string): Reconocida {
    for (const [prefijo, info] of Object.entries(PREFIJOS)) {
        if (clave.startsWith(prefijo)) {
            return {
                proveedor: info.proveedor,
                variable: info.variable,
                confianza: info.confianza,
            };
        }
    }

    if (clave.startsWith("sk-")) {
        return {
            proveedor: "otro",
            variable: "API_KEY",
            confianza: "media",
        };
    }

    return {
        proveedor: "desconocido",
        variable: "API_KEY",
        confianza: "ninguna",
    };
}

export function enmascarar(clave: string): string {
    if (clave.length < 10) {
        return clave.length > 8 ? clave.slice(0, 4) + "***" + clave.slice(-4) : "****";
    }
    return clave.slice(0, 4) + "*".repeat(clave.length - 8) + clave.slice(-4);
}