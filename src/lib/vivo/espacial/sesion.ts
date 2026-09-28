/**
 * Escena 3D compartida · SESIÓN (L5 · 2026-09-28).
 * ============================================================================
 * El motor de una escena abierta: une el documento (modelo + fusión), la base (`os_spaces`, con
 * guardado comparar-e-intercambiar) y el canal en vivo (presencia, poses, cambios).
 *
 * Dos clases de escena:
 *   · GUARDADA (`fuente.tipo === "espacio"`): la verdad es la fila de `os_spaces`. Lo mío se
 *     guarda con 800 ms de espera (≥ 600) y relectura-fusión si otra persona guardó antes. Lo que
 *     llega de otras personas por broadcast se ve AL MOMENTO pero queda «sin confirmar» hasta que
 *     la base lo confirma (postgres_changes de ESA fila); si no se confirma en 20 s, se relee la
 *     fila una vez y lo no confirmado se retira. Así nadie puede colar cambios en la base solo por
 *     conocer el id del canal: lo que se guarda es siempre lo que cada cual escribe con SU permiso.
 *   · SALA DE LLAMADA (`fuente.tipo === "llamada"`): efímera, sin fila. Los objetos viven mientras
 *     haya alguien dentro; quien entra pide el estado a los presentes. Se puede guardar una copia
 *     como escena propia.
 *
 * Presupuesto de tráfico: poses con el estrangulador de `./avatares` (≤ 10 Hz, solo moviéndose,
 * nunca a solas ni con la pestaña oculta), vista previa de arrastres ≤ 10 Hz, y NADA de sondeo:
 * la fila se relee solo al (re)conectar, al volver a la pestaña tras un rato o para confirmar.
 *
 * Sin React ni DOM obligatorios: todo lo del entorno entra por `DependenciasSesion` (los tests
 * usan un canal y un almacén de mentira).
 */

import {
    crearObjeto,
    docVacio,
    lapida,
    LIMITE_OBJETOS,
    sanearAmbiente,
    sanearDoc,
    sanearObjeto,
    siguienteMarca,
    contarVivos,
    type AmbienteEscena,
    type DocEscena,
    type ObjetoEscena,
    type OpcionesNuevoObjeto,
    type TipoObjeto,
    type Vec3,
} from "./modelo";
import { aplicarAmbiente, aplicarObjetos, diferenciaSobre, fusionarDocs, ganaObjeto, marcaMaxima, mismaVersion } from "./fusion";
import {
    avataresDePresencia,
    colorDeClave,
    crearEmisorPose,
    crearEstrangulador,
    mismosAvatares,
    sanearPose,
    type EmisorPose,
    type MetaAvatar,
    type ModoAvatar,
    type Pose,
} from "./avatares";
import { crearTienda, igualSuperficial, type Tienda } from "./tienda";
import type { ConexionEscena, EventoEscena, FilaCambiada } from "./canal";
import { MENSAJES_ERROR, type ErrorEscena, type FilaEscena, type ResultadoGuardado } from "./persistencia";

export type FuenteEscena = { tipo: "espacio"; id: string } | { tipo: "llamada"; sesionId: string };

export type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "error" | "efimera" | "lectura";

export interface EstadoSesionEscena {
    fase: "cargando" | "lista" | "error";
    error: string | null;
    titulo: string;
    /** Lo que se ve: lo guardado + lo mío + lo de otras personas aún sin confirmar. */
    doc: DocEscena;
    puedeEditar: boolean;
    persistente: boolean;
    conectado: boolean;
    guardado: EstadoGuardado;
    aviso: string | null;
    /** Cambios de otras personas que se ven pero la base aún no confirmó. */
    sinConfirmar: number;
}

export interface EstadoAvatares {
    yo: MetaAvatar | null;
    otros: MetaAvatar[];
}

export interface AlmacenEscena {
    leer(id: string): Promise<{ fila: FilaEscena; error?: undefined } | { fila?: undefined; error: ErrorEscena }>;
    guardar(id: string, rev: number, doc: DocEscena): Promise<ResultadoGuardado>;
    puedeEditar(id: string, dueno: string): Promise<boolean>;
    aceptarInvitacion?(id: string): Promise<void>;
    crearCopia?(titulo: string, doc: DocEscena): Promise<{ id: string } | { error: string }>;
}

