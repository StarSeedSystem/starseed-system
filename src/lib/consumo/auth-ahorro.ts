/**
 * Ahorro en la sesión del navegador (contrato «consumo» · CON1010, 2026-10-10).
 *
 * Medido el 2026-10-10 en el proyecto: `/auth/v1/user` 2.492 peticiones en 20 h, casi todas de las
 * pestañas de la Mac. Al cargar `/metagenesis` salieron 21 seguidas: decenas de componentes llaman a
 * `supabase.auth.getUser()` al montarse, y cada llamada es un viaje al servidor de Auth para
 * preguntar lo mismo. Además, el cliente de Auth emite `SIGNED_IN` CADA vez que una pestaña vuelve
 * a estar visible (`_recoverAndRefresh` de @supabase/auth-js 2.99): una docena de módulos tratan
 * ese eco como un inicio de sesión y relanzan su arranque entero (perfil, preferencias, neuronas,
 * conversaciones, tableros…).
 *
 * Dos remedios, los dos sobre la instancia ÚNICA del navegador (`utils/supabase/client.ts`):
 *
 *  1. `getUser()` sin argumentos se COMPARTE: una sola petición en vuelo para todos los que
 *     pregunten a la vez y su respuesta vale `GETUSER_VIGENCIA_MS` (60 s). Entrar, salir, cambiar
 *     de cuenta o actualizar el usuario la invalida al momento. `getUser(jwt)` (verificar un token
 *     concreto) va siempre a la red, y un error nunca se guarda.
 *  2. `onAuthStateChange(cb)` no entrega a `cb` el eco `SIGNED_IN` de la MISMA cuenta que ese
 *     oyente ya conoce. Un inicio de sesión de verdad (de nadie a alguien, o de una cuenta a otra)
 *     sí llega, igual que `INITIAL_SESSION`, `TOKEN_REFRESHED`, `USER_UPDATED`, `SIGNED_OUT` y el
 *     resto. Los oyentes internos de supabase-js se registran al crear el cliente, antes de este
 *     envoltorio, así que el tiempo real sigue recibiendo todo.
 *
 * Nunca lanza: si algo del envoltorio falla, el cliente queda como estaba.
 */

export const GETUSER_VIGENCIA_MS = 60_000;

/** Lo mínimo del cliente de Auth que tocamos. */
export interface AuthAhorrable {
    getUser: (jwt?: string) => Promise<{ data: { user: { id?: string } | null } | null; error: unknown }>;
    onAuthStateChange: (
        cb: (evento: string, sesion: { user?: { id?: string } | null } | null) => void | Promise<void>,
    ) => unknown;
}

export interface EstadisticaAhorroAuth {
    /** Llamadas a getUser() sin argumentos que pidieron los módulos. */
    pedidas: number;
    /** De ellas, las que salieron a la red. */
    aLaRed: number;
    /** Ecos SIGNED_IN de la misma cuenta que no se entregaron. */
    ecosSilenciados: number;
}

const MARCA = Symbol.for("starseed.consumo.auth-ahorro");

/** Eventos que dicen «la cuenta o sus datos cambiaron»: invalidan la respuesta compartida. */
const INVALIDAN = new Set(["SIGNED_OUT", "USER_UPDATED", "SIGNED_IN", "PASSWORD_RECOVERY", "MFA_CHALLENGE_VERIFIED"]);

function uidDe(sesion: { user?: { id?: string } | null } | null | undefined): string | null {
    const id = sesion?.user?.id;
    return typeof id === "string" && id ? id : null;
}

/**
 * Envuelve `auth` (idempotente). Devuelve las estadísticas vivas del ahorro, o `null` si no se
 * pudo envolver (el cliente queda intacto).
 */
