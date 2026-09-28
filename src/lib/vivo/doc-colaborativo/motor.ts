/**
 * Motor de edición a varias manos (2026-09-28 · apps en vivo L2: Documento y Presentación).
 *
 * Un `SalaColaborativa` por documento abierto. Guarda en un `doc` jsonb (os_spaces) una lista de
 * unidades con fusión por unidad (ver `modelo.ts`) y habla con los demás por UN canal:
 *
 *   · Difusión inmediata («unidades»): lo que escribes llega a los demás en ~150 ms, antes de
 *     guardarse. Es solo VISTA: nadie guarda lo que le llega por el canal (así un lector que
 *     conozca el id no puede colar cambios a través de la pantalla de un editor).
 *   · Guardado con compare-and-swap sobre `rev` (pausa ≥ 600 ms, como mucho cada `esperaMaxMs`):
 *     se escribe «lo confirmado por el servidor + MIS cambios». Si otra persona guardó entre
 *     medias, el servidor lo rechaza, se relee, se fusiona y se reintenta: nada se pisa.
 *   · «guardado» avisa de la revisión nueva con los sellos de lo guardado; quien no tenga esas
 *     versiones (se perdió la difusión) relee. No hay suscripción a la tabla: tráfico mínimo.
 *   · Presencia: quién está, con qué color, en qué bloque/diapositiva y si está presentando.
 *
 * `instantanea()` devuelve SIEMPRE el mismo objeto mientras nada cambie (useSyncExternalStore).
 * Sin React ni Supabase: el transporte se inyecta (las pruebas usan uno falso en memoria).
 */

import type { Parche } from "./deshacer";
import {
    aplicarCambio,
    colorDePersona,
    fusionar,
    fusionarMeta,
    fusionarUnidades,
    gana,
    ganaRegistro,
    idValido,
    leerDoc,
    leerRegistro,
    leerUnidad,
    mismoContenido,
    podarLapidas,
    selloNuevo,
    serializarDoc,
    serializarUnidad,
    visibles,
    type CambioUnidad,
    type EstadoColab,
    type RegistroLWW,
    type UnidadColab,
} from "./modelo";

// ───────────────────────────── Transporte ─────────────────────────────

export interface LecturaServidor {
    doc: unknown;
    rev: number;
}

export type ResultadoEscritura =
    | { tipo: "ok"; rev: number }
    /** Otra escritura llegó antes (rev distinta). Si se sabe, trae lo que hay ahora. */
    | { tipo: "conflicto"; lectura?: LecturaServidor | null }
    | { tipo: "sin-permiso" }
    | { tipo: "error"; mensaje?: string; red?: boolean };

export interface OyentesCanal {
    alEvento: (evento: string, carga: Record<string, unknown>) => void;
    alPresencia: (estado: Record<string, unknown[]>) => void;
    alEstado: (conectado: boolean) => void;
}

export interface CanalColab {
    enviar: (evento: string, carga: Record<string, unknown>) => void;
    anunciar: (estado: Record<string, unknown>) => void;
    cerrar: () => void;
}

export interface TransporteColab {
    /** El doc y su revisión; "sin-acceso" si no existe o no se puede leer; null si falla la red. */
    leer: () => Promise<LecturaServidor | "sin-acceso" | null>;
    /** Solo la revisión (barato). null si no se pudo leer. */
    leerRev: () => Promise<number | null>;
    /** Escribe el doc SOLO si la revisión sigue siendo `revEsperada`. */
    escribir: (doc: Record<string, unknown>, revEsperada: number) => Promise<ResultadoEscritura>;
    abrirCanal: (claveTab: string, oyentes: OyentesCanal) => CanalColab;
}

// ───────────────────────────── Tipos públicos ─────────────────────────────

export type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "sin-conexion" | "sin-permiso" | "error";

export interface Yo {
    uid: string | null;
    nombre: string;
    color: string;
}

export interface Presentando {
    id: string | null;
    indice: number;
    /** Cuándo empezó esta presentación (distingue una nueva de un «dejé de presentar» viejo). */
    inicio?: number;
}

export interface Presente {
    /** Clave de la pestaña (una persona con dos pestañas aparece dos veces). */
    clave: string;
    uid: string | null;
    nombre: string;
    color: string;
    /** Bloque o diapositiva en el que está. */
    unidad: string | null;
    modo: "editar" | "ver";
    presentando: Presentando | null;
    desde: number;
}

