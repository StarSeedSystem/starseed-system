"use client";

/**
 * Micrófono, cámara, pantalla y altavoces. Solo se piden cuando la persona pulsa un botón
 * (llamar, aceptar, unirse, «probar cámara y micro»): nunca al cargar una página ni al sonar
 * un timbre. Nunca lanza: devuelve el error ya traducido.
 */
import { mensajeErrorMedios } from "@/lib/llamadas/errores";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import type { DispositivosMedios } from "@/lib/llamadas/tipos";
import { explicarFalloMedios } from "@/lib/nativa/medios-nativos";
import { esAppNativa } from "@/lib/nativa/puente";
import { describirCamaras, elegirCamaraPorDefecto, leerPreferencias, lineaCamaraElegida, plataformaDe, type CamaraInfo, type Plataforma, restriccionesDeOpciones, leerCapacidades, restriccionesVideoDeseadas, textoRestricciones } from "@/lib/llamadas/camaras";
// LLA1111A · lo puro de las restricciones vive en camaras.ts (lo usa también el adaptador); se reexporta aquí.
export { esPlataformaMovil, textoRestricciones } from "@/lib/llamadas/camaras";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { getDeviceId } from "@/lib/network/device-registry";
// PRM1109A (paso 4) · el motor de permisos es el único que habla con el
// navegador para abrir micrófono/cámara/pantalla: aquí se le pide el stream.
import { solicitarMedios, solicitarPantalla } from "@/lib/aurora/senses/request-permission";

/** La neurona de ESTE aparato (donde se recuerdan las elecciones); sin ella, un nombre fijo. */
function neuronaLocal(): string {
    try {
        return getDeviceId() || "local";
    } catch {
        return "local";
    }
}

function mediaDevices(): MediaDevices | null {
    try {
        return typeof navigator !== "undefined" && navigator.mediaDevices ? navigator.mediaDevices : null;
    } catch {
        return null;
    }
}

export function soportaLlamadas(): boolean {
    if (typeof window === "undefined") return false;
    const md = mediaDevices();
    return !!md && typeof md.getUserMedia === "function" && typeof (window as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function";
}

/**
 * (MIC1108A) Por qué no hay llamadas aquí, dicho para ESTE entorno: en la app nativa, falta de
 * permiso de la app instalada o motor sin WebRTC; en el navegador, https y navegador actual.
 */
export async function motivoSinLlamadas(video = false): Promise<{ motivo: string; ajustes: AjustesMedios | null }> {
    const md = mediaDevices();
    if (!md || typeof md.getUserMedia !== "function") {
        const d = await explicarFalloMedios({ name: "NoMediaDevices" }, { audio: true, video });
        return { motivo: d.mensaje, ajustes: d.ajustes };
    }
    return {
        motivo: esAppNativa()
            ? "El motor web de esta app no trae llamadas (WebRTC). Mientras, puedes llamar desde el navegador."
            : "Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual.",
        ajustes: null,
    };
}

export function soportaPantalla(): boolean {
    const md = mediaDevices();
    return !!md && typeof (md as { getDisplayMedia?: unknown }).getDisplayMedia === "function";
}

export function soportaAltavoz(): boolean {
    try {
        return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
    } catch {
        return false;
    }
}

function modoEco(): boolean {
    try {
        return typeof document !== "undefined" && document.documentElement.getAttribute("data-perf") === "eco";
    } catch {
        return false;
    }
}

export function restriccionesAudio(microId?: string | null): MediaTrackConstraints {
    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(microId ? { deviceId: { exact: microId } } : {}),
    };
}

