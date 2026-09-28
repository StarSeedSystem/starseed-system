/**
 * CONTROLADOR de una sala compartida (una sala de juegos o un programa en vivo).
 *
 * Es el cerebro común: sostiene el diario (`Registro`), lo reconstruye con las reglas del motor,
 * difunde cada entrada al momento por un canal de difusión, la guarda en `os_spaces` con
 * escritura diferida y compare-and-swap, y se fusiona con lo que llega de los demás sin perder
 * trabajo ni partirse en dos realidades. No sabe nada de Supabase ni de React: recibe un
 * `Transporte` y una `Persistencia` (las implementaciones reales están en
 * `transporte-supabase.ts`; las pruebas usan versiones en memoria), y se ofrece como almacén
 * externo (`subscribe` / `getSnapshot`) para `useSyncExternalStore`.
 *
 * Garantías (y sus límites, dichos con honestidad):
 *   · Cada entrada —propia o ajena— pasa por las mismas reglas puras; las inválidas se rechazan
 *     igual en todos los dispositivos.
 *   · Recargar o llegar tarde reconstruye la sala repitiendo el diario guardado.
 *   · El canal de difusión NO autentica al remitente: la «autoridad» es el diario guardado, que
 *     solo pueden escribir quienes tienen permiso de edición en `os_spaces` (RLS).
 *   · Si dos personas hacen a la vez cosas incompatibles, gana una (la de menor marca de tiempo)
 *     y a la otra se le vuelve a intentar su acción encima, o se le dice que ya no era posible.
 *
 * Tráfico: una difusión por entrada, un guardado por ráfaga (≥ 700 ms de espera), sin sondeo.
 * Si el guardado falla no se reintenta en bucle: 4 intentos espaciados y se avisa.
 */
import {
    docVacio,
    fusionarDocs,
    reconstruir,
    sanearDoc,
    sanearEntrada,
    sanearRegistro,
    validarRegistro,
    type BuscarMotor,
} from "./registro";
import {
    DESFASE_MAX_MS,
    LIMITE_HISTORIAL,
    type Datos,
    type DocSala,
    type Entrada,
    type Extra,
    type Json,
    type MotorCualquiera,
    type Presente,
    type Registro,
    type ResumenPartida,
    type Yo,
} from "./tipos";

// ───────────────────────────── Contratos de entrada ─────────────────────────────

export type EstadoConexion = "conectando" | "en-vivo" | "caido";

export interface Transporte {
    /** Envía un evento a los demás (sin eco). Si no hay conexión, se pierde: la resincronización lo cubre. */
    enviar(evento: string, carga: unknown): void;
    suscribir(alRecibir: (evento: string, carga: unknown) => void, alEstado: (e: EstadoConexion) => void): () => void;
    /** Se anuncia como presente en la sala. */
    anunciar(yo: Presente): void;
    alPresentes(cb: (lista: Presente[]) => void): () => void;
}

export type ResultadoLeer =
    | { ok: true; doc: unknown; soloLectura?: boolean; titulo?: string | null }
    | { ok: false; error: string };

export type ResultadoEscribir =
    | { ok: true; doc: unknown }
    | { ok: false; error: string; denegado?: boolean };

export interface Persistencia {
    leer(): Promise<ResultadoLeer>;
    /** Lee-fusiona-escribe con compare-and-swap. `fn` recibe el documento guardado (saneado) y devuelve el nuevo. */
    escribir(fn: (guardado: DocSala | null) => DocSala | null): Promise<ResultadoEscribir>;
    /** Avisa de los cambios guardados por OTRAS personas o dispositivos. */
    alCambiar(cb: (doc: unknown) => void): () => void;
}

// ───────────────────────────── Instantánea ─────────────────────────────

export interface Instantanea {
    fase: "cargando" | "listo" | "error";
    error: string | null;
    /** Un aviso pasajero (guardado fallido, acción que ya no era posible…). */
    aviso: string | null;
    soloLectura: boolean;
    conexion: EstadoConexion;
    yo: Yo;
    titulo: string | null;
    registro: Registro | null;
    /** El estado del motor tras repetir el diario (o null si no hay registro). */
    estado: unknown;
    historial: ResumenPartida[];
    extras: Record<string, Extra>;
    presentes: Presente[];
    /** Entradas propias aún sin guardar. */
    pendientes: number;
    /** Entradas ajenas rechazadas por no ser válidas. */
    rechazadas: number;
}

