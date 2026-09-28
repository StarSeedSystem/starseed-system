/**
 * Motor de edición COLABORATIVA sobre un espacio `os_spaces` (2026-09-28).
 *
 * Genérico en el documento `D` (lo usan la tabla de datos y el panel compartido): quien lo
 * instancia aporta cómo leer/guardar/escuchar el espacio y cómo FUSIONAR dos versiones; el motor
 * se encarga de todo lo demás:
 *
 *   · Estado local instantáneo (`aplicar`) + guardado con retardo (mín. 600 ms, máx. 5 s bajo
 *     ediciones continuas, nunca dos guardados a menos de 600 ms).
 *   · Guardado COMPARE-AND-SWAP por `rev`: se escribe solo si el espacio sigue como lo vimos; si
 *     alguien escribió antes, se lee, se FUSIONA y se reintenta (hasta 4 veces). Así dos personas
 *     nunca se pisan aunque guarden a la vez.
 *   · Cambios de otras personas por Realtime (una sola suscripción con filtro `id=eq.<id>`),
 *     fusionados con lo local; si lo local aporta algo que el servidor no tiene, se vuelve a guardar.
 *   · Sin red o con error: reintentos con espera creciente (2 s, 5 s, 15 s, 30 s) SIN bucles; los
 *     cambios quedan en un borrador local y se recuperan si se recarga la página.
 *   · Sin permiso: el doc pasa a solo lectura con un aviso, no se insiste.
 *   · Deshacer/rehacer solo de lo propio (si el documento lo soporta).
 *
 * El snapshot es un objeto ESTABLE: `getSnapshot()` devuelve la misma referencia mientras nada
 * cambie (requisito de `useSyncExternalStore`; un snapshot nuevo por lectura provocó el bucle
 * React #185 en producción).
 */
import type { Ctx } from "./modelo";

// ───────────────────────────── contratos ─────────────────────────────

export interface EspacioLeido {
    id: string;
    titulo: string;
    doc: Record<string, unknown>;
    rev: number;
    propietario: string;
    acceso: string;
}

export type ResultadoLeer =
    | { ok: true; espacio: EspacioLeido }
    | { ok: false; motivo: "no-encontrado" | "red" | "sin-sesion" };

export type ResultadoGuardar =
    | { ok: true; espacio: EspacioLeido }
    | { ok: false; motivo: "conflicto" | "sin-permiso" | "red" | "desaparecido" };

/** Lo que llega por Realtime (el `doc` puede faltar si la fila era demasiado grande). */
export interface CambioRemoto {
    rev: number;
    doc?: Record<string, unknown> | null;
    titulo?: string;
}

export interface RelojMotor {
    ahora(): number;
    poner(f: () => void, ms: number): unknown;
    quitar(id: unknown): void;
}