function plataformaActual(): Plataforma {
    return plataformaDe(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

/**
 * La lista de deseos de vídeo, TODO como `ideal` (LLA1111A). Antes llevaba `frameRate: { max: 30 }` (obligatorio) y
 * `facingMode: "user"` también en el escritorio: en la Mac (prueba.35) toda petición a la «FaceTime HD Camera», a la
 * virtual y al sistema sin id acababa en OverconstrainedError en 2–40 ms, y solo abrían las del iPhone. El único
 * requisito obligatorio común a todas esas peticiones era ese `max` (el `deviceId` exacto no estaba en la del sistema).
 * Un `ideal` nunca hace fallar la apertura: el motor da lo más parecido que tenga la cámara.
 */
export function restriccionesVideo(camaraId?: string | null, plataforma: Plataforma = plataformaActual(), eco = modoEco()): MediaTrackConstraints {
    return restriccionesVideoDeseadas(camaraId, plataforma, eco);
}

export type NombrePeldano = "deseo" | "solo-id" | "libre";
export interface PeldanoCamara {
    paso: NombrePeldano;
    video: MediaTrackConstraints | true;
}

/**
 * LLA1111A · la escalera de relajación al abrir una cámara: 1) la lista de deseos (todo `ideal`); 2) con cámara
 * pedida, solo su `deviceId` exacto; 3) nada (`video: true`). Después del 3, quien llama pasa a la cámara pedida
 * con la pista ya abierta (ver `obtenerMedios`). Pura.
 */
export function escaleraCamara(camaraId: string | null | undefined, plataforma: Plataforma, eco = false): PeldanoCamara[] {
    const out: PeldanoCamara[] = [{ paso: "deseo", video: restriccionesVideo(camaraId, plataforma, eco) }];
    if (camaraId) out.push({ paso: "solo-id", video: { deviceId: { exact: camaraId } } });
    out.push({ paso: "libre", video: true });
    return out;
}

/** Nombre y restricción que falló de un error de getUserMedia (`OverconstrainedError.constraint`). */
export function describirErrorMedios(err: unknown): string {
    const e = err as { name?: string; constraint?: string } | null;
    const nombre = e?.name ?? "desconocido";
    return nombre === "OverconstrainedError" ? `${nombre} constraint=${e?.constraint || "?"}` : nombre;
}

/** ¿Merece la pena bajar un peldaño? Solo si lo pedido no encaja (o el id ya no existe), no si falta permiso u ocupa otra app. */
export function relajarTrasError(err: unknown): boolean {
    const n = (err as { name?: string } | null)?.name ?? "";
    return n === "OverconstrainedError" || n === "ConstraintNotSatisfiedError" || n === "NotFoundError" || n === "DevicesNotFoundError";
}

const OCUPADA = ["NotReadableError", "AbortError", "TrackStartError"];

/**
 * Abre la cámara por la escalera; una línea al registro por intento y su resultado. Devuelve el stream y el peldaño
 * que abrió, o lanza el último error.
 */
async function abrirPorEscalera(md: MediaDevices, audio: MediaTrackConstraints | false, peldanos: readonly PeldanoCamara[], que: string): Promise<{ stream: MediaStream; paso: NombrePeldano }> {
    let ultimo: unknown = null;
    for (let i = 0; i < peldanos.length; i++) {
        const p = peldanos[i];
        const t0 = Date.now();
        try {
            const stream = await solicitarMedios({ audio, video: p.video }, md);
            const pista = stream.getVideoTracks()[0];
            anotarLlamada("camara", null, `intento ${que} ${i + 1}/${peldanos.length} paso=${p.paso} restr=${textoRestricciones(p.video)} ok ms=${Date.now() - t0} abierta="${(pista?.label ?? "?").replace(/"/g, "'").slice(0, 50)}"`);
            return { stream, paso: p.paso };
        } catch (err) {
            ultimo = err;
            const sigue = relajarTrasError(err) && i < peldanos.length - 1;
            anotarLlamada("camara", null, `intento ${que} ${i + 1}/${peldanos.length} paso=${p.paso} restr=${textoRestricciones(p.video)} fallo ms=${Date.now() - t0} error=${describirErrorMedios(err)}${sigue ? " se relaja" : ""}`);
            if (!sigue) break;
        }
    }
    throw ultimo;
}

/** Abre SOLO la pista de vídeo de una cámara concreta por la escalera (sin el peldaño libre: tiene que ser esa). */
async function abrirPistaDe(md: MediaDevices, id: string, plataforma: Plataforma, que: string): Promise<MediaStreamTrack> {
    const peldanos = escaleraCamara(id, plataforma, modoEco()).filter((p) => p.paso !== "libre");
    const { stream } = await abrirPorEscalera(md, false, peldanos, que);
    const nueva = stream.getVideoTracks()[0];
    if (!nueva) throw Object.assign(new Error("sin pista"), { name: "SinPista" });
    return nueva;
}

/**
 * Cambia la pista de vídeo de `stream` por la de la cámara `destino` (LLA1110D/LLA1111A). Primero con la otra abierta;
 * si la cámara está «ocupada» (WebKit puede no abrir dos a la vez), suelta la abierta y reintenta; si tampoco, vuelve a
 * abrir lo que había por la escalera (nunca sin cámara). Devuelve si quedó la de destino.
 */
async function pasarACamara(md: MediaDevices, stream: MediaStream, destino: CamaraInfo, abiertaId: string | null, plataforma: Plataforma): Promise<boolean> {
    const pista = stream.getVideoTracks()[0] ?? null;
    try {
        const nueva = await abrirPistaDe(md, destino.id, plataforma, "cambio");
        stream.addTrack(nueva);
        if (pista) {
            stream.removeTrack(pista);
            pista.stop();
        }
        return true;
    } catch (err) {
        const ocupada = OCUPADA.includes((err as { name?: string })?.name ?? "");
        anotarLlamada("camara", null, `cambio-a-preferida-fallo elegida="${destino.etiqueta}" error=${describirErrorMedios(err)}${ocupada ? " se suelta la del sistema y se reintenta" : ""}`);
        if (!ocupada || !pista) return false;
        stream.removeTrack(pista);
        pista.stop();
        try {
            stream.addTrack(await abrirPistaDe(md, destino.id, plataforma, "cambio-sola"));
            return true;
        } catch (err2) {
            anotarLlamada("camara", null, `preferida-sola-fallo error=${describirErrorMedios(err2)} se reabre la del sistema`);
            try {
                const peldanos = escaleraCamara(abiertaId, plataforma, modoEco());
                const { stream: s } = await abrirPorEscalera(md, false, peldanos, "reabrir");
                const t = s.getVideoTracks()[0];
                if (t) stream.addTrack(t);
            } catch (err3) {
                anotarLlamada("camara", null, `reabrir-sistema-fallo error=${describirErrorMedios(err3)}`);
            }
            return false;
        }
    }
}

/** Lista de cámaras ya descrita (con etiquetas si hay permiso). */
async function camarasDe(md: MediaDevices, plataforma: Plataforma): Promise<CamaraInfo[]> {
    return describirCamaras(
        (await md.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ id: d.deviceId, nombre: d.label || "" })),
        plataforma,
    );
}

