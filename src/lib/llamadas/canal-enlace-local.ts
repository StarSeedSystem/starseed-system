"use client";

import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { MetaPresencia, SenalLlamada } from "./tipos";
import type { ConexionCanal, EstadoCanal } from "./senalizacion";
import { sanearMeta } from "./presencia";
import { sanearSenal } from "./negociacion";

const REPETICION_MS = 10_000;
const CADUCIDAD_MS = 30_000;

type MensajeCanal =
    | { t: "llc.pres"; s: string; meta: MetaPresencia }
    | { t: "llc.senal"; s: string; senal: SenalLlamada }
    | { t: "llc.fuera"; s: string; id: string };

/** Lo que llega por el enlace es DATO DEL OTRO APARATO: se lee sin fiarse de ningún campo. */
interface MensajeEntrante {
    t?: unknown;
    s?: unknown;
    meta?: unknown;
    senal?: unknown;
    id?: unknown;
}

/** Id de par usable: texto no vacío y de largo razonable (el mismo criterio que `sanearSenal`). */
function idDePar(v: unknown): v is string {
    return typeof v === "string" && v.length > 0 && v.length <= 120;
}

/**
 * Canal de señalización de llamadas sobre un enlace local punto a punto.
 * Nunca lanza: todo envío o parseo va protegido. Lo que manda el otro aparato (presencia y
 * señales) se sanea igual que en el canal de Supabase antes de entregarlo al motor.
 */
export function abrirCanalLlamadaPorEnlace(
    enlace: EnlaceLocalVivo,
    sesionId: string,
    clave: string,
): ConexionCanal {
    const oyentesPresencia = new Set<(p: MetaPresencia[]) => void>();
    const oyentesSenal = new Set<(s: SenalLlamada) => void>();
    const oyentesSuscrito = new Set<(ok: boolean) => void>();
    const oyentesEstado = new Set<(e: EstadoCanal) => void>();
    let miMeta: MetaPresencia | null = null;
    let metaOtro: MetaPresencia | null = null;
    let recibidaOtro = 0;
    let cerrado = false;
    let vigilante: ReturnType<typeof setInterval> | null = null;

    const listaPresencia = (): MetaPresencia[] => {
        const lista: MetaPresencia[] = [];
        if (miMeta) lista.push(miMeta);
        if (metaOtro) lista.push(metaOtro);
        return lista;
    };

    const avisarPresencia = () => {
        const lista = listaPresencia();
        oyentesPresencia.forEach((cb) => {
            try { cb(lista); } catch { /* oyente defectuoso */ }
        });
    };

    const avisarEstado = (e: EstadoCanal) => {
        oyentesEstado.forEach((cb) => {
            try { cb(e); } catch { /* oyente defectuoso */ }
        });
    };

    const mandar = (msg: MensajeCanal) => {
        try { enlace.enviar(JSON.stringify(msg)); } catch { /* enlace caído */ }
    };

    const estadoActual = (): EstadoCanal => (enlace.abierto() ? "dentro" : "reconectando");
    let estadoPrevio = estadoActual();

    const latido = () => {
        if (cerrado) return;
        try {
            if (miMeta) mandar({ t: "llc.pres", s: sesionId, meta: miMeta });
            if (metaOtro && Date.now() - recibidaOtro >= CADUCIDAD_MS) {
                metaOtro = null;
                avisarPresencia();
            }
            const ahora = estadoActual();
            if (ahora !== estadoPrevio) {
                estadoPrevio = ahora;
                avisarEstado(ahora);
                const ahoraAbierto = enlace.abierto();
                oyentesSuscrito.forEach((cb) => {
                    try { cb(ahoraAbierto); } catch { /* oyente defectuoso */ }
                });
            }
        } catch { /* nunca lanzar */ }
    };

    const baja = enlace.alMensaje((data) => {
        if (cerrado || typeof data !== "string") return;
        try {
            const msg = JSON.parse(data) as MensajeEntrante | null;
            if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("llc.") || msg.s !== sesionId) return;
            if (msg.t === "llc.pres") {
                // Nadie puede presentarse con un id inválido ni con el mío (se haría pasar por mí).
                const idOtro = (msg.meta as { id?: unknown } | null | undefined)?.id;
                if (!idDePar(idOtro) || idOtro === clave || idOtro === miMeta?.id) return;
                const limpia = sanearMeta(msg.meta, idOtro);
                if (!limpia) return;
                const eraNuevo = !metaOtro || metaOtro.id !== limpia.id;
                metaOtro = limpia;
                recibidaOtro = Date.now();
                avisarPresencia();
                // Quien llega tarde ve a quien ya estaba al instante, sin esperar al latido de 10 s.
                // Una respuesta por cada presencia nueva: no hay rebote (el otro ya nos conoce).
                if (eraNuevo && miMeta) mandar({ t: "llc.pres", s: sesionId, meta: miMeta });
            } else if (msg.t === "llc.senal") {
                const senal = sanearSenal(msg.senal);
                if (!senal) return;
                oyentesSenal.forEach((cb) => {
                    try { cb(senal); } catch { /* oyente defectuoso */ }
                });
            } else if (msg.t === "llc.fuera") {
                // Solo retira a quien se va de verdad: una pestaña vieja no borra a la nueva.
                if (!metaOtro || msg.id !== metaOtro.id) return;
                metaOtro = null;
                avisarPresencia();
            }
        } catch { /* mensaje corrupto */ }
    });

    vigilante = setInterval(latido, REPETICION_MS);
    // Notify the initial subscription status after a tick to allow subscribers to register.
    setTimeout(() => {
        if (cerrado) return;
        const abiertoInicial = enlace.abierto();
        oyentesSuscrito.forEach((cb) => {
            try { cb(abiertoInicial); } catch { /* oyente defectuoso */ }
        });
    }, 0);

    const retirar = () => {
        if (cerrado || !miMeta) return;
        miMeta = null;
        mandar({ t: "llc.fuera", s: sesionId, id: clave });
        avisarPresencia();
    };

    return {
        sesionId,
        tema: `directo:${sesionId}`,
        clave: () => clave,
        suscrito: () => {
            try { return enlace.abierto(); } catch { return false; }
        },
        estado: () => estadoActual(),
        presencia: () => listaPresencia(),
        onPresencia(cb) { oyentesPresencia.add(cb); return () => { oyentesPresencia.delete(cb); }; },
        onSenal(cb) { oyentesSenal.add(cb); return () => { oyentesSenal.delete(cb); }; },
        onSuscrito(cb) { oyentesSuscrito.add(cb); return () => { oyentesSuscrito.delete(cb); }; },
        onEstado(cb) { oyentesEstado.add(cb); return () => { oyentesEstado.delete(cb); }; },
        enviar(s) { if (!cerrado) mandar({ t: "llc.senal", s: sesionId, senal: s }); },
        publicar(meta) {
            if (cerrado) return;
            miMeta = meta;
            mandar({ t: "llc.pres", s: sesionId, meta });
            avisarPresencia();
        },
        retirar,
        soltar() {
            if (cerrado) return;
            cerrado = true;
            if (vigilante) clearInterval(vigilante);
            try { baja(); } catch { /* enlace caído */ }
            mandar({ t: "llc.fuera", s: sesionId, id: clave });
            miMeta = null;
            metaOtro = null;
        },
    };
}
