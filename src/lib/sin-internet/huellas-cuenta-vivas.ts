/**
 * (OFF1108A) Reconocer neuronas de la cuenta SIN servidor: espejo síncrono de lo que la instantánea sabe.
 *
 * Por qué. Los motores de enlace (Bluetooth directo, red local nativa) deciden en el acto si un saludo es de
 * «una neurona de mi cuenta» con funciones síncronas (`vinculos()`, `neuronasCuenta()`). Tras reabrir la app
 * sin internet no había de dónde sacar eso: los vínculos del aparato no traen a las neuronas que solo se
 * habían reconocido por la prueba de cuenta, y la lista de neuronas de la cuenta era la de Supabase.
 *
 * Qué hace:
 *   · `cargarEspejo()` lee de la instantánea (IndexedDB) las huellas probadas y los ids de las neuronas de la
 *     cuenta; se llama al arrancar los motores (y se puede esperar: así no hay carrera con el primer saludo).
 *   · `vinculosDeCuentaCacheados()` / `idsNeuronasCuentaCacheados()` los dan al instante.
 *   · `aprender(ligaduras)` anota la huella de cada enlace ligado POR PRUEBA DE CUENTA (HMAC de faro o
 *     certificado) para la próxima vez; solo de neuronas conocidas de la cuenta.
 *
 * Seguridad: la huella llega siempre PROBADA por la firma del sobre (posesión de la clave del aparato); aquí solo
 * se recuerda que esa clave ya demostró ser de la cuenta. Nada de tokens ni de la clave de faro.
 */

import {
    huellasAprendidas,
    huellasComoVinculos,
    leerHuellas,
    leerNeuronas,
    recordarHuellas,
    type HuellasCuenta,
} from "./instantanea-cuenta";

let uidEspejo: string | null = null;
let huellas: HuellasCuenta = {};
let idsNeuronas: string[] = [];
let nombres: Record<string, string> = {};
let cargando: Promise<void> | null = null;

async function uidDeLaCuenta(): Promise<string | null> {
    try {
        return await (await import("@/lib/consumo/usuario")).uidActual();
    } catch {
        return null;
    }
}

/** Lee la instantánea al espejo (una vez en vuelo). Nunca lanza. */
export function cargarEspejo(uid?: string | null): Promise<void> {
    cargando ??= (async () => {
        try {
            const u = uid ?? (await uidDeLaCuenta());
            uidEspejo = u;
            if (!u) return;
            huellas = await leerHuellas(u);
            const filas = await leerNeuronas(u);
            idsNeuronas = (filas ?? []).map((f) => String(f.id ?? "")).filter(Boolean);
            nombres = Object.fromEntries((filas ?? []).map((f) => [String(f.id ?? ""), typeof f.name === "string" ? f.name : ""]).filter(([id, n]) => id && n));
        } catch {
            /* sin instantánea: el espejo queda vacío */
        } finally {
            cargando = null;
        }
    })();
    return cargando;
}

export function cuentaDelEspejo(): string | null {
    return uidEspejo;
}

/** Huellas de neuronas de la cuenta ya probadas, como vínculos mínimos para `aceptarHola`. */
export function vinculosDeCuentaCacheados(): Array<{ neurona: string; nombre: string; huella: string; cuenta?: string }> {
    return huellasComoVinculos(huellas, uidEspejo, nombres);
}

/** Ids de neuronas de la cuenta que se saludan «a ciegas» aunque no haya servidor. */
export function idsNeuronasCuentaCacheados(): string[] {
    return Array.from(new Set([...idsNeuronas, ...Object.keys(huellas)]));
}

/** Anota las huellas probadas por cuenta de las ligaduras vivas. Devuelve cuántas neuronas nuevas o cambiadas. */
export async function aprender(
    ligaduras: ReadonlyArray<{ neurona: string; huella: string; porCuenta?: boolean; at?: number }>,
    ahora: number = Date.now(),
): Promise<number> {
    try {
        if (!uidEspejo) await cargarEspejo();
        const uid = uidEspejo;
        if (!uid) return 0;
        const nuevas = huellasAprendidas(ligaduras, { conocidas: idsNeuronas, ahora });
        const cambiadas = Object.entries(nuevas).filter(([n, h]) => huellas[n]?.huella !== h.huella).length;
        if (!cambiadas) return 0;
        huellas = await recordarHuellas(uid, nuevas);
        return cambiadas;
    } catch {
        return 0;
    }
}

/** Solo pruebas. */
export function _reiniciarEspejoParaPruebas(): void {
    uidEspejo = null;
    huellas = {};
    idsNeuronas = [];
    nombres = {};
    cargando = null;
}