/**
 * LLA1111A · la cámara pedida en la lista de ahora: por id, y si el id cambió (WebKit los cambia entre arranques), por
 * la etiqueta que se recordó con ese id. Pura.
 */
export function resolverCamaraPedida(lista: readonly CamaraInfo[], id: string, guardada?: { id: string; etiqueta?: string } | null): CamaraInfo | null {
    const porId = lista.find((c) => c.id === id);
    if (porId) return porId;
    const etiqueta = guardada && guardada.id === id ? guardada.etiqueta : undefined;
    if (!etiqueta) return null;
    return lista.find((c) => c.etiqueta && (c.etiqueta === etiqueta || c.nombre === etiqueta)) ?? null;
}

/**
 * VID1110A: deja en la llamada la cámara DEL PROPIO APARATO. Sin deviceId deja decidir al sistema, y macOS prefiere el
 * iPhone (Cámara de Continuidad) si está cerca. Con permiso ya dado se ven las etiquetas: si lo abierto no es lo que se
 * elegiría (guardada › integrada frontal › resto), se pasa a la buena por la escalera (LLA1111A) y se suelta la otra.
 * Nunca lanza ni deja la llamada sin cámara: si algo falla, se queda la que abrió el sistema.
 */
export async function afinarCamara(md: MediaDevices, stream: MediaStream, camaraIdPedida?: string | null, neurona: string = neuronaLocal(), plataforma: Plataforma = plataformaActual()): Promise<void> {
    const pista = stream.getVideoTracks()[0];
    if (!pista) return;
    try {
        const lista = await camarasDe(md, plataforma);
        const abiertaId = pista.getSettings?.().deviceId ?? null;
        const abierta = lista.find((c) => c.id === abiertaId) ?? lista.find((c) => c.etiqueta && c.etiqueta === pista.label) ?? null;
        if (camaraIdPedida) {
            if (abierta) anotarLlamada("camara", null, lineaCamaraElegida(abierta, "pedida"));
            return;
        }
        const e = elegirCamaraPorDefecto(lista, leerPreferencias(neurona).camara);
        let final = abierta;
        if (e.camara && abiertaId && e.camara.id !== abiertaId) {
            if (await pasarACamara(md, stream, e.camara, abiertaId, plataforma)) final = e.camara;
        }
        if (final) anotarLlamada("camara", null, lineaCamaraElegida(final, final === e.camara ? e.motivo : "sistema"));
    } catch {
        /* sin enumerateDevices: se queda la que abrió el sistema */
    }
}

