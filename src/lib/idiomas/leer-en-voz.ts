export interface EntornoVoz {
    synth?: SpeechSynthesis;
    Utter?: typeof SpeechSynthesisUtterance;
}

export interface ResultadoLectura {
    ok: boolean;
    voz?: string;
    motivo?: string;
}

let utteranceActual: SpeechSynthesisUtterance | null = null;

export function leerEnVoz(
    texto: string,
    idioma: string | null,
    entorno: EntornoVoz
): ResultadoLectura {
    if (!entorno.synth) {
        return { ok: false, motivo: "Este aparato no tiene síntesis de voz" };
    }

    if (idioma === null) {
        return { ok: false, motivo: "Elige el idioma" };
    }

    const voces = entorno.synth.getVoices();
    if (!voces.length) {
        return { ok: false, motivo: `No hay una voz instalada para ${idioma} en este aparato` };
    }

    let vozSeleccionada: SpeechSynthesisVoice | null = null;

    for (const voz of voces) {
        if (voz.lang.toLowerCase() === idioma.toLowerCase()) {
            vozSeleccionada = voz;
            break;
        }
    }

    if (!vozSeleccionada) {
        const prefijo = idioma.slice(0, 2).toLowerCase();
        for (const voz of voces) {
            if (voz.lang.toLowerCase().startsWith(prefijo)) {
                vozSeleccionada = voz;
                break;
            }
        }
    }

    if (!vozSeleccionada) {
        return { ok: false, motivo: `No hay una voz instalada para ${idioma} en este aparato` };
    }

    if (utteranceActual) {
        entorno.synth.cancel();
        utteranceActual = null;
    }

    const textoRecortado = texto.slice(0, 2000);

    if (!entorno.Utter) {
        return { ok: false, motivo: "Este aparato no tiene síntesis de voz" };
    }

    const utterance = new entorno.Utter(textoRecortado);
    utterance.lang = vozSeleccionada.lang;
    utterance.voice = vozSeleccionada;

    utterance.onend = () => {
        if (utteranceActual === utterance) {
            utteranceActual = null;
        }
    };

    utteranceActual = utterance;
    entorno.synth.speak(utterance);

    return { ok: true, voz: vozSeleccionada.name };
}

export function detener(entorno: EntornoVoz): void {
    if (entorno.synth && utteranceActual) {
        entorno.synth.cancel();
        utteranceActual = null;
    }
}