export interface Conflicto {
    unidadId: string;
    autorNombre: string;
    /** true: se quedó la versión de la otra persona; false: se mantuvo la tuya. */
    ganaRemoto: boolean;
}

export interface InstantaneaSala<P, M> {
    cargando: boolean;
    /** Mensaje en español para quien usa la app (null = todo bien). */
    error: string | null;
    /** Unidades visibles, en orden. */
    unidades: UnidadColab<P>[];
    meta: M;
    guardado: EstadoGuardado;
    puedeEditar: boolean;
    /** Las demás pestañas presentes (no incluye la tuya). */
    presentes: Presente[];
    conectado: boolean;
    /** Sube con cada cambio; útil para efectos. */
    version: number;
    revision: number | null;
}

export interface ConfigSala<P, M> {
    /** "documento" | "presentacion": se escribe en `doc.app` y se exige al leer. */
    app: string;
    transporte: TransporteColab;
    validarDatos: (raw: unknown) => P | null;
    validarMeta: (raw: unknown) => M | null;
    metaInicial: M;
    yo: Yo;
    puedeEditar: boolean;
    /** Pausa antes de guardar (ms, mínimo 600). */
    debounceMs?: number;
    /** Guardado forzoso aunque se siga escribiendo (ms). */
    esperaMaxMs?: number;
    /** Tope del doc guardado (bytes). */
    maxBytes?: number;
    /** Tope de unidades visibles (bloques o diapositivas). */
    maxUnidades?: number;
    /** Nombre de lo que se edita, para los mensajes: «documento», «presentación». */
    nombreCosa?: string;
    /** Género gramatical de `nombreCosa` («la presentación», «esta presentación»). */
    femenino?: boolean;
    ahora?: () => number;
    claveTab?: string;
}

// ───────────────────────────── Utilidades ─────────────────────────────

const MAX_CARGA_DIFUSION = 180_000;
const EVENTOS_RESERVADOS = new Set(["unidades", "guardado"]);

function esObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function bytesDe(v: unknown): number {
    try {
        const s = JSON.stringify(v) ?? "";
        if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
        return s.length * 2;
    } catch {
        return Infinity;
    }
}