/** Aplica unas opciones guardadas (resolución, fps, zoom…) a la pista abierta. Solo lo que esa cámara admite. */
export async function aplicarOpcionesGuardadas(pista: MediaStreamTrack | null | undefined, neurona: string = neuronaLocal()): Promise<void> {
    if (!pista || typeof pista.applyConstraints !== "function") return;
    try {
        const o = leerPreferencias(neurona).opciones?.[pista.label];
        if (!o) return;
        const r = restriccionesDeOpciones(o, leerCapacidades(pista));
        if (Object.keys(r).length) await pista.applyConstraints(r);
    } catch {
        /* la cámara no las admite: se queda como está */
    }
}

export interface ResultadoMedios {
    stream: MediaStream | null;
    /** Error bloqueante (no se consiguió nada de lo pedido). */
    error: string | null;
    /** Aviso parcial (p. ej. hay micro pero no cámara). */
    aviso: string | null;
    /** (MIC1108A) Qué ajustes del sistema abre «Abrir ajustes» (solo en la app y si el fallo fue de permisos). */
    ajustes?: AjustesMedios | null;
    /** LLA1113A: la cámara no abrió porque está ocupada (NotReadableError…): con otra abierta, se puede soltar y reintentar. */
    ocupada?: boolean;
}

/** (MIC1108A) El error bloqueante, dicho para ESTE entorno (app nativa de cada sistema o navegador). */
async function errorBloqueante(err: unknown, p: { audio: boolean; video: boolean }): Promise<ResultadoMedios> {
    const d = await explicarFalloMedios(err, { audio: p.audio, video: p.video });
    return { stream: null, error: d.mensaje, aviso: null, ajustes: d.ajustes };
}

/**
 * Pide micro y/o cámara. Si pide los dos y la cámara falla, se queda con el micro y lo avisa
 * (mejor una llamada sin vídeo que ninguna).
 *
 * LLA1111A · la cámara se abre por la escalera de relajación (`escaleraCamara`): deseos como `ideal` › solo el
 * `deviceId` exacto › `video: true`. Si abrió el peldaño libre y se había pedido otra cámara, se pasa a esa con la pista
 * ya abierta (por id, o por la etiqueta recordada si el id cambió). Pedida SOLO la cámara (selector, encender) y sin
 * poder abrir esa en concreto, no se devuelve otra en silencio: se suelta y se dice por qué (quien llama decide; el
 * motor reintenta con la del sistema al encender y deja la anterior al cambiar). Cada intento, una línea al registro.
 * Sustituye al reintento con `video: true` del enjambre (P0-3), que solo corría con cámara pedida y luego volvía a
 * elegir sola (podía devolver el iPhone cuando se había pedido la FaceTime).
 */
