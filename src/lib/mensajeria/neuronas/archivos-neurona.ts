"use client";

/**
 * Archivos de cualquier formato con una neurona (NEU1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Un archivo en un chat de neurona es un MENSAJE de la bandeja (`adjunto`, mismo id en los dos
 * extremos) + su transferencia, por el medio que deciden los ajustes del chat (`planParaDatos`):
 *  · P2P (enlace sin internet, Wi-Fi local, P2P por internet o TURN): el motor de archivos de
 *    siempre (`archivos-malla.ts`: trozos de 16 KB a disco, SHA-256 por lista de hashes, reanuda
 *    desde el último trozo guardado y EL RECEPTOR ACEPTA), sobre el canal del transporte universal
 *    (multitrayecto si hay varios enlaces al mismo aparato y el chat los permite todos);
 *  · servidor (solo tus neuronas): el almacenamiento de tu cuenta (≤ 50 MB), SIN recomprimir y
 *    con el SHA-256 del archivo entero en el anuncio, que el otro aparato verifica al bajarlo.
 * Relé, LoRa y Bluetooth no llevan archivos: el plan lo dice con su motivo.
 *
 * Historial sin internet: el anuncio vive en la bandeja local; el archivo entero, en IndexedDB de
 * este aparato (lo recibido y verificado, y una copia de lo enviado ≤ 512 MB para reanudar tras
 * recargar). Pesado → perezoso: motor, transporte y almacenamiento se importan al usarlos.
 */

import { useSyncExternalStore } from "react";
import {
    anunciarEnChatMalla,
    bandejaMalla,
    cambiarMensajeMalla,
    guardarMensajeMalla,
    hayInternetYSesion,
    mensajeMalla,
    reenviarMensajeNeurona,
} from "./buzon";
import type { EstadoArchivoMensaje, MensajeMalla } from "./bandeja";
import {
    candidatosDatosDesdeEnlaces,
    enlaceForzadoParaArchivo,
    faseDesdeMotor,
    MAX_SERVIDOR_BYTES,
    nombreArchivoSeguro,
    planParaDatos,
    porcentajeTransferencia,
    urlAdjuntoSegura,
    viaDeEnlaces,
    type AdjuntoNeurona,
    type CandidatoDato,
    type FaseMotorArchivo,
} from "./datos-neurona";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";
import type { DestinoMalla } from "@/lib/mensajeria/medios/enviar";
import type { PlanEnvio, ViaMensaje } from "@/lib/mensajeria/medios/tipos";
// (INT1108C) Lo pesado hacia una neurona vecina propone o abre el enlace Wi-Fi directo.
import { avisarEnvioPesado, enlaceDePaso } from "@/lib/malla/puente-ble-wifi";

/** Copia local de lo enviado (para reanudar tras recargar) solo hasta este tamaño. */
export const MAX_COPIA_LOCAL_BYTES = 512 * 1024 * 1024;

/* ══════════════════════════ Almacén local (IndexedDB) ══════════════════════════ */

const NOMBRE_DB = "starseed-neurona-archivos";
const ALMACEN = "archivos";
let dbPromesa: Promise<IDBDatabase | null> | null = null;

function abrirDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolver) => {
        try {
            const r = indexedDB.open(NOMBRE_DB, 1);
            r.onupgradeneeded = () => {
                if (!r.result.objectStoreNames.contains(ALMACEN)) r.result.createObjectStore(ALMACEN);
            };
            r.onsuccess = () => resolver(r.result);
            r.onerror = () => resolver(null);
            r.onblocked = () => resolver(null);
        } catch {
            resolver(null);
        }
    });
}

function db(): Promise<IDBDatabase | null> {
    dbPromesa ??= abrirDb();
    return dbPromesa;
}

async function guardarBlob(id: string, blob: Blob): Promise<boolean> {
    const d = await db();
    if (!d) return false;
    return new Promise((resolver) => {
        try {
            const tx = d.transaction(ALMACEN, "readwrite");
            tx.objectStore(ALMACEN).put(blob, id);
            tx.oncomplete = () => resolver(true);
            tx.onerror = () => resolver(false);
            tx.onabort = () => resolver(false);
        } catch {
            resolver(false);
        }
    });
}