function nuevaClaveTab(): string {
    try {
        const id = globalThis.crypto?.randomUUID?.();
        if (id) return id;
    } catch {
        /* sin crypto */
    }
    return `tab-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const RE_COLOR = /^#[0-9a-fA-F]{6}$/;

function leerPresentando(v: unknown): Presentando | null {
    if (!esObj(v)) return null;
    const indice = typeof v.indice === "number" && Number.isFinite(v.indice) ? Math.max(0, Math.floor(v.indice)) : 0;
    const p: Presentando = { id: idValido(v.id) ? v.id : null, indice };
    if (typeof v.inicio === "number" && Number.isFinite(v.inicio)) p.inicio = v.inicio;
    return p;
}

/** Presencia del canal → lista de las OTRAS pestañas (validada; nada del canal se cree a ciegas). */
export function leerPresentes(estado: Record<string, unknown[]> | null | undefined, miClave: string): Presente[] {
    const out: Presente[] = [];
    for (const [clave, metas] of Object.entries(estado ?? {})) {
        if (clave === miClave) continue;
        const lista = Array.isArray(metas) ? metas : [];
        const m = lista[lista.length - 1];
        if (!esObj(m)) continue;
        const uid = typeof m.uid === "string" && m.uid.length <= 64 ? m.uid : null;
        const nombre = typeof m.nombre === "string" && m.nombre.trim() ? m.nombre.trim().slice(0, 60) : "Invitado";
        out.push({
            clave,
            uid,
            nombre,
            color: typeof m.color === "string" && RE_COLOR.test(m.color) ? m.color : colorDePersona(uid ?? clave),
            unidad: idValido(m.unidad) ? m.unidad : null,
            modo: m.modo === "editar" ? "editar" : "ver",
            presentando: leerPresentando(m.presentando),
            desde: typeof m.desde === "number" && Number.isFinite(m.desde) ? m.desde : 0,
        });
    }
    return out.sort((a, b) => a.desde - b.desde || (a.clave < b.clave ? -1 : 1));
}

// ───────────────────────────── El motor ─────────────────────────────

export class SalaColaborativa<P, M> {
    readonly claveTab: string;
    private readonly cfg: ConfigSala<P, M>;
    private readonly ahora: () => number;
    private readonly debounceMs: number;
    private readonly esperaMaxMs: number;
    private readonly maxBytes: number;

    private base: EstadoColab<P, M> = { unidades: [], meta: null };
    private baseIndice = new Map<string, UnidadColab<P>>();
    private extras: Record<string, unknown> = {};
    private rev: number | null = null;
    private propios = new Map<string, UnidadColab<P>>();
    private metaPropia: RegistroLWW<M> | null = null;
    private remotos = new Map<string, UnidadColab<P>>();
    private metaRemota: RegistroLWW<M> | null = null;
    private recientes = new Map<string, number>();
    private avisados = new Map<string, number>();

    private canal: CanalColab | null = null;
    private conectado = false;
    private yaConectado = false;
    private presentes: Presente[] = [];
    private foco: { unidad: string | null; presentando: Presentando | null } = { unidad: null, presentando: null };
    private desde: number;

    private cargando = true;
    private error: string | null = null;
    private guardado: EstadoGuardado = "guardado";
    private puedeEditar: boolean;
    private appAjena = false;
    private version = 0;

    private cacheTodas: UnidadColab<P>[] | null = null;
    private cacheIndice: Map<string, UnidadColab<P>> | null = null;
    private cacheVisibles: UnidadColab<P>[] | null = null;
    private inst: InstantaneaSala<P, M>;

    private oyentes = new Set<() => void>();
    private oyentesConflicto = new Set<(c: Conflicto) => void>();
    private oyentesEvento = new Set<(evento: string, carga: Record<string, unknown>) => void>();

    private tGuardar: ReturnType<typeof setTimeout> | null = null;
    private tEsperaMax: ReturnType<typeof setTimeout> | null = null;
    private tDifundir: ReturnType<typeof setTimeout> | null = null;
    private tPresencia: ReturnType<typeof setTimeout> | null = null;
    private tSincronizar: ReturnType<typeof setTimeout> | null = null;
    private tReintento: ReturnType<typeof setTimeout> | null = null;
    private porDifundir = new Set<string>();
    private metaPorDifundir = false;
    private escribiendo = false;
    private otraVez = false;
    private reintentos = 0;
    private iniciado = false;
    private cerrado = false;
    private ultimoAnuncio = 0;

    constructor(cfg: ConfigSala<P, M>) {
        this.cfg = cfg;
        this.ahora = cfg.ahora ?? (() => Date.now());
        this.debounceMs = Math.max(600, cfg.debounceMs ?? 900);
        this.esperaMaxMs = Math.max(this.debounceMs, cfg.esperaMaxMs ?? 5000);
        this.maxBytes = cfg.maxBytes ?? 2_500_000;
        this.claveTab = cfg.claveTab ?? nuevaClaveTab();
        this.puedeEditar = cfg.puedeEditar;
        this.desde = this.ahora();
        this.inst = this.construir();
    }

    /** Piezas de los mensajes: «este documento» / «esta presentación». */
    private cosa(): { cosa: string; este: string; el: string; El: string; un: string } {
        const f = !!this.cfg.femenino;
        return { cosa: this.cfg.nombreCosa ?? "documento", este: f ? "esta" : "este", el: f ? "la" : "el", El: f ? "La" : "El", un: f ? "una" : "un" };
    }

    // ── Tienda (useSyncExternalStore) ──

    suscribir = (fn: () => void): (() => void) => {
        this.oyentes.add(fn);
        return () => {
            this.oyentes.delete(fn);
        };
    };

    instantanea = (): InstantaneaSala<P, M> => this.inst;

    alConflicto(fn: (c: Conflicto) => void): () => void {
        this.oyentesConflicto.add(fn);
        return () => {
            this.oyentesConflicto.delete(fn);
        };
    }

    /** Eventos propios de la app (p. ej. «presentacion», «puntero»). */
    alEvento(fn: (evento: string, carga: Record<string, unknown>) => void): () => void {
        this.oyentesEvento.add(fn);
        return () => {
            this.oyentesEvento.delete(fn);
        };
    }

    get yo(): Yo {
        return this.cfg.yo;
    }

    // ── Ciclo de vida ──

    iniciar(): void {
        if (this.iniciado || this.cerrado) return;
        this.iniciado = true;
        try {
            this.canal = this.cfg.transporte.abrirCanal(this.claveTab, {
                alEvento: this.recibirEvento,
                alPresencia: this.recibirPresencia,
                alEstado: this.recibirEstadoCanal,
            });
        } catch {
            this.canal = null;
        }
        void this.sincronizar();
    }

    /** Cierra el canal y guarda lo pendiente (sin esperar). */
    cerrar(): void {
        if (this.cerrado) return;
        if (this.propios.size || this.metaPropia) void this.guardar();
        this.cerrado = true;
        for (const t of [this.tGuardar, this.tEsperaMax, this.tDifundir, this.tPresencia, this.tSincronizar, this.tReintento]) {
            if (t) clearTimeout(t);
        }
        try {
            this.canal?.cerrar();
        } catch {
            /* noop */
        }
        this.canal = null;
        this.oyentes.clear();
        this.oyentesConflicto.clear();
        this.oyentesEvento.clear();
    }

    fijarPermiso(puede: boolean): void {
        if (this.puedeEditar === puede) return;
        this.puedeEditar = puede && !this.appAjena;
        if (!this.puedeEditar && this.guardado !== "sin-permiso") this.guardado = "guardado";
        this.anunciar();
        this.emitir();
    }

    // ── Lectura ──

    private todas(): { lista: UnidadColab<P>[]; indice: Map<string, UnidadColab<P>> } {
        if (!this.cacheTodas || !this.cacheIndice) {
            this.cacheTodas = fusionarUnidades(this.base.unidades, this.remotos.values(), this.propios.values());
            this.cacheIndice = new Map(this.cacheTodas.map((u) => [u.id, u]));
            this.cacheVisibles = null;
        }
        return { lista: this.cacheTodas, indice: this.cacheIndice };
    }

    private invalidar(): void {
        this.cacheTodas = null;
        this.cacheIndice = null;
        this.cacheVisibles = null;
    }

    /** Versión vigente de una unidad (también si está borrada). */
    unidad(id: string): UnidadColab<P> | undefined {
        return this.todas().indice.get(id);
    }

    private registroMeta(): RegistroLWW<M> | null {
        return fusionarMeta(this.base.meta, this.metaRemota, this.metaPropia);
    }

    meta(): M {
        return this.registroMeta()?.valor ?? this.cfg.metaInicial;
    }

    /** Estado visible para guardar una versión (sin lápidas). */
    exportar(): { unidades: UnidadColab<P>[]; meta: M } {
        return { unidades: this.inst.unidades, meta: this.inst.meta };
    }

    // ── Edición local ──

    /** Aplica cambios propios. Devuelve los parches (antes/después) para el deshacer. */
    cambiar(cambios: CambioUnidad<P>[]): Parche<P>[] {
        if (!this.puedeEditar || this.cerrado || !cambios.length) return [];
        const ahora = this.ahora();
        const autor = { uid: this.cfg.yo.uid ?? "anon", nombre: this.cfg.yo.nombre };
        const parches: Parche<P>[] = [];
        const maxUnidades = this.cfg.maxUnidades ?? 4000;
        let vivas = this.inst.unidades.length;
        for (const c of cambios) {
            if (!idValido(c.id)) continue;
            const previo = this.unidad(c.id);
            const nace = (!previo || previo.borrado) && c.borrar !== true;
            if (nace && vivas >= maxUnidades) continue;
            const nueva = aplicarCambio(previo, c, autor, ahora);
            if (!nueva) continue;
            if (previo && mismoContenido(previo, nueva)) continue;
            if (nace) vivas += 1;
            else if (nueva.borrado && previo && !previo.borrado) vivas -= 1;
            this.propios.set(c.id, nueva);
            this.recientes.set(c.id, ahora);
            this.porDifundir.add(c.id);
            this.invalidar();
            parches.push({ id: c.id, antes: previo ?? null, despues: nueva });
        }
        if (parches.length) {
            this.emitir();
            this.programarDifusion();
            this.programarGuardado();
        }
        return parches;
    }

    cambiarMeta(valor: M): void {
        if (!this.puedeEditar || this.cerrado) return;
        const actual = this.registroMeta();
        this.metaPropia = {
            valor,
            actualizado: selloNuevo(actual?.actualizado, this.ahora()),
            autor: this.cfg.yo.uid ?? "anon",
            autorNombre: this.cfg.yo.nombre,
        };
        this.metaPorDifundir = true;
        this.emitir();
        this.programarDifusion();
        this.programarGuardado();
    }

    /** Dónde estoy (bloque o diapositiva) — para la presencia. */
    enfocar(unidad: string | null): void {
        if (this.foco.unidad === unidad) return;
        this.foco = { ...this.foco, unidad };
        this.anunciar();
    }

    /** Presentar (o dejar de hacerlo): viaja en la presencia para quien llegue tarde. */
    presentar(p: Presentando | null): void {
        const antes = this.foco.presentando;
        if (antes === p || (antes && p && antes.id === p.id && antes.indice === p.indice && antes.inicio === p.inicio)) return;
        this.foco = { ...this.foco, presentando: p };
        this.anunciar(true);
    }

    /** Evento propio de la app por el canal (efímero: no se guarda). */
    enviar(evento: string, carga: Record<string, unknown>): void {
        if (EVENTOS_RESERVADOS.has(evento) || !this.canal) return;
        try {
            this.canal.enviar(evento, { ...carga, de: this.claveTab });
        } catch {
            /* sin canal: no pasa nada */
        }
    }

    /** Guardar ya (al ocultar la pestaña, al cerrar). */
    guardarAhora(): Promise<void> {
        return this.guardar();
    }

    /** Al volver a la pestaña: si alguien guardó mientras tanto, releer. */
    async alVolver(): Promise<void> {
        if (this.cerrado) return;
        const rev = await this.cfg.transporte.leerRev().catch(() => null);
        if (rev !== null && rev !== this.rev) await this.sincronizar();
    }

    // ── Servidor ──

    /** Lee el doc del servidor y lo FUSIONA con lo que ya se sabía. */
    async sincronizar(): Promise<boolean> {
        let r: LecturaServidor | "sin-acceso" | null = null;
        try {
            r = await this.cfg.transporte.leer();
        } catch {
            r = null;
        }
        if (this.cerrado) return false;
        const t = this.cosa();
        if (r === "sin-acceso") {
            this.cargando = false;
            this.error = `No encontramos ${t.este} ${t.cosa} o ya no tienes acceso.`;
            this.puedeEditar = false;
            this.emitir();
            return false;
        }
        if (!r) {
            if (this.cargando) this.error = `No se pudo abrir ${t.el} ${t.cosa}. Revisa la conexión; lo reintentamos solos.`;
            this.guardado = this.puedeEditar ? "sin-conexion" : this.guardado;
            this.programarSincronizacion(Math.min(30_000, 3000 * 2 ** Math.min(4, this.reintentos++)));
            this.emitir();
            return false;
        }
        this.absorber(r);
        this.cargando = false;
        if (!this.appAjena) this.error = null;
        this.emitir();
        return true;
    }

    private absorber(r: LecturaServidor): void {
        const leido = leerDoc<P, M>(r.doc, this.cfg.validarDatos, this.cfg.validarMeta);
        const vacio = !leido.app && leido.estado.unidades.length === 0;
        if (leido.app !== this.cfg.app && !vacio) {
            // Otro tipo de espacio (una pizarra, un escritorio…): ni se pinta ni se escribe.
            this.appAjena = true;
            this.puedeEditar = false;
            const t = this.cosa();
            this.error = `Este enlace no abre ${t.un} ${t.cosa}.`;
            this.rev = r.rev;
            return;
        }
        this.base = fusionar(this.base, leido.estado);
        this.baseIndice = new Map(this.base.unidades.map((u) => [u.id, u]));
        this.extras = leido.extras;
        this.rev = r.rev;
        this.podarSuperados();
        this.invalidar();
    }

    /** Lo remoto o propio que el servidor ya tiene (o superó) deja de hacer falta aparte. */
    private podarSuperados(): void {
        for (const [id, u] of this.remotos) {
            const b = this.baseIndice.get(id);
            if (b && !gana(u, b)) this.remotos.delete(id);
        }
        for (const [id, u] of this.propios) {
            const b = this.baseIndice.get(id);
            if (b && !gana(u, b)) this.propios.delete(id);
        }
        if (this.metaRemota && this.base.meta && !ganaRegistro(this.metaRemota, this.base.meta)) this.metaRemota = null;
        if (this.metaPropia && this.base.meta && !ganaRegistro(this.metaPropia, this.base.meta)) this.metaPropia = null;
    }

    private async guardar(): Promise<void> {
        if (this.tGuardar) clearTimeout(this.tGuardar);
        if (this.tEsperaMax) clearTimeout(this.tEsperaMax);
        this.tGuardar = null;
        this.tEsperaMax = null;
        if (!this.puedeEditar || this.appAjena) return;
        if (!this.propios.size && !this.metaPropia) {
            if (this.guardado === "pendiente") {
                this.guardado = "guardado";
                this.emitir();
            }
            return;
        }
        if (this.escribiendo) {
            this.otraVez = true;
            return;
        }
        this.escribiendo = true;
        this.guardado = "guardando";
        this.emitir();
        try {
            for (let intento = 0; intento < 4; intento++) {
                if (this.rev === null) {
                    const ok = await this.sincronizar();
                    if (!ok || this.appAjena) {
                        if (!this.appAjena) this.fallo(true);
                        return;
                    }
                    if (!this.puedeEditar) return;
                }
                const aEnviar = new Map(this.propios);
                const metaEnviada = this.metaPropia;
                const estado = podarLapidas(fusionar(this.base, { unidades: [...aEnviar.values()], meta: metaEnviada }), this.ahora());
                const doc = serializarDoc(this.cfg.app, estado, this.extras);
                if (bytesDe(doc) > this.maxBytes) {
                    this.guardado = "error";
                    const t = this.cosa();
                    this.error = `${t.El} ${t.cosa} ya ocupa demasiado para guardarse (más de ${Math.round(this.maxBytes / 1_000_000)} MB). Sube las imágenes como archivos en vez de incrustarlas o divide ${t.el} ${t.cosa}.`;
                    this.emitir();
                    return;
                }
                let r: ResultadoEscritura;
                try {
                    r = await this.cfg.transporte.escribir(doc, this.rev as number);
                } catch {
                    r = { tipo: "error", red: true };
                }
                if (r.tipo === "ok") {
                    this.base = estado;
                    this.baseIndice = new Map(estado.unidades.map((u) => [u.id, u]));
                    this.rev = r.rev;
                    for (const [id, u] of aEnviar) if (this.propios.get(id) === u) this.propios.delete(id);
                    if (this.metaPropia === metaEnviada) this.metaPropia = null;
                    this.podarSuperados();
                    this.invalidar();
                    this.reintentos = 0;
                    this.error = null;
                    this.difundirGuardado([...aEnviar.values()], metaEnviada);
                    const quedan = this.propios.size > 0 || !!this.metaPropia;
                    this.guardado = quedan ? "pendiente" : "guardado";
                    this.emitir();
                    if (quedan) this.programarGuardado();
                    return;
                }
                if (r.tipo === "conflicto") {
                    if (r.lectura) this.absorber(r.lectura);
                    else if (!(await this.sincronizar())) {
                        this.fallo(true);
                        return;
                    }
                    if (this.appAjena) {
                        this.emitir();
                        return;
                    }
                    continue;
                }
                if (r.tipo === "sin-permiso") {
                    this.puedeEditar = false;
                    this.guardado = "sin-permiso";
                    const t = this.cosa();
                    this.error = `Ya no tienes permiso para editar ${t.este} ${t.cosa}; tus últimos cambios no se guardaron. Pide a quien lo creó que te invite como editor.`;
                    this.anunciar();
                    this.emitir();
                    return;
                }
                this.fallo(!!r.red);
                return;
            }
            // Demasiadas carreras seguidas: respiramos y reintentamos.
            this.programarGuardado(1500);
        } finally {
            this.escribiendo = false;
            if (this.otraVez && !this.cerrado) {
                this.otraVez = false;
                this.programarGuardado();
            }
        }
    }

    private fallo(red: boolean): void {
        this.guardado = red ? "sin-conexion" : "error";
        this.reintentos += 1;
        const espera = Math.min(30_000, 2000 * 2 ** Math.min(4, this.reintentos - 1));
        if (this.tReintento) clearTimeout(this.tReintento);
        if (!this.cerrado) {
            this.tReintento = setTimeout(() => {
                this.tReintento = null;
                void this.guardar();
            }, espera);
        }
        this.emitir();
    }

    private programarGuardado(ms = this.debounceMs): void {
        if (this.cerrado) return;
        if (this.guardado === "guardado") {
            this.guardado = "pendiente";
            this.emitir();
        }
        if (this.tGuardar) clearTimeout(this.tGuardar);
        this.tGuardar = setTimeout(() => void this.guardar(), ms);
        if (!this.tEsperaMax) this.tEsperaMax = setTimeout(() => void this.guardar(), this.esperaMaxMs);
    }

    private programarSincronizacion(ms: number): void {
        if (this.cerrado) return;
        if (this.tSincronizar) clearTimeout(this.tSincronizar);
        this.tSincronizar = setTimeout(() => {
            this.tSincronizar = null;
            void this.sincronizar();
        }, ms);
    }

    // ── Canal ──

    private programarDifusion(): void {
        if (this.tDifundir || this.cerrado) return;
        this.tDifundir = setTimeout(() => {
            this.tDifundir = null;
            this.difundir();
        }, 120);
    }

    private difundir(): void {
        if (!this.canal) {
            this.porDifundir.clear();
            this.metaPorDifundir = false;
            return;
        }
        const unidades: Record<string, unknown>[] = [];
        for (const id of this.porDifundir) {
            const u = this.propios.get(id) ?? this.unidad(id);
            if (u) unidades.push(serializarUnidad(u));
        }
        this.porDifundir.clear();
        const meta = this.metaPorDifundir ? this.registroMeta() : null;
        this.metaPorDifundir = false;
        let lote: Record<string, unknown>[] = [];
        let bytes = 0;
        const enviarLote = (conMeta: boolean) => {
            if (!lote.length && !conMeta) return;
            const carga: Record<string, unknown> = { de: this.claveTab, unidades: lote };
            if (conMeta && meta) carga.meta = meta;
            try {
                this.canal?.enviar("unidades", carga);
            } catch {
                /* se recupera con «guardado» */
            }
            lote = [];
            bytes = 0;
        };
        for (const u of unidades) {
            const b = bytesDe(u);
            // Una unidad enorme no viaja por el canal: la recogen al ver el «guardado».
            if (b > MAX_CARGA_DIFUSION) continue;
            if (bytes + b > MAX_CARGA_DIFUSION) enviarLote(false);
            lote.push(u);
            bytes += b;
        }
        enviarLote(!!meta);
    }

    private difundirGuardado(unidades: UnidadColab<P>[], meta: RegistroLWW<M> | null): void {
        if (!this.canal || this.rev === null) return;
        const carga: Record<string, unknown> = {
            de: this.claveTab,
            rev: this.rev,
            marcas: unidades.slice(0, 400).map((u) => [u.id, u.actualizado]),
        };
        if (unidades.length > 400) carga.completo = false;
        if (meta) carga.meta = meta.actualizado;
        try {
            this.canal.enviar("guardado", carga);
        } catch {
            /* noop */
        }
    }

    private recibirEvento = (evento: string, carga: Record<string, unknown>): void => {
        if (this.cerrado || !esObj(carga) || carga.de === this.claveTab) return;
        if (evento === "unidades") this.recibirUnidades(carga);
        else if (evento === "guardado") this.recibirGuardado(carga);
        else for (const fn of this.oyentesEvento) fn(evento, carga);
    };

    private recibirUnidades(carga: Record<string, unknown>): void {
        let cambio = false;
        const lista = Array.isArray(carga.unidades) ? carga.unidades.slice(0, 500) : [];
        for (const raw of lista) {
            const u = leerUnidad(raw, this.cfg.validarDatos);
            if (!u) continue;
            const actual = this.unidad(u.id);
            const ganaRemoto = !actual || gana(u, actual);
            if (actual) this.quizaAvisar(u, ganaRemoto);
            if (!ganaRemoto) continue;
            this.remotos.set(u.id, u);
            cambio = true;
        }
        const meta = leerRegistro(carga.meta, this.cfg.validarMeta);
        if (meta) {
            const actual = this.registroMeta();
            if (!actual || ganaRegistro(meta, actual)) {
                this.metaRemota = meta;
                cambio = true;
            }
        }
        if (cambio) {
            this.invalidar();
            this.emitir();
        }
    }

    private quizaAvisar(u: UnidadColab<P>, ganaRemoto: boolean): void {
        const ahora = this.ahora();
        if (u.autor === (this.cfg.yo.uid ?? "anon") && u.autorNombre === this.cfg.yo.nombre) return;
        const reciente = this.propios.has(u.id) || ahora - (this.recientes.get(u.id) ?? -Infinity) < 5000;
        if (!reciente) return;
        if (ahora - (this.avisados.get(u.id) ?? -Infinity) < 8000) return;
        this.avisados.set(u.id, ahora);
        const c: Conflicto = { unidadId: u.id, autorNombre: u.autorNombre ?? "Otra persona", ganaRemoto };
        for (const fn of this.oyentesConflicto) fn(c);
    }

    private recibirGuardado(carga: Record<string, unknown>): void {
        const rev = typeof carga.rev === "number" && Number.isFinite(carga.rev) ? carga.rev : null;
        if (rev === null || (this.rev !== null && rev <= this.rev)) return;
        const marcas = Array.isArray(carga.marcas) ? carga.marcas : [];
        let falta = carga.completo === false || (marcas.length === 0 && typeof carga.meta !== "number");
        for (const m of marcas.slice(0, 400)) {
            if (!Array.isArray(m) || !idValido(m[0]) || typeof m[1] !== "number") continue;
            const u = this.unidad(m[0]);
            if (!u || u.actualizado < m[1]) {
                falta = true;
                break;
            }
        }
        if (typeof carga.meta === "number" && (this.registroMeta()?.actualizado ?? -1) < carga.meta) falta = true;
        if (falta) this.programarSincronizacion(250);
    }

    private recibirPresencia = (estado: Record<string, unknown[]>): void => {
        if (this.cerrado) return;
        this.presentes = leerPresentes(estado, this.claveTab);
        this.emitir();
    };

    private recibirEstadoCanal = (conectado: boolean): void => {
        if (this.cerrado || this.conectado === conectado) return;
        this.conectado = conectado;
        if (conectado) {
            this.anunciar(true);
            // Reconexión: lo que se difundió mientras estábamos fuera se recupera releyendo.
            if (this.yaConectado) this.programarSincronizacion(0);
            this.yaConectado = true;
        }
        this.emitir();
    };

    private anunciar(inmediato = false): void {
        if (!this.canal || this.cerrado) return;
        const hacer = () => {
            this.tPresencia = null;
            this.ultimoAnuncio = this.ahora();
            try {
                this.canal?.anunciar({
                    uid: this.cfg.yo.uid,
                    nombre: this.cfg.yo.nombre,
                    color: this.cfg.yo.color,
                    unidad: this.foco.unidad,
                    modo: this.puedeEditar ? "editar" : "ver",
                    presentando: this.foco.presentando,
                    desde: this.desde,
                });
            } catch {
                /* noop */
            }
        };
        if (inmediato) {
            if (this.tPresencia) clearTimeout(this.tPresencia);
            hacer();
            return;
        }
        if (this.tPresencia) return;
        const espera = Math.max(0, 200 - (this.ahora() - this.ultimoAnuncio));
        this.tPresencia = setTimeout(hacer, espera);
    }

    // ── Instantánea ──

    private construir(): InstantaneaSala<P, M> {
        if (!this.cacheVisibles) this.cacheVisibles = visibles(this.todas().lista);
        return {
            cargando: this.cargando,
            error: this.error,
            unidades: this.cacheVisibles,
            meta: this.meta(),
            guardado: this.guardado,
            puedeEditar: this.puedeEditar,
            presentes: this.presentes,
            conectado: this.conectado,
            version: this.version,
            revision: this.rev,
        };
    }

    private emitir(): void {
        if (this.cerrado) return;
        this.version += 1;
        this.inst = this.construir();
        for (const fn of [...this.oyentes]) {
            try {
                fn();
            } catch {
                /* un oyente roto no para a los demás */
            }
        }
    }
}
