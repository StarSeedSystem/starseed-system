/**
 * Banco de llamadas · «alguien contestó o colgó a mano» (ORD1114Q · ronda-automatica-llamadas.md §4 regla 5).
 *
 * Durante una serie guionizada, la app sabe qué hace el guion: cada acción del guion (`contestar`, `llamar`,
 * `colgar`, en `control-remoto/ejecutores.ts`) se ESPERA aquí antes de hacerse. Lo que cambia en las
 * llamadas de este aparato sin haberse esperado es de una persona:
 *   · aparece una llamada activa sin un `contestar`/`llamar` esperado → «contesto» (o «llamo»);
 *   · la llamada termina con el motivo del botón «Colgar» de la ventana (`colgarLlamada()` sin motivo →
 *     «Has salido de la llamada.») sin un `colgar` esperado → «colgo». El guion cuelga con motivo «orden»,
 *     y un cuelgue del OTRO lado trae otro motivo: ninguno de los dos se toma por una persona.
 * Un rechazo a mano no se distingue hoy de que quien llama corte: no se detecta (lo dice el informe).
 *
 * Puro: el estado de llamadas y el reloj entran por argumento. `vigilarLlamadas` lo monta sobre el store.
 */

export const MOTIVO_BOTON_COLGAR = "Has salido de la llamada.";
export const VENTANA_ESPERA_MS = 8_000;

export type AccionGuion = "contestar" | "llamar" | "colgar";
export type Intervencion = "contesto" | "llamo" | "colgo";

export interface FotoLlamadas {
    /** Id de la llamada activa (o null). */
    activa: string | null;
    /** Fase del motor de la activa («terminada» al colgar). */
    fase: string | null;
    motivoFin: string | null;
    /** Ids de los timbres que suenan. */
    timbres: string[];
}

export class VigiaMano {
    private esperadas: Array<{ a: AccionGuion; t: number }> = [];
    private previa: FotoLlamadas | null = null;

    /** El guion va a hacer `a` ahora mismo. */
    esperar(a: AccionGuion, ahora: number): void {
        this.esperadas = this.esperadas.filter((x) => ahora - x.t < VENTANA_ESPERA_MS);
        this.esperadas.push({ a, t: ahora });
    }

    private consumir(acciones: AccionGuion[], ahora: number): boolean {
        const i = this.esperadas.findIndex((x) => acciones.includes(x.a) && ahora - x.t < VENTANA_ESPERA_MS);
        if (i < 0) return false;
        this.esperadas.splice(i, 1);
        return true;
    }

    /** Compara con la foto anterior. Devuelve la intervención de una persona, o null. */
    observar(f: FotoLlamadas, ahora: number): Intervencion | null {
        const p = this.previa;
        this.previa = { ...f, timbres: [...f.timbres] };
        if (!p) return null;
        if (f.activa && f.activa !== p.activa && f.fase !== "terminada") {
            if (this.consumir(["contestar", "llamar"], ahora)) return null;
            return p.timbres.includes(f.activa) ? "contesto" : "llamo";
        }
        if (p.activa && p.fase !== "terminada" && (f.fase === "terminada" || f.activa !== p.activa)) {
            const porBoton = f.fase === "terminada" && f.activa === p.activa && f.motivoFin === MOTIVO_BOTON_COLGAR;
            if (this.consumir(["colgar"], ahora)) return null;
            return porBoton ? "colgo" : null;
        }
        return null;
    }
}

/** El vigía de ESTE aparato (lo comparten el actor del banco y la puerta del control). */
export const vigiaMano = new VigiaMano();

/** Foto del store de llamadas (sin importarlo de forma estática: cuelga del montaje global). */
export async function fotoLlamadas(): Promise<FotoLlamadas> {
    const { leerLlamadas } = await import("@/lib/llamadas/store");
    const e = leerLlamadas();
    const a = e.activa as { sesionId?: string; motor?: { estado?: () => { fase?: string; motivoFin?: string | null } } } | null;
    const est = a?.motor?.estado?.() ?? null;
    return {
        activa: a?.sesionId ?? null,
        fase: est?.fase ?? null,
        motivoFin: est?.motivoFin ?? null,
        timbres: e.timbres.map((t) => t.sesionId),
    };
}

/** Mira las llamadas cada 500 ms mientras viva; avisa de cada intervención. Devuelve cómo pararlo. */
export function vigilarLlamadas(alIntervenir: (que: Intervencion) => void, cada = 500): () => void {
    let vivo = true;
    const vuelta = async () => {
        if (!vivo) return;
        try {
            const i = vigiaMano.observar(await fotoLlamadas(), Date.now());
            if (i) alIntervenir(i);
        } catch {
            /* sin store: nada que vigilar */
        }
    };
    const id = setInterval(() => void vuelta(), cada);
    void vuelta();
    return () => {
        vivo = false;
        clearInterval(id);
    };
}