async function leerBlob(id: string): Promise<Blob | null> {
    const d = await db();
    if (!d) return null;
    return new Promise((resolver) => {
        try {
            const r = d.transaction(ALMACEN, "readonly").objectStore(ALMACEN).get(id);
            r.onsuccess = () => resolver(r.result instanceof Blob ? r.result : null);
            r.onerror = () => resolver(null);
        } catch {
            resolver(null);
        }
    });
}

/** Quita la copia local de un archivo (al borrar el mensaje de este aparato). */
export async function olvidarArchivoGuardado(id: string): Promise<void> {
    enMemoria.delete(id);
    const d = await db();
    if (!d) return;
    try {
        d.transaction(ALMACEN, "readwrite").objectStore(ALMACEN).delete(id);
    } catch {
        /* noop */
    }
}

/** Lo enviado en esta sesión y lo recibido (el Blob, mientras la pestaña viva). */
const enMemoria = new Map<string, Blob>();

/** El archivo entero de un adjunto, si está en este aparato (memoria, motor o IndexedDB). */
export async function archivoDeAdjunto(id: string): Promise<Blob | null> {
    const enRam = enMemoria.get(id);
    if (enRam) return enRam;
    const mo = await motor();
    const recibido = mo?.blobRecibido(id) ?? mo?.archivoDeEnvio(id);
    if (recibido) return recibido;
    const guardado = await leerBlob(id);
    if (guardado) enMemoria.set(id, guardado);
    return guardado;
}

/* ══════════════════════════ Estado en vivo (del motor) ══════════════════════════ */

export interface VivoArchivo {
    rol: "enviar" | "recibir";
    fase: FaseMotorArchivo;
    progreso: number;
    trozos: number;
    tamano: number;
    motivo?: string;
    inicioMs: number;
    actualizadoMs: number;
    /** (BLE1108B) La ruta que mide este aparato, la que dice el otro y si coinciden. */
    rutaEnlace?: string;
    rutaEnlaceOtro?: string;
    rutaEnlaceVerificada?: boolean | null;
    /** (MPT1108B) Cifrado de archivo, reparto por vías («Red local 72 % · Bluetooth 8 %») y velocidad total (bytes/s). */
    cifradoArchivo?: "archivo" | "sin-cifrado-de-archivo";
    repartoVias?: string;
    velocidadBps?: number;
}

/**
 * (BLE1108B) La vía de un mensaje de archivo con la ruta de los DOS aparatos (mismo clasificador): la propia
 * es la medida de este lado; si el otro midió lo mismo queda «verificada por ambos». Puro.
 */
export function viaConRutas(via: ViaMensaje, v: Pick<VivoArchivo, "rutaEnlace" | "rutaEnlaceOtro" | "rutaEnlaceVerificada">): ViaMensaje {
    const ruta = v.rutaEnlace ?? via.ruta ?? null;
    const otro = v.rutaEnlaceOtro ?? via.rutaOtro ?? null;
    return {
        ...via,
        ruta,
        ...(otro ? { rutaOtro: otro, rutaVerificada: v.rutaEnlaceVerificada ?? (ruta ? ruta === otro : null) } : {}),
    };
}

const vivos = new Map<string, VivoArchivo>();
const oyentesVivos = new Set<() => void>();

function suscribirVivos(cb: () => void): () => void {
    oyentesVivos.add(cb);
    return () => {
        oyentesVivos.delete(cb);
    };
}

/** Estado en vivo de una transferencia (null si el motor no la conoce en esta sesión). */
export function useArchivoVivo(id: string | undefined): VivoArchivo | null {
    return useSyncExternalStore(
        suscribirVivos,
        () => (id ? vivos.get(id) ?? null : null),
        () => null,
    );
}

type Motor = import("@/lib/network/archivos-malla").MotorArchivos;
type EstadoTransferencia = import("@/lib/network/archivos-malla").EstadoTransferencia;
let motorPromesa: Promise<Motor | null> | null = null;

/** El motor de archivos compartido, enganchado a este módulo (una vez). */
function motor(): Promise<Motor | null> {
    motorPromesa ??= import("@/lib/network/archivos-malla")
        .then((m) => {
            const mo = m.motorArchivosCompartido();
            mo.onProgreso(alProgreso);
            for (const e of mo.listaTransferencias()) alProgreso(e);
            return mo;
        })
        .catch(() => null);
    return motorPromesa;
}

