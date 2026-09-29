"use client";
/**
 * Fondo ambiental de la pestaña activa (2026-09-29).
 *
 * Dos capas tras los widgets: la luz del tema (deriva lenta, solo `transform`) y su motivo dibujado
 * (estático, desvanecido hacia el centro). En «ligero» (movimiento reducido, ahorro de datos) baja
 * la intensidad; en modo eco la luz queda quieta (CSS). La persona lo puede apagar por pestaña.
 */
import * as React from "react";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import estilos from "../dashboard-tabs.module.css";
import { capasAmbiente } from "./ambiente";
import { aspectoDe, type PestanaConAspecto } from "./temas";

export function FondoAmbiente({ pestana }: { pestana: PestanaConAspecto & { ambiente?: "auto" | "apagado" } }) {
    const nivel = useNivelRender();
    const aspecto = aspectoDe(pestana);
    const capas = React.useMemo(
        () => capasAmbiente(aspecto.tema.motivo, aspecto.acento, aspecto.acento2, nivel === "ligero" ? 0.6 : 1),
        [aspecto.tema.motivo, aspecto.acento, aspecto.acento2, nivel],
    );
    if (pestana.ambiente === "apagado") return null;
    return (
        <div aria-hidden className={estilos.ambiente} data-ambiente={aspecto.tema.motivo}>
            <div className={estilos.luz} style={capas.luz} />
            {capas.motivo && <div className={estilos.motivo} style={capas.motivo} />}
        </div>
    );
}
