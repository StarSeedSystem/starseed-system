"use client";

import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { MetaPresencia, SenalLlamada } from "./tipos";
import type { ConexionCanal, EstadoCanal } from "./senalizacion";

const REPETICION_MS = 10_000;
const CADUCIDAD_MS = 30_000;

type MensajeCanal =
    | { t: "llc.pres"; s: string; meta: MetaPresencia }
    | { t: "llc.senal"; s: string; senal: SenalLlamada }
    | { t: "llc.fuera"; s: string; id: string };

/**
 * Canal de señalización de llamadas sobre un enlace local punto a punto.
 * Nunca lanza: todo envío o parseo va protegido.
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
                if (!enlace.abierto()) {
                    oyentesSuscrito.forEach((cb) => {
                        try { cb(false); } catch { /* oyente defectuoso */ }
                    });
                }
            }
        } catch { /* nunca lanzar */ }
    };

    const baja = enlace.alMensaje((data) => {
        if (cerrado || typeof data !== "string") return;
        try {
            const msg = JSON.parse(data) as MensajeCanal;
            if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("llc.") || msg.s !== sesionId) return;
            if (msg.t === "llc.pres") {
                metaOtro = msg.meta;
                recibidaOtro = Date.now();
                avisarPresencia();
            } else if (msg.t === "llc.senal") {
                oyentesSenal.forEach((cb) => {
                    try { cb(msg.senal); } catch { /* oyente defectuoso */ }
                });
            } else if (msg.t === "llc.fuera") {
                metaOtro = null;
                avisarPresencia();
            }
        } catch { /* mensaje corrupto */ }
    });

    vigilante = setInterval(latido, REPETICION_MS);
    const abiertoInicial = enlace.abierto();
    if (abiertoInicial) {
        oyentesSuscrito.forEach((cb) => {
            try { cb(true); } catch { /* oyente defectuoso */ }
        });
    }

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