export const RELOJ_REAL: RelojMotor = {
    ahora: () => Date.now(),
    poner: (f, ms) => setTimeout(f, ms),
    quitar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface Paso<D> {
    antes: D;
    despues: D;
}

export interface DepsMotor<D> {
    cargar(): Promise<ResultadoLeer>;
    guardar(doc: Record<string, unknown>, revEsperada: number): Promise<ResultadoGuardar>;
    suscribir(alCambiar: (c: CambioRemoto) => void): () => void;
    puedeEditar(e: EspacioLeido): Promise<boolean>;
    /** Autor abreviado de las escrituras de esta persona. */
    autor: string;
    /** null si el doc del espacio es de este tipo; si no, el motivo (en español). */
    validar(doc: Record<string, unknown>): string | null;
    extraer(doc: Record<string, unknown>): D;
    /** Fusiona `b` en `a`; devuelve `a` (misma referencia) si `b` no aporta nada. */
    fusionar(a: D, b: D): D;
    /** Doc para guardar: conserva las claves ajenas del doc crudo (p. ej. `sharing`). */
    incrustar(base: Record<string, unknown>, d: D): Record<string, unknown>;
    maxTiempo(d: D): number;
    invertirPaso?(paso: Paso<D>, actual: D, c: Ctx): D;
    borrador?: { leer(): D | null; escribir(d: D | null): void };
    debounceMs?: number;
    maxEsperaMs?: number;
    reloj?: RelojMotor;
}

export type FaseMotor = "cargando" | "listo" | "no-disponible";
export type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "reintentando" | "sin-permiso";

export interface SnapshotMotor<D> {
    fase: FaseMotor;
    /** Mensaje en español cuando la fase es «no-disponible» o el guardado necesita atención. */
    motivo: string | null;
    doc: D | null;
    titulo: string;
    propietario: string | null;
    acceso: string | null;
    guardado: EstadoGuardado;
    puedeEditar: boolean;
    /** Sube con cada cambio del documento (local o remoto). */
    version: number;
    puedeDeshacer: boolean;
    puedeRehacer: boolean;
}

const ESPERA_MIN_MS = 600;
const ESPERA_MAX_MS = 5_000;
const REINTENTOS_MS = [2_000, 5_000, 15_000, 30_000];
const MAX_INTENTOS_CONFLICTO = 4;
const MAX_HISTORIAL = 60;

export const SNAPSHOT_INICIAL: SnapshotMotor<never> = Object.freeze({
    fase: "cargando",
    motivo: null,
    doc: null,
    titulo: "",
    propietario: null,
    acceso: null,
    guardado: "limpio",
    puedeEditar: false,
    version: 0,
    puedeDeshacer: false,
    puedeRehacer: false,
}) as SnapshotMotor<never>;

const MENSAJES_CARGA: Record<string, string> = {
    "no-encontrado": "No encontramos este espacio, o no tienes acceso a él. Pide a quien lo creó que te invite.",
    red: "No pudimos conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
    "sin-sesion": "Inicia sesión para abrir este espacio.",
};

// ───────────────────────────── el motor ─────────────────────────────

export class MotorColab<D> {
    private snap: SnapshotMotor<D> = SNAPSHOT_INICIAL as SnapshotMotor<D>;
    private oyentes = new Set<() => void>();
    private doc: D | null = null;
    private base: D | null = null;
    private crudo: Record<string, unknown> = {};
    private rev = 0;
    private ultimoT = 0;
    private sucio = false;
    private guardando = false;
    private otraVez = false;
    private fallos = 0;
    private cerrado = false;
    private iniciado = false;
    private timerGuardar: unknown = null;
    private timerBorrador: unknown = null;
    private timerOcultar: unknown = null;
    private primerPendiente: number | null = null;
    private finUltimoGuardado = 0;
    private desuscribir: (() => void) | null = null;
    private visible = true;
    private deshacerPila: Paso<D>[] = [];
    private rehacerPila: Paso<D>[] = [];
    private readonly reloj: RelojMotor;

    constructor(private readonly deps: DepsMotor<D>) {
        this.reloj = deps.reloj ?? RELOJ_REAL;
    }

    // ── useSyncExternalStore ──
    subscribe = (cb: () => void): (() => void) => {
        this.oyentes.add(cb);
        return () => {
            this.oyentes.delete(cb);
        };
    };
    getSnapshot = (): SnapshotMotor<D> => this.snap;
    getServerSnapshot = (): SnapshotMotor<D> => SNAPSHOT_INICIAL as SnapshotMotor<D>;

    private cambiar(p: Partial<SnapshotMotor<D>>): void {
        const s = this.snap;
        let distinto = false;
        for (const k of Object.keys(p) as (keyof SnapshotMotor<D>)[]) {
            if (!Object.is(s[k], p[k])) {
                distinto = true;
                break;
            }
        }
        if (!distinto) return;
        this.snap = { ...s, ...p };
        for (const cb of [...this.oyentes]) {
            try {
                cb();
            } catch {
                /* un oyente roto no debe tumbar al resto */
            }
        }
    }

    // ── reloj híbrido: una escritura nueva siempre gana a lo que ya vimos ──
    ctx = (): Ctx => {
        const t = Math.max(this.reloj.ahora(), this.ultimoT + 1);
        this.ultimoT = t;
        return { t, a: this.deps.autor };
    };

    // ── arranque ──
    async iniciar(): Promise<void> {
        if (this.iniciado || this.cerrado) return;
        this.iniciado = true;
        const l = await this.deps.cargar();
        if (this.cerrado) return;
        if (!l.ok) {
            this.cambiar({ fase: "no-disponible", motivo: MENSAJES_CARGA[l.motivo] ?? MENSAJES_CARGA.red });
            return;
        }
        const e = l.espacio;
        const invalido = this.deps.validar(e.doc);
        if (invalido) {
            this.cambiar({ fase: "no-disponible", motivo: invalido });
            return;
        }
        this.crudo = e.doc;
        this.rev = e.rev;
        this.base = this.deps.extraer(e.doc);
        let doc = this.base;
        let borrador: D | null = null;
        try {
            borrador = this.deps.borrador?.leer() ?? null;
        } catch {
            borrador = null;
        }
        if (borrador) doc = this.deps.fusionar(doc, borrador);
        this.doc = doc;
        this.ultimoT = this.deps.maxTiempo(doc);
        this.sucio = this.deps.fusionar(this.base, doc) !== this.base;
        let puede = false;
        try {
            puede = await this.deps.puedeEditar(e);
        } catch {
            puede = false;
        }
        if (this.cerrado) return;
        this.desuscribir = this.deps.suscribir((c) => this.alRemoto(c));
        this.cambiar({
            fase: "listo",
            motivo: null,
            doc,
            titulo: e.titulo,
            propietario: e.propietario,
            acceso: e.acceso,
            puedeEditar: puede,
            guardado: this.sucio && puede ? "pendiente" : "limpio",
            version: this.snap.version + 1,
        });
        if (this.sucio && puede) this.programar();
    }

    // ── cambios locales ──
    aplicar(fn: (d: D, c: Ctx) => D, opc: { historial?: boolean } = {}): boolean {
        if (this.cerrado || !this.doc || !this.snap.puedeEditar) return false;
        const nuevo = fn(this.doc, this.ctx());
        if (nuevo === this.doc) return false;
        if (opc.historial !== false && this.deps.invertirPaso) {
            this.deshacerPila = [...this.deshacerPila, { antes: this.doc, despues: nuevo }].slice(-MAX_HISTORIAL);
            this.rehacerPila = [];
        }
        this.poner(nuevo);
        return true;
    }

    deshacer(): boolean {
        return this.recorrerHistorial(this.deshacerPila, this.rehacerPila);
    }

    rehacer(): boolean {
        return this.recorrerHistorial(this.rehacerPila, this.deshacerPila);
    }

    private recorrerHistorial(desde: Paso<D>[], hacia: Paso<D>[]): boolean {
        if (this.cerrado || !this.doc || !this.snap.puedeEditar || !this.deps.invertirPaso) return false;
        const paso = desde.pop();
        if (!paso) return false;
        const nuevo = this.deps.invertirPaso(paso, this.doc, this.ctx());
        hacia.push({ antes: this.doc, despues: nuevo });
        if (hacia.length > MAX_HISTORIAL) hacia.shift();
        this.poner(nuevo);
        return true;
    }

    private poner(nuevo: D): void {
        this.doc = nuevo;
        this.sucio = true;
        this.cambiar({
            doc: nuevo,
            version: this.snap.version + 1,
            guardado: this.snap.guardado === "sin-permiso" ? "sin-permiso" : "pendiente",
            puedeDeshacer: this.deshacerPila.length > 0,
            puedeRehacer: this.rehacerPila.length > 0,
        });
        if (this.snap.guardado !== "sin-permiso") this.programar();
        this.programarBorrador();
    }

    // ── guardado ──
    private programar(espera?: number): void {
        if (this.cerrado) return;
        const ahora = this.reloj.ahora();
        if (this.primerPendiente === null) this.primerPendiente = ahora;
        const debounce = Math.max(ESPERA_MIN_MS, this.deps.debounceMs ?? 900);
        const tope = this.deps.maxEsperaMs ?? ESPERA_MAX_MS;
        let ms = espera ?? Math.min(debounce, Math.max(0, this.primerPendiente + tope - ahora));
        ms = Math.max(ms, this.finUltimoGuardado + ESPERA_MIN_MS - ahora, 0);
        if (this.timerGuardar !== null) this.reloj.quitar(this.timerGuardar);
        this.timerGuardar = this.reloj.poner(() => {
            this.timerGuardar = null;
            void this.guardar();
        }, ms);
    }

    private programarBorrador(): void {
        if (!this.deps.borrador || this.timerBorrador !== null) return;
        this.timerBorrador = this.reloj.poner(() => {
            this.timerBorrador = null;
            try {
                this.deps.borrador?.escribir(this.sucio ? this.doc : null);
            } catch {
                /* sin almacenamiento local */
            }
        }, 1000);
    }

    /** Guarda ya (sin esperar al retardo). Seguro de llamar varias veces. */
    async guardarYa(): Promise<void> {
        if (this.timerGuardar !== null) {
            this.reloj.quitar(this.timerGuardar);
            this.timerGuardar = null;
        }
        await this.guardar();
    }

    private async guardar(): Promise<void> {
        if (this.guardando) {
            this.otraVez = true;
            return;
        }
        if (!this.doc || !this.sucio || !this.snap.puedeEditar) return;
        this.guardando = true;
        this.primerPendiente = null;
        this.cambiar({ guardado: "guardando" });
        try {
            for (let intento = 0; intento < MAX_INTENTOS_CONFLICTO; intento++) {
                const enviado = this.doc as D;
                const r = await this.deps.guardar(this.deps.incrustar(this.crudo, enviado), this.rev);
                if (r.ok) {
                    this.rev = Math.max(this.rev, r.espacio.rev);
                    this.crudo = r.espacio.doc;
                    this.base = enviado;
                    this.fallos = 0;
                    this.finUltimoGuardado = this.reloj.ahora();
                    this.sucio = this.doc !== null && this.deps.fusionar(enviado, this.doc) !== enviado;
                    if (!this.sucio) {
                        try {
                            this.deps.borrador?.escribir(null);
                        } catch {
                            /* nada */
                        }
                        this.cambiar({ guardado: "limpio", motivo: null });
                    } else {
                        this.cambiar({ guardado: "pendiente", motivo: null });
                        this.programar();
                    }
                    return;
                }
                if (r.motivo === "conflicto") {
                    const l = await this.deps.cargar();
                    if (!l.ok) return this.reintentar();
                    this.absorber(l.espacio.doc, l.espacio.rev, l.espacio.titulo);
                    continue;
                }
                if (r.motivo === "desaparecido") {
                    this.cambiar({ fase: "no-disponible", puedeEditar: false, motivo: "Quien lo creó ha eliminado este espacio." });
                    return;
                }
                if (r.motivo === "sin-permiso") {
                    this.cambiar({
                        guardado: "sin-permiso",
                        puedeEditar: false,
                        motivo: "No tienes permiso para editar esto: lo verás en solo lectura. Tus últimos cambios no se han guardado.",
                    });
                    return;
                }
                return this.reintentar();
            }
            this.reintentar();
        } finally {
            this.guardando = false;
            if (this.otraVez) {
                this.otraVez = false;
                if (this.sucio && !this.cerrado) this.programar();
            }
        }
    }

    private reintentar(): void {
        this.fallos += 1;
        const ms = REINTENTOS_MS[Math.min(this.fallos - 1, REINTENTOS_MS.length - 1)];
        this.cambiar({
            guardado: "reintentando",
            motivo: "Sin conexión con el servidor: tus cambios están a salvo en este dispositivo y se guardarán en cuanto vuelva.",
        });
        this.programar(ms);
    }

    // ── cambios ajenos ──
    private alRemoto(c: CambioRemoto): void {
        if (this.cerrado) return;
        if (c.rev <= this.rev) return; // ya lo teníamos (o es más viejo)
        const doc = c.doc;
        if (!doc || typeof doc !== "object" || Object.keys(doc).length === 0) {
            void this.refrescar(); // fila demasiado grande: Realtime no trae el doc
            return;
        }
        this.absorber(doc, c.rev, c.titulo);
    }

    /** Lee lo último del servidor y lo fusiona. */
    async refrescar(): Promise<void> {
        if (this.cerrado || !this.doc) return;
        const l = await this.deps.cargar();
        if (this.cerrado || !l.ok) return;
        this.absorber(l.espacio.doc, l.espacio.rev, l.espacio.titulo);
    }

    private absorber(docCrudo: Record<string, unknown>, rev: number, titulo?: string): void {
        if (!this.doc) return;
        if (rev < this.rev) return;
        this.rev = rev;
        this.crudo = docCrudo;
        const remoto = this.deps.extraer(docCrudo);
        this.base = remoto;
        const fusion = this.deps.fusionar(this.doc, remoto);
        const aporta = this.deps.fusionar(remoto, fusion) !== remoto; // lo local tiene algo que el servidor no
        const p: Partial<SnapshotMotor<D>> = {};
        if (fusion !== this.doc) {
            this.doc = fusion;
            this.ultimoT = Math.max(this.ultimoT, this.deps.maxTiempo(remoto));
            p.doc = fusion;
            p.version = this.snap.version + 1;
        }
        if (titulo !== undefined && titulo !== this.snap.titulo) p.titulo = titulo;
        this.sucio = aporta;
        if (aporta && this.snap.puedeEditar && this.snap.guardado !== "guardando") {
            p.guardado = "pendiente";
            this.cambiar(p);
            this.programar();
            return;
        }
        if (!aporta && this.snap.guardado === "pendiente") p.guardado = "limpio";
        this.cambiar(p);
    }

    // ── ciclo de vida de la pestaña ──
    /** La pestaña se oculta: tras un minuto se suelta el canal (menos tráfico). */
    alOcultar(): void {
        this.visible = false;
        if (this.timerOcultar !== null) this.reloj.quitar(this.timerOcultar);
        this.timerOcultar = this.reloj.poner(() => {
            this.timerOcultar = null;
            if (this.visible || this.cerrado) return;
            this.desuscribir?.();
            this.desuscribir = null;
        }, 60_000);
    }

    /** La pestaña vuelve: se recupera el canal y se lee lo que pasó mientras tanto. */
    alMostrar(): void {
        this.visible = true;
        if (this.timerOcultar !== null) {
            this.reloj.quitar(this.timerOcultar);
            this.timerOcultar = null;
        }
        if (this.cerrado || !this.doc) return;
        if (!this.desuscribir) this.desuscribir = this.deps.suscribir((c) => this.alRemoto(c));
        void this.refrescar();
    }

    /** Vuelve la conexión: se reintenta el guardado pendiente y se pone al día. */
    alVolverRed(): void {
        if (this.cerrado || !this.doc) return;
        if (this.sucio && this.snap.puedeEditar) void this.guardarYa();
        void this.refrescar();
    }

    /** Se cierra la página o el componente: último intento de guardar lo pendiente. */
    destruir(): void {
        if (this.cerrado) return;
        const pendiente = this.sucio && this.snap.puedeEditar && !!this.doc;
        for (const t of [this.timerGuardar, this.timerBorrador, this.timerOcultar]) if (t !== null) this.reloj.quitar(t);
        this.timerGuardar = this.timerBorrador = this.timerOcultar = null;
        this.desuscribir?.();
        this.desuscribir = null;
        if (pendiente) {
            try {
                this.deps.borrador?.escribir(this.doc);
            } catch {
                /* nada */
            }
            void this.guardar().catch(() => undefined);
        }
        this.cerrado = true;
        this.oyentes.clear();
    }
}