export async function obtenerMedios(p: { audio: boolean; video: boolean; microId?: string | null; camaraId?: string | null }): Promise<ResultadoMedios> {
    const md = mediaDevices();
    if (!md || typeof md.getUserMedia !== "function") {
        return errorBloqueante({ name: "NoMediaDevices" }, p);
    }
    if (!p.audio && !p.video) return { stream: null, error: null, aviso: null };
    const audio = p.audio ? restriccionesAudio(p.microId) : false;
    if (!p.video) {
        try {
            return { stream: await solicitarMedios({ audio, video: false }, md), error: null, aviso: null };
        } catch (err) {
            anotarLlamada("camara", null, `obtener-medios-fallo audio=si video=no micro=${p.microId ? "elegido" : "sistema"} error=${describirErrorMedios(err)}`);
            return errorBloqueante(err, p);
        }
    }
    const plataforma = plataformaActual();
    const neurona = neuronaLocal();
    try {
        const { stream, paso } = await abrirPorEscalera(md, audio, escaleraCamara(p.camaraId, plataforma, modoEco()), p.camaraId ? "pedida" : "sistema");
        if (p.camaraId && paso === "libre") {
            // Ya hay permiso y etiquetas: se busca la pedida (el id pudo cambiar) y se pasa a ella.
            const lista = await camarasDe(md, plataforma).catch(() => [] as CamaraInfo[]);
            const pista = stream.getVideoTracks()[0] ?? null;
            const abiertaId = pista?.getSettings?.().deviceId ?? null;
            const destino = resolverCamaraPedida(lista, p.camaraId, leerPreferencias(neurona).camara);
            let ok = !!destino && destino.id === abiertaId;
            if (destino && !ok) ok = await pasarACamara(md, stream, destino, abiertaId, plataforma);
            anotarLlamada("camara", null, `tras-libre pedida=${destino ? `"${destino.etiqueta}"` : "no-esta"} ${ok ? "abierta" : "no-abre"}`);
            if (!ok && !p.audio) {
                pararStream(stream);
                const nombre = destino?.nombre ?? "La cámara elegida";
                return { stream: null, error: destino ? `${nombre} no se pudo abrir. Sigue la cámara que tenías; prueba otra vez o elige otra.` : "Esa cámara ya no está conectada. Elige otra en Puertos › Cámara.", aviso: null };
            }
            if (destino && ok) anotarLlamada("camara", null, lineaCamaraElegida(destino, "pedida"));
        } else {
            await afinarCamara(md, stream, p.camaraId, neurona, plataforma);
        }
        await aplicarOpcionesGuardadas(stream.getVideoTracks()[0]);
        return { stream, error: null, aviso: null };
    } catch (err) {
        // (LLA1110D) Todo fallo de medios queda en el registro del enlace (nombre del error, restricción y qué se pidió).
        anotarLlamada("camara", null, `obtener-medios-fallo audio=${p.audio ? "si" : "no"} video=si micro=${p.microId ? "elegido" : "sistema"} camara=${p.camaraId ? "elegida" : "sistema"} error=${describirErrorMedios(err)}`);
        if (p.audio) {
            try {
                const stream = await solicitarMedios({ audio, video: false }, md);
                return { stream, error: null, aviso: await textoFalloCamara(md, err) };
            } catch (err2) {
                anotarLlamada("camara", null, `obtener-medios-fallo solo-micro error=${describirErrorMedios(err2)}`);
                return errorBloqueante(err2, p);
            }
        }
        const r = await errorBloqueante(err, p);
        return { ...r, error: (await textoCamaraListada(md, err)) ?? r.error, ocupada: OCUPADA.includes((err as { name?: string })?.name ?? "") };
    }
}

/**
 * LLA1111A · nunca «No encontramos ninguna cámara» si hay cámaras en la lista: se dice qué pasó de verdad. null si no
 * hay ninguna listada (entonces vale el texto de siempre).
 */
async function textoCamaraListada(md: MediaDevices, err: unknown): Promise<string | null> {
    let hay = false;
    try {
        hay = (await md.enumerateDevices()).some((d) => d.kind === "videoinput");
    } catch {
        hay = false;
    }
    if (!hay) return null;
    const n = (err as { name?: string })?.name ?? "";
    if (OCUPADA.includes(n)) return "La cámara está ocupada por otra aplicación. Ciérrala y vuelve a probar, o elige otra cámara.";
    if (n === "NotAllowedError" || n === "SecurityError") return null;
    return `La cámara no se pudo abrir (${describirErrorMedios(err)}). Vuelve a probar o elige otra en Puertos › Cámara.`;
}

async function textoFalloCamara(md: MediaDevices, err: unknown): Promise<string> {
    return (await textoCamaraListada(md, err)) ?? mensajeErrorMedios(err, { audio: false, video: true });
}

export async function obtenerPista(tipo: "audio" | "video", deviceId?: string | null): Promise<{ pista: MediaStreamTrack | null; error: string | null; ocupada?: boolean }> {
    const r = await obtenerMedios({
        audio: tipo === "audio",
        video: tipo === "video",
        microId: tipo === "audio" ? deviceId : null,
        camaraId: tipo === "video" ? deviceId : null,
    });
    const pista = (tipo === "audio" ? r.stream?.getAudioTracks()[0] : r.stream?.getVideoTracks()[0]) ?? null;
    return { pista, error: pista ? null : r.error ?? r.aviso, ...(!pista && r.ocupada ? { ocupada: true } : {}) }; // LLA1113A: ocupada
}