function decena(p: number | null): number {
    return p === null ? -1 : Math.floor(p / 10);
}

/** Mensajes de la bandeja que anuncian esa transferencia (normalmente uno). */
function mensajesDeAdjunto(id: string): MensajeMalla[] {
    const out: MensajeMalla[] = [];
    for (const c of Object.values(bandejaMalla().conv)) for (const m of c.mensajes) if (m.adjunto?.id === id) out.push(m);
    return out;
}

function alProgreso(e: EstadoTransferencia): void {
    // ARC1110A: la persona ya pulsó «Aceptar» en el mensaje; en cuanto el motor ve el anuncio/la oferta, se acepta.
    if (e.rol === "recibir" && e.fase === "pendiente-aceptar" && aceptadasDeAntemano.delete(e.id)) {
        void motorPromesa?.then((mo) => mo?.aceptarOferta(e.id));
    }
    const previo = vivos.get(e.id);
    const vivo: VivoArchivo = {
        rol: e.rol,
        fase: e.fase as FaseMotorArchivo,
        progreso: e.progreso,
        trozos: e.trozos,
        tamano: e.tamano,
        ...(e.motivo ? { motivo: e.motivo } : {}),
        inicioMs: e.inicioMs,
        actualizadoMs: e.actualizadoMs,
        ...(e.rutaEnlace ? { rutaEnlace: e.rutaEnlace } : {}),
        ...(e.rutaEnlaceOtro ? { rutaEnlaceOtro: e.rutaEnlaceOtro } : {}),
        ...(e.rutaEnlaceVerificada !== undefined ? { rutaEnlaceVerificada: e.rutaEnlaceVerificada } : {}),
        ...(e.cifradoArchivo ? { cifradoArchivo: e.cifradoArchivo } : {}),
        ...(e.repartoVias ? { repartoVias: e.repartoVias } : {}),
        ...(typeof e.velocidadBps === "number" ? { velocidadBps: e.velocidadBps } : {}),
    };
    vivos.set(e.id, vivo);
    for (const cb of Array.from(oyentesVivos)) {
        try {
            cb();
        } catch {
            /* noop */
        }
    }
    // A la bandeja (localStorage) solo los cambios de fase y cada 10 %: no en cada trozo.
    const pct = porcentajeTransferencia(e.progreso, e.trozos);
    const pctPrevio = previo ? porcentajeTransferencia(previo.progreso, previo.trozos) : null;
    if (previo && previo.fase === e.fase && decena(pct) === decena(pctPrevio)) return;
    void persistir(e.id, vivo, pct);
}

async function persistir(id: string, vivo: VivoArchivo, pct: number | null): Promise<void> {
    const fase = faseDesdeMotor(vivo.fase);
    for (const m of mensajesDeAdjunto(id)) {
        const archivo: EstadoArchivoMensaje = { ...(m.archivo ?? { fase }), fase, porcentaje: pct, ...(vivo.motivo ? { motivo: vivo.motivo } : { motivo: undefined }) };
        const cambio: Partial<MensajeMalla> = { archivo };
        if (m.dir === "sale" && fase === "verificado" && m.via) {
            cambio.via = { ...m.via, confirmado: true, confirmadoPor: "destino", motivo: `${m.via.motivo ?? "archivo"} · el otro aparato lo verificó con SHA-256` };
        }
        // (BLE1108B) Las dos rutas (la medida aquí y la que dice el otro lado) en la vía del mensaje.
        if (m.via && (vivo.rutaEnlace || vivo.rutaEnlaceOtro)) cambio.via = viaConRutas(cambio.via ?? m.via, vivo);
        if (m.dir === "entra" && fase === "verificado" && !m.archivo?.guardado) {
            const blob = (await motor())?.blobRecibido(id);
            if (blob) {
                enMemoria.set(id, blob);
                archivo.guardado = await guardarBlob(id, blob);
            }
        }
        cambiarMensajeMalla(m.clave, m.id, cambio);
    }
}

/* ══════════════════════════ Plan: por dónde sale un archivo ══════════════════════════ */