/** Instantánea única mientras no hay controlador: siempre el MISMO objeto (React #185). */
export const INSTANTANEA_VACIA: Instantanea = Object.freeze({
    fase: "cargando",
    error: null,
    aviso: null,
    soloLectura: true,
    conexion: "conectando",
    yo: Object.freeze({ uid: null, nombre: "" }),
    titulo: null,
    registro: null,
    estado: null,
    historial: Object.freeze([]) as unknown as ResumenPartida[],
    extras: Object.freeze({}) as Record<string, Extra>,
    presentes: Object.freeze([]) as unknown as Presente[],
    pendientes: 0,
    rechazadas: 0,
}) as Instantanea;

export interface OpcionesControlador {
    tipoDoc: "juego" | "programa";
    yo: Yo;
    transporte: Transporte;
    persistencia: Persistencia;
    buscarMotor: BuscarMotor;
    ahora?: () => number;
    idNuevo?: () => string;
    retardoGuardadoMs?: number;
}

export type ResultadoAccion = { ok: true } | { ok: false; motivo: string };

const MAX_FUTURAS = 60;
const MAX_REINTENTOS_GUARDADO = 4;
const ESPERA_ENTRE_SYNC_MS = 1_500;
const MAX_BYTES_SYNC = 150_000;

function idAleatorio(): string {
    try {
        const c = globalThis.crypto;
        if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 16);
    } catch {
        /* sigue */
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class Controlador {
    private readonly opciones: OpcionesControlador;
    private readonly ahora: () => number;
    private readonly idNuevo: () => string;
    private readonly retardo: number;

    private yo: Yo;
    private doc: DocSala;
    private motor: MotorCualquiera | null = null;
    private estado: unknown = null;
    private pendientes: Entrada[] = [];
    private futuras: Entrada[] = [];
    private rechazadas = 0;
    private fase: Instantanea["fase"] = "cargando";
    private error: string | null = null;
    private aviso: string | null = null;
    /** El servidor (RLS) no deja escribir a esta cuenta. */
    private denegado = false;
    private conexion: EstadoConexion = "conectando";
    private titulo: string | null = null;
    private presentes: Presente[] = [];

    private snap: Instantanea;
    private oyentes = new Set<() => void>();
    private efimeros = new Map<string, Set<(carga: unknown) => void>>();
    private bajas: (() => void)[] = [];

    private temporizadorGuardado: ReturnType<typeof setTimeout> | null = null;
    private guardando = false;
    private guardarOtraVez = false;
    private sucio = false;
    /** Contador de cambios sin guardar: un guardado solo limpia lo que existía cuando empezó. */
    private cambios = 0;
    private fallosGuardado = 0;
    private ultimoSync = 0;
    private ultimaRespuestaSync = { largo: -1, t: 0 };
    private cerrado = false;
    private huboConexion = false;

    constructor(opciones: OpcionesControlador) {
        this.opciones = opciones;
        this.ahora = opciones.ahora ?? (() => Date.now());
        this.idNuevo = opciones.idNuevo ?? idAleatorio;
        this.retardo = opciones.retardoGuardadoMs ?? 700;
        this.yo = opciones.yo;
        this.doc = docVacio(opciones.tipoDoc);
        this.snap = this.construirInstantanea();
    }

    // ───────────────────────────── Almacén externo ─────────────────────────────

    subscribe = (cb: () => void): (() => void) => {
        this.oyentes.add(cb);
        return () => {
            this.oyentes.delete(cb);
        };
    };

    getSnapshot = (): Instantanea => this.snap;

    private construirInstantanea(): Instantanea {
        return {
            fase: this.fase,
            error: this.error,
            aviso: this.aviso,
            soloLectura: this.esSoloLectura(),
            conexion: this.conexion,
            yo: this.yo,
            titulo: this.titulo,
            registro: this.doc.registro,
            estado: this.estado,
            historial: this.doc.historial,
            extras: this.doc.extras,
            presentes: this.presentes,
            pendientes: this.pendientes.length,
            rechazadas: this.rechazadas,
        };
    }

    private marcarSucio(): void {
        this.sucio = true;
        this.cambios += 1;
    }

    private esSoloLectura(): boolean {
        return !this.yo.uid || this.denegado;
    }

    /** Publica una instantánea NUEVA (y solo entonces). */
    private emitir(): void {
        this.snap = this.construirInstantanea();
        for (const cb of [...this.oyentes]) {
            try {
                cb();
            } catch {
                /* un oyente roto no rompe a los demás */
            }
        }
    }

    // ───────────────────────────── Ciclo de vida ─────────────────────────────

    /** Abre la sala: escucha, lee lo guardado y se anuncia. Nunca lanza. */
    async iniciar(): Promise<void> {
        const { transporte, persistencia } = this.opciones;
        try {
            this.bajas.push(
                transporte.suscribir(
                    (evento, carga) => this.recibir(evento, carga),
                    (e) => this.alConexion(e),
                ),
            );
            this.bajas.push(transporte.alPresentes((lista) => {
                this.presentes = lista;
                this.emitir();
            }));
            this.bajas.push(persistencia.alCambiar((doc) => this.adoptarDocBruto(doc)));
        } catch {
            /* sin tiempo real seguimos con lo guardado */
        }
        if (this.yo.uid) transporte.anunciar({ uid: this.yo.uid, nombre: this.yo.nombre });

        const leido = await persistencia.leer();
        if (this.cerrado) return;
        if (!leido.ok) {
            this.fase = "error";
            this.error = leido.error;
            this.emitir();
            return;
        }
        if (leido.soloLectura) this.denegado = true;
        this.titulo = leido.titulo ?? null;
        const guardado = sanearDoc(leido.doc);
        if (leido.doc && typeof leido.doc === "object" && Object.keys(leido.doc as object).length > 0 && !guardado) {
            this.fase = "error";
            this.error = "Este espacio no es una sala de este tipo.";
            this.emitir();
            return;
        }
        if (guardado && guardado.vivo.tipo !== this.opciones.tipoDoc) {
            this.fase = "error";
            this.error = guardado.vivo.tipo === "programa" ? "Este espacio es un programa, no un juego." : "Este espacio es un juego, no un programa.";
            this.emitir();
            return;
        }
        this.fase = "listo";
        this.fusionarConLocal(guardado);
        this.emitir();
        if (this.conexion === "en-vivo") this.pedirSync(true);
    }

    /** Vuelve a leer lo guardado y pide a los presentes lo que no esté guardado (al volver a la pestaña o a la red). */
    async refrescar(): Promise<void> {
        if (this.cerrado) return;
        const leido = await this.opciones.persistencia.leer();
        if (this.cerrado || !leido.ok) return;
        this.fusionarConLocal(sanearDoc(leido.doc));
        this.emitir();
        this.pedirSync();
    }

    /** Cierra: guarda lo pendiente (mejor esfuerzo) y suelta todo. */
    cerrar(): void {
        if (this.cerrado) return;
        if (this.sucio && !this.esSoloLectura()) void this.guardar();
        this.cerrado = true;
        if (this.temporizadorGuardado) clearTimeout(this.temporizadorGuardado);
        for (const baja of this.bajas.splice(0)) {
            try {
                baja();
            } catch {
                /* noop */
            }
        }
        this.oyentes.clear();
        this.efimeros.clear();
    }

    /** Guarda ya (al ocultar o cerrar la pestaña). */
    vaciarCola(): void {
        if (this.temporizadorGuardado) {
            clearTimeout(this.temporizadorGuardado);
            this.temporizadorGuardado = null;
        }
        if (this.sucio && !this.esSoloLectura()) void this.guardar();
    }

    fijarYo(yo: Yo): void {
        this.yo = yo;
        if (yo.uid) this.opciones.transporte.anunciar({ uid: yo.uid, nombre: yo.nombre });
        this.emitir();
    }

    descartarAviso(): void {
        if (this.aviso === null) return;
        this.aviso = null;
        this.emitir();
    }

    // ───────────────────────────── Acciones ─────────────────────────────

    /**
     * Hace algo en la sala: valida con las reglas, lo aplica al momento (optimista), lo difunde y
     * lo guarda. Devuelve `{ ok:false, motivo }` si las reglas no lo permiten.
     */
    proponer(k: string, d?: Datos): ResultadoAccion {
        const uid = this.yo.uid;
        if (!uid) return { ok: false, motivo: "Inicia sesión para participar." };
        if (this.denegado) return { ok: false, motivo: "Tienes permiso solo para mirar." };
        const registro = this.doc.registro;
        if (!registro || !this.motor) return { ok: false, motivo: "Aún no hay nada abierto." };
        const entrada: Entrada = {
            id: this.idNuevo(),
            n: registro.log.length,
            u: uid,
            t: this.ahora(),
            k,
            ...(d ? { d } : {}),
        };
        const r = this.motor.aplicar(this.estado, entrada);
        if (!r.ok) return { ok: false, motivo: r.motivo };
        this.doc = { ...this.doc, registro: { ...registro, log: [...registro.log, entrada] } };
        this.estado = r.estado;
        this.pendientes = [...this.pendientes, entrada];
        this.marcarSucio();
        this.opciones.transporte.enviar("op", { rid: registro.id, gen: registro.gen, e: entrada });
        this.programarGuardado();
        this.emitir();
        return { ok: true };
    }

    /**
     * Sustituye el registro por uno nuevo (revancha, otro juego, compactación). Si el anterior
     * había terminado, su resumen pasa al historial.
     */
    nuevoRegistro(tipo: string, base: Datos, opciones: { continuidad?: boolean } = {}): ResultadoAccion {
        const uid = this.yo.uid;
        if (!uid) return { ok: false, motivo: "Inicia sesión para participar." };
        if (this.denegado) return { ok: false, motivo: "Tienes permiso solo para mirar." };
        const motor = this.opciones.buscarMotor(tipo);
        if (!motor) return { ok: false, motivo: "No conozco ese tipo." };
        try {
            motor.inicial(base);
        } catch {
            return { ok: false, motivo: "La configuración no es válida." };
        }
        const actual = this.doc.registro;
        let historial = this.doc.historial;
        let resumen: ResumenPartida | null = null;
        if (actual && this.motor && this.estado !== null && this.motor.resumen) {
            resumen = this.motor.resumen(this.estado, actual);
            if (resumen && !historial.some((h) => h.id === resumen!.id)) {
                historial = [...historial, resumen].slice(-LIMITE_HISTORIAL);
            } else {
                resumen = null;
            }
        }
        const nuevo: Registro = {
            id: this.idNuevo(),
            tipo,
            gen: (actual?.gen ?? 0) + 1,
            creada: this.ahora(),
            base,
            log: [],
            ...(opciones.continuidad ? { continuidad: true } : {}),
        };
        this.doc = { ...this.doc, registro: nuevo, historial };
        this.motor = motor;
        this.estado = motor.inicial(base);
        if (!opciones.continuidad) this.pendientes = [];
        this.futuras = [];
        this.marcarSucio();
        this.opciones.transporte.enviar("registro", { registro: nuevo, resumen });
        this.emitir();
        this.vaciarCola();
        return { ok: true };
    }

    /** Guarda un dato suelto de la sala (p. ej. el dibujo en curso). Gana la versión mayor. */
    guardarExtra(clave: string, d: Json): void {
        if (this.esSoloLectura()) return;
        this.doc = { ...this.doc, extras: { ...this.doc.extras, [clave]: { v: this.ahora(), d } } };
        this.marcarSucio();
        this.programarGuardado();
        this.emitir();
    }

    /** Quita un dato suelto (se guarda como `null` con versión nueva, para que gane a la anterior). */
    borrarExtra(clave: string): void {
        this.guardarExtra(clave, null);
    }

    /** Mensaje efímero (trazos, intentos de adivinar…): va por difusión, no se guarda. */
    enviarEfimero(nombre: string, carga: unknown): void {
        if (!this.yo.uid) return;
        this.opciones.transporte.enviar(`e:${nombre}`, carga);
    }

    alEfimero(nombre: string, cb: (carga: unknown) => void): () => void {
        let set = this.efimeros.get(nombre);
        if (!set) {
            set = new Set();
            this.efimeros.set(nombre, set);
        }
        set.add(cb);
        return () => {
            set?.delete(cb);
        };
    }

    // ───────────────────────────── Recepción ─────────────────────────────

    private alConexion(e: EstadoConexion): void {
        const antes = this.conexion;
        this.conexion = e;
        if (e === "en-vivo") {
            const volvio = this.huboConexion && antes === "caido";
            this.huboConexion = true;
            if (this.fase === "listo") {
                this.pedirSync(true);
                if (volvio) void this.refrescar();
            }
        }
        this.emitir();
    }

    private recibir(evento: string, carga: unknown): void {
        if (this.cerrado) return;
        try {
            if (evento === "op") return this.recibirOp(carga);
            if (evento === "registro") return this.recibirRegistro(carga);
            if (evento === "pedir") return this.recibirPedir(carga);
            if (evento === "sync") return this.recibirSync(carga);
            if (evento.startsWith("e:")) {
                const set = this.efimeros.get(evento.slice(2));
                if (set) for (const cb of [...set]) cb(carga);
            }
        } catch {
            /* un mensaje roto nunca tumba la sala */
        }
    }

    private recibirOp(carga: unknown): void {
        const c = carga as { rid?: unknown; gen?: unknown; e?: unknown } | null;
        const entrada = sanearEntrada(c?.e);
        if (!entrada || typeof c?.rid !== "string" || typeof c.gen !== "number") return;
        if (entrada.t > this.ahora() + DESFASE_MAX_MS) {
            this.rechazadas += 1;
            return this.emitir();
        }
        const registro = this.doc.registro;
        if (!registro || !this.motor) {
            this.pedirSync();
            return;
        }
        if (c.rid !== registro.id || c.gen !== registro.gen) {
            if (c.gen > registro.gen || c.rid !== registro.id) this.pedirSync();
            return;
        }
        if (registro.log.some((x) => x.id === entrada.id)) return;

        if (entrada.n < registro.log.length) {
            // Compite con una entrada nuestra por el mismo sitio: se decide con la regla común.
            this.fusionarConLocal({ ...this.doc, registro: { ...registro, log: [entrada] } });
            return this.emitir();
        }
        if (entrada.n > registro.log.length) {
            if (this.futuras.length < MAX_FUTURAS && !this.futuras.some((x) => x.id === entrada.id)) {
                this.futuras.push(entrada);
            }
            this.pedirSync();
            return;
        }
        this.aplicarAjena(entrada);
        this.emitir();
    }

    /** Aplica una entrada ajena que es justo la siguiente; luego las futuras que encajen. */
    private aplicarAjena(entrada: Entrada): void {
        const registro = this.doc.registro;
        if (!registro || !this.motor) return;
        const r = this.motor.aplicar(this.estado, entrada);
        if (!r.ok) {
            this.rechazadas += 1;
            return;
        }
        this.doc = { ...this.doc, registro: { ...registro, log: [...registro.log, entrada] } };
        this.estado = r.estado;
        this.marcarSucio(); // hay que guardarla también: cualquiera puede ser quien la persista
        this.programarGuardado();
        // Las futuras que ahora encajan.
        if (this.futuras.length > 0) {
            const siguiente = this.futuras.findIndex((x) => x.n === this.doc.registro!.log.length);
            if (siguiente >= 0) {
                const [x] = this.futuras.splice(siguiente, 1);
                this.aplicarAjena(x);
            }
        }
    }

    private recibirRegistro(carga: unknown): void {
        const c = carga as { registro?: unknown; resumen?: unknown } | null;
        const registro = sanearRegistro(c?.registro);
        if (!registro) return;
        const resumen = c?.resumen && typeof c.resumen === "object" ? [c.resumen as ResumenPartida] : [];
        const historial = sanearDoc({ v: 1, vivo: { tipo: this.opciones.tipoDoc }, registro: null, historial: resumen, extras: {} })?.historial ?? [];
        this.fusionarConLocal({ ...this.doc, registro, historial, extras: {} });
        this.emitir();
    }

    private recibirPedir(carga: unknown): void {
        const c = carga as { rid?: unknown; gen?: unknown; n?: unknown } | null;
        const registro = this.doc.registro;
        if (!registro || typeof c?.gen !== "number" || typeof c.n !== "number") return;
        const misma = c.rid === registro.id && c.gen === registro.gen;
        const tengoMas = misma ? registro.log.length > c.n : registro.gen >= c.gen;
        if (!tengoMas) return;
        const espera = Math.floor(Math.random() * 250);
        setTimeout(() => {
            if (this.cerrado || !this.doc.registro) return;
            const vista = this.ultimaRespuestaSync;
            if (vista.largo >= this.doc.registro.log.length && this.ahora() - vista.t < 600) return;
            if (JSON.stringify(this.doc.registro).length > MAX_BYTES_SYNC) return;
            this.opciones.transporte.enviar("sync", { registro: this.doc.registro });
        }, espera);
    }

    private recibirSync(carga: unknown): void {
        const c = carga as { registro?: unknown } | null;
        const registro = sanearRegistro(c?.registro);
        if (!registro) return;
        this.ultimaRespuestaSync = { largo: registro.log.length, t: this.ahora() };
        this.fusionarConLocal({ ...this.doc, registro, historial: [], extras: {} });
        this.emitir();
    }

    private pedirSync(forzar = false): void {
        const t = this.ahora();
        if (!forzar && t - this.ultimoSync < ESPERA_ENTRE_SYNC_MS) return;
        this.ultimoSync = t;
        const registro = this.doc.registro;
        this.opciones.transporte.enviar("pedir", {
            rid: registro?.id ?? null,
            gen: registro?.gen ?? -1,
            n: registro?.log.length ?? 0,
        });
    }

    private adoptarDocBruto(doc: unknown): void {
        if (this.cerrado) return;
        const guardado = sanearDoc(doc);
        if (!guardado) return;
        this.fusionarConLocal(guardado);
        this.emitir();
    }

    // ───────────────────────────── Fusión con lo local ─────────────────────────────

    /**
     * Fusiona `otro` con el documento local con las reglas comunes, deja el diario validado y
     * reintenta encima lo propio que se quedó fuera.
     */
    private fusionarConLocal(otro: DocSala | null): void {
        if (!otro) return;
        const antes = this.doc.registro;
        const { doc } = fusionarDocs(this.opciones.buscarMotor, this.doc, otro);
        if (!doc) return;
        let registro = doc.registro;
        let estado: unknown = this.estado;
        let motor = this.motor;
        if (registro) {
            motor = this.opciones.buscarMotor(registro.tipo);
            if (motor) {
                const v = validarRegistro(motor, registro);
                registro = v.registro;
                estado = v.estado;
                if (v.descartadas > 0) this.rechazadas += v.descartadas;
            } else {
                estado = null;
            }
        }
        const cambioDeRegistro = !antes || !registro || antes.id !== registro.id || antes.gen !== registro.gen;
        this.doc = { ...doc, registro };
        this.motor = motor;
        this.estado = estado;
        if (cambioDeRegistro) this.futuras = [];

        // Lo propio que ya no está en el diario: o se vuelve a intentar encima, o se dice que ya no valía.
        const enLog = new Set((registro?.log ?? []).map((e) => e.id));
        const idsBase = registro?.base.ids;
        if (Array.isArray(idsBase)) for (const id of idsBase) if (typeof id === "string") enLog.add(id);
        const perdidas = this.pendientes.filter((p) => !enLog.has(p.id));
        this.pendientes = this.pendientes.filter((p) => enLog.has(p.id));
        if (perdidas.length > 0 && registro) {
            const seguir = !cambioDeRegistro || registro.continuidad === true;
            if (seguir) this.reintentar(perdidas);
            else this.aviso = "La partida cambió y tu última acción ya no cuenta.";
        }
        this.limpiarFuturas();
    }

    private limpiarFuturas(): void {
        const registro = this.doc.registro;
        if (!registro || this.futuras.length === 0) return;
        this.futuras = this.futuras.filter((f) => f.n >= registro.log.length);
        let seguir = true;
        while (seguir && this.futuras.length > 0 && this.doc.registro) {
            const i = this.futuras.findIndex((x) => x.n === this.doc.registro!.log.length);
            if (i < 0) break;
            const [x] = this.futuras.splice(i, 1);
            const antes = this.doc.registro.log.length;
            this.aplicarAjena(x);
            seguir = (this.doc.registro?.log.length ?? 0) > antes;
        }
    }

    private reintentar(perdidas: Entrada[]): void {
        const ordenadas = [...perdidas].sort((a, b) => a.n - b.n);
        let fallo: string | null = null;
        for (const p of ordenadas) {
            const r = this.proponer(p.k, p.d);
            if (!r.ok) fallo = r.motivo;
        }
        if (fallo) this.aviso = `Tu última acción ya no era posible: ${fallo}`;
    }

    // ───────────────────────────── Guardado ─────────────────────────────

    private programarGuardado(): void {
        if (this.esSoloLectura() || this.cerrado) return;
        if (this.temporizadorGuardado) clearTimeout(this.temporizadorGuardado);
        this.temporizadorGuardado = setTimeout(() => {
            this.temporizadorGuardado = null;
            void this.guardar();
        }, this.retardo);
    }

    private async guardar(): Promise<void> {
        if (this.esSoloLectura() || !this.sucio) return;
        if (this.guardando) {
            this.guardarOtraVez = true;
            return;
        }
        this.guardando = true;
        const marca = this.cambios;
        try {
            const r = await this.opciones.persistencia.escribir((guardado) => {
                const { doc } = fusionarDocs(this.opciones.buscarMotor, guardado, this.doc);
                return doc;
            });
            if (this.cerrado) return;
            if (!r.ok) {
                if (r.denegado) {
                    this.denegado = true;
                    this.aviso = "Solo tienes permiso para mirar: lo que hagas no se guardará.";
                } else {
                    this.fallosGuardado += 1;
                    if (this.fallosGuardado <= MAX_REINTENTOS_GUARDADO) {
                        this.aviso = "No se pudo guardar; se reintentará. Se sigue jugando en directo.";
                        this.temporizadorGuardado = setTimeout(() => {
                            this.temporizadorGuardado = null;
                            void this.guardar();
                        }, this.retardo * 2 ** this.fallosGuardado);
                    } else {
                        this.aviso = "No se puede guardar ahora: la partida sigue en directo, pero al recargar podría perderse.";
                    }
                }
                this.emitir();
                return;
            }
            this.fallosGuardado = 0;
            const guardado = sanearDoc(r.doc);
            // Solo se limpia lo que ya existía cuando empezó este guardado.
            if (this.cambios === marca) this.sucio = false;
            // Lo propio que ya está en el guardado deja de estar pendiente.
            const guardadas = new Set((guardado?.registro?.log ?? []).map((e) => e.id));
            const plegadas = guardado?.registro?.base.ids; // ids ya incluidos en un registro compactado
            if (Array.isArray(plegadas)) for (const id of plegadas) if (typeof id === "string") guardadas.add(id);
            this.fusionarConLocal(guardado);
            this.pendientes = this.pendientes.filter((p) => !guardadas.has(p.id));
            if (this.aviso && this.aviso.startsWith("No se pudo guardar")) this.aviso = null;
            this.emitir();
        } finally {
            this.guardando = false;
            if (this.guardarOtraVez && !this.cerrado) {
                this.guardarOtraVez = false;
                this.marcarSucio();
                this.programarGuardado();
            }
        }
    }

    // ───────────────────────────── Consultas ─────────────────────────────

    /** Reconstruye desde cero el estado del registro actual (para comprobar la determinación). */
    reconstruirDesdeCero(): unknown {
        const registro = this.doc.registro;
        const motor = registro ? this.opciones.buscarMotor(registro.tipo) : null;
        return registro && motor ? reconstruir(motor, registro).estado : null;
    }
}

export function crearControlador(opciones: OpcionesControlador): Controlador {
    return new Controlador(opciones);
}