export interface Temporizadores {
    ahora: () => number;
    programar: (fn: () => void, ms: number) => unknown;
    cancelar: (id: unknown) => void;
}

export interface DependenciasSesion extends Partial<Temporizadores> {
    almacen: AlmacenEscena;
    abrirCanal: (tema: string, clave: string, filaId: string | null) => ConexionEscena | null;
    aleatorio?: () => number;
}

export interface IdentidadEscena {
    /** Clave de presencia única por pestaña (`<uid|inv-…>:<sufijo>`). */
    clave: string;
    uid: string | null;
    nombre: string;
}

export interface OpcionesSesion {
    fuente: FuenteEscena;
    identidad: IdentidadEscena;
    modo?: ModoAvatar;
    deps: DependenciasSesion;
}

export interface VistaPreviaArrastre {
    pos: Vec3;
    rot: Vec3;
    esc: Vec3;
    hasta: number;
}

export interface SesionEscena {
    readonly tienda: Tienda<EstadoSesionEscena>;
    readonly avatares: Tienda<EstadoAvatares>;
    /** Poses recibidas (se leen en cada fotograma, fuera de React). */
    readonly poses: Map<string, { pose: Pose; recibida: number }>;
    /** Vista previa de objetos que otra persona está arrastrando ahora mismo. */
    readonly arrastres: Map<string, VistaPreviaArrastre>;
    anadir(tipo: TipoObjeto, opciones?: OpcionesNuevoObjeto): ObjetoEscena | null;
    actualizar(id: string, cambios: Partial<Omit<ObjetoEscena, "id" | "tipo" | "actualizado" | "por" | "borrado">>): boolean;
    borrar(id: string): boolean;
    duplicar(id: string): ObjetoEscena | null;
    cambiarAmbiente(cambios: Partial<Pick<AmbienteEscena, "cielo" | "suelo">>): boolean;
    /** Vista previa en vivo mientras arrastro (≤ 10 Hz, solo si hay alguien más). */
    previsualizar(id: string, t: { pos: Vec3; rot: Vec3; esc: Vec3 }): void;
    /** Llamar en cada fotograma con la pose de la cámara. */
    emitirPose(pose: Pose): void;
    cambiarModo(modo: ModoAvatar): void;
    /** Pestaña visible/oculta (pausa las poses y guarda lo pendiente al ocultarse). */
    visibilidad(visible: boolean): void;
    /** Guarda ya lo pendiente. */
    guardarYa(): Promise<void>;
    /** Sala de llamada → escena propia guardada. Devuelve el id nuevo. */
    guardarCopia(titulo: string): Promise<{ id: string } | { error: string }>;
    cerrar(): void;
}

export const ESPERA_GUARDADO_MS = 800;
export const CADUCIDAD_SIN_CONFIRMAR_MS = 20_000;
export const CADUCIDAD_ARRASTRE_MS = 1_500;
const RELEER_TRAS_OCULTO_MS = 30_000;
const MAX_INTENTOS_GUARDADO = 4;

