// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS · EGM · revisarConPeces · Ola 1104R
// ------------------------------------------------------------------------------
// Revisa un artefacto con N peces (modelos gratuitos) sin contexto.
// Módulo PURO: llama(modelo, prompt) → Promise<string> es INYECTADO.
// ════════════════════════════════════════════════════════════════════════════

import { leerObjeciones, promptDePez, veredicto, type Objecion, type TipoArtefacto, type Veredicto } from "./peces";

export interface ResultadoRevicion {
    objeciones: Objecion[];
    veredicto: Veredicto;
    peces: string[];
    avisos: string[];
}

export interface OpcionesRevicion {
    tipo: TipoArtefacto;
    llamar: (modelo: string, prompt: string) => Promise<string>;
    modelos: string[];
    n?: number;
    plazoMs?: number;
}

function tocarModelos(modelos: string[], n: number): string[] {
    if (modelos.length === 0) return [];
    const unicos = [...new Set(modelos)];
    const seleccion: string[] = [];
    for (const m of unicos) {
        if (seleccion.length >= n) break;
        seleccion.push(m);
    }
    return seleccion;
}

async function revisarConPez(
    modelo: string,
    artefacto: string,
    tipo: TipoArtefacto,
    llamar: (modelo: string, prompt: string) => Promise<string>,
    plazoMs: number,
): Promise<{ objeciones: Objecion[]; error?: string }> {
    const prompt = promptDePez(artefacto, tipo);
    try {
        const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error("Plazo superado")), plazoMs);
        });
        const modeloPromise = llamar(modelo, prompt);
        const texto = await Promise.race([modeloPromise, timeoutPromise]);
        const objeciones = leerObjeciones(texto);
        return { objeciones };
    } catch (e) {
        return { objeciones: [], error: e instanceof Error ? e.message : "Error desconocido" };
    }
}

export async function revisarConPeces(
    artefacto: string,
    opciones: OpcionesRevicion,
): Promise<ResultadoRevicion> {
    const { tipo, llamar, modelos, n = 2, plazoMs = 30000 } = opciones;
    const seleccion = tocarModelos(modelos, n);
    
    if (seleccion.length === 0) {
        return {
            objeciones: [],
            veredicto: veredicto([]),
            peces: [],
            avisos: ["sin peces"],
        };
    }

    const resultados = await Promise.all(
        seleccion.map(async (modelo) => {
            const resultado = await revisarConPez(modelo, artefacto, tipo, llamar, plazoMs);
            const aviso = resultado.error ? `Pez ${modelo} falló: ${resultado.error}` : undefined;
            return { modelo, ...resultado, aviso };
        }),
    );

    const avisos: string[] = [];
    const vistas = new Set<string>();
    const todosObjeciones: Objecion[] = [];
    for (const r of resultados) {
        if (r.aviso) avisos.push(r.aviso);
        for (const o of r.objeciones) {
            if (!vistas.has(o.texto)) {
                vistas.add(o.texto);
                todosObjeciones.push(o);
            }
        }
    }

    const veredictoFinal = veredicto(todosObjeciones);
    
    return {
        objeciones: todosObjeciones,
        veredicto: veredictoFinal,
        peces: seleccion,
        avisos,
    };
}