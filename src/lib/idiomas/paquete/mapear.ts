import { normalizarTexto } from "../catalogo";

export interface ResultadoMapeo {
    entradas: Record<string, string>;
    casadas: number;
    sinCasar: string[];
    porcentaje: number;
}

function pareceIdentificador(clave: string): boolean {
    return /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(clave);
}

function normalizarParaComparar(t: string): string {
    return t.toLowerCase().replace(/[.,;:!?¿¡]+$/, "").trim();
}

function extraerClavesFuente(fuente: Record<string, unknown> | string[]): string[] {
    if (Array.isArray(fuente)) {
        return fuente.map((c) => normalizarTexto(String(c)));
    }
    return Object.keys(fuente).map((c) => normalizarTexto(c));
}

function extraerValoresFuente(fuente: Record<string, unknown> | string[]): string[] {
    if (Array.isArray(fuente)) {
        return [];
    }
    return Object.values(fuente)
        .filter((v): v is string => typeof v === "string")
        .map((v) => normalizarParaComparar(v));
}

export function mapearClaves(
    importadas: Record<string, string>,
    fuente: Record<string, unknown> | string[]
): ResultadoMapeo {
    const clavesFuente = extraerClavesFuente(fuente);
    const valoresFuente = extraerValoresFuente(fuente);

    const clavesFuenteNormalizadas = new Set(clavesFuente);
    const valoresFuenteNormalizados = new Set(valoresFuente);

    const entradas: Record<string, string> = {};
    const sinCasar: string[] = [];
    let casadas = 0;

    for (const [claveImportada, valorImportado] of Object.entries(importadas)) {
        const claveNormalizada = normalizarTexto(claveImportada);
        const valorNormalizado = normalizarParaComparar(valorImportado);

        let casa = false;

        if (clavesFuenteNormalizadas.has(claveNormalizada)) {
            casa = true;
        } else if (pareceIdentificador(claveImportada)) {
            const ultimaParte = claveImportada.split(".").pop() ?? "";
            const ultimaNormalizada = normalizarTexto(ultimaParte);
            if (clavesFuenteNormalizadas.has(ultimaNormalizada)) {
                casa = true;
            }
        }

        if (!casa && valoresFuenteNormalizados.has(valorNormalizado)) {
            casa = true;
        }

        if (casa) {
            entradas[claveImportada] = valorImportado;
            casadas++;
        } else {
            if (sinCasar.length < 200) {
                sinCasar.push(claveImportada);
            }
        }
    }

    const total = Object.keys(importadas).length;
    const porcentaje = total === 0 ? 0 : Math.round((casadas / total) * 100);

    return { entradas, casadas, sinCasar, porcentaje };
}