/**
 * Guardián del cliente de Supabase (contrato «consumo», 2026-09-29).
 *
 * Por qué existe: el proyecto del OS quedó bloqueado el 2026-09-28 por pasar la cuota gratuita de
 * tráfico de salida, tres días después de volver a usarse. Picos de 27.000–33.000 peticiones/hora,
 * todas desde pestañas del navegador, y tras el bloqueo siguieron ~1.200/hora recibiendo 402.
 * El plan gratuito no tiene límites de gasto diarios: los ponemos aquí, en la única puerta por la
 * que sale cada petición del navegador (`global.fetch` del cliente, ver utils/supabase/client.ts).
 *
 * Qué hace, en orden:
 *  1. Cortacircuitos: una respuesta 402, o un error que diga «exceed_…_quota» / «restricted», lo
 *     abre 30 min (persistido en localStorage y avisado a TODAS las pestañas). Mientras está
 *     abierto, cada petición recibe un 402 sintético sin tocar la red. Al vencer, UNA petición de
 *     prueba; si vuelve a fallar, la espera crece 30 min más cada vez, hasta 2 h.
 *  2. Freno remoto (tabla os_freno, lo escribe el vigía diario) y presupuesto diario del
 *     dispositivo (8.000): por encima solo pasan escrituras y autenticación.
 *  3. Cubo de fichas por pestaña: 60/min con ráfaga de 30. Las lecturas que sobran esperan en
 *     cola; si el exceso dura 60 s, «freno local» de 2 min.
 *  4. Deduplicación: dos lecturas idénticas en vuelo comparten UNA petición de red (cada llamador
 *     recibe su propia copia de la respuesta).
 *
 * Transparencia: mismas respuestas que fetch (las copias son `clone()`), el cuerpo de la petición
 * no se toca, AbortSignal sigue funcionando, y nada lanza donde fetch no lanzaría. Sin ventana
 * (SSR/Node) no hay guardián: `fetchGuardado` es fetch tal cual.
 *
 * Detalle de sesión: el cliente de auth BORRA la sesión si el refresco del token falla con un
 * error «no reintentable» (402 lo es). Para el refresco usamos 503, que trata como fallo de red:
 * la sesión sobrevive a la pausa y se renueva sola cuando vuelve el servicio.
 */

// ── Constantes del contrato ─────────────────────────────────────────────────────────────────
export const CLAVE_CORTE = "starseed.supabase.corte.v1";
export const CLAVE_DIA = "starseed.supabase.dia.v1";
export const CANAL_CONSUMO = "starseed-consumo";

export const CORTE_BASE_MS = 30 * 60_000;
export const CORTE_MAX_MS = 2 * 60 * 60_000;
/** Entre dos pruebas (de cualquier pestaña) pasa al menos esto, aunque la red falle. */
export const SONDA_MIN_MS = 60_000;

export const FICHAS_POR_MIN = 60;
export const RAFAGA = 30;
export const EXCESO_MAX_MS = 60_000;
export const FRENO_LOCAL_MS = 2 * 60_000;
/** Más lecturas esperando que esto = exceso claro: freno local inmediato. */
export const COLA_MAX = 120;

export const PRESUPUESTO_DIA = 8_000;
const DIA_MS = 86_400_000;
const VOLCADO_DIA_MS = 5_000;
const FICHA_POR_MS = FICHAS_POR_MIN / 60_000;

export type MotivoPausa = "corte" | "freno-remoto" | "dia" | "freno-local";

// ── Tipos públicos ──────────────────────────────────────────────────────────────────────────
export interface ContadorRuta {
    n: number;
    bytes: number;
}

export interface ContadoresConsumo {
    /** Por ruta sin consulta ni ids (p. ej. `/rest/v1/os_mesh_relay`). Objeto vivo: no mutar. */
    porRuta: Record<string, ContadorRuta>;
    /** Peticiones que salieron a la red desde que se abrió esta pestaña. */
    total: number;
    /** Veces que se abrió el freno local en esta pestaña. */
    frenos: number;
    corteHasta: number | null;
    /** Peticiones de hoy (UTC) en este dispositivo, todas las pestañas. */
    hoy: number;
    presupuestoDia: number;
    /** Respuestas sintéticas (pausas) servidas sin tocar la red. */
    bloqueadas: number;
    frenoLocalHasta: number | null;
    frenoRemoto: boolean;
}

