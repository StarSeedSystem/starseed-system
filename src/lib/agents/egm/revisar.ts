import { TipoArtefacto, Objecion, Veredicto, promptDePez, leerObjeciones, veredicto } from "./peces";

export type { TipoArtefacto, Objecion, Veredicto };

export interface RevisarOpciones {
    tipo: TipoArtefacto;
    llamar: (modelo: string, prompt: string) => Promise<string>;
    modelos: string[];
    n?: number;
    plazoMs?: number;
}

export interface ResultadoRevisar {
    objeciones: Objecion[];
    veredicto: Veredicto;
    peces: string[];
    avisos: string[];
}

export async function revisarConPeces(
    artefacto: string,
    opciones: RevisarOpciones
): Promise<ResultadoRevisar & { pasa: boolean }> {
    const { tipo, llamar, modelos, n = 2, plazoMs = 5000 } = opciones;
    const pecesElegidos = modelos.slice(0, n);
    const objeciones: Objecion[] = [];
    const avisos: string[] = [];

    if (pecesElegidos.length === 0) {
        return { objeciones: [], veredicto: { pasa: true, bloqueantes: [] }, peces: [], avisos: ["sin peces"], pasa: true };
    }

    const promesas = pecesElegidos.map(async (modelo) => {
        try {
            const prompt = promptDePez(artefacto, tipo);
            
            const respuesta = await Promise.race([
                llamar(modelo, prompt),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), plazoMs))
            ]);

            const nuevasObjeciones = leerObjeciones(respuesta);
            return nuevasObjeciones;
        } catch (e) {
            avisos.push(`error al llamar a ${modelo}: ${e instanceof Error ? e.message : String(e)}`);
            return [];
        }
    });

    const resultados = await Promise.all(promesas);
    resultados.forEach((res) => objeciones.push(...res));

    const finalVeredicto = veredicto(objeciones);
    return {
        objeciones,
        veredicto: finalVeredicto,
        peces: pecesElegidos,
        avisos,
        pasa: finalVeredicto.pasa
    };
}
