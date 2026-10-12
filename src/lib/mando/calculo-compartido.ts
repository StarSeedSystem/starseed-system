/**
 * Un cálculo caro, compartido y reutilizado unos segundos (2026-10-12).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: envuelve una función asíncrona sin argumentos. Mientras el último resultado tenga menos
 * de `vigenciaMs`, se devuelve ese; si no, se calcula UNA vez aunque lleguen diez llamadas a la
 * vez (todas esperan la misma promesa). Un fallo no se guarda: la siguiente llamada reintenta.
 *
 * POR QUÉ: Alex (12-10): «no está reaccionando». `/api/mando/estado` lanza dieciséis lecturas
 * (git status, git log, colas, latidos, bus de Supabase, ramificación…) por CADA petición; con
 * la Mac en presión de memoria tardaba 5-25 s, y la página de Genesis, la de MetaGenesis y cada
 * aparato conectado por el túnel la piden cada 20 s. Cada petición repetía el mismo trabajo y
 * hacía más lentas a las demás.
 *
 * Puro (sin `node:*`): se puede importar desde cualquier sitio y probar con un reloj falso.
 */

export interface CalculoCompartido<T> {
    (): Promise<T>;
    /** Olvida el último resultado (tras una orden que lo cambia, o en pruebas). */
    olvidar(): void;
}

export function compartirCalculo<T>(
    calcular: () => Promise<T>,
    vigenciaMs: number,
    ahora: () => number = () => Date.now(),
): CalculoCompartido<T> {
    let ultimo: { t: number; valor: T } | null = null;
    let enVuelo: Promise<T> | null = null;

    const compartido = (() => {
        if (ultimo && ahora() - ultimo.t < vigenciaMs) return Promise.resolve(ultimo.valor);
        if (enVuelo) return enVuelo;
        const promesa = calcular().then((valor) => {
            ultimo = { t: ahora(), valor };
            return valor;
        });
        enVuelo = promesa;
        const soltar = () => {
            if (enVuelo === promesa) enVuelo = null;
        };
        promesa.then(soltar, soltar);
        return promesa;
    }) as CalculoCompartido<T>;

    compartido.olvidar = () => {
        ultimo = null;
    };
    return compartido;
}
