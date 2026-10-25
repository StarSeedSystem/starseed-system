"use client";

/**
 * StarSeed XR · BOTÓN UNIVERSAL «Entrar en VR/AR» (XR1010E, contrato §3 c). Un botón por modo
 * inmersivo que el aparato ofrece; textos honestos de `texto-entrada`. Al pulsar abre la sesión
 * con el almacén XR (XR1010D, import perezoso) y los errores se explican con `mensajeErrorXR`
 * (el del hook vivo, sin duplicar). Lo montan XR1010F (global) y XR1010G (/xr/os).
 */
import { useCallback, useState } from "react";
import { Glasses } from "lucide-react";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { ModoXR } from "@/lib/xr/tipos";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";
import { textoEntrada, soloModo } from "./texto-entrada";
import type { ModoBotonXR } from "./texto-entrada";

/** Perfil de partida hasta que la calidad dinámica (XR1010AE) lo lea de la sesión. */
const PERFIL = PERFILES.media;

export interface BotonEntradaXRProps {
    /** Modo pedido por la persona o la página; `auto` (por omisión) deja elegir al aparato. */
    modo?: ModoXR | "auto";
    /** `flotante` = esquina inferior derecha del layout raíz; `insertado` = dentro de una página. */
    variante?: "flotante" | "insertado";
    /** Se avisa cuando la sesión se abrió (p. ej. `/xr/os` recoge el estado). */
    alEntrar?: (modo: ModoBotonXR) => void;
}

type Fase = "listo" | "entrando" | "error";

/** Clases del proyecto: objetivo táctil ≥ 44 px, foco visible y colores del cristal (`tokens-3d.ts`). */
function clasesBoton(variante: "flotante" | "insertado"): string {
    const base =
        "cursor-pointer inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm " +
        "font-medium text-[#F5F7FF] border border-white/15 shadow transition duration-150 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70 " +
        "disabled:cursor-not-allowed disabled:opacity-60";
    const fondo = variante === "flotante" ? "bg-[#0E101E] hover:bg-[#060814]" : "bg-[#0E101E]/90 hover:bg-[#0E101E]";
    const sitio = variante === "flotante" ? "fixed bottom-4 right-4 z-50" : "";
    return `${sitio} ${base} ${fondo}`.trim();
}

/** Del modo inmersivo a la llamada real del almacén (la librería es `enterVR`/`enterAR`, XR1010D). */
function pedirSesion(almacen: { enterAR(): Promise<unknown>; enterVR(): Promise<unknown> }, modo: ModoBotonXR): Promise<unknown> {
    return modo === "vr-inmersivo" ? almacen.enterVR() : almacen.enterAR();
}

export function BotonEntradaXR({ modo = "auto", variante = "insertado", alEntrar }: BotonEntradaXRProps) {
    const { estado, datos, capacidades, plan } = useCapacidadesXR({ modo });
    const [fase, setFase] = useState<Fase>("listo");
    const [error, setError] = useState<string | null>(null);
    const texto = textoEntrada(capacidades, plan, estado === "sondeando", !datos.seguro);
    const botones = soloModo(texto.botones, modo);

    const entrar = useCallback(
        async (m: ModoBotonXR) => {
            setFase("entrando");
            setError(null);
            try {
                // Import perezoso: el layout raíz no carga el almacén ni la librería XR (§0.6).
                const { obtenerAlmacenXR } = await import("./almacen-xr");
                const almacen = await obtenerAlmacenXR({ perfil: PERFIL, capacidades });
                const sesion = await pedirSesion(almacen, m);
                if (!sesion) throw new Error("No se pudo abrir la sesión inmersiva.");
                setFase("listo");
                alEntrar?.(m);
            } catch (e) {
                setError(mensajeErrorXR(e));
                setFase("error");
            }
        },
        [capacidades, alEntrar],
    );

    if (estado === "sondeando" || botones.length === 0) {
        // Sin modo inmersivo (o aún sondeando): sin botón que no funcione.
        // (XR1025A) El botón FLOTANTE de la esquina no pinta NADA —ni texto ni contenedor—: «Este aparato no
        // tiene VR ni AR.» y «Comprobando tu visor…» eran ruido fijo en cada pantalla del OS. El aviso honesto
        // de `textoEntrada` sigue en la variante insertada (ajustes), donde alguien lo busca a propósito.
        if (variante === "flotante" || texto.aviso === null) return null;
        return (
            <div className="max-w-sm" data-testid="boton-entrada-xr">
                <p className="text-xs text-[#B9C0D8]" role="status" data-testid="aviso-entrada-xr">
                    {texto.aviso}
                </p>
            </div>
        );
    }

    return (
        <div
            className={variante === "flotante" ? "fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" : "flex flex-wrap items-center gap-3"}
            data-testid="boton-entrada-xr"
        >
            {botones.map((b) => (
                <button
                    key={b.modo}
                    type="button"
                    aria-label={b.etiqueta}
                    title={b.descripcion}
                    disabled={fase === "entrando"}
                    onClick={() => void entrar(b.modo)}
                    className={clasesBoton(variante)}
                >
                    <Glasses className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {fase === "entrando" ? "Entrando…" : b.etiqueta}
                </button>
            ))}
            {texto.aviso !== null && (
                <p className="text-xs text-[#B9C0D8]" role="status" data-testid="aviso-entrada-xr">
                    {texto.aviso}
                </p>
            )}
            {error !== null && (
                <p className="text-xs text-[#DC143C]" role="alert" data-testid="error-entrada-xr">
                    {error}
                </p>
            )}
        </div>
    );
}
