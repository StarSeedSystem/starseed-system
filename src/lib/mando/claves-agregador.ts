import { createHash } from "node:crypto";
import { type Confianza, enmascarar, reconocer } from "@/lib/mando/claves-forma";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";

export type { Confianza };

export type ResultadoIdentificacion = {
    proveedor: string;
    variable: string;
    confianza: Confianza;
    huella: string;
    mascara: string;
};

const VARS_CATALOGO = new Set(PROVEEDORES_CATALOGO.flatMap((p) => p.variables));
const RE_PASARELA = /^STARSEED_PASARELA_[A-Z0-9_]+$/;

export function variablePermitida(variable: string): boolean {
    if (!variable || typeof variable !== "string") return false;
    return VARS_CATALOGO.has(variable) || RE_PASARELA.test(variable);
}

export function huellaClaveSha256(clave: string): string {
    return createHash("sha256").update(clave).digest("hex").slice(0, 12);
}

export function identificarClaveEntrante(
    clave: string,
    variableManual?: string,
): ResultadoIdentificacion {
    const reconocida = reconocer(clave);
    let proveedor = reconocida.proveedor;
    let variable = reconocida.variable;
    let confianza = reconocida.confianza;

    if (variableManual && typeof variableManual === "string" && variablePermitida(variableManual)) {
        variable = variableManual;
        const provEncontrado = PROVEEDORES_CATALOGO.find((p) => p.variables.includes(variableManual));
        if (provEncontrado) {
            proveedor = provEncontrado.id;
            confianza = "alta";
        } else if (variableManual.startsWith("STARSEED_PASARELA_")) {
            proveedor = "pasarela";
            confianza = "alta";
        }
    }

    return {
        proveedor,
        variable,
        confianza,
        huella: huellaClaveSha256(clave),
        mascara: enmascarar(clave),
    };
}