/** Identificador corto y estable del autor de una edición (sin el uid dentro). */
export function autorDeClave(clave: string): string {
    let h = 2166136261;
    for (let i = 0; i < clave.length; i++) {
        h ^= clave.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `d${(h >>> 0).toString(36)}${clave.length.toString(36)}`;
}

const ESTADO_CARGANDO: EstadoSesionEscena = {
    fase: "cargando",
    error: null,
    titulo: "",
    doc: docVacio(),
    puedeEditar: false,
    persistente: true,
    conectado: false,
    guardado: "lectura",
    aviso: null,
    sinConfirmar: 0,
};

/** Estado estable para antes de abrir ninguna sesión (misma referencia siempre). */
export const ESTADO_SESION_INICIAL: EstadoSesionEscena = ESTADO_CARGANDO;
export const AVATARES_INICIAL: EstadoAvatares = { yo: null, otros: [] };

export function abrirSesionEscena(o: OpcionesSesion): SesionEscena {
    const { fuente, identidad, deps } = o;
    const ahora = deps.ahora ?? (() => Date.now());
    const programar = deps.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const cancelar = deps.cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
    const aleatorio = deps.aleatorio ?? Math.random;
    const persistente = fuente.tipo === "espacio";
    const filaId = fuente.tipo === "espacio" ? fuente.id : null;
    const tema = fuente.tipo === "espacio" ? `escena3d:${fuente.id}` : `escena3d:llamada:${fuente.sesionId}`;
    const miPor = autorDeClave(identidad.clave);

    // ── Estado interno ──
    let base: DocEscena = docVacio(); // lo último que sé que está en la base
    let rev = 0;
    let dueno = "";
    let local: DocEscena = docVacio(); // base + lo mío
    const ajenos = new Map<string, { obj: ObjetoEscena; hasta: number }>();
    let ambienteAjeno: { amb: AmbienteEscena; hasta: number } | null = null;
    let relojMax = 0;
    let puedeEditar = !persistente; // las salas de llamada las edita todo el que está dentro
    let cerrada = false;
    let cargada = false;
    let timerGuardado: unknown = null;
    let timerCaducidad: unknown = null;
    let guardando: Promise<void> | null = null;
    let ultimaLectura = 0;
    let visible = true;
    let modo: ModoAvatar = o.modo ?? "3d";
    let otros = 0;
    const respuestasPendientes = new Map<string, unknown>();

    const tienda = crearTienda<EstadoSesionEscena>(
        { ...ESTADO_CARGANDO, persistente, guardado: persistente ? "lectura" : "efimera", puedeEditar },
        igualSuperficial,
    );
    const yo: MetaAvatar = {
        clave: identidad.clave,
        uid: identidad.uid,
        nombre: identidad.nombre || "Persona",
        color: colorDeClave(identidad.clave),
        modo,
        editor: puedeEditar,
        desde: ahora(),
    };
    const avatares = crearTienda<EstadoAvatares>({ yo, otros: [] });
    const poses = new Map<string, { pose: Pose; recibida: number }>();
    const arrastres = new Map<string, VistaPreviaArrastre>();

    const fijar = (patch: Partial<EstadoSesionEscena>) => tienda.fijar({ ...tienda.obtener(), ...patch });

    // ── Vista = local + ajenos (misma referencia si no hay ajenos) ──
    const recalcularVista = () => {
        let vista = local;
        if (ajenos.size > 0) vista = aplicarObjetos(vista, Array.from(ajenos.values(), (a) => a.obj)).doc;
        if (ambienteAjeno) vista = aplicarAmbiente(vista, ambienteAjeno.amb);
        fijar({ doc: vista, sinConfirmar: ajenos.size + (ambienteAjeno ? 1 : 0) });
    };

    const verObjeto = (obj: ObjetoEscena) => {
        if (obj.actualizado > relojMax) relojMax = obj.actualizado;
    };
    const marcaNueva = () => {
        const m = siguienteMarca(ahora(), relojMax);
        relojMax = m;
        return m;
    };

    // ── Canal ──
    const canal = deps.abrirCanal(tema, identidad.clave, filaId);
    const enviar = (evento: EventoEscena, payload: Record<string, unknown>) => {
        if (!canal || cerrada) return;
        canal.enviar(evento, { de: identidad.clave, ...payload });
    };

    const emisor: EmisorPose = crearEmisorPose({
        enviar: (pose) => enviar("pose", { p: pose.p, q: pose.q }),
        ahora,
        programar,
        cancelar,
    });
    const estranguladorArrastre = crearEstrangulador<{ id: string; pos: Vec3; rot: Vec3; esc: Vec3 }>(
        (v) => enviar("arrastre", v as unknown as Record<string, unknown>),
        100,
        { ahora, programar, cancelar },
    );

    const publicarYo = () => {
        const actual = avatares.obtener();
        const nuevoYo: MetaAvatar = { ...yo, modo, editor: puedeEditar };
        if (!actual.yo || actual.yo.modo !== modo || actual.yo.editor !== puedeEditar) avatares.fijar({ ...actual, yo: nuevoYo });
        canal?.publicarPresencia({ uid: yo.uid, nombre: yo.nombre, color: yo.color, modo, editor: puedeEditar, desde: yo.desde });
    };

    // ── Guardado (solo escenas guardadas) ──
    const pendientes = () => {
        const d = diferenciaSobre(local, base);
        return d.objetos.length > 0 || d.ambiente !== null;
    };

    const programarGuardado = (ms = ESPERA_GUARDADO_MS) => {
        if (!persistente || !puedeEditar || cerrada || !cargada) return;
        if (timerGuardado !== null) cancelar(timerGuardado);
        timerGuardado = programar(() => {
            timerGuardado = null;
            void guardar();
        }, ms);
        if (tienda.obtener().guardado !== "guardando") fijar({ guardado: "pendiente" });
    };

    const guardar = async (): Promise<void> => {
        if (!persistente || !filaId || cerrada) return;
        if (guardando) {
            await guardando;
            if (pendientes()) return guardar();
            return;
        }
        if (!pendientes()) {
            fijar({ guardado: "guardado" });
            return;
        }
        guardando = (async () => {
            fijar({ guardado: "guardando" });
            for (let intento = 0; intento < MAX_INTENTOS_GUARDADO; intento++) {
                const aEscribir = local;
                const res = await deps.almacen.guardar(filaId, rev, aEscribir);
                if (cerrada) return;
                if (res.ok) {
                    rev = res.rev;
                    base = aEscribir;
                    ultimaLectura = ahora();
                    fijar({ guardado: pendientes() ? "pendiente" : "guardado", aviso: null });
                    if (pendientes()) programarGuardado();
                    return;
                }
                if (res.conflicto) {
                    // Alguien guardó antes (o no tengo permiso): releo, fusiono y reintento.
                    const lectura = await deps.almacen.leer(filaId);
                    if (cerrada) return;
                    if (!lectura.fila) {
                        fijar({ guardado: "error", aviso: MENSAJES_ERROR[lectura.error] });
                        return;
                    }
                    if (lectura.fila.rev === rev) {
                        // Nadie más escribió y aun así no se aplicó: el RLS no me deja editar.
                        puedeEditar = false;
                        publicarYo();
                        fijar({ guardado: "lectura", puedeEditar: false, aviso: MENSAJES_ERROR["sin-permiso"] });
                        return;
                    }
                    aplicarFila(lectura.fila.rev, lectura.fila.doc);
                    continue;
                }
                fijar({ guardado: "error", aviso: MENSAJES_ERROR[res.error] });
                if (res.error === "sin-permiso") {
                    puedeEditar = false;
                    publicarYo();
                    fijar({ puedeEditar: false, guardado: "lectura" });
                } else {
                    programarGuardado(5_000); // la red vuelve: se reintenta sin prisa
                }
                return;
            }
            fijar({ guardado: "pendiente" });
            programarGuardado(2_000);
        })();
        try {
            await guardando;
        } finally {
            guardando = null;
        }
    };

    /** Aplica una versión de la base (lectura o postgres_changes) si es más nueva que la mía. */
    const aplicarFila = (nuevoRev: number, docCrudo: unknown) => {
        if (nuevoRev <= rev) return;
        const { doc } = sanearDoc(docCrudo);
        rev = nuevoRev;
        base = doc;
        ultimaLectura = ahora();
        relojMax = Math.max(relojMax, marcaMaxima(doc));
        local = fusionarDocs(local, doc);
        // Lo confirmado deja de estar «sin confirmar».
        for (const [id, a] of ajenos) {
            const l = local.objetos[id];
            if (l && (mismaVersion(l, a.obj) || ganaObjeto(l, a.obj))) ajenos.delete(id);
        }
        if (ambienteAjeno && (local.ambiente.actualizado >= ambienteAjeno.amb.actualizado)) ambienteAjeno = null;
        recalcularVista();
        if (pendientes()) programarGuardado();
    };

    const releer = async () => {
        if (!persistente || !filaId || cerrada) return;
        const lectura = await deps.almacen.leer(filaId);
        if (cerrada || !lectura.fila) return;
        aplicarFila(lectura.fila.rev, lectura.fila.doc);
    };

    // ── Caducidad de lo no confirmado ──
    const revisarCaducidad = async () => {
        timerCaducidad = null;
        if (cerrada) return;
        const t = ahora();
        const hayCaducados = Array.from(ajenos.values()).some((a) => a.hasta <= t) || (ambienteAjeno !== null && ambienteAjeno.hasta <= t);
        if (hayCaducados && persistente) {
            await releer(); // quizá sí se guardó y el aviso de la base no llegó
            if (cerrada) return;
            const t2 = ahora();
            for (const [id, a] of ajenos) if (a.hasta <= t2) ajenos.delete(id);
            if (ambienteAjeno && ambienteAjeno.hasta <= t2) ambienteAjeno = null;
            recalcularVista();
        }
        programarCaducidad();
    };
    const programarCaducidad = () => {
        if (timerCaducidad !== null || cerrada || (ajenos.size === 0 && !ambienteAjeno)) return;
        let proxima = Infinity;
        for (const a of ajenos.values()) proxima = Math.min(proxima, a.hasta);
        if (ambienteAjeno) proxima = Math.min(proxima, ambienteAjeno.hasta);
        timerCaducidad = programar(() => void revisarCaducidad(), Math.max(50, proxima - ahora()));
    };

    // ── Cambios propios ──
    const aplicarPropio = (objs: ObjetoEscena[], amb: AmbienteEscena | null) => {
        for (const x of objs) ajenos.delete(x.id);
        local = aplicarObjetos(local, objs).doc;
        if (amb) {
            local = aplicarAmbiente(local, amb);
            ambienteAjeno = null;
        }
        recalcularVista();
        // A solas no se emite nada: quien entre lo leerá de la base (o lo pedirá, en una llamada).
        if (otros > 0) enviar("cambios", { objetos: objs, ...(amb ? { ambiente: amb } : {}) });
        if (persistente) programarGuardado();
    };

    const noEditable = (): boolean => {
        if (cerrada) return true;
        if (!puedeEditar) {
            fijar({ aviso: persistente ? MENSAJES_ERROR["sin-permiso"] : "Esta sala es de solo lectura." });
            return true;
        }
        return false;
    };

    // ── Mensajes del canal ──
    const alMensaje = (evento: EventoEscena, payload: unknown) => {
        if (cerrada || !payload || typeof payload !== "object") return;
        const p = payload as Record<string, unknown>;
        const de = typeof p.de === "string" ? p.de : "";
        if (!de || de === identidad.clave) return;
        switch (evento) {
            case "pose": {
                const pose = sanearPose({ p: p.p, q: p.q });
                if (pose) poses.set(de, { pose, recibida: ahora() });
                return;
            }
            case "arrastre": {
                const id = typeof p.id === "string" ? p.id : "";
                const obj = local.objetos[id];
                if (!obj || obj.borrado) return;
                const limpio = sanearObjeto({ ...obj, pos: p.pos, rot: p.rot, esc: p.esc });
                if (limpio) arrastres.set(id, { pos: limpio.pos, rot: limpio.rot, esc: limpio.esc, hasta: ahora() + CADUCIDAD_ARRASTRE_MS });
                return;
            }
            case "cambios": {
                const entrantes = (Array.isArray(p.objetos) ? p.objetos : [])
                    .slice(0, LIMITE_OBJETOS)
                    .map(sanearObjeto)
                    .filter((x): x is ObjetoEscena => x !== null);
                const amb = p.ambiente ? sanearAmbiente(p.ambiente) : null;
                for (const x of entrantes) {
                    verObjeto(x);
                    arrastres.delete(x.id);
                }
                if (amb && amb.actualizado > relojMax) relojMax = amb.actualizado;
                if (!persistente) {
                    local = aplicarObjetos(local, entrantes).doc;
                    if (amb) local = aplicarAmbiente(local, amb);
                    recalcularVista();
                    return;
                }
                const hasta = ahora() + CADUCIDAD_SIN_CONFIRMAR_MS;
                for (const x of entrantes) {
                    const l = local.objetos[x.id];
                    if (l && (mismaVersion(l, x) || ganaObjeto(l, x))) continue;
                    const previo = ajenos.get(x.id);
                    if (previo && !ganaObjeto(x, previo.obj)) continue;
                    ajenos.set(x.id, { obj: x, hasta });
                }
                if (amb && amb.actualizado > local.ambiente.actualizado && (!ambienteAjeno || amb.actualizado > ambienteAjeno.amb.actualizado)) {
                    ambienteAjeno = { amb, hasta };
                }
                recalcularVista();
                programarCaducidad();
                return;
            }
            case "pedir-estado": {
                if (persistente) return; // la escena guardada se lee de la base
                const rid = typeof p.rid === "string" ? p.rid.slice(0, 40) : "";
                if (!rid || respuestasPendientes.has(rid)) return;
                if (contarVivos(local) === 0 && local.ambiente.actualizado === 0) return;
                const id = programar(() => {
                    respuestasPendientes.delete(rid);
                    enviar("estado", { rid, doc: local });
                }, 150 + Math.floor(aleatorio() * 550));
                respuestasPendientes.set(rid, id);
                return;
            }
            case "estado": {
                const rid = typeof p.rid === "string" ? p.rid : "";
                const pendiente = respuestasPendientes.get(rid);
                if (pendiente !== undefined) {
                    cancelar(pendiente); // ya respondió otra persona
                    respuestasPendientes.delete(rid);
                }
                if (persistente) return;
                const { doc } = sanearDoc(p.doc);
                relojMax = Math.max(relojMax, marcaMaxima(doc));
                local = fusionarDocs(local, doc);
                recalcularVista();
                return;
            }
        }
    };

    const alPresencia = (estado: Record<string, unknown>) => {
        if (cerrada) return;
        const lista = avataresDePresencia(estado, identidad.clave);
        const actual = avatares.obtener();
        if (!mismosAvatares(actual.otros, lista)) avatares.fijar({ ...actual, otros: lista });
        const claves = new Set(lista.map((a) => a.clave));
        for (const k of Array.from(poses.keys())) if (!claves.has(k)) poses.delete(k);
        otros = lista.length;
        emisor.fijarOtros(otros);
    };

    const alFila = (f: FilaCambiada) => {
        if (cerrada) return;
        aplicarFila(f.rev, f.doc);
        if (f.titulo && f.titulo !== tienda.obtener().titulo) fijar({ titulo: f.titulo });
    };

    const alSuscrito = (ok: boolean) => {
        if (cerrada) return;
        fijar({ conectado: ok });
        if (!ok) return;
        publicarYo();
        if (persistente) {
            if (cargada && ahora() - ultimaLectura > 2_000) void releer(); // reconexión: ponerse al día
        } else {
            enviar("pedir-estado", { rid: `${autorDeClave(identidad.clave)}-${Math.floor(aleatorio() * 1e9).toString(36)}` });
        }
    };

    const desuscribir: Array<() => void> = [];
    if (canal) {
        desuscribir.push(canal.onMensaje(alMensaje), canal.onPresencia(alPresencia), canal.onFila(alFila), canal.onSuscrito(alSuscrito));
    }

    // ── Carga inicial ──
    const cargar = async () => {
        if (!persistente || !filaId) {
            cargada = true;
            fijar({
                fase: "lista",
                titulo: "Sala de la llamada",
                guardado: "efimera",
                puedeEditar: true,
                aviso: canal ? null : "Sin conexión en vivo: lo que hagas solo lo ves tú.",
            });
            publicarYo();
            return;
        }
        await deps.almacen.aceptarInvitacion?.(filaId).catch(() => undefined);
        const lectura = await deps.almacen.leer(filaId);
        if (cerrada) return;
        if (!lectura.fila) {
            fijar({ fase: "error", error: MENSAJES_ERROR[lectura.error] });
            return;
        }
        const fila = lectura.fila;
        dueno = fila.dueno;
        // Si la base ya avisó de una versión más nueva mientras leía, esa manda.
        if (fila.rev >= rev) {
            rev = fila.rev;
            base = fila.doc;
        }
        relojMax = Math.max(relojMax, marcaMaxima(fila.doc));
        local = fusionarDocs(local, fila.doc);
        ultimaLectura = ahora();
        cargada = true;
        puedeEditar = await deps.almacen.puedeEditar(filaId, dueno).catch(() => false);
        if (cerrada) return;
        fijar({
            fase: "lista",
            titulo: fila.titulo,
            puedeEditar,
            guardado: puedeEditar ? "guardado" : "lectura",
            aviso: fila.descartados > 0 ? `${fila.descartados} objeto(s) de esta escena no se pudieron leer y no se muestran.` : null,
        });
        recalcularVista();
        publicarYo();
        if (!canal) fijar({ aviso: "Sin conexión en vivo: no verás a nadie ni sus cambios hasta recargar." });
    };
    void cargar();

    // ── API ──
    const sesion: SesionEscena = {
        tienda,
        avatares,
        poses,
        arrastres,
        anadir(tipo, opciones = {}) {
            if (noEditable()) return null;
            if (contarVivos(local) >= LIMITE_OBJETOS) {
                fijar({ aviso: `Esta escena ya tiene ${LIMITE_OBJETOS} objetos, el máximo para que funcione bien en cualquier móvil.` });
                return null;
            }
            let nuevo: ObjetoEscena;
            try {
                nuevo = crearObjeto(tipo, opciones, { actualizado: marcaNueva(), por: miPor });
            } catch (e) {
                fijar({ aviso: e instanceof Error ? e.message : "No se pudo añadir." });
                return null;
            }
            const canon = sanearObjeto(nuevo);
            if (!canon) return null;
            aplicarPropio([canon], null);
            return canon;
        },
        actualizar(id, cambios) {
            if (noEditable()) return false;
            const actual = tienda.obtener().doc.objetos[id];
            if (!actual || actual.borrado) return false;
            const canon = sanearObjeto({ ...actual, ...cambios, id, tipo: actual.tipo, actualizado: marcaNueva(), por: miPor, borrado: false });
            if (!canon) return false;
            aplicarPropio([canon], null);
            return true;
        },
        borrar(id) {
            if (noEditable()) return false;
            const actual = tienda.obtener().doc.objetos[id];
            if (!actual || actual.borrado) return false;
            aplicarPropio([lapida(id, actual.tipo, marcaNueva(), miPor)], null);
            return true;
        },
        duplicar(id) {
            if (noEditable()) return null;
            const actual = tienda.obtener().doc.objetos[id];
            if (!actual || actual.borrado) return null;
            const { id: _i, actualizado: _a, por: _p, ...resto } = actual;
            void _i;
            void _a;
            void _p;
            const copia = sanearObjeto({
                ...resto,
                id: `o_${Math.floor(aleatorio() * 36 ** 8).toString(36)}`,
                nombre: `${actual.nombre} (copia)`.slice(0, 60),
                pos: [actual.pos[0] + 0.6, actual.pos[1], actual.pos[2] + 0.6],
                actualizado: marcaNueva(),
                por: miPor,
                bloqueado: false,
            });
            if (!copia) return null;
            if (contarVivos(local) >= LIMITE_OBJETOS) return null;
            aplicarPropio([copia], null);
            return copia;
        },
        cambiarAmbiente(cambios) {
            if (noEditable()) return false;
            const actual = tienda.obtener().doc.ambiente;
            const amb = sanearAmbiente({ ...actual, ...cambios, actualizado: marcaNueva(), por: miPor });
            aplicarPropio([], amb);
            return true;
        },
        previsualizar(id, t) {
            if (cerrada || !puedeEditar || otros === 0) return;
            estranguladorArrastre.empujar({ id, pos: t.pos, rot: t.rot, esc: t.esc });
        },
        emitirPose(pose) {
            if (!visible) return;
            emisor.actualizar(pose);
        },
        cambiarModo(m) {
            if (m === modo) return;
            modo = m;
            publicarYo();
        },
        visibilidad(v) {
            if (v === visible) return;
            visible = v;
            if (!v) {
                emisor.pausar();
                if (persistente && pendientes()) {
                    if (timerGuardado !== null) {
                        cancelar(timerGuardado);
                        timerGuardado = null;
                    }
                    void guardar();
                }
            } else {
                emisor.reanudar();
                if (persistente && cargada && ahora() - ultimaLectura > RELEER_TRAS_OCULTO_MS) void releer();
            }
        },
        async guardarYa() {
            if (timerGuardado !== null) {
                cancelar(timerGuardado);
                timerGuardado = null;
            }
            await guardar();
        },
        async guardarCopia(titulo) {
            if (!deps.almacen.crearCopia) return { error: "No se puede guardar una copia desde aquí." };
            const vivos = aplicarObjetos(docVacio(), Object.values(local.objetos).filter((x) => !x.borrado)).doc;
            return deps.almacen.crearCopia(titulo, aplicarAmbiente(vivos, local.ambiente));
        },
        cerrar() {
            if (cerrada) return;
            // Último intento de guardar lo pendiente (sin esperar).
            if (persistente && puedeEditar && cargada && pendientes()) {
                if (timerGuardado !== null) cancelar(timerGuardado);
                timerGuardado = null;
                void guardar();
            }
            cerrada = true;
            emisor.destruir();
            estranguladorArrastre.cancelar();
            if (timerGuardado !== null) cancelar(timerGuardado);
            if (timerCaducidad !== null) cancelar(timerCaducidad);
            for (const id of respuestasPendientes.values()) cancelar(id);
            respuestasPendientes.clear();
            for (const d of desuscribir) d();
            canal?.cerrar();
        },
    };
    return sesion;
}
