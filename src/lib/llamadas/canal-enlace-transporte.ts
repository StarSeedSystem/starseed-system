"use client";

/**
 * Canal de señalización de llamadas sobre el TRANSPORTE UNIVERSAL (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11, 0.5.1-prueba.29): la Mac llamó a la tableta (Wi-Fi apagado, solo Bluetooth directo).
 * El timbre llegó por la burbuja del chat (que sí viaja por BLE), pero la señalización de la llamada
 * (presencia + oferta/respuesta SDP + ICE) solo tenía DOS vías: el canal privado de Supabase (la tableta
 * no tiene internet) y los enlaces WebRTC locales (`canal-enlace-local.ts`; por Bluetooth no hay). Así que
 * al «Contestar» la tableta no podía entrar en ningún canal («conectando» para siempre) y la Mac nunca vio
 * que había contestado (la presencia es lo que marca «contestada»).
 *
 * Este canal lleva exactamente los mismos mensajes (`llc.pres`, `llc.senal`, `llc.fuera`) por el mejor
 * enlace que tenga el transporte universal hacia esa neurona —Bluetooth directo, red local nativa, Wi-Fi
 * directo, malla de la cuenta— con acuse, reintentos y deduplicación (el transporte descarta lo repetido por
 * id). El cifrado es el de cada enlace (CIF1108A): no se añade otra capa. Solo se atiende lo que viene de
 * enlaces con consentimiento y de la neurona a la que se llama (`dn`), nunca de otra.
 * Nunca lanza.
 */
import type { MetaPresencia, SenalLlamada } from "./tipos";
import type { ConexionCanal, EstadoCanal } from "./senalizacion";
import { sanearMeta } from "./presencia";
import { sanearSenal } from "./negociacion";
import { anotarLlamada } from "./voz-datos/diagnostico";

export const CANAL_SENALIZACION = "llamada-canal";
const ORIGENES_ADMITIDOS = new Set(["local", "nativo", "ble", "cuenta", "par"]);
const REPETICION_MS = 10_000;
const CADUCIDAD_MS = 30_000;
const PULSO_ESTADO_MS = 2_000;
/** Reintentos de una señal que no salió por ningún enlace (el siguiente espera 1, 2 y 4 s). */
const REINTENTOS = 3;

type MensajeCanal =
    | { t: "llc.pres"; s: string; dn: string; meta: MetaPresencia }
    | { t: "llc.senal"; s: string; dn: string; senal: SenalLlamada }
    | { t: "llc.fuera"; s: string; dn: string; id: string };

export interface DepsCanalTransporte {
    /** Manda un cuerpo a esa neurona por su mejor enlace. */
    enviar(neurona: string, cuerpo: unknown): Promise<{ ok: boolean; via?: string }>;
    /** Escucha lo que llega por el canal de señalización (entregado una sola vez por id). */
    alRecibir(cb: (m: { cuerpo: unknown; origen: { tipo: string } }) => void): () => void;
    /** ¿Hay algún enlace de datos abierto con esa neurona ahora? */
    hayEnlace(neurona: string): boolean;
    /** Mi id de neurona (va en cada mensaje para que el otro sepa de quién es). */
    yo(): string | null;
    ahora?(): number;
    esperar?(ms: number): Promise<void>;
}

function idDePar(v: unknown): v is string {
    return typeof v === "string" && v.length > 0 && v.length <= 120;
}

