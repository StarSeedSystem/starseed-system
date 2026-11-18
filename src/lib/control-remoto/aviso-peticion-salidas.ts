/**
 * CTL1117J · S3 · las tres salidas REALES del aviso de petición de control y lo que se resuelve en local.
 * Módulo aparte (con importaciones perezosas) para que `canal.ts` no cargue de más al arrancar.
 */

import type { AlcanceControl, AvisoPeticion, PeticionControl, SalidasAviso } from "./aviso-peticion";
import { mostrarAvisoPeticion } from "./aviso-peticion";

function esAndroidNativo(): boolean {
    try {
        return /Android/i.test(navigator.userAgent) && !!(globalThis as { __TAURI__?: unknown }).__TAURI__;
    } catch {
        return false;
    }
}

export const SALIDAS_REALES: SalidasAviso = {
    dentro: (a) => mostrarAvisoPeticion(a),
    centro: (a) => {
        // El centro de notificaciones de StarSeed (persistido, campana). El aviso emergente lo pone la ventana propia.
        return import("@/lib/notifications/app-notify").then((m) => {
            const r = m.notifyFromApp({ appId: "senales", title: a.titulo, body: a.cuerpo, icon: "ShieldAlert", level: "warning", actions: [{ label: a.boton ?? "Abrir el ajuste", href: a.ruta }], dedupeKey: a.id, popup: false });
            return { ok: r.toCenter === true, motivo: r.reason };
        });
    },
    sistema: (a) =>
        import("@/lib/notifications/avisos-mensajes").then((m) =>
            // En Android, con la sesión ya abierta, la notificación nativa del control lo dice: no se pone una segunda.
            m.avisarPeticionControl({ id: a.id, titulo: a.titulo, cuerpo: a.cuerpo, ruta: a.ruta, omitir: a.estado === "abierta" && esAndroidNativo() }),
        ),
};

/** El código visible del aparato que pide y el alcance de ESTE aparato (por defecto «total»; un valor raro se lee como «total»). */
export async function resolverLocal(p: PeticionControl): Promise<{ codigo: string | null; alcance: AlcanceControl }> {
    let codigo: string | null = null;
    let alcance: AlcanceControl = "total";
    try {
        const [{ codigoDe }, { leerAjustesControl }, { leerPermisoLocal }] = await Promise.all([import("@/lib/chats-genesis/firma-aparato"), import("./ajustes-aparato"), import("./canal")]);
        const cuenta = [...leerPermisoLocal().controladores, ...leerPermisoLocal().pendientes].find((x) => x.huella === p.de)?.cuenta;
        if (cuenta) codigo = await codigoDe(p.de, cuenta).catch(() => null);
        alcance = (await leerAjustesControl()).alcance;
    } catch {
        /* sin lo local: palabras con los valores de fábrica */
    }
    return { codigo, alcance };
}

export type { AvisoPeticion };
