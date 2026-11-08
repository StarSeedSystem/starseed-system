/**
 * (OFF1108A) Arranque sin internet: lo que une la instantánea de la cuenta con los enlaces y el buzón.
 *
 * Lo monta `MallaNeuronasMount`. Tres trabajos, todos tolerantes a fallos y sin red:
 *   1. CARGAR el espejo (huellas probadas + ids de neuronas de la cuenta) ANTES de que los motores saluden
 *      (`esperarEspejo()` lo esperan los `depsReales` de Bluetooth y red local: sin carrera de arranque en frío).
 *   2. APRENDER: cada vez que cambian los enlaces, anotar la huella de los ligados por prueba de cuenta.
 *   3. DRENAR: cuando una neurona queda ligada (por Bluetooth o red local nativa), reintentar el buzón YA
 *      (mensajes y archivos en espera) sin que la persona pulse nada. Con `ESPERA_DRENAJE_MS` de agrupación.
 *
 * Con internet, además, guarda una copia ligera de los cerebros de la cuenta (pertenencia: id, nombre, fecha).
 */

import { aprender, cargarEspejo } from "./huellas-cuenta-vivas";
import { instantaneaCuenta } from "./instantanea-cuenta";

export const ESPERA_DRENAJE_MS = 600;
export const REFRESCO_ESPEJO_MS = 10 * 60_000;
export const CADA_COPIA_CEREBROS_MS = 30 * 60_000;

/** Lo mínimo de una ligadura. */
export interface LigaduraMin {
    neurona: string;
    huella: string;
    porCuenta?: boolean;
    at?: number;
}

/** Neuronas que están ligadas ahora y antes no (pura). */
export function recienLigadas(antes: ReadonlySet<string>, ahora: readonly LigaduraMin[]): string[] {
    return Array.from(new Set(ahora.map((l) => l.neurona))).filter((n) => n && !antes.has(n));
}

export interface DepsArranque {
    espejo(): Promise<void>;
    aprender(l: readonly LigaduraMin[]): Promise<unknown>;
    /** Reintenta el buzón; devuelve cuántos salieron. */
    drenar(): Promise<number>;
    /** Enlaces ligados ahora, de todos los medios (Bluetooth, red local nativa). */
    ligaduras(): LigaduraMin[];
    /** Se suscribe a cambios de enlaces; devuelve la baja. Reintenta si el motor aún no existe. */
    suscribir(cb: () => void): () => void;
    poner(f: () => void, ms: number): unknown;
    quitar(h: unknown): void;
}

/**
 * Corazón puro del arranque: suscripción → aprender + drenar al ligarse una neurona nueva.
 * Devuelve la parada y `alCambiar` (para pruebas: simula un cambio sin esperar).
 */
export function crearArranque(deps: DepsArranque): { parar(): void; alCambiar(): Promise<void> } {
    let vivo = true;
    let ligadasAntes = new Set<string>();
    let pendiente: unknown = null;

    const alCambiar = async () => {
        if (!vivo) return;
        const ahora = deps.ligaduras();
        const nuevas = recienLigadas(ligadasAntes, ahora);
        ligadasAntes = new Set(ahora.map((l) => l.neurona));
        if (!ahora.length) return;
        await deps.aprender(ahora).catch(() => undefined);
        if (!nuevas.length) return;
        // Agrupa saludos seguidos (los dos medios a la vez, varias neuronas) en un solo reintento.
        if (pendiente != null) deps.quitar(pendiente);
        pendiente = deps.poner(() => {
            pendiente = null;
            if (vivo) void deps.drenar().catch(() => undefined);
        }, ESPERA_DRENAJE_MS);
    };

    const baja = deps.suscribir(() => void alCambiar());
    void deps.espejo().then(() => alCambiar()).catch(() => undefined);
    return {
        alCambiar,
        parar() {
            vivo = false;
            if (pendiente != null) deps.quitar(pendiente);
            baja();
        },
    };
}

/* ══════════════════════════ Dependencias reales ══════════════════════════ */