export function abrirCanalLlamadaPorTransporte(neurona: string, sesionId: string, clave: string, deps: DepsCanalTransporte): ConexionCanal {
    const oyentesPresencia = new Set<(p: MetaPresencia[]) => void>();
    const oyentesSenal = new Set<(s: SenalLlamada) => void>();
    const oyentesSuscrito = new Set<(ok: boolean) => void>();
    const oyentesEstado = new Set<(e: EstadoCanal) => void>();
    const ahora = deps.ahora ?? (() => Date.now());
    const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    let miMeta: MetaPresencia | null = null;
    let metaOtro: MetaPresencia | null = null;
    let recibidaOtro = 0;
    let cerrado = false;
    let presenciaAnotada = false;
    const miNeurona = () => deps.yo() ?? "";

    const estadoActual = (): EstadoCanal => (deps.hayEnlace(neurona) ? "dentro" : "reconectando");
    let estadoPrevio = estadoActual();

    const lista = (): MetaPresencia[] => {
        const l: MetaPresencia[] = [];
        if (miMeta) l.push(miMeta);
        if (metaOtro) l.push(metaOtro);
        return l;
    };
    const avisarPresencia = () => {
        const l = lista();
        oyentesPresencia.forEach((cb) => {
            try { cb(l); } catch { /* oyente defectuoso */ }
        });
    };

    /**
     * Envía con reintentos si NINGÚN enlace lo llevó. Las señales importantes no se pierden por un bache del enlace.
     * LLA1113C · `trasCerrar`: sigue reintentando aunque el canal ya se haya soltado. Colgar suelta el canal en el mismo
     * instante en que manda «colgar»: si ese primer envío no tenía acuse en 1,5 s, el bucle veía `cerrado` y acababa sin
     * reintentar y SIN dejar línea. Prueba 41: la primera llamada acabó en la Mac a las 18:53:47 sin ninguna línea de fin y
     * la tableta siguió dentro, sin oír nada, hasta que la presencia de la Mac caducó (30 s) y se empezó la segunda.
     */
    const mandar = (msg: MensajeCanal, reintentos = REINTENTOS, trasCerrar = false) => {
        void (async () => {
            for (let intento = 0; intento <= reintentos && (!cerrado || trasCerrar); intento++) {
                let r: { ok: boolean; via?: string } = { ok: false };
                try { r = await deps.enviar(neurona, msg); } catch { /* sin enlace */ }
                if (r.ok) {
                    // La primera presencia que sale (la que dice «estoy aquí / contesté») también queda en el registro.
                    if (msg.t === "llc.pres" && !presenciaAnotada) {
                        presenciaAnotada = true;
                        anotarLlamada("senal-enviada", neurona, `presencia via=${r.via ?? "?"}`);
                    }
                    if (msg.t === "llc.senal") anotarLlamada("senal-enviada", neurona, `${msg.senal.tipo}${msg.senal.tipo === "senal" ? (msg.senal.desc ? ` ${msg.senal.desc.type}` : msg.senal.ice ? " ice" : "") : ""} via=${r.via ?? "?"}${intento > 0 ? ` intento=${intento + 1}` : ""}`);
                    return;
                }
                if (intento < reintentos) await esperar(1000 * 2 ** intento);
            }
            if ((!cerrado || trasCerrar) && msg.t === "llc.senal") anotarLlamada("fallo", neurona, `señal ${msg.senal.tipo} sin enlace tras ${reintentos + 1} intentos`);
        })();
    };

    const latido = () => {
        if (cerrado) return;
        try {
            if (metaOtro && ahora() - recibidaOtro >= CADUCIDAD_MS) {
                metaOtro = null;
                avisarPresencia();
            }
            const actual = estadoActual();
            if (actual !== estadoPrevio) {
                estadoPrevio = actual;
                oyentesEstado.forEach((cb) => { try { cb(actual); } catch { /* oyente defectuoso */ } });
                const abierto = actual === "dentro";
                oyentesSuscrito.forEach((cb) => { try { cb(abierto); } catch { /* oyente defectuoso */ } });
                // Volvió el enlace: se republica la presencia (por si el otro se perdió la anterior).
                if (abierto && miMeta) mandar({ t: "llc.pres", s: sesionId, dn: miNeurona(), meta: miMeta }, 1);
            }
        } catch { /* nunca lanzar */ }
    };
    let ultimaRepeticion = ahora();
    const pulso = setInterval(() => {
        latido();
        if (!cerrado && miMeta && ahora() - ultimaRepeticion >= REPETICION_MS) {
            ultimaRepeticion = ahora();
            mandar({ t: "llc.pres", s: sesionId, dn: miNeurona(), meta: miMeta }, 0);
        }
    }, PULSO_ESTADO_MS);

    const baja = deps.alRecibir((m) => {
        if (cerrado || !ORIGENES_ADMITIDOS.has(m.origen.tipo)) return;
        try {
            const msg = m.cuerpo as { t?: unknown; s?: unknown; dn?: unknown; meta?: unknown; senal?: unknown; id?: unknown } | null;
            if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("llc.") || msg.s !== sesionId) return;
            // Solo de la neurona a la que se llama: ninguna otra puede meter señales en esta llamada.
            if (msg.dn !== neurona) return;
            if (msg.t === "llc.pres") {
                const idOtro = (msg.meta as { id?: unknown } | null | undefined)?.id;
                if (!idDePar(idOtro) || idOtro === clave || idOtro === miMeta?.id) return;
                const limpia = sanearMeta(msg.meta, idOtro);
                if (!limpia) return;
                const eraNuevo = !metaOtro || metaOtro.id !== limpia.id;
                metaOtro = limpia;
                recibidaOtro = ahora();
                avisarPresencia();
                if (eraNuevo) {
                    anotarLlamada("senal-recibida", neurona, "presencia");
                    // Una respuesta por cada presencia nueva: quien llega tarde ve a quien ya estaba al instante.
                    if (miMeta) mandar({ t: "llc.pres", s: sesionId, dn: miNeurona(), meta: miMeta }, 1);
                }
            } else if (msg.t === "llc.senal") {
                const senal = sanearSenal(msg.senal);
                if (!senal) return;
                anotarLlamada("senal-recibida", neurona, `${senal.tipo}${senal.tipo === "senal" ? (senal.desc ? ` ${senal.desc.type}` : senal.ice ? " ice" : "") : ""}`);
                oyentesSenal.forEach((cb) => { try { cb(senal); } catch { /* oyente defectuoso */ } });
            } else if (msg.t === "llc.fuera") {
                if (!metaOtro || msg.id !== metaOtro.id) return;
                metaOtro = null;
                avisarPresencia();
            }
        } catch { /* mensaje corrupto */ }
    });

    setTimeout(() => {
        if (cerrado) return;
        const abierto = deps.hayEnlace(neurona);
        oyentesSuscrito.forEach((cb) => { try { cb(abierto); } catch { /* oyente defectuoso */ } });
    }, 0);

    return {
        sesionId,
        tema: `directo:${sesionId}`,
        clave: () => clave,
        suscrito: () => {
            try { return deps.hayEnlace(neurona); } catch { return false; }
        },
        estado: () => estadoActual(),
        presencia: () => lista(),
        onPresencia(cb) { oyentesPresencia.add(cb); return () => { oyentesPresencia.delete(cb); }; },
        onSenal(cb) { oyentesSenal.add(cb); return () => { oyentesSenal.delete(cb); }; },
        onSuscrito(cb) { oyentesSuscrito.add(cb); return () => { oyentesSuscrito.delete(cb); }; },
        onEstado(cb) { oyentesEstado.add(cb); return () => { oyentesEstado.delete(cb); }; },
        // LLA1113C: «colgar» se sigue reintentando aunque el motor suelte el canal justo después (ver `mandar`).
        enviar(s) { if (!cerrado) mandar({ t: "llc.senal", s: sesionId, dn: miNeurona(), senal: s }, REINTENTOS, s.tipo === "colgar"); },
        publicar(meta) {
            if (cerrado) return;
            miMeta = meta;
            ultimaRepeticion = ahora();
            mandar({ t: "llc.pres", s: sesionId, dn: miNeurona(), meta });
            avisarPresencia();
        },
        retirar() {
            if (cerrado || !miMeta) return;
            miMeta = null;
            mandar({ t: "llc.fuera", s: sesionId, dn: miNeurona(), id: clave }, 1);
            avisarPresencia();
        },
        soltar() {
            if (cerrado) return;
            if (miMeta) mandar({ t: "llc.fuera", s: sesionId, dn: miNeurona(), id: clave }, 1);
            cerrado = true;
            clearInterval(pulso);
            try { baja(); } catch { /* ya dada de baja */ }
            miMeta = null;
            metaOtro = null;
        },
    };
}

