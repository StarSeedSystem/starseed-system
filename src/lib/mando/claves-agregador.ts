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

export interface MetadatoClaveConfigurada {
    proveedor: string;
    variable: string;
    presente: boolean;
    huella: string | null;
    mascara: string | null;
    estado: string;
}

const VARS_CATALOGO = new Set(PROVEEDORES_CATALOGO.flatMap((p) => p.variables));
const PROVEEDORES_PERMITIDOS = new Set(
    PROVEEDORES_CATALOGO.map((p) => p.id).concat(["pasarela", "otro", "desconocido"])
);
const RE_PASARELA = /^STARSEED_PASARELA_[A-Z0-9_]+$/;

export function variablePermitida(variable: string): boolean {
    if (!variable || typeof variable !== "string") return false;
    return VARS_CATALOGO.has(variable) || RE_PASARELA.test(variable);
}

export function proveedorPermitido(proveedor: string): boolean {
    if (!proveedor || typeof proveedor !== "string") return false;
    if (PROVEEDORES_PERMITIDOS.has(proveedor)) return true;
    return RE_PASARELA.test(proveedor);
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

export function obtenerResumenClavesConfiguradas(
    envVars: Record<string, string | undefined>,
    proveedores: Array<{ id: string; variables: string[]; estado?: string }>
): MetadatoClaveConfigurada[] {
    const resumen: MetadatoClaveConfigurada[] = [];
    const lista = proveedores.length > 0 ? proveedores : PROVEEDORES_CATALOGO;
    for (const p of lista) {
        for (const v of p.variables || []) {
            if (!variablePermitida(v)) continue;
            const val = envVars[v];
            const presente = typeof val === "string" && val.length > 0;
            resumen.push({
                proveedor: p.id,
                variable: v,
                presente,
                huella: presente ? huellaClaveSha256(val) : null,
                mascara: presente ? enmascarar(val) : null,
                estado: ("estado" in p ? p.estado : undefined) || "desconocido",
            });
        }
    }
    return resumen;
}