function depsReales(): DepsArranque {
    return {
        espejo: () => cargarEspejo(),
        aprender: (l) => aprender(l),
        // (BLE1108B) Por el disparador único del buzón: un enlace que se registra no lanza dos reintentos.
        drenar: async () => {
            (await import("@/lib/mensajeria/neuronas/buzon")).reintentarAlEnlazar("arranque sin internet");
            return 0;
        },
        ligaduras: () => {
            const out: LigaduraMin[] = [];
            try {
                // Los motores se importan perezosos y SOLO si ya existen: este módulo no los arranca.
                const ble = bleActivo?.();
                if (ble) out.push(...ble.instantanea().ligaduras);
            } catch {
                /* sin Bluetooth */
            }
            try {
                const rl = redLocalActiva?.();
                if (rl) out.push(...rl.instantanea().ligaduras);
            } catch {
                /* sin red local nativa */
            }
            return out;
        },
        suscribir: (cb) => suscribirMotores(cb),
        poner: (f, ms) => setTimeout(f, ms),
        quitar: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
}

type Motor = { instantanea(): { ligaduras: LigaduraMin[] }; suscribir(cb: () => void): () => void };
let bleActivo: (() => Motor | null) | null = null;
let redLocalActiva: (() => Motor | null) | null = null;

/** Se engancha a los motores cuando existen (arrancan después que este módulo) y reintenta cada 2 s hasta 2 min. */
function suscribirMotores(cb: () => void): () => void {
    const bajas = new Map<string, () => void>();
    let vivo = true;
    let intentos = 0;
    const enganchar = () => {
        if (!vivo) return;
        for (const [id, motor] of [
            ["ble", bleActivo?.()],
            ["rl", redLocalActiva?.()],
        ] as const) {
            if (motor && !bajas.has(id)) {
                bajas.set(id, motor.suscribir(cb));
                cb();
            }
        }
        if (++intentos < 60) timer = setTimeout(enganchar, 2_000);
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
        try {
            const [ble, rl] = await Promise.all([import("@/lib/malla/bluetooth-directo-motor"), import("@/lib/malla/red-local-nativa-motor")]);
            bleActivo = () => ble.bluetoothDirectoActivo() as unknown as Motor | null;
            redLocalActiva = () => rl.redLocalNativaActiva() as unknown as Motor | null;
        } catch {
            /* sin motores nativos (navegador): nada que escuchar */
        }
        enganchar();
    })();
    return () => {
        vivo = false;
        if (timer) clearTimeout(timer);
        for (const b of bajas.values()) {
            try {
                b();
            } catch {
                /* */
            }
        }
    };
}

/** Copia ligera de los cerebros de la cuenta (pertenencia). Con internet; nunca guarda servidores ni claves. */
async function copiarCerebros(): Promise<void> {
    try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        const [{ uidActual }, { listarCerebros }] = await Promise.all([import("@/lib/consumo/usuario"), import("@/lib/brains/brains")]);
        const uid = await uidActual();
        if (!uid) return;
        const r = await listarCerebros();
        if (!r.ok) return;
        await instantaneaCuenta().escribir(
            "cerebros",
            uid,
            r.brains.map((b) => ({ id: b.id, name: b.name, updated_at: (b as unknown as Record<string, unknown>).updated_at })),
        );
    } catch {
        /* sin copia esta vez */
    }
}

let parada: (() => void) | null = null;

/** Lo monta `MallaNeuronasMount`. Devuelve la parada. */
export function iniciarArranqueSinRed(): () => void {
    if (typeof window === "undefined") return () => undefined;
    parada?.();
    const a = crearArranque(depsReales());
    const t1 = setInterval(() => void cargarEspejo().catch(() => undefined), REFRESCO_ESPEJO_MS);
    const t2 = setInterval(() => void copiarCerebros(), CADA_COPIA_CEREBROS_MS);
    const t3 = setTimeout(() => void copiarCerebros(), 20_000);
    const alVolverLaRed = () => {
        void cargarEspejo().catch(() => undefined);
        void a.alCambiar();
        void depsReales().drenar().catch(() => undefined);
    };
    window.addEventListener("online", alVolverLaRed);
    parada = () => {
        a.parar();
        clearInterval(t1);
        clearInterval(t2);
        clearTimeout(t3);
        window.removeEventListener("online", alVolverLaRed);
    };
    return () => {
        parada?.();
        parada = null;
    };
}
