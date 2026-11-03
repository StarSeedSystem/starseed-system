"use client";

/** StarSeed XR · PANEL DE VÍNCULOS (XR1010AG · contrato §3 e): 11 acciones reconfigurables sin dejar a nadie atrapado. */
import { useEffect, useState } from "react";
import { Container } from "@react-three/uikit";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";
import {
    ACCIONES_XR, GESTOS_RESERVADOS, MAPAS_DEFECTO, asignar, validarMapa,
    type AccionXR, type Gatillo, type MapaEntrada,
} from "../../../lib/xr/vinculos-xr";
import type { EntradaXR } from "../../../lib/xr/tipos";
export const ETIQUETAS_ACCION: Record<AccionXR, string> = {
    seleccionar: "Seleccionar", agarrar: "Agarrar", "menu-mano": "Menú de mano", "abrir-dock": "Abrir dock", recentrar: "Recentrar", salir: "Salir",
    hablar: "Hablar", teletransporte: "Teletransporte", "giro-izquierda": "Girar a la izquierda", "giro-derecha": "Girar a la derecha", atras: "Atrás",
};
export const ETIQUETAS_ENTRADA: Record<EntradaXR, string> = {
    mandos: "Mandos", manos: "Manos", "mirada-pellizco": "Mirada y pellizco", "teclado-raton": "Teclado y ratón", gamepad: "Gamepad", tactil: "Táctil", voz: "Voz",
};
export function etiquetaGatillo(g: Gatillo): string {
    if (g.tipo === "boton") return `Botón ${g.indice} (${g.mano})`;
    if (g.tipo === "eje") return `Eje ${g.indice}${g.direccion} (${g.mano})`;
    if (g.tipo === "gesto") return `Gesto ${g.gesto} (${g.mano})`;
    if (g.tipo === "tecla") return `Tecla ${g.codigo}`;
    return `Frase «${g.texto}»`;
}
export interface FilaVinculo { accion: AccionXR; etiqueta: string; gatillos: string[] }
/** Las 11 acciones, con los gatillos que tenga hoy esta forma de entrada. */
export function accionesDeEntrada(entrada: EntradaXR, mapa: MapaEntrada): FilaVinculo[] {
    void entrada;
    return ACCIONES_XR.map((accion) => ({ accion, etiqueta: ETIQUETAS_ACCION[accion], gatillos: (mapa[accion] ?? []).map(etiquetaGatillo) }));
}
export interface Captura { mapa: MapaEntrada; desplazada: AccionXR | null; aviso: string | null }
/** Aplica el siguiente gatillo aprendido; si estaba ocupado, dice a quién se lo quitó. */
export function aplicarCaptura(mapa: MapaEntrada, accion: AccionXR, gatillo: Gatillo): Captura {
    const { mapa: nuevo, desplazada } = asignar(mapa, accion, gatillo);
    return { mapa: nuevo, desplazada, aviso: desplazada ? `Se lo quité a «${ETIQUETAS_ACCION[desplazada]}».` : null };
}
export const puedeGuardarMapa = (entrada: EntradaXR, mapa: MapaEntrada): { ok: boolean; problemas: string[] } =>
    validarMapa(entrada, mapa);
/** Copia nueva de los valores por defecto: restaurar nunca muta `MAPAS_DEFECTO`. */
export const mapaRestaurado = (entrada: EntradaXR): MapaEntrada => JSON.parse(JSON.stringify(MAPAS_DEFECTO[entrada])) as MapaEntrada;

export const AVISO_APRENDER = "Aprende: pulsa un botón, haz un gesto, pulsa una tecla o di una frase.";
export const AVISO_RESERVADO = `próximamente: ${GESTOS_RESERVADOS.join(", ")} es del sistema del visor y no se puede reasignar.`;
export interface PropsPanelVinculos {
    entrada: EntradaXR;
    /** El siguiente gatillo capturado por el motor de entrada (XR1010L). */
    captura?: Gatillo | null;
    onAprender?: (accion: AccionXR) => void;
}
export function PanelVinculos({ entrada, captura = null, onAprender }: PropsPanelVinculos) {
    const { vinculos, setVinculo } = usePrefsXR();
    const [borrador, setBorrador] = useState<MapaEntrada>(() => vinculos[entrada] ?? MAPAS_DEFECTO[entrada]);
    const [aprendiendo, setAprendiendo] = useState<AccionXR | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    useEffect(() => {
        setBorrador(vinculos[entrada] ?? MAPAS_DEFECTO[entrada]);
        setAprendiendo(null);
        setAviso(null);
    }, [entrada]);
    useEffect(() => {
        if (aprendiendo === null || captura === null) return;
        const r = aplicarCaptura(borrador, aprendiendo, captura);
        setBorrador(r.mapa);
        setAviso(r.aviso);
        setAprendiendo(null);
    }, [captura, aprendiendo, borrador]);
    const validacion = puedeGuardarMapa(entrada, borrador);
    const guardar = (): void => {
        if (!validacion.ok) { setAviso(validacion.problemas.join(" ")); return; }
        setVinculo({ ...vinculos, [entrada]: borrador });
        setAviso("Guardado.");
    };
    const restaurar = (): void => {
        const defecto = mapaRestaurado(entrada);
        setBorrador(defecto);
        setVinculo({ ...vinculos, [entrada]: defecto });
        setAviso("Restaurado a los valores por defecto.");
    };
    return (
        <PanelCristal nodo="logic" ancho={1.3} alto={1}>
            <Texto3D distancia={1.5}>{`Entrada: ${ETIQUETAS_ENTRADA[entrada]}`}</Texto3D>
            <Container flexDirection="column" gapRow={3}>
                {accionesDeEntrada(entrada, borrador).map((fila) => (
                    <Container key={fila.accion} flexDirection="row" gapColumn={8}>
                        <Texto3D distancia={1.5}>{fila.etiqueta}</Texto3D>
                        <Texto3D distancia={1.5} tono="textoSecundario">
                            {fila.gatillos.length ? fila.gatillos.join(" · ") : "sin asignar"}
                        </Texto3D>
                        <Container cursor="pointer" onClick={() => { setAprendiendo(fila.accion); onAprender?.(fila.accion); }} backgroundColor={"#FFFFFF14"} paddingLeft={8} paddingRight={8}>
                            <Texto3D distancia={1.5}>Cambiar</Texto3D>
                        </Container>
                    </Container>
                ))}
            </Container>
            {aprendiendo !== null && <Texto3D distancia={1.5} tono="textoSecundario">{AVISO_APRENDER}</Texto3D>}
            {aviso !== null && <Texto3D distancia={1.5} tono="textoSecundario">{aviso}</Texto3D>}
            {!validacion.ok && <Texto3D distancia={1.5} tono="textoSecundario">{validacion.problemas.join(" ")}</Texto3D>}
            <Texto3D distancia={1.5} tono="textoSecundario">{AVISO_RESERVADO}</Texto3D>
            <Container flexDirection="row" gapColumn={8}>
                <Container cursor="pointer" onClick={guardar} backgroundColor={"#FFFFFF14"} paddingLeft={8} paddingRight={8}>
                    <Texto3D distancia={1.5}>Guardar cambios</Texto3D>
                </Container>
                <Container cursor="pointer" onClick={restaurar} backgroundColor={"#FFFFFF14"} paddingLeft={8} paddingRight={8}>
                    <Texto3D distancia={1.5}>Restaurar</Texto3D>
                </Container>
            </Container>
        </PanelCristal>
    );
}