/** Instantánea para la UI: el MISMO objeto mientras nada cambie (useSyncExternalStore). */
export interface AvisoGuardian {
    corte: boolean;
    corteHasta: number | null;
    frenoLocalHasta: number | null;
    diaAgotado: boolean;
}

export interface AlmacenConsumo {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
}

export interface CanalConsumo {
    postMessage(mensaje: unknown): void;
    close(): void;
    onmessage: ((ev: { data: unknown }) => void) | null;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpcionesGuardian {
    /** El fetch de verdad (la red). */
    red: FetchLike;
    ahora?: () => number;
    almacen?: AlmacenConsumo | null;
    crearCanal?: ((nombre: string) => CanalConsumo | null) | null;
    avisar?: (mensaje: string) => void;
    presupuestoDia?: number;
}

export interface Guardian {
    fetch: FetchLike;
    leerContadores(): ContadoresConsumo;
    leerAviso(): AvisoGuardian;
    suscribir(oyente: () => void): () => void;
    fijarFrenoRemoto(activo: boolean): void;
    /** Solo pruebas: suelta el canal y los temporizadores. */
    cerrar(): void;
}

// ── Internos ────────────────────────────────────────────────────────────────────────────────
interface EstadoCorte {
    hasta: number;
    fallos: number;
    motivo: string;
    /** Cuándo empezó la última prueba (de cualquier pestaña); 0 = ninguna. */
    sondaEn: number;
}

interface Peticion {
    url: string;
    metodo: string;
    ruta: string;
    lectura: boolean;
    auth: boolean;
    refresco: boolean;
    freno: boolean;
    sonda: boolean;
    signal: AbortSignal | null;
    clave: string | null;
}

interface Espera {
    resolver(r: Response): void;
    rechazar(e: unknown): void;
    hecho: boolean;
    quitar?: () => void;
}

interface Vuelo {
    pet: Peticion;
    input: RequestInfo | URL;
    init: RequestInit | undefined;
    esperas: Espera[];
    activos: number;
    controlador: AbortController;
    estado: "cola" | "red" | "hecho";
    unica: boolean;
}

const RE_CUOTA = /exceed_[a-z_]*quota/i;
const RE_RESTRINGIDO = /\brestricted\b/i;

const AVISO_INICIAL: AvisoGuardian = Object.freeze({
    corte: false,
    corteHasta: null,
    frenoLocalHasta: null,
    diaAgotado: false,
});

function horaCorta(ms: number): string {
    try {
        return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return new Date(ms).toISOString().slice(11, 16);
    }
}

export function mensajePausa(motivo: MotivoPausa, hasta: number | null): string {
    switch (motivo) {
        case "corte":
            return (
                "Pausa de consumo: la nube de StarSeed ha pedido una pausa por exceso de tráfico. " +
                (hasta ? `Se vuelve a intentar sola a las ${horaCorta(hasta)}. ` : "") +
                "Lo que tienes en este dispositivo sigue a mano."
            );
        case "freno-remoto":
            return (
                "Pausa de consumo: el proyecto alcanzó su presupuesto de hoy. " +
                "Las lecturas de la nube vuelven a las 00:00 UTC; lo que escribas sí se guarda."
            );
        case "dia":
            return (
                "Pausa de consumo: este dispositivo alcanzó su presupuesto diario de lecturas. " +
                "Se renueva a las 00:00 UTC; lo que escribas sí se guarda."
            );
        default:
            return (
                "Pausa de consumo: esta pestaña pidió demasiados datos seguidos. " +
                "Se reanuda en unos 2 minutos."
            );
    }
}

/** `/rest/v1/tabla`, `/rest/v1/rpc/funcion`, `/auth/v1/user`, `/storage/v1/object/cubo`… */
export function rutaDe(url: string): string {
    const barras = url.indexOf("//");
    const i = barras < 0 ? (url.charCodeAt(0) === 47 ? 0 : -1) : url.indexOf("/", barras + 2);
    if (i < 0) return "/";
    let fin = url.length;
    const q = url.indexOf("?", i);
    if (q >= 0) fin = q;
    const h = url.indexOf("#", i);
    if (h >= 0 && h < fin) fin = h;
    const max = url.startsWith("/rest/v1/rpc/", i) || url.startsWith("/storage/v1/", i) ? 4 : 3;
    let segmentos = 0;
    for (let j = i; j < fin; j++) {
        if (url.charCodeAt(j) === 47 && ++segmentos > max) {
            fin = j;
            break;
        }
    }
    return url.slice(i, fin);
}

function razonAbort(signal: AbortSignal): unknown {
    if (signal.reason !== undefined) return signal.reason;
    try {
        return new DOMException("The operation was aborted.", "AbortError");
    } catch {
        const e = new Error("The operation was aborted.");
        e.name = "AbortError";
        return e;
    }
}

function claveCabeceras(h: HeadersInit | undefined): string {
    if (!h) return "";
    const partes: string[] = [];
    if (typeof Headers !== "undefined" && h instanceof Headers) {
        h.forEach((v, k) => partes.push(`${k}:${v}`));
    } else if (Array.isArray(h)) {
        for (const [k, v] of h) partes.push(`${String(k).toLowerCase()}:${v}`);
    } else {
        for (const k of Object.keys(h)) partes.push(`${k.toLowerCase()}:${(h as Record<string, string>)[k]}`);
    }
    return partes.sort().join("\n");
}

function leerJSON<T>(almacen: AlmacenConsumo | null, clave: string): T | null {
    if (!almacen) return null;
    try {
        const crudo = almacen.getItem(clave);
        return crudo ? (JSON.parse(crudo) as T) : null;
    } catch {
        return null;
    }
}

function validarCorte(x: unknown): EstadoCorte | null {
    if (!x || typeof x !== "object") return null;
    const c = x as Partial<EstadoCorte>;
    if (typeof c.hasta !== "number" || !Number.isFinite(c.hasta)) return null;
    return {
        hasta: c.hasta,
        fallos: typeof c.fallos === "number" && c.fallos > 0 ? Math.floor(c.fallos) : 1,
        motivo: typeof c.motivo === "string" ? c.motivo : "",
        sondaEn: typeof c.sondaEn === "number" ? c.sondaEn : 0,
    };
}

// ── Fábrica ─────────────────────────────────────────────────────────────────────────────────
export function crearGuardian(op: OpcionesGuardian): Guardian {
    const red = op.red;
    const ahora = op.ahora ?? (() => Date.now());
    const almacen = op.almacen ?? null;
    const avisar = op.avisar ?? (() => undefined);
    const presupuestoDia = op.presupuestoDia ?? PRESUPUESTO_DIA;

    // Contadores
    const porRuta: Record<string, ContadorRuta> = {};
    let total = 0;
    let frenos = 0;
    let bloqueadas = 0;

    // Cortacircuitos
    let corte: EstadoCorte | null = validarCorte(leerJSON(almacen, CLAVE_CORTE));
    let sondaEnVuelo = false;

    // Freno remoto (lo fija freno.ts)
    let frenoRemoto = false;

    // Cubo de fichas
    let fichas = RAFAGA;
    let ultimaRecarga = ahora();
    const cola: Vuelo[] = [];
    let excesoDesde: number | null = null;
    let frenoLocalHasta = 0;
    let temporizadorCola: ReturnType<typeof setTimeout> | null = null;
    let temporizadorFinFreno: ReturnType<typeof setTimeout> | null = null;

    // Presupuesto diario (se vuelca a localStorage cada pocos segundos, no por petición)
    let diaActual = Math.floor(ahora() / DIA_MS);
    let baseDia = 0;
    let pendienteDia = 0;
    let temporizadorDia: ReturnType<typeof setTimeout> | null = null;
    {
        const guardado = leerJSON<{ d?: number; n?: number }>(almacen, CLAVE_DIA);
        if (guardado && guardado.d === diaActual && typeof guardado.n === "number") baseDia = guardado.n;
    }

    // Deduplicación
    const enVuelo = new Map<string, Vuelo>();

    // Aviso para la UI
    let aviso: AvisoGuardian = AVISO_INICIAL;
    const oyentes = new Set<() => void>();

    // Canal entre pestañas
    let canal: CanalConsumo | null = null;
    try {
        canal = op.crearCanal ? op.crearCanal(CANAL_CONSUMO) : null;
    } catch {
        canal = null;
    }
    if (canal) {
        canal.onmessage = (ev) => {
            const d = ev?.data as { t?: string; corte?: unknown } | null;
            if (!d || typeof d !== "object" || d.t !== "corte") return;
            const anterior = corte;
            corte = validarCorte(d.corte);
            if (corte && !anterior) vaciarCola("corte");
            actualizarAviso();
        };
    }

    function difundirCorte(): void {
        try {
            if (almacen) {
                if (corte) almacen.setItem(CLAVE_CORTE, JSON.stringify(corte));
                else almacen.removeItem(CLAVE_CORTE);
            }
        } catch {
            /* almacenamiento lleno o bloqueado: el canal sigue avisando */
        }
        try {
            canal?.postMessage({ t: "corte", corte });
        } catch {
            /* sin canal: cada pestaña descubre el corte por su cuenta */
        }
    }

    // ── Día ──
    function hoy(): number {
        const d = Math.floor(ahora() / DIA_MS);
        if (d !== diaActual) {
            diaActual = d;
            baseDia = 0;
            pendienteDia = 0;
            if (aviso.diaAgotado) queueMicrotask(actualizarAviso);
        }
        return baseDia + pendienteDia;
    }

    function volcarDia(): void {
        if (temporizadorDia) {
            clearTimeout(temporizadorDia);
            temporizadorDia = null;
        }
        hoy();
        const guardado = leerJSON<{ d?: number; n?: number }>(almacen, CLAVE_DIA);
        const base = guardado && guardado.d === diaActual && typeof guardado.n === "number" ? guardado.n : baseDia;
        const n = Math.max(base, 0) + pendienteDia;
        try {
            almacen?.setItem(CLAVE_DIA, JSON.stringify({ d: diaActual, n }));
        } catch {
            /* sin almacenamiento: el contador vive en memoria */
        }
        baseDia = n;
        pendienteDia = 0;
    }

    function contarSalida(ruta: string): void {
        const c = porRuta[ruta];
        if (c) c.n++;
        else porRuta[ruta] = { n: 1, bytes: 0 };
        total++;
        hoy();
        pendienteDia++;
        if (almacen && !temporizadorDia) temporizadorDia = setTimeout(volcarDia, VOLCADO_DIA_MS);
        if (!aviso.diaAgotado && baseDia + pendienteDia >= presupuestoDia) actualizarAviso();
    }

    function contarBytes(ruta: string, res: Response): void {
        const largo = res.headers.get("content-length");
        if (!largo) return;
        const n = Number(largo);
        const c = porRuta[ruta];
        if (c && n > 0) c.bytes += n;
    }

    // ── Aviso ──
    function actualizarAviso(): void {
        const t = ahora();
        const corteHasta = corte ? corte.hasta : null;
        const fl = frenoLocalHasta > t ? frenoLocalHasta : null;
        const diaAgotado = hoy() >= presupuestoDia;
        const hayCorte = corte !== null;
        if (
            aviso.corte === hayCorte &&
            aviso.corteHasta === corteHasta &&
            aviso.frenoLocalHasta === fl &&
            aviso.diaAgotado === diaAgotado
        ) {
            return;
        }
        aviso = Object.freeze({ corte: hayCorte, corteHasta, frenoLocalHasta: fl, diaAgotado });
        for (const o of Array.from(oyentes)) {
            try {
                o();
            } catch {
                /* un oyente roto no para a los demás */
            }
        }
    }

    // ── Respuestas sintéticas ──
    function pausa(motivo: MotivoPausa, paraRefresco: boolean): Response {
        bloqueadas++;
        const cuerpo = JSON.stringify({
            message: mensajePausa(motivo, motivo === "corte" && corte ? corte.hasta : null),
            code: "starseed_freno",
        });
        return new Response(cuerpo, {
            status: paraRefresco ? 503 : 402,
            statusText: paraRefresco ? "Service Unavailable" : "Payment Required",
            headers: { "content-type": "application/json; charset=utf-8", "x-starseed-freno": motivo },
        });
    }

    // ── Cortacircuitos ──
    function abrirCorte(motivo: string, desdeSonda: boolean): void {
        const t = ahora();
        if (desdeSonda) sondaEnVuelo = false;
        // Ya abierto (o con su prueba en vuelo): no alargarlo por respuestas rezagadas.
        else if (corte && (t < corte.hasta || sondaEnVuelo)) return;
        const fallos = (corte?.fallos ?? 0) + 1;
        const espera = Math.min(CORTE_BASE_MS * fallos, CORTE_MAX_MS);
        corte = { hasta: t + espera, fallos, motivo, sondaEn: 0 };
        difundirCorte();
        avisar(
            `[consumo] Supabase pidió pausa (${motivo}). Sin peticiones a la nube durante ${Math.round(espera / 60_000)} min; ` +
                `luego una sola de prueba.`,
        );
        vaciarCola("corte");
        actualizarAviso();
    }

    function cerrarCorte(): void {
        sondaEnVuelo = false;
        if (!corte) return;
        corte = null;
        difundirCorte();
        avisar("[consumo] La prueba respondió bien: la nube vuelve a estar disponible.");
        actualizarAviso();
    }

    function sondaSinRespuesta(): void {
        // La red falló (no es una señal de cuota): el corte sigue; la próxima prueba en ≥ 60 s.
        sondaEnVuelo = false;
    }

    function esCuotaSync(res: Response): boolean {
        return res.status === 402;
    }

    async function esCuotaCuerpo(copia: Response): Promise<boolean> {
        try {
            let enCabecera = false;
            copia.headers.forEach((v) => {
                if (RE_CUOTA.test(v)) enCabecera = true;
            });
            if (enCabecera) return true;
            const texto = (await copia.text()).slice(0, 8192);
            if (RE_CUOTA.test(texto)) return true;
            const s = copia.status;
            // «restricted» solo cuenta en estados que no son errores normales de una consulta.
            return (s === 403 || s === 429 || s >= 500) && RE_RESTRINGIDO.test(texto);
        } catch {
            return false;
        }
    }

    /** Observa una respuesta REAL: contadores y cortacircuitos. true/false/promesa = ¿es cuota? */
    function observar(pet: Peticion, res: Response): boolean | Promise<boolean> {
        contarBytes(pet.ruta, res);
        if (esCuotaSync(res)) {
            abrirCorte(`respuesta ${res.status} en ${pet.ruta}`, pet.sonda);
            return true;
        }
        if (res.status >= 400) {
            let copia: Response;
            try {
                copia = res.clone();
            } catch {
                if (pet.sonda) cerrarCorte();
                return false;
            }
            return esCuotaCuerpo(copia).then((cuota) => {
                if (cuota) abrirCorte(`cuota agotada en ${pet.ruta}`, pet.sonda);
                else if (pet.sonda) cerrarCorte();
                return cuota;
            });
        }
        if (pet.sonda) cerrarCorte();
        return false;
    }

    // ── Bloqueos ──
    function motivoBloqueo(pet: Peticion): MotivoPausa | null {
        if (corte && ahora() < corte.hasta) return "corte";
        if (pet.lectura && !pet.auth && !pet.freno) {
            if (frenoRemoto) return "freno-remoto";
            if (hoy() >= presupuestoDia) return "dia";
            if (ahora() < frenoLocalHasta) return "freno-local";
        }
        return null;
    }

    // ── Cubo de fichas ──
    function recargar(): void {
        const t = ahora();
        const d = t - ultimaRecarga;
        if (d > 0) {
            fichas = Math.min(RAFAGA, fichas + d * FICHA_POR_MS);
            ultimaRecarga = t;
        }
    }

    function tomarFicha(): boolean {
        recargar();
        if (fichas >= 1) {
            fichas -= 1;
            return true;
        }
        return false;
    }

    function gastarFicha(): void {
        recargar();
        fichas = Math.max(-RAFAGA, fichas - 1);
    }

    function programarCola(): void {
        if (temporizadorCola || cola.length === 0) return;
        recargar();
        const falta = fichas >= 1 ? 0 : Math.ceil((1 - fichas) / FICHA_POR_MS);
        temporizadorCola = setTimeout(atenderCola, Math.max(falta, 16));
    }

    function atenderCola(): void {
        temporizadorCola = null;
        recargar();
        if (cola.length && excesoDesde !== null && ahora() - excesoDesde >= EXCESO_MAX_MS) {
            abrirFrenoLocal();
            return;
        }
        while (cola.length && fichas >= 1) {
            const v = cola.shift() as Vuelo;
            const motivo = motivoBloqueo(v.pet);
            if (motivo) {
                resolverConPausa(v, motivo);
                continue;
            }
            fichas -= 1;
            arrancar(v);
        }
        if (cola.length) programarCola();
        else excesoDesde = null;
    }

    function encolar(v: Vuelo): void {
        if (cola.length >= COLA_MAX) {
            abrirFrenoLocal();
            resolverConPausa(v, "freno-local");
            return;
        }
        const t = ahora();
        if (excesoDesde === null) excesoDesde = t;
        else if (t - excesoDesde >= EXCESO_MAX_MS) {
            abrirFrenoLocal();
            resolverConPausa(v, "freno-local");
            return;
        }
        v.estado = "cola";
        cola.push(v);
        programarCola();
    }

    function vaciarCola(motivo: MotivoPausa): void {
        if (!cola.length) return;
        const pendientes = cola.splice(0, cola.length);
        for (const v of pendientes) resolverConPausa(v, motivo);
        if (temporizadorCola) {
            clearTimeout(temporizadorCola);
            temporizadorCola = null;
        }
        excesoDesde = null;
    }

    function abrirFrenoLocal(): void {
        frenoLocalHasta = ahora() + FRENO_LOCAL_MS;
        frenos++;
        excesoDesde = null;
        avisar(
            "[consumo] Freno local de 2 min: esta pestaña llevaba más de un minuto pidiendo por encima de " +
                `${FICHAS_POR_MIN} peticiones/min. Algún sondeo se ha desbocado (mira leerContadores().porRuta).`,
        );
        vaciarCola("freno-local");
        if (temporizadorFinFreno) clearTimeout(temporizadorFinFreno);
        temporizadorFinFreno = setTimeout(() => {
            temporizadorFinFreno = null;
            actualizarAviso();
        }, FRENO_LOCAL_MS + 50);
        actualizarAviso();
    }

    // ── Vuelos (lecturas) ──
    function quitarDelMapa(v: Vuelo): void {
        const c = v.pet.clave;
        if (c && enVuelo.get(c) === v) enVuelo.delete(c);
    }

    function resolverConPausa(v: Vuelo, motivo: MotivoPausa): void {
        quitarDelMapa(v);
        v.estado = "hecho";
        if (v.pet.sonda) sondaEnVuelo = false;
        for (const e of v.esperas) {
            if (e.hecho) continue;
            e.hecho = true;
            e.quitar?.();
            e.resolver(pausa(motivo, false));
        }
    }

    function abandonar(v: Vuelo, razon: unknown): void {
        quitarDelMapa(v);
        if (v.pet.sonda && v.estado !== "hecho") sondaEnVuelo = false;
        if (v.estado === "cola") {
            const i = cola.indexOf(v);
            if (i >= 0) cola.splice(i, 1);
            v.estado = "hecho";
            if (!cola.length) excesoDesde = null;
        } else if (v.estado === "red") {
            v.controlador.abort(razon);
        }
    }

    function unirse(v: Vuelo, signal: AbortSignal | null): Promise<Response> {
        return new Promise<Response>((resolve, reject) => {
            const e: Espera = { resolver: resolve, rechazar: reject, hecho: false };
            v.esperas.push(e);
            v.activos++;
            if (signal) {
                const alAbortar = () => {
                    const razon = razonAbort(signal);
                    if (e.hecho) {
                        // Entregada a un único llamador: abortar corta el cuerpo, como hace fetch.
                        if (v.unica) v.controlador.abort(razon);
                        return;
                    }
                    e.hecho = true;
                    reject(razon);
                    if (--v.activos <= 0) abandonar(v, razon);
                };
                signal.addEventListener("abort", alAbortar, { once: true });
                e.quitar = () => signal.removeEventListener("abort", alAbortar);
            }
        });
    }

    function arrancar(v: Vuelo): void {
        v.estado = "red";
        contarSalida(v.pet.ruta);
        let promesa: Promise<Response>;
        try {
            promesa = red(v.input, { ...(v.init ?? {}), signal: v.controlador.signal });
        } catch (e) {
            promesa = Promise.reject(e);
        }
        promesa.then(
            (res) => entregar(v, res),
            (err) => fallar(v, err),
        );
    }

    function entregar(v: Vuelo, res: Response): void {
        quitarDelMapa(v);
        v.estado = "hecho";
        try {
            void observar(v.pet, res);
        } catch {
            /* observar nunca debe romper la entrega */
        }
        const vivas = v.esperas.filter((e) => !e.hecho);
        if (!vivas.length) {
            try {
                void res.body?.cancel().catch(() => undefined);
            } catch {
                /* nada que cancelar */
            }
            return;
        }
        // Todas las copias ANTES de entregar nada: nadie ha podido leer aún la original.
        const respuestas: Response[] = [];
        for (let i = 0; i < vivas.length; i++) {
            try {
                respuestas.push(i === 0 ? res : res.clone());
            } catch {
                respuestas.push(res);
            }
        }
        v.unica = vivas.length === 1;
        vivas.forEach((e, i) => {
            e.hecho = true;
            if (!v.unica) e.quitar?.();
            e.resolver(respuestas[i]);
        });
    }

    function fallar(v: Vuelo, err: unknown): void {
        quitarDelMapa(v);
        v.estado = "hecho";
        if (v.pet.sonda) sondaSinRespuesta();
        for (const e of v.esperas) {
            if (e.hecho) continue;
            e.hecho = true;
            e.quitar?.();
            e.rechazar(err);
        }
    }

    // ── Clasificación ──
    function clasificar(input: RequestInfo | URL, init: RequestInit | undefined): Peticion {
        const esRequest = typeof input === "object" && !(input instanceof URL) && typeof (input as Request).url === "string";
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const metodo = (init?.method ?? (esRequest ? (input as Request).method : "GET")).toUpperCase();
        const lectura = metodo === "GET" || metodo === "HEAD";
        const auth = url.includes("/auth/v1/");
        const signal = init?.signal ?? (esRequest ? (input as Request).signal : null) ?? null;
        return {
            url,
            metodo,
            ruta: rutaDe(url),
            lectura,
            auth,
            refresco: auth && url.includes("grant_type=refresh_token"),
            freno: url.includes("/rest/v1/os_freno"),
            sonda: false,
            signal,
            clave: lectura && !esRequest ? `${metodo} ${url}\n${claveCabeceras(init?.headers)}` : null,
        };
    }

    // ── La puerta ──
    function guardado(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const pet = clasificar(input, init);
        if (pet.signal?.aborted) return Promise.reject(razonAbort(pet.signal));

        const motivo = motivoBloqueo(pet);
        if (motivo) return Promise.resolve(pausa(motivo, pet.refresco));

        if (corte) {
            // Corte vencido: una sola prueba (entre todas las pestañas) cada ≥ 60 s.
            const t = ahora();
            if (sondaEnVuelo || t - corte.sondaEn < SONDA_MIN_MS) return Promise.resolve(pausa("corte", pet.refresco));
            pet.sonda = true;
            sondaEnVuelo = true;
            corte = { ...corte, sondaEn: t };
            difundirCorte();
        }

        if (!pet.lectura || pet.clave === null) {
            // Escrituras (y lecturas con objeto Request): nunca esperan en cola, sí gastan ficha.
            if (pet.lectura && !pet.auth && !pet.freno && !pet.sonda && !tomarFicha()) {
                // Lectura con Request sin ficha: esperamos en cola como las demás.
                const v = nuevoVuelo(pet, input, init);
                const p = unirse(v, pet.signal);
                encolar(v);
                return p;
            }
            if (!pet.lectura) gastarFicha();
            contarSalida(pet.ruta);
            let promesa: Promise<Response>;
            try {
                promesa = red(input, init);
            } catch (e) {
                promesa = Promise.reject(e);
            }
            return promesa.then(
                (res) => {
                    let cuota: boolean | Promise<boolean> = false;
                    try {
                        cuota = observar(pet, res);
                    } catch {
                        cuota = false;
                    }
                    if (!pet.refresco) return res;
                    if (cuota === true) return pausa("corte", true);
                    if (cuota === false) return res;
                    return cuota.then((c) => (c ? pausa("corte", true) : res));
                },
                (err) => {
                    if (pet.sonda) sondaSinRespuesta();
                    throw err;
                },
            );
        }

        // Lecturas: deduplicación y cubo de fichas.
        const existente = enVuelo.get(pet.clave);
        if (existente && existente.estado !== "hecho" && !pet.sonda) return unirse(existente, pet.signal);

        const v = nuevoVuelo(pet, input, init);
        enVuelo.set(pet.clave, v);
        const p = unirse(v, pet.signal);
        if (pet.auth || pet.freno || pet.sonda) {
            gastarFicha();
            arrancar(v);
        } else if (cola.length === 0 && tomarFicha()) {
            arrancar(v);
        } else {
            encolar(v);
        }
        return p;
    }

    function nuevoVuelo(pet: Peticion, input: RequestInfo | URL, init: RequestInit | undefined): Vuelo {
        return {
            pet,
            input,
            init,
            esperas: [],
            activos: 0,
            controlador: new AbortController(),
            estado: "cola",
            unica: false,
        };
    }

    return {
        fetch(input, init) {
            try {
                return guardado(input, init);
            } catch {
                // Un fallo interno del guardián nunca rompe la app: fetch tal cual.
                return red(input, init);
            }
        },
        leerContadores() {
            const t = ahora();
            return {
                porRuta,
                total,
                frenos,
                corteHasta: corte ? corte.hasta : null,
                hoy: hoy(),
                presupuestoDia,
                bloqueadas,
                frenoLocalHasta: frenoLocalHasta > t ? frenoLocalHasta : null,
                frenoRemoto,
            };
        },
        leerAviso() {
            return aviso;
        },
        suscribir(oyente) {
            oyentes.add(oyente);
            return () => {
                oyentes.delete(oyente);
            };
        },
        fijarFrenoRemoto(activo) {
            if (frenoRemoto === activo) return;
            frenoRemoto = activo;
            if (activo) {
                // Las lecturas que esperaban ya no saldrán hoy.
                const pendientes = cola.filter((v) => !v.pet.auth && !v.pet.freno);
                for (const v of pendientes) {
                    cola.splice(cola.indexOf(v), 1);
                    resolverConPausa(v, "freno-remoto");
                }
                if (!cola.length) excesoDesde = null;
            }
        },
        cerrar() {
            for (const t of [temporizadorCola, temporizadorFinFreno, temporizadorDia]) if (t) clearTimeout(t);
            temporizadorCola = temporizadorFinFreno = temporizadorDia = null;
            try {
                canal?.close();
            } catch {
                /* ya cerrado */
            }
            canal = null;
            oyentes.clear();
        },
    };
}

// ── Instancia de la pestaña ─────────────────────────────────────────────────────────────────
let guardianPestana: Guardian | null = null;

function almacenLocal(): AlmacenConsumo | null {
    try {
        const ls = window.localStorage;
        const prueba = "starseed.consumo.prueba";
        ls.setItem(prueba, "1");
        ls.removeItem(prueba);
        return ls;
    } catch {
        return null;
    }
}

/** El guardián de esta pestaña, o null en SSR/Node (sin ventana no hay guardián). */
export function guardianActual(): Guardian | null {
    if (guardianPestana) return guardianPestana;
    if (typeof window === "undefined" || typeof fetch !== "function") return null;
    guardianPestana = crearGuardian({
        red: (input, init) => fetch(input, init),
        almacen: almacenLocal(),
        crearCanal: (nombre) => (typeof BroadcastChannel === "function" ? (new BroadcastChannel(nombre) as unknown as CanalConsumo) : null),
        // eslint-disable-next-line no-console
        avisar: (m) => console.warn(m),
    });
    // Diagnóstico desde la consola del navegador: `__starseedConsumo.contadores().porRuta`
    // enseña qué ruta se ha desbocado sin abrir la pestaña de red. Solo lectura.
    try {
        const g = guardianPestana;
        Object.defineProperty(window, "__starseedConsumo", {
            value: Object.freeze({ contadores: () => g.leerContadores(), aviso: () => g.leerAviso() }),
            configurable: true,
        });
    } catch {
        /* ventana congelada: sin atajo de consola */
    }
    return guardianPestana;
}

/** `global.fetch` del cliente de Supabase. Transparente; en SSR es fetch tal cual. */
export function fetchGuardado(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let g: Guardian | null = null;
    try {
        g = guardianActual();
    } catch {
        g = null;
    }
    return g ? g.fetch(input, init) : fetch(input, init);
}

const CONTADORES_VACIOS: ContadoresConsumo = Object.freeze({
    porRuta: Object.freeze({}) as Record<string, ContadorRuta>,
    total: 0,
    frenos: 0,
    corteHasta: null,
    hoy: 0,
    presupuestoDia: PRESUPUESTO_DIA,
    bloqueadas: 0,
    frenoLocalHasta: null,
    frenoRemoto: false,
});

/** Contadores por ruta de esta pestaña (sin consultas ni claves). Barato: no copia nada. */
export function leerContadores(): ContadoresConsumo {
    return guardianActual()?.leerContadores() ?? CONTADORES_VACIOS;
}

export function leerAvisoConsumo(): AvisoGuardian {
    return guardianActual()?.leerAviso() ?? AVISO_INICIAL;
}

export function avisoConsumoServidor(): AvisoGuardian {
    return AVISO_INICIAL;
}

export function suscribirConsumo(oyente: () => void): () => void {
    return guardianActual()?.suscribir(oyente) ?? (() => undefined);
}

/** Lo llama freno.ts cuando cambia la fila `os_freno`. */
export function fijarFrenoRemoto(activo: boolean): void {
    guardianActual()?.fijarFrenoRemoto(activo);
}
