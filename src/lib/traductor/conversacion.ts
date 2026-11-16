/**
 * TU15 · Conversación por voz en dos sentidos: máquina de turnos con latencia visible
 * ─────────────────────────────────────────────────────────────────────────────
 * Máquina de estados pura (reloj inyectado): dos hablantes A y B, cada uno con su idioma.
 * Estados: inactivo → escuchando(X) → traduciendo(X) → hablando(Y) → escuchando(Y)…
 * Eventos: pulsarHablar(X), resultadoParcial(texto), resultadoFinal(texto),
 *          traduccionLista(res), finDeVoz(), error(motivo).
 * Cada turno guarda {quien, texto, traduccion, msReconocer, msTraducir, msHablar}
 * para que la pantalla muestre "traduciendo…" y las cifras reales.
 * Un turno nunca empieza mientras el anterior habla (evita el eco).
 * Si algún paso no está disponible (sin reconocimiento o sin voz de destino)
 * el turno sigue como texto y lo dice.
 */

export type Hablante = "A" | "B";

export interface ConfigConversacion {
    readonly idiomaA: string;
    readonly idiomaB: string;
    readonly reconocimientoDisponible: boolean;
    readonly vozDestinoDisponible: (hablante: Hablante) => boolean;
}

export type EstadoConversacion =
    | { readonly tipo: "inactivo" }
    | { readonly tipo: "escuchando"; readonly quien: Hablante; readonly inicioMs: number }
    | { readonly tipo: "traduciendo"; readonly quien: Hablante; readonly texto: string; readonly inicioMs: number; readonly msReconocer: number }
    | { readonly tipo: "hablando"; readonly quien: Hablante; readonly texto: string; readonly traduccion: string; readonly inicioMs: number; readonly msReconocer: number; readonly msTraducir: number }
    | { readonly tipo: "error"; readonly motivo: string; readonly estadoAnterior: EstadoConversacion };

export interface Turno {
    readonly quien: Hablante;
    readonly texto: string;
    readonly traduccion: string;
    readonly msReconocer: number;
    readonly msTraducir: number;
    readonly msHablar: number;
}

export interface SalidaConversacion {
    readonly estado: EstadoConversacion;
    readonly turnos: readonly Turno[];
    readonly accion?: "hablar" | "traducir" | "escuchar" | "mostrar-error";
    readonly payload?: { texto: string; idioma: string };
}

export interface Reloj {
    ahora(): number;
}

function crearRelojSistema(): Reloj {
    return { ahora: () => Date.now() };
}

