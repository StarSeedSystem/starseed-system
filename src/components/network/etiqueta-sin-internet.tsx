"use client";

/**
 * (OFF1108A) Etiqueta «Sin internet» discreta: la app sigue funcionando con la cuenta guardada del aparato.
 *
 * Monta `decidirModoAcceso` (IDN1108A) en el cliente: con internet y sesión verificada NO se pinta nada.
 * Sin internet y con cuenta guardada dice si la identidad está certificada o es «solo sesión guardada».
 * No bloquea, no cubre la interfaz (pastilla pequeña abajo a la izquierda, sin capturar clics) y se oculta
 * sola al volver la red. El modo estricto (`exigirCertificado`) NO se activa aquí: Alex aún no tiene maestra.
 */

import { useEffect, useState } from "react";
import { useAccount } from "@/context/account-context";
import type { AnclaCuenta } from "@/lib/identidad/certificado-neurona";
import type { DecisionAcceso } from "@/lib/identidad/modo-sin-internet";

async function decidir(sesionVerificada: boolean): Promise<DecisionAcceso> {
    const [{ decidirModoAcceso }, { uidRecordado }, usuario] = await Promise.all([
        import("@/lib/identidad/modo-sin-internet"),
        import("@/lib/sin-internet/uid-recordado"),
        import("@/lib/consumo/usuario"),
    ]);
    let certificado: unknown = null;
    let anclas: AnclaCuenta[] = [];
    let estaRevocada: ((r: { mfp: string; neuronaId: string; huella: string }) => boolean) | undefined;
    try {
        const { servicioIdentidad } = await import("@/lib/identidad/servicio");
        certificado = await (await servicioIdentidad()).certificadoPropio();
        const { contextoReal } = await import("@/lib/identidad/enlace");
        const ctx = await contextoReal();
        anclas = await ctx.anclas();
        estaRevocada = ctx.estaRevocada;
    } catch {
        /* sin identidad certificada: queda «solo sesión guardada» */
    }
    return decidirModoAcceso({
        enLinea: typeof navigator === "undefined" ? true : navigator.onLine !== false,
        fallaRed: usuario.sinRedProbable(),
        sesionEnCache: !!uidRecordado(),
        sesionVerificada,
        certificado,
        anclas,
        estaRevocada,
    });
}

export function EtiquetaSinInternet() {
    const { session, sinConexion, loading } = useAccount();
    const [d, setD] = useState<DecisionAcceso | null>(null);
    const [enLinea, setEnLinea] = useState(true);

    useEffect(() => {
        const act = () => setEnLinea(navigator.onLine !== false);
        act();
        window.addEventListener("online", act);
        window.addEventListener("offline", act);
        return () => {
            window.removeEventListener("online", act);
            window.removeEventListener("offline", act);
        };
    }, []);

    useEffect(() => {
        let vivo = true;
        if (loading || (!sinConexion && enLinea)) {
            setD(null);
            return;
        }
        void decidir(!!session && enLinea).then((x) => vivo && setD(x)).catch(() => vivo && setD(null));
        return () => {
            vivo = false;
        };
    }, [session, sinConexion, enLinea, loading]);

    if (!d || d.modo !== "sin-internet") return null;
    return (
        <div
            role="status"
            aria-live="polite"
            title={d.motivo}
            className="pointer-events-none fixed bottom-2 left-2 z-[60] max-w-[80vw] truncate rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur"
        >
            {d.etiqueta}
        </div>
    );
}