function motivoNoLlegaEnlace(tipo: string): string {
    if (tipo === "rele") return "el relé necesita la identidad cifrada del destinatario";
    if (tipo === "lora") return "falta el número de nodo LoRa del destinatario";
    return "ese enlace va a otro aparato";
}

/** Enlaces REALES hacia `destino`, con lo que admite cada uno (archivos y flujos). Nunca lanza. */
export async function candidatosParaDatos(destino: DestinoMalla): Promise<CandidatoDato[]> {
    try {
        const [t, el] = await Promise.all([import("@/lib/malla/transporte-universal"), import("@/lib/malla/eleccion-enlace")]);
        const enlaces = await t.enlacesDisponibles();
        const porId = new Map(enlaces.map((e) => [e.id, e]));
        return candidatosDatosDesdeEnlaces(
            enlaces.map((e) => ({
                id: e.id,
                tipo: e.tipo,
                etiqueta: e.etiqueta,
                abierto: e.abierto,
                ruta: e.ruta ?? null,
                rttMs: e.rttMs ?? null,
                capacidadKbps: e.capacidadKbps ?? null,
                admite: { ...e.admite },
            })),
            (e) => {
                const real = porId.get(e.id);
                return !!real && el.alcanzaDestino(real, destino);
            },
            (e) => motivoNoLlegaEnlace(e.tipo),
        );
    } catch {
        return [];
    }
}

async function internetYSesion(): Promise<{ internet: boolean; uid: string | null }> {
    try {
        return await hayInternetYSesion();
    } catch {
        return { internet: false, uid: null };
    }
}

/** Plan de medios para un archivo de `bytes` hacia `destino` (ajustes de medio del chat). */
export async function planArchivo(m: Pick<MensajeMalla, "destino" | "clavePrefs">, bytes: number): Promise<{ plan: PlanEnvio; candidatos: CandidatoDato[] }> {
    const destino = m.destino ?? {};
    const propia = !destino.uid;
    // Un chat o grupo por la malla: solo P2P (con servidor, sus adjuntos van por el chat de siempre).
    const tipo = m.clavePrefs?.startsWith("dm:") ? "dm" : m.clavePrefs?.startsWith("grupo:") ? "grupo" : "neurona";
    const [candidatos, red] = await Promise.all([candidatosParaDatos(destino), internetYSesion()]);
    const plan = planParaDatos(preferenciasEfectivas(m.clavePrefs), candidatos, {
        clase: "archivo",
        tipo,
        bytes,
        servidor:
            tipo === "neurona"
                ? {
                      abierto: red.internet && !!red.uid,
                      llega: propia,
                      motivoNoLlega: "el almacenamiento de tu cuenta solo comparte con tus propias neuronas",
                      maxBytes: MAX_SERVIDOR_BYTES,
                      etiqueta: "Almacenamiento de tu cuenta",
                  }
                : null,
    });
    return { plan, candidatos };
}

/** El anuncio de un archivo: por el chat de la neurona o, en un chat o grupo, por «chat-malla». */
function anunciar(m: MensajeMalla): Promise<MensajeMalla> {
    return m.clave.startsWith("dm:") ? anunciarEnChatMalla(m) : reenviarMensajeNeurona(m);
}

/* ══════════════════════════ Envío ══════════════════════════ */

