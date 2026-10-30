"use client";
/**
 * StarSeed XR · SPLAT OBJETO (XR1010AM · contrato §3 g). Cascarón fino de R3F: la decisión
 * de nivel, el presupuesto y la carga viven en `cargar-splat.ts`; aquí solo se monta la malla
 * de Spark o, si no se puede, el marcador de cristal con el motivo en español.
 */
import { useEffect, useState } from "react";
import type { ObjetoMundo } from "../../../lib/xr/mundo-tipos";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { PanelCristal, Texto3D } from "./panel-cristal";
import {
    cargarSplat,
    MOTIVO_NO_SPLAT,
    presupuestoSplat,
    puedeUsarSplat,
    TEXTO_SIN_SPLAT,
    urlSplatDeObjeto,
    type MallaSplat,
} from "./cargar-splat";

export interface PropsSplatObjeto {
    objeto: ObjetoMundo;
    nivel: NivelCalidad;
}

type EstadoCarga =
    | { fase: "cargando" }
    | { fase: "listo"; malla: MallaSplat }
    | { fase: "fallo"; motivo: string };

function soltarMalla(malla: MallaSplat): void {
    const descartable = malla as { dispose?: () => void };
    if (typeof descartable.dispose === "function") descartable.dispose();
}

function MarcadorSplat({ objeto, nivel, motivo }: { objeto: ObjetoMundo; nivel: NivelCalidad; motivo: string }) {
    const ancho = Math.max(0.42, Math.min(0.9, objeto.esc[0] * 0.6));
    return (
        <group position={objeto.pos} rotation={objeto.rot}>
            <PanelCristal nodo="logic" ancho={ancho} alto={ancho * 0.45} nivel={nivel}>
                <Texto3D distancia={1.6}>{objeto.nombre}</Texto3D>
                <Texto3D distancia={1.6} tono="textoSecundario">{motivo}</Texto3D>
            </PanelCristal>
        </group>
    );
}

export function SplatObjeto({ objeto, nivel }: PropsSplatObjeto) {
    const url = urlSplatDeObjeto(objeto);
    const permitido = puedeUsarSplat(nivel);
    const maxSplats = presupuestoSplat(nivel);
    const [estado, setEstado] = useState<EstadoCarga>({ fase: "cargando" });

    useEffect(() => {
        if (!permitido || url === null) return;
        let vivo = true;
        setEstado({ fase: "cargando" });
        void cargarSplat(url, { maxSplats }).then((resultado) => {
            if (!vivo) {
                if (resultado.ok) soltarMalla(resultado.malla);
                return;
            }
            setEstado(resultado.ok
                ? { fase: "listo", malla: resultado.malla }
                : { fase: "fallo", motivo: resultado.motivo });
        });
        return () => { vivo = false; };
    }, [url, nivel, permitido, maxSplats]);

    useEffect(() => {
        if (estado.fase !== "listo") return;
        return () => soltarMalla(estado.malla);
    }, [estado]);

    if (!permitido) return <MarcadorSplat objeto={objeto} nivel={nivel} motivo={TEXTO_SIN_SPLAT} />;
    if (url === null) return <MarcadorSplat objeto={objeto} nivel={nivel} motivo={MOTIVO_NO_SPLAT} />;
    if (estado.fase === "fallo") return <MarcadorSplat objeto={objeto} nivel={nivel} motivo={estado.motivo} />;
    if (estado.fase === "cargando") return <MarcadorSplat objeto={objeto} nivel={nivel} motivo="Cargando el splat…" />;
    return <primitive object={estado.malla} position={objeto.pos} rotation={objeto.rot} scale={objeto.esc} />;
}
