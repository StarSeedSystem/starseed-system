"use client";
/**
 * StarSeed XR · OBJETO SPLAT (XR1010AM · contrato `architecture/starseed-xr.md` §3 g). Objeto de mundo
 * de la Biblioteca en formato `splat`: `SplatMesh` de Spark en la posición/rotación/escala declaradas.
 * En nivel bajo, sin enlace o con carga fallida se pinta un marcador de cristal con el motivo.
 * Lógica decidible en `cargar-splat.ts` (probada en node); este cascarón sólo decide qué mostrar.
 */
import { useEffect, useState } from "react";
import { Container } from "@react-three/uikit";
import type { SplatMesh } from "@sparkjsdev/spark";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import type { ObjetoMundo } from "../../../lib/xr/mundo-tipos";
import { cargarSplat, marcadorSplat, type ResultadoSplat } from "./cargar-splat";
import { PanelCristal, Texto3D } from "./panel-cristal";

export interface PropsSplatObjeto {
    /** Objeto del `MundoSpec` con `fuente.formato === "splat"`. */
    objeto: ObjetoMundo;
    /** Nivel de calidad del aparato: splats sólo en alta y máxima (Spark perezoso). */
    nivel: NivelCalidad;
    /** Enlace https del splat; lo resuelve quien renderiza desde la ficha de la Biblioteca. */
    url?: string;
}

/** Cascarón fino: la decisión vive en cargar-splat.ts, aquí sólo estado de carga y marcador. */
export function SplatObjeto({ objeto, nivel, url }: PropsSplatObjeto) {
    const [carga, setCarga] = useState<ResultadoSplat<SplatMesh> | null>(null);
    const marcador = marcadorSplat(nivel, url);

    useEffect(() => {
        if (!url) return;
        let vivo = true;
        setCarga(null);
        void cargarSplat<SplatMesh>(url, { nivel }).then((r) => {
            if (vivo) setCarga(r);
        });
        return () => {
            vivo = false;
        };
        // El nivel entra en la decisión de carga y cambia con la sesión; la URL manda para descargar.
    }, [url, nivel]);

    if (objeto.oculto) return null;
    const mesh = carga && carga.ok ? carga.mesh : null;
    const motivo = marcador ?? (carga ? (carga.ok ? null : carga.motivo) : "Cargando el splat…");
    return (
        <group position={objeto.pos} rotation={objeto.rot} scale={objeto.esc}>
            {mesh ? <primitive object={mesh} /> : null}
            {motivo ? (
                <group position={[0, 0.02, 0]}>
                    <PanelCristal nodo="horizon" ancho={0.72} alto={0.24}>
                        <Container flexDirection="row" alignItems="center" justifyContent="center" width="100%" height="100%" paddingLeft={10} paddingRight={10}>
                            <Texto3D distancia={2}>{motivo}</Texto3D>
                        </Container>
                    </PanelCristal>
                </group>
            ) : null}
        </group>
    );
}