function nuevoId(prefijo = ""): string {
    try {
        return `${prefijo}${crypto.randomUUID()}`;
    } catch {
        return `${prefijo}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

function cambiarArchivo(m: MensajeMalla, archivo: Partial<EstadoArchivoMensaje>, extra: Partial<MensajeMalla> = {}): MensajeMalla {
    const actual = mensajeMalla(m.clave, m.id) ?? m;
    const nuevo: EstadoArchivoMensaje = { ...(actual.archivo ?? { fase: "preparando" }), ...archivo };
    cambiarMensajeMalla(m.clave, m.id, { archivo: nuevo, ...extra });
    return mensajeMalla(m.clave, m.id) ?? { ...actual, archivo: nuevo, ...extra };
}

export interface ResultadoArchivoNeurona {
    mensaje: MensajeMalla;
    ok: boolean;
    aviso?: string;
}

/**
 * Manda archivos de cualquier formato a una neurona: uno detrás de otro (la oferta es rápida; los
 * trozos siguen en segundo plano cuando el otro acepta). Nunca lanza.
 */
export async function enviarArchivosANeurona(e: { clave: string; destino: DestinoMalla; archivos: File[]; mensaje?: string }): Promise<ResultadoArchivoNeurona[]> {
    const out: ResultadoArchivoNeurona[] = [];
    const lote = nuevoLote(e.archivos.length, e.mensaje);
    for (const archivo of e.archivos) {
        try {
            out.push(await enviarUno(e.clave, e.destino, archivo, claveChat("neurona", e.clave), lote));
        } catch {
            /* un archivo roto no para a los demás */
        }
    }
    return out;
}

/**
 * Lo mismo en un chat 1:1 o de grupo cuyo medio elegido es la malla: una transferencia P2P a cada
 * persona del chat (cada una con su vía y sus confirmaciones), anunciada por «chat-malla».
 */
export async function enviarArchivosAChatMalla(e: { hiloId: string; tipo: "dm" | "grupo"; otros: string[]; archivos: File[]; mensaje?: string }): Promise<ResultadoArchivoNeurona[]> {
    const out: ResultadoArchivoNeurona[] = [];
    const clave = `dm:${e.hiloId}`;
    // Un envío por persona: cada una ve SUS archivos juntos en una ventana.
    const lotes = new Map<string, LoteEnvio>();
    for (const archivo of e.archivos) {
        for (const uid of Array.from(new Set(e.otros)).slice(0, 64)) {
            let lote = lotes.get(uid);
            if (!lote) {
                lote = nuevoLote(e.archivos.length, e.mensaje);
                lotes.set(uid, lote);
            }
            try {
                out.push(await enviarUno(clave, { uid }, archivo, claveChat(e.tipo, e.hiloId), lote));
            } catch {
                /* noop */
            }
        }
    }
    return out;
}

/** (ARC1108A) Envío al que pertenece un archivo: los que salen juntos los decide el otro en UNA ventana. */
interface LoteEnvio {
    id: string;
    total: number;
    mensaje?: string;
}

function nuevoLote(total: number, mensaje?: string): LoteEnvio {
    const nota = typeof mensaje === "string" ? mensaje.trim().slice(0, 1000) : "";
    return { id: nuevoId("lote_").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60), total: Math.max(1, total), ...(nota ? { mensaje: nota } : {}) };
}

/** (ARC1108A) Lo que acompaña a la oferta de cada adjunto (en memoria: tras recargar, el reintento sale sin ello). */
const extrasOferta = new Map<string, { lote?: LoteEnvio; ruta?: string }>();

async function enviarUno(clave: string, destino: DestinoMalla, archivo: File, clavePrefs: string, lote?: LoteEnvio): Promise<ResultadoArchivoNeurona> {
    const adjunto: AdjuntoNeurona = {
        id: nuevoId("arch_"),
        nombre: nombreArchivoSeguro(archivo.name),
        tipo: (archivo.type || "application/octet-stream").toLowerCase().slice(0, 120),
        tamano: archivo.size,
        modo: "p2p",
    };
    const m: MensajeMalla = {
        id: nuevoId(),
        clave,
        dir: "sale",
        texto: "",
        at: Date.now(),
        estado: "enviando",
        destino,
        ...(destino.uid && clave.startsWith("dm:") ? { destinatarios: [destino.uid] } : {}),
        clavePrefs,
        intentos: 0,
        adjunto,
        archivo: { fase: "preparando" },
    };
    enMemoria.set(adjunto.id, archivo);
    const ruta = typeof archivo.webkitRelativePath === "string" && archivo.webkitRelativePath ? archivo.webkitRelativePath : undefined;
    extrasOferta.set(adjunto.id, { ...(lote ? { lote } : {}), ...(ruta ? { ruta } : {}) });
    guardarMensajeMalla(m);
    void motor();
    if (archivo.size <= MAX_COPIA_LOCAL_BYTES) {
        void guardarBlob(adjunto.id, archivo).then((ok) => {
            if (ok) cambiarArchivo(m, { guardado: true });
        });
    }
    return enviarSegunPlan(m, archivo);
}

/** Decide el medio y lo manda (también al reintentar o reanudar). */
async function enviarSegunPlan(m0: MensajeMalla, archivo: Blob): Promise<ResultadoArchivoNeurona> {
    const m = mensajeMalla(m0.clave, m0.id) ?? m0;
    const { plan, candidatos } = await planArchivo(m, archivo.size);
    // (INT1108C) Un archivo grande a una neurona vecina (Bluetooth directo cerca): el enlace Wi-Fi directo se
    // abre o se propone según el ajuste (una vez por archivo: los reintentos del buzón no insisten).
    avisarEnvioPesado({ clave: `archivo:${m.id}`, destino: m.destino ?? {}, clase: "archivo", bytes: archivo.size, enlace: enlaceDePaso(plan.pasos[0]) });
    if (plan.sinCamino) {
        const espera = plan.siNinguno === "esperar";
        const fin = cambiarArchivo(
            m,
            { fase: espera ? "preparando" : "error", motivo: plan.aviso },
            { estado: espera ? "en-espera" : "fallido", aviso: plan.aviso, descartados: plan.descartados, intentos: (m.intentos ?? 0) + 1 },
        );
        return { mensaje: fin, ok: espera, aviso: plan.aviso };
    }
    if (plan.pasos[0].medio === "servidor") return subirYAnunciar(m, archivo, plan);
    return ofrecerPorMalla(m, archivo, plan, candidatos);
}

async function ofrecerPorMalla(m: MensajeMalla, archivo: Blob, plan: PlanEnvio, candidatos: CandidatoDato[]): Promise<ResultadoArchivoNeurona> {
    // 1 · El anuncio, por el plan de MENSAJES del chat (así el otro aparato sabe de qué chat es).
    if (!m.via) {
        const anunciado = await anunciar(m);
        if (anunciado.estado === "fallido" || anunciado.estado === "en-espera") {
            const fin = cambiarArchivo(anunciado, { fase: anunciado.estado === "fallido" ? "error" : "preparando", motivo: anunciado.aviso });
            return { mensaje: fin, ok: anunciado.estado === "en-espera", aviso: anunciado.aviso };
        }
    }
    // 2 · Los trozos, por el canal P2P (uno forzado si el chat no permite todos los enlaces).
    const adj = m.adjunto as AdjuntoNeurona;
    try {
        const tu = await import("@/lib/malla/transporte-universal");
        const forzado = enlaceForzadoParaArchivo(plan, candidatos);
        const destino = { ...(m.destino ?? {}), ...(forzado ? { enlaceId: forzado } : {}) };
        // MPT1108B: sellado de punta a punta + todas las vías; el relé solo si los ajustes del chat permiten el servidor y no se forzó un enlace.
        const elegido = await tu.canalParaArchivo(destino, archivo.size, { permitirRele: !forzado && plan.pasos.some((p) => p.medio === "servidor") });
        if (!elegido.canal) {
            const motivo = elegido.motivo ?? "No hay ningún enlace P2P abierto hacia ese aparato.";
            return { mensaje: cambiarArchivo(m, { fase: "error", motivo }), ok: false, aviso: motivo };
        }
        const mo = await motor();
        if (!mo) return { mensaje: cambiarArchivo(m, { fase: "error", motivo: "El motor de archivos no está disponible." }), ok: false };
        const via: ViaMensaje | null = viaDeEnlaces(
            elegido.enlaces.map((x) => ({ id: x.id, tipo: x.tipo, etiqueta: x.etiqueta, ruta: x.ruta ?? null, rttMs: x.rttMs ?? null })),
            { clase: "archivo", descartados: plan.descartados, en: Date.now() },
        );
        cambiarArchivo(m, { fase: "ofrecido", motivo: undefined, enlaces: elegido.enlaces.map((x) => x.etiqueta) }, via ? { via } : {});
        // (ARC1108A) El envío al que pertenece, su carpeta y una vista previa: el otro decide en UNA ventana.
        const extras = extrasOferta.get(adj.id);
        // ARC1110A: la vista previa NO se espera aquí (era otro retraso antes de la oferta): el motor recibe la promesa y
        // la espera como mucho unos segundos mientras prepara el archivo.
        const vista = import("@/lib/network/vista-previa-envio")
            .then((v) => v.vistaParaOferta(archivo, adj.nombre, adj.tipo))
            .catch(() => undefined);
        const r = await mo.enviarArchivo(
            elegido.canal,
            archivo,
            adj.nombre,
            { tipo: "dispositivo", id: m.destino?.syncDeviceId ?? m.destino?.neuronDeviceId ?? elegido.enlaces[0]?.id },
            {
                idTransferencia: adj.id,
                tipoMime: adj.tipo,
                ...(extras?.lote ? { lote: extras.lote } : {}),
                ...(extras?.ruta ? { ruta: extras.ruta } : {}),
                vista,
            },
        );
        if (!r.ok) return { mensaje: cambiarArchivo(m, { fase: "error", motivo: r.error }), ok: false, aviso: r.error };
        return { mensaje: mensajeMalla(m.clave, m.id) ?? m, ok: true, aviso: r.aviso };
    } catch {
        return { mensaje: cambiarArchivo(m, { fase: "error", motivo: "No se pudo empezar el envío." }), ok: false };
    }
}

async function sha256Hex(blob: Blob): Promise<string | null> {
    try {
        const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
        return null;
    }
}

function ahora(): number {
    try {
        return performance.now();
    } catch {
        return Date.now();
    }
}

async function subirYAnunciar(m: MensajeMalla, archivo: Blob, plan: PlanEnvio): Promise<ResultadoArchivoNeurona> {
    const adj = m.adjunto as AdjuntoNeurona;
    cambiarArchivo(m, { fase: "subiendo", motivo: undefined });
    const sha = await sha256Hex(archivo);
    try {
        const { uploadFile } = await import("@/lib/files/os-files");
        // Sin recomprimir (una imagen se subiría recomprimida): la neurona recibe el mismo archivo,
        // byte a byte, y lo verifica con su SHA-256.
        const crudo = new File([archivo], adj.nombre, { type: "application/octet-stream" });
        const t0 = ahora();
        const subida = await uploadFile(crudo, { folder: "neuronas" });
        const dt = ahora() - t0;
        const url = urlAdjuntoSegura(subida.file?.url);
        if (!subida.ok || !url) {
            const motivo = subida.error ?? "El almacenamiento no devolvió un enlace seguro (https).";
            return { mensaje: cambiarArchivo(m, { fase: "error", motivo }, { estado: "fallido", aviso: motivo }), ok: false, aviso: motivo };
        }
        const adjunto: AdjuntoNeurona = { ...adj, modo: "servidor", url, ...(sha ? { sha256: sha } : {}) };
        cambiarMensajeMalla(m.clave, m.id, { adjunto });
        const anunciado = await reenviarMensajeNeurona(mensajeMalla(m.clave, m.id) ?? { ...m, adjunto });
        const via: ViaMensaje = {
            medio: "servidor",
            direccion: "sale",
            enlace: "Almacenamiento de tu cuenta",
            enlaceId: "servidor",
            servidor: "Almacenamiento de archivos StarSeed (Supabase Storage)",
            ruta: null,
            latenciaMs: dt,
            latenciaFuente: "servidor",
            confirmado: true,
            confirmadoPor: "servidor",
            motivo: `guardado en tu cuenta (${sha ? "con su SHA-256" : "sin SHA-256"}); aviso ${anunciado.via ? `por ${anunciado.via.enlace ?? anunciado.via.medio}` : "pendiente"}`,
            descartados: plan.descartados,
            en: Date.now(),
        };
        const ok = anunciado.estado === "enviado" || anunciado.estado === "confirmado";
        return {
            mensaje: cambiarArchivo(anunciado, { fase: "disponible", motivo: ok ? undefined : anunciado.aviso }, { via }),
            ok,
            aviso: ok ? undefined : anunciado.aviso,
        };
    } catch {
        return { mensaje: cambiarArchivo(m, { fase: "error", motivo: "No se pudo subir el archivo." }), ok: false };
    }
}

/**
 * Reintenta o reanuda un archivo que salía: con la copia de este aparato vuelve a pasar por el plan
 * (si ya se anunció, solo vuelven a salir los trozos; el otro aparato sigue desde el último que
 * guardó). Lo usan el botón «Reanudar» y los reintentos del buzón. Nunca lanza.
 */
export async function reintentarArchivoNeurona(m: MensajeMalla): Promise<MensajeMalla> {
    if (m.dir !== "sale" || !m.adjunto) return m;
    const archivo = await archivoDeAdjunto(m.adjunto.id);
    if (!archivo) {
        return cambiarArchivo(
            m,
            { fase: "error", motivo: "Este aparato no guardó una copia (más de 512 MB o sin espacio): vuelve a adjuntarlo." },
            { estado: m.estado === "en-espera" ? "fallido" : m.estado },
        );
    }
    try {
        return (await enviarSegunPlan(m, archivo)).mensaje;
    } catch {
        return mensajeMalla(m.clave, m.id) ?? m;
    }
}

/* ══════════════════════════ Recepción ══════════════════════════ */

/** Acepta, rechaza o cancela una transferencia P2P (el receptor decide). */
/** ARC1110A: «Aceptar» pulsado antes de que el motor conozca la transferencia (el mensaje del chat llega antes que el anuncio). */
const aceptadasDeAntemano = new Set<string>();

export async function aceptarArchivo(id: string): Promise<void> {
    const mo = await motor();
    if (!mo) return;
    if (mo.estadoDe(id)) mo.aceptarOferta(id);
    else {
        aceptadasDeAntemano.add(id);
        while (aceptadasDeAntemano.size > 64) aceptadasDeAntemano.delete(aceptadasDeAntemano.values().next().value as string);
    }
}

export async function rechazarArchivo(id: string): Promise<void> {
    (await motor())?.rechazarOferta(id, "Rechazado por quien lo recibe.");
}

export async function cancelarArchivo(id: string): Promise<void> {
    (await motor())?.cancelar(id);
}

/**
 * Llegó el anuncio de un archivo (lo llama el buzón). Engancha el motor y, si la transferencia ya
 * terminó (el anuncio llegó tarde), guarda el archivo en este aparato.
 */
export async function alAnunciarArchivo(clave: string, mensajeId: string): Promise<void> {
    await motor();
    const m = mensajeMalla(clave, mensajeId);
    const adj = m?.adjunto;
    if (!m || !adj || adj.modo !== "p2p") return;
    const vivo = vivos.get(adj.id);
    if (vivo) await persistir(adj.id, vivo, porcentajeTransferencia(vivo.progreso, vivo.trozos));
}

/**
 * Baja un archivo del almacenamiento de la cuenta, lo verifica con su SHA-256 y lo guarda en este
 * aparato (así se ve y se baja sin internet). Nunca lanza.
 */
export async function bajarArchivoServidor(m: MensajeMalla): Promise<{ ok: boolean; motivo?: string }> {
    const adj = m.adjunto;
    const url = urlAdjuntoSegura(adj?.url);
    if (!adj || adj.modo !== "servidor" || !url) return { ok: false, motivo: "Este archivo no tiene un enlace seguro." };
    cambiarArchivo(m, { fase: "transfiriendo", porcentaje: null, motivo: undefined });
    try {
        const r = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (adj.sha256) {
            const sha = await sha256Hex(blob);
            if (sha !== adj.sha256) {
                const motivo = "La verificación SHA-256 no coincide: el archivo llegó dañado o alterado.";
                cambiarArchivo(m, { fase: "error", motivo });
                return { ok: false, motivo };
            }
        }
        const limpio = new Blob([blob], { type: adj.tipo });
        enMemoria.set(adj.id, limpio);
        const guardado = await guardarBlob(adj.id, limpio);
        cambiarArchivo(m, { fase: adj.sha256 ? "verificado" : "disponible", guardado, motivo: adj.sha256 ? undefined : "sin SHA-256 con el que verificarlo" });
        return { ok: true };
    } catch {
        const motivo = "No se pudo bajar (¿sin internet?). El aviso sigue aquí: vuelve a intentarlo luego.";
        cambiarArchivo(m, { fase: "disponible", motivo });
        return { ok: false, motivo };
    }
}

/** Engancha el motor de archivos (lo llama el arranque del buzón) para seguir lo que llega. */
export function iniciarArchivosNeurona(): () => void {
    void motor();
    return () => undefined;
}