export async function obtenerPantalla(): Promise<{ pista: MediaStreamTrack | null; error: string | null }> {
    const md = mediaDevices() as (MediaDevices & { getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream> }) | null;
    if (!md?.getDisplayMedia) return { pista: null, error: (await explicarFalloMedios({ name: "NoMediaDevices" }, { audio: false, video: true, pantalla: true })).mensaje };
    try {
        const s = await solicitarPantalla({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }, md);
        const pista = s.getVideoTracks()[0] ?? null;
        try {
            if (pista) (pista as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
        } catch {
            /* opcional */
        }
        return { pista, error: pista ? null : "No llegó ninguna imagen de la pantalla." };
    } catch (err) {
        return { pista: null, error: (await explicarFalloMedios(err, { audio: false, video: true, pantalla: true })).mensaje };
    }
}

export async function listarDispositivos(): Promise<DispositivosMedios> {
    const vacio: DispositivosMedios = { microfonos: [], camaras: [], altavoces: [] };
    const md = mediaDevices();
    if (!md?.enumerateDevices) return vacio;
    try {
        const lista = await md.enumerateDevices();
        const out: DispositivosMedios = { microfonos: [], camaras: [], altavoces: [] };
        // LLA1113B: las que el sistema enseña sin id (sin permiso de ese tipo todavía) no se pueden elegir, pero se cuentan:
        // la ventana dice «hay N, enciende la cámara para verlas» en vez de «no hay ninguna».
        const ocultas = { camaras: 0, microfonos: 0 };
        for (const d of lista) {
            if (!d.deviceId) {
                if (d.kind === "videoinput") ocultas.camaras++;
                else if (d.kind === "audioinput") ocultas.microfonos++;
                continue;
            }
            if (d.kind === "audioinput") out.microfonos.push({ id: d.deviceId, nombre: d.label || `Micrófono ${out.microfonos.length + 1}` });
            else if (d.kind === "videoinput") out.camaras.push({ id: d.deviceId, nombre: d.label || `Cámara ${out.camaras.length + 1}` });
            else if (d.kind === "audiooutput") out.altavoces.push({ id: d.deviceId, nombre: d.label || `Altavoz ${out.altavoces.length + 1}` });
        }
        // Con alguna ya visible, las ocultas son la entrada genérica que Chrome añade sin permiso: no se cuentan dos veces.
        if (!out.camaras.length && ocultas.camaras) out.ocultas = { camaras: ocultas.camaras, microfonos: out.microfonos.length ? 0 : ocultas.microfonos };
        else if (!out.microfonos.length && ocultas.microfonos) out.ocultas = { camaras: 0, microfonos: ocultas.microfonos };
        return out;
    } catch {
        return vacio;
    }
}

/**
 * LLA1113B · La lista de cámaras para el registro (`camara lista …`): cuántas, cuántas con nombre, cuántas ocultas (sin
 * permiso) y cuáles (el nombre del sistema, recortado). Así la próxima ronda dice si el selector tenía qué enseñar. Pura.
 */
export function resumenCamaras(d: Pick<DispositivosMedios, "camaras" | "ocultas">, plataforma: Plataforma = plataformaActual()): string {
    const lista = describirCamaras(d.camaras, plataforma);
    const conNombre = lista.filter((c) => !c.sinEtiqueta).length;
    const nombres = lista.map((c) => `${c.tipo}:${(c.etiqueta || "?").replace(/[|"]/g, "'").slice(0, 28)}`).join("|");
    return `n=${lista.length} con-nombre=${conNombre} ocultas=${d.ocultas?.camaras ?? 0}${nombres ? ` lista=${nombres}` : ""}`;
}

/** Aplica el altavoz elegido a un elemento de audio/vídeo (si el navegador lo permite). */
export async function aplicarAltavoz(el: HTMLMediaElement | null, altavozId: string | null): Promise<void> {
    if (!el || !altavozId || !soportaAltavoz()) return;
    try {
        await (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(altavozId);
    } catch {
        /* dispositivo desaparecido o permiso: se queda en el de siempre */
    }
}

export function pararStream(s: MediaStream | null | undefined) {
    if (!s) return;
    for (const t of s.getTracks()) {
        try {
            t.stop();
        } catch {
            /* ya parada */
        }
    }
}
