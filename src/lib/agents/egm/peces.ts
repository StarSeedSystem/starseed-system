// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS · EGM · Peces (revisores sin contexto) · Ola 1104R
// ------------------------------------------------------------------------------
// Un "pez" es un revisor sin contexto que ve solo el artefacto (respuesta,
// plan, ola, página, app) y devuelve objeciones con gravedad. Módulo PURO,
// sin "use client" ni `node:*`: lo importan Astraura y la Protomolécula
// antes de una respuesta larga o creación.
// ════════════════════════════════════════════════════════════════════════════

export type TipoArtefacto = "respuesta" | "plan" | "ola" | "pagina" | "app";

export type GravedadObjecion = "bloquea" | "importa" | "menor";

export interface Objecion {
    gravedad: GravedadObjecion;
    texto: string;
}

export interface Veredicto {
    pasa: boolean;
    bloqueantes: Objecion[];
}

export function promptDePez(artefacto: string, tipo: TipoArtefacto): string {
    const premio = {
        respuesta: "respuesta larga o propuesta de creación",
        plan: "plan de implementación o estructura de proyecto",
        ola: "ola o tarea del enjambre",
        pagina: "página o publicación",
        app: "app o widget",
    }[tipo];
    return (
        `Eres un revisor "pez" de EGM: revisa este ${premio} SIN VER CONTEXTO.\n` +
        `\n` +
        `Artefacto:\n${artefacto}\n` +
        `\n` +
        `Responde SOLO con objeciones, una por línea, con este formato exacto:\n` +
        `bloquea| <texto>  (error crítico que impide avanzar)\n` +
        `importa| <texto>  (observación importante que requiere cambio)\n` +
        `menor| <texto>   (sugerencia o detalle que no es obligatorio)\n` +
        `\n` +
        `Si no hay objeciones, devuelve exactamente: ninguna| \n` +
        `No añadas explicaciones, no uses markdown, no uses listas.`
    );
}

export function leerObjeciones(texto: string): Objecion[] {
    const lineas = texto.split("\n").filter((l) => l.trim().length > 0);
    const vistas = new Set<string>();
    const resultado: Objecion[] = [];
    for (const linea of lineas) {
        const match = linea.match(/^(bloquea|importa|menor)\|\s*(.+)$/);
        if (!match) continue;
        const [, gravedad, objTexto] = match;
        const limpio = objTexto.trim();
        if (limpio.length === 0) continue;
        if (vistas.has(limpio)) continue;
        vistas.add(limpio);
        resultado.push({ gravedad: gravedad as GravedadObjecion, texto: limpio });
    }
    return resultado;
}

export function veredicto(objeciones: Objecion[]): Veredicto {
    const bloqueantes = objeciones.filter((o) => o.gravedad === "bloquea");
    return {
        pasa: bloqueantes.length === 0,
        bloqueantes,
    };
}