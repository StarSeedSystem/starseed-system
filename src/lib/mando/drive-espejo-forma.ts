export type NivelEstadoEspejo = "ok" | "atrasado" | "sin-espejo" | "invalida";

export interface EstadoEspejoForma {
    nivel: NivelEstadoEspejo;
    etiqueta: string;
    cuando: string;
}

export function interpretarEstadoEspejo(
    ultimoEspejo: string | null,
    ahora: number,
): EstadoEspejoForma {
    if (!ultimoEspejo) {
        return {
            nivel: "sin-espejo",
            etiqueta: "Sin espejo todavía",
            cuando: "nunca",
        };
    }

    const instante = Date.parse(ultimoEspejo);
    if (!Number.isFinite(instante) || !Number.isFinite(ahora) || instante > ahora) {
        return {
            nivel: "invalida",
            etiqueta: "Fecha inválida",
            cuando: instante > ahora ? "reloj desincronizado" : "sin fecha legible",
        };
    }

    const minutos = Math.floor((ahora - instante) / 60_000);
    if (minutos < 1) {
        return { nivel: "ok", etiqueta: "Espejo al día", cuando: "ahora" };
    }
    if (minutos < 60) {
        return { nivel: "ok", etiqueta: "Espejo al día", cuando: `hace ${minutos} min` };
    }

    const horas = Math.floor(minutos / 60);
    if (horas < 24) {
        return { nivel: "ok", etiqueta: "Espejo al día", cuando: `hace ${horas} h` };
    }
    if (horas < 48) {
        return { nivel: "ok", etiqueta: "Espejo al día", cuando: "ayer" };
    }
    return {
        nivel: "atrasado",
        etiqueta: "Espejo atrasado",
        cuando: `hace ${Math.floor(horas / 24)} días`,
    };
}