export function crearMaquinaConversacion(
    config: ConfigConversacion,
    reloj: Reloj = crearRelojSistema()
): {
    readonly estado: () => EstadoConversacion;
    readonly turnos: () => readonly Turno[];
    readonly pulsarHablar: (quien: Hablante) => SalidaConversacion;
    readonly resultadoParcial: (texto: string) => SalidaConversacion;
    readonly resultadoFinal: (texto: string) => SalidaConversacion;
    readonly traduccionLista: (res: { texto: string; ms: number }) => SalidaConversacion;
    readonly finDeVoz: () => SalidaConversacion;
    readonly error: (motivo: string) => SalidaConversacion;
    readonly reiniciar: () => void;
} {
    let estado: EstadoConversacion = { tipo: "inactivo" };
    const turnos: Turno[] = [];
    let turnoActual: Partial<Omit<Turno, "msHablar">> & { msHablar?: number } = {};
    let colaHablar: Hablante | null = null;

    function obtenerIdioma(quien: Hablante): string {
        return quien === "A" ? config.idiomaA : config.idiomaB;
    }

    function obtenerOtro(quien: Hablante): Hablante {
        return quien === "A" ? "B" : "A";
    }

    function estadoActual(): EstadoConversacion {
        return estado;
    }

    function turnosActuales(): readonly Turno[] {
        return turnos;
    }

    function transicion(nuevoEstado: EstadoConversacion): void {
        estado = nuevoEstado;
    }

    function emitir(accion: SalidaConversacion["accion"], payload?: SalidaConversacion["payload"]): SalidaConversacion {
        return {
            estado: estadoActual(),
            turnos: turnosActuales(),
            accion,
            payload,
        };
    }

    function procesarCola(): SalidaConversacion {
        if (colaHablar !== null) {
            const siguiente = colaHablar;
            colaHablar = null;
            return pulsarHablar(siguiente);
        }
        return emitir(undefined);
    }

    function pulsarHablar(quien: Hablante): SalidaConversacion {
        const ahora = reloj.ahora();

        // Si estamos hablando, encolar
        if (estado.tipo === "hablando") {
            colaHablar = quien;
            return emitir(undefined);
        }

        // Si estamos en error, no hacer nada
        if (estado.tipo === "error") {
            return emitir(undefined);
        }

        // Si ya estamos escuchando a alguien, ignorar
        if (estado.tipo === "escuchando" || estado.tipo === "traduciendo") {
            return emitir(undefined);
        }

        // Verificar si hay reconocimiento disponible
        if (!config.reconocimientoDisponible) {
            // Sin reconocimiento: saltar directamente a traduciendo con texto vacío
            // (en la práctica la UI debería manejar esto, pero la máquina lo soporta)
            const texto = "";
            const msReconocer = 0;
            turnoActual = { quien, texto, msReconocer };
            transicion({ tipo: "traduciendo", quien, texto, inicioMs: ahora, msReconocer });
            return emitir("traducir", { texto, idioma: obtenerIdioma(obtenerOtro(quien)) });
        }

        // Iniciar escucha
        turnoActual = { quien, inicioMs: ahora };
        transicion({ tipo: "escuchando", quien, inicioMs: ahora });
        return emitir("escuchar", { texto: "", idioma: obtenerIdioma(quien) });
    }

    function resultadoParcial(texto: string): SalidaConversacion {
        if (estado.tipo !== "escuchando") {
            return emitir(undefined);
        }
        // Actualizar texto parcial (la UI lo muestra)
        turnoActual.texto = texto;
        return emitir(undefined);
    }

    function resultadoFinal(texto: string): SalidaConversacion {
        if (estado.tipo !== "escuchando") {
            return emitir(undefined);
        }

        const ahora = reloj.ahora();
        const msReconocer = ahora - (turnoActual.inicioMs ?? ahora);
        const quien = estado.quien;

        turnoActual = { ...turnoActual, quien, texto, msReconocer };

        // Verificar si hay voz de destino disponible
        const oyente = obtenerOtro(quien);
        if (!config.vozDestinoDisponible(oyente)) {
            // Sin voz de destino: el turno sigue como texto y lo dice en el idioma original
            const msTraducir = 0;
            turnoActual = { ...turnoActual, traduccion: texto, msTraducir };
            transicion({
                tipo: "hablando",
                quien,
                texto,
                traduccion: texto,
                inicioMs: ahora,
                msReconocer,
                msTraducir,
            });
            return emitir("hablar", { texto, idioma: obtenerIdioma(quien) });
        }

        // Hay voz de destino: ir a traduciendo
        transicion({ tipo: "traduciendo", quien, texto, inicioMs: ahora, msReconocer });
        return emitir("traducir", { texto, idioma: obtenerIdioma(oyente) });
    }

    function traduccionLista(res: { texto: string; ms: number }): SalidaConversacion {
        if (estado.tipo !== "traduciendo") {
            return emitir(undefined);
        }

        const ahora = reloj.ahora();
        const msTraducir = res.ms;
        const quien = estado.quien;
        const textoOriginal = estado.texto;

        turnoActual = { ...turnoActual, traduccion: res.texto, msTraducir };
        transicion({
            tipo: "hablando",
            quien,
            texto: textoOriginal,
            traduccion: res.texto,
            inicioMs: ahora,
            msReconocer: estado.msReconocer,
            msTraducir,
        });

        const oyente = obtenerOtro(quien);
        return emitir("hablar", { texto: res.texto, idioma: obtenerIdioma(oyente) });
    }

    function finDeVoz(): SalidaConversacion {
        if (estado.tipo !== "hablando") {
            return emitir(undefined);
        }

        const ahora = reloj.ahora();
        const msHablar = ahora - estado.inicioMs;
        const turnoCompleto: Turno = {
            quien: estado.quien,
            texto: estado.texto,
            traduccion: estado.traduccion,
            msReconocer: estado.msReconocer,
            msTraducir: estado.msTraducir,
            msHablar,
        };

        turnos.push(turnoCompleto);

        // Cambiar al oyente - preparar turnoActual para el siguiente hablante
        const siguiente = obtenerOtro(estado.quien);
        turnoActual = { quien: siguiente, inicioMs: ahora };
        transicion({ tipo: "escuchando", quien: siguiente, inicioMs: ahora });

        return emitir("escuchar", { texto: "", idioma: obtenerIdioma(siguiente) });
    }

    function error(motivo: string): SalidaConversacion {
        const estadoAnterior = estado;
        transicion({ tipo: "error", motivo, estadoAnterior });
        return emitir("mostrar-error", { texto: motivo, idioma: "es" });
    }

    function reiniciar(): void {
        estado = { tipo: "inactivo" };
        turnos.length = 0;
        turnoActual = {};
        colaHablar = null;
    }

    return {
        estado: estadoActual,
        turnos: turnosActuales,
        pulsarHablar,
        resultadoParcial,
        resultadoFinal,
        traduccionLista,
        finDeVoz,
        error,
        reiniciar,
    };
}

export type MaquinaConversacion = ReturnType<typeof crearMaquinaConversacion>;