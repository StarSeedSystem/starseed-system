/**
 * Autocuración de la PÁGINA de Genesis (2026-10-05).
 *
 * QUÉ: cada 15 s mira la salud de las lecturas (`guardia-fetch.ts`). Si la página está
 * atascada —muchas lecturas fallidas seguidas, o más de dos minutos pidiendo sin que vuelva
 * ninguna— pregunta directamente al servidor (`/api/mando/latido`, sin pasar por la cola):
 *   · servidor vivo → primero suelta todo lo que está en vuelo (`reiniciar-guardia`); si al
 *     minuto sigue atascada, RECARGA la página sola (como mucho una vez cada 10 min);
 *   · servidor caído → espera: lo levanta `scripts/puente/autocuracion_mando.py` en la Mac.
 *
 * POR QUÉ: Alex: «eso debería el propio puente autorrepararse sin tener que pedírtelo aquí,
 * directo del puente debería automáticamente repararse y funcionar». Dos veces en una noche
 * la pestaña se quedó en «—» con el servidor sano, y la única cura era recargar a mano.
 *
 * CÓMO: `decidirRemedio` es PURA (pruebas en `__tests__/autocuracion-pagina.test.ts`);
 * `instalarAutocuracionPagina` es el bucle del navegador. Cada remedio se anuncia con el
 * evento `starseed:autocuracion-mando` (lo pinta `aviso-autocuracion.tsx`) y deja su rastro en
 * `sessionStorage`, para que tras una recarga la página diga por qué se recargó.
 */
import { fetchSinGuardia, guardiaInstalada, type SaludGuardia } from "./guardia-fetch";

export const FALLOS_ATASCO = 12;
export const MS_SIN_EXITO_ATASCO = 120_000;
export const MS_ENTRE_REINICIOS = 60_000;
export const MS_ENTRE_RECARGAS = 10 * 60_000;
export const CLAVE_RECARGA = "starseed.mando.autocuracion.recarga";
export const EVENTO = "starseed:autocuracion-mando";

export type Remedio = "nada" | "reiniciar-guardia" | "recargar" | "esperar-servidor";

export interface EntradaAutocuracion {
    ahora: number;
    visible: boolean;
    salud: SaludGuardia;
    /** Cuándo empezó a vigilar esta página (para «sin éxito» cuando aún no hubo ninguno). */
    inicio: number;
    /** Resultado de la sonda directa al servidor; null si no se ha sondeado. */
    servidorVivo: boolean | null;
    ultimoReinicio: number | null;
    ultimaRecarga: number | null;
}

/** PURA. ¿La página está atascada? */
export function estaAtascada(e: Pick<EntradaAutocuracion, "ahora" | "salud" | "inicio">): boolean {
    const s = e.salud;
    if (s.fallosSeguidos >= FALLOS_ATASCO) return true;
    const pendientes = s.enVuelo + s.enCola;
    const desde = s.ultimoExito || e.inicio;
    return pendientes > 0 && s.ultimoIntento > 0 && e.ahora - desde > MS_SIN_EXITO_ATASCO;
}

/** PURA. El remedio que toca, con su porqué en castellano. */
export function decidirRemedio(e: EntradaAutocuracion): { remedio: Remedio; porque: string } {
    if (!e.visible) return { remedio: "nada", porque: "la pestaña no está a la vista" };
    if (!estaAtascada(e)) return { remedio: "nada", porque: "las lecturas vuelven" };
    const s = e.salud;
    const sintoma = s.fallosSeguidos >= FALLOS_ATASCO
        ? `${s.fallosSeguidos} lecturas fallidas seguidas`
        : `${Math.round((e.ahora - (s.ultimoExito || e.inicio)) / 1000)} s sin que vuelva ninguna lectura`;
    if (e.servidorVivo === false) {
        return { remedio: "esperar-servidor", porque: `${sintoma} y el servidor no responde: lo levanta la Mac` };
    }
    if (e.servidorVivo === null) return { remedio: "nada", porque: `${sintoma}: falta preguntar al servidor` };
    if (e.ultimoReinicio === null || e.ahora - e.ultimoReinicio > MS_ENTRE_REINICIOS) {
        return { remedio: "reiniciar-guardia", porque: `${sintoma} con el servidor sano: suelto lo atascado` };
    }
    if (e.ultimaRecarga === null || e.ahora - e.ultimaRecarga > MS_ENTRE_RECARGAS) {
        return { remedio: "recargar", porque: `${sintoma} aun después de soltar lo atascado: recargo la página` };
    }
    return { remedio: "nada", porque: `${sintoma}, pero ya recargué hace menos de 10 min: espero` };
}

function leerNumero(clave: string): number | null {
    try {
        const v = window.sessionStorage.getItem(clave);
        const n = v ? Number(JSON.parse(v)?.t) : NaN;
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

async function sondearServidor(tope = 8000): Promise<boolean> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), tope);
    try {
        const r = await fetchSinGuardia()("/api/mando/latido", { cache: "no-store", signal: control.signal });
        return r.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(reloj);
    }
}

function anunciar(detalle: { remedio: Remedio; porque: string; descartadas?: number }) {
    try {
        console.info(`[autocuración de Genesis] ${detalle.remedio}: ${detalle.porque}`);
        window.dispatchEvent(new CustomEvent(EVENTO, { detail: detalle }));
    } catch {
        // Sin CustomEvent no hay aviso; el remedio se aplica igual.
    }
}

let instalada = false;

/** Arranca el bucle en el navegador (una vez). En el servidor no hace nada. */
export function instalarAutocuracionPagina(intervaloMs = 15_000): void {
    // En las pruebas no se arranca: un intervalo suelto sobrevive al entorno de pruebas (como el
    // bucle de requestAnimationFrame que tumbó la publicación de las 00:19).
    if (instalada || typeof window === "undefined" || process.env.NODE_ENV === "test") return;
    instalada = true;
    const inicio = Date.now();
    let ultimoReinicio: number | null = null;
    let ocupado = false;

    window.setInterval(async () => {
        const guardia = guardiaInstalada();
        if (!guardia || ocupado) return;
        ocupado = true;
        try {
            const base = {
                ahora: Date.now(),
                visible: document.visibilityState !== "hidden",
                salud: guardia.salud(),
                inicio,
                ultimoReinicio,
                ultimaRecarga: leerNumero(CLAVE_RECARGA),
            };
            if (!base.visible || !estaAtascada(base)) return;
            const decision = decidirRemedio({ ...base, servidorVivo: await sondearServidor() });
            if (decision.remedio === "reiniciar-guardia") {
                guardia.reiniciar("la página estaba atascada");
                ultimoReinicio = Date.now();
                anunciar({ ...decision, descartadas: base.salud.descartadas });
            } else if (decision.remedio === "recargar") {
                try {
                    window.sessionStorage.setItem(CLAVE_RECARGA, JSON.stringify({ t: Date.now(), porque: decision.porque }));
                } catch {
                    // Sin sessionStorage se recarga igual; el tope de 10 min vive solo en esta carga.
                }
                anunciar(decision);
                window.location.reload();
            } else if (decision.remedio === "esperar-servidor") {
                anunciar(decision);
            }
        } finally {
            ocupado = false;
        }
    }, intervaloMs);
}