/** Las dependencias reales (transporte universal + enlaces). Carga perezosa: este módulo no arrastra la malla al importarse. */
export async function depsCanalTransporteReales(): Promise<DepsCanalTransporte> {
    const [tu, ident, vt] = await Promise.all([
        import("@/lib/malla/transporte-universal"),
        import("@/lib/network/identidad-dispositivo"),
        import("./voz-datos/transporte"),
    ]);
    await vt.precargarTransporteVoz();
    let ultimaConsulta = 0;
    let vistoPorTransporte = false;
    return {
        enviar: async (neurona, cuerpo) => {
            const r = await tu.enviarMensaje({ neuronDeviceId: neurona }, CANAL_SENALIZACION, cuerpo, { esperarAcuseMs: 1500 });
            return { ok: r.ok, via: r.enlace?.tipo };
        },
        alRecibir: (cb) => tu.alRecibirMensaje(CANAL_SENALIZACION, (m) => cb({ cuerpo: m.cuerpo, origen: { tipo: m.origen.tipo } })),
        hayEnlace: (neurona) => {
            // Síncrono: lo que ya se sabe (BLE y enlaces WebRTC locales) o lo que dijo el transporte la última vez
            // (red local nativa, malla de la cuenta…), que se refresca de fondo como mucho cada 2 s.
            const ahora = Date.now();
            if (ahora - ultimaConsulta > 2000) {
                ultimaConsulta = ahora;
                void tu.enlacesDisponibles().then((l) => {
                    vistoPorTransporte = l.some((e) => e.abierto && e.alcanza.neuronDeviceId === neurona);
                }).catch(() => undefined);
            }
            return vt.enlacesDatosHacia(neurona).length > 0 || vistoPorTransporte;
        },
        yo: () => {
            try { return ident.identidadDispositivo().neuronDeviceId; } catch { return null; }
        },
    };
}