export function ahorrarAuth(
    auth: AuthAhorrable | null | undefined,
    op: { ahora?: () => number; vigenciaMs?: number } = {},
): EstadisticaAhorroAuth | null {
    if (!auth || typeof auth !== "object") return null;
    const marcado = (auth as unknown as Record<symbol, EstadisticaAhorroAuth | undefined>)[MARCA];
    if (marcado) return marcado;
    if (typeof auth.getUser !== "function" || typeof auth.onAuthStateChange !== "function") return null;

    const ahora = op.ahora ?? (() => Date.now());
    const vigencia = op.vigenciaMs ?? GETUSER_VIGENCIA_MS;
    const stats: EstadisticaAhorroAuth = { pedidas: 0, aLaRed: 0, ecosSilenciados: 0 };
    const getUserOriginal = auth.getUser.bind(auth);
    const onAuthOriginal = auth.onAuthStateChange.bind(auth);

    type Resp = Awaited<ReturnType<AuthAhorrable["getUser"]>>;
    let generacion = 0;
    let guardada: { en: number; gen: number; resp: Resp } | null = null;
    let enVuelo: { gen: number; promesa: Promise<Resp> } | null = null;

    const invalidar = () => {
        generacion++;
        guardada = null;
        enVuelo = null;
    };

    /** Cada llamador recibe su copia: si un módulo toca `data.user`, no se lo cambia a los demás. */
    const copia = (resp: Resp): Resp => {
        try {
            return !resp?.error && typeof structuredClone === "function" ? structuredClone(resp) : resp;
        } catch {
            return resp;
        }
    };

    function getUserCompartido(jwt?: string): Promise<Resp> {
        if (typeof jwt === "string" && jwt) return getUserOriginal(jwt);
        stats.pedidas++;
        const t = ahora();
        if (guardada && guardada.gen === generacion && t - guardada.en < vigencia) {
            return Promise.resolve(copia(guardada.resp));
        }
        if (enVuelo && enVuelo.gen === generacion) return enVuelo.promesa.then(copia);
        const gen = generacion;
        stats.aLaRed++;
        const promesa = getUserOriginal().then(
            (resp) => {
                // Solo se guarda una respuesta buena y de la cuenta vigente (si cambió mientras tanto, no).
                if (gen === generacion && resp && !resp.error && resp.data?.user) {
                    guardada = { en: ahora(), gen, resp };
                }
                if (enVuelo?.promesa === promesa) enVuelo = null;
                return resp;
            },
            (e: unknown) => {
                if (enVuelo?.promesa === promesa) enVuelo = null;
                throw e;
            },
        );
        enVuelo = { gen, promesa };
        return promesa.then(copia);
    }

    function onAuthFiltrado(
        cb: (evento: string, sesion: { user?: { id?: string } | null } | null) => void | Promise<void>,
    ): unknown {
        // Lo que ESTE oyente ya sabe: `undefined` = todavía nada (el primer evento siempre pasa).
        let conocida: string | null | undefined;
        return onAuthOriginal((evento, sesion) => {
            const uid = uidDe(sesion);
            if (evento === "SIGNED_IN" && conocida !== undefined && conocida === uid) {
                stats.ecosSilenciados++;
                return;
            }
            conocida = evento === "SIGNED_OUT" ? null : uid;
            return cb(evento, sesion);
        });
    }

    try {
        // Un oyente propio, registrado ANTES de envolver: invalida la respuesta compartida cuando la
        // cuenta cambia de verdad (el eco de la misma cuenta no la invalida).
        let ultimaCuenta: string | null | undefined;
        onAuthOriginal((evento, sesion) => {
            const uid = uidDe(sesion);
            if (evento === "SIGNED_IN" && ultimaCuenta !== undefined && ultimaCuenta === uid) return;
            if (INVALIDAN.has(evento) || uid !== (ultimaCuenta ?? null)) invalidar();
            ultimaCuenta = evento === "SIGNED_OUT" ? null : uid;
        });
        auth.getUser = getUserCompartido as AuthAhorrable["getUser"];
        auth.onAuthStateChange = onAuthFiltrado as AuthAhorrable["onAuthStateChange"];
        Object.defineProperty(auth, MARCA, { value: stats, enumerable: false });
        return stats;
    } catch {
        return null;
    }
}
