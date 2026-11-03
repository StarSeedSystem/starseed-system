"use client";
/**
 * StarSeed XR · PANEL DE VÍNCULOS DE ENTRADA (XR1010AG · contrato `architecture/starseed-xr.md` §3 e).
 * Lista las 11 acciones con los gatillos de la forma de entrada presente, permite reasignarlos
 * («Cambiar» entra en modo aprender) y bloquea guardar un mapa que deje a alguien atrapado.
 * La captura del siguiente gatillo la inyecta el bucle de entrada (XR1010AS).
 */
import { useEffect, useMemo, useState } from "react";
import { Container, Text } from "@react-three/uikit";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import {
    ACCIONES_XR, MAPAS_DEFECTO, asignar, validarMapa,
    type AccionXR, type Gatillo, type MapaEntrada,
} from "../../../lib/xr/vinculos-xr";
import type { EntradaXR } from "../../../lib/xr/tipos";
import { usePrefsXR } from "./use-prefs-xr";

export interface PropsPanelVinculos {
    entrada?: EntradaXR;
    /** Captura el siguiente gatillo; la inyecta XR1010AS. Sin ella se dice «próximamente». */
    capturarGatillo?: (entrada: EntradaXR) => Promise<Gatillo | null> | Gatillo | null;
}

export const ETIQUETAS_ACCION: Record<AccionXR, string> = {
    seleccionar: "Seleccionar", agarrar: "Agarrar", "menu-mano": "Menú de mano", "abrir-dock": "Abrir dock", recentrar: "Recentrar",
    salir: "Salir", hablar: "Hablar", teletransporte: "Teletransporte", "giro-izquierda": "Girar a la izquierda", "giro-derecha": "Girar a la derecha", atras: "Atrás",
};

/** Texto legible de un gatillo, para que la persona sepa exactamente qué tiene en la mano. */
export function gatilloLegible(g: Gatillo): string {
    switch (g.tipo) {
        case "boton": return `botón ${g.indice} (${g.mano})`;
        case "eje": return `eje ${g.indice}${g.direccion} (${g.mano})`;
        case "gesto": return `gesto ${g.gesto} (${g.mano})`;
        case "tecla": return `tecla ${g.codigo}`;
        case "frase": return `frase «${g.texto}»`;
    }
}
export interface Aprendizaje { mapa: MapaEntrada; desplazada: AccionXR | null; problemas: string[]; ok: boolean }
/** Aplica el gatillo aprendido y devuelve el mapa nuevo con la validación del núcleo. */
export function asignarAprendido(entrada: EntradaXR, mapa: MapaEntrada, accion: AccionXR, g: Gatillo): Aprendizaje {
    const r = asignar(mapa, accion, g);
    const v = validarMapa(entrada, r.mapa);
    return { mapa: r.mapa, desplazada: r.desplazada, problemas: v.problemas, ok: v.ok };
}

const ACENTO = COLORES_NODO.logic, SECUNDARIO = CRISTAL.textoSecundario;

export function PanelVinculos({ entrada = "mandos", capturarGatillo }: PropsPanelVinculos) {
    const { vinculos, setVinculo } = usePrefsXR();
    const guardado = vinculos[entrada] ?? MAPAS_DEFECTO[entrada];
    const [mapa, setMapa] = useState<MapaEntrada>(guardado);
    const [aprendiendo, setAprendiendo] = useState<AccionXR | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [hecho, setHecho] = useState<string | null>(null);
    const validacion = useMemo(() => validarMapa(entrada, mapa), [entrada, mapa]);

    useEffect(() => {
        setMapa(vinculos[entrada] ?? MAPAS_DEFECTO[entrada]);
        setAviso(null); setHecho(null);
    }, [entrada]);

    async function cambiar(accion: AccionXR) {
        if (!capturarGatillo) { setAviso("Cambiar: próximamente — la captura del siguiente gatillo la cablea XR1010AS."); return; }
        setAprendiendo(accion); setHecho(null);
        setAviso(`Aprende «${ETIQUETAS_ACCION[accion]}»: pulsa el siguiente gatillo…`);
        try {
            const g = await capturarGatillo(entrada);
            if (!g) { setAviso("No se capturó ningún gatillo; no se cambió nada."); return; }
            const r = asignarAprendido(entrada, mapa, accion, g);
            setMapa(r.mapa);
            setAviso(r.desplazada
                ? `Se lo quité a «${ETIQUETAS_ACCION[r.desplazada]}» (${gatilloLegible(g)}).`
                : `«${ETIQUETAS_ACCION[accion]}» ahora es ${gatilloLegible(g)}.`);
        } finally {
            setAprendiendo(null);
        }
    }

    function guardar() {
        if (!validacion.ok) { setAviso(`No se puede guardar: ${validacion.problemas.join(" ")}`); return; }
        setVinculo({ ...vinculos, [entrada]: mapa });
        setAviso(null); setHecho("Vínculos guardados.");
    }

    function restaurar() {
        const defecto = MAPAS_DEFECTO[entrada];
        setMapa(defecto); setVinculo({ ...vinculos, [entrada]: defecto });
        setAviso(null); setHecho("Se restauraron los vínculos de fábrica.");
    }

    return (
        <Container flexDirection="column" gap={6}>
            <Text color={ACENTO.vivo} fontSize={11}>Vínculos de entrada · {entrada}</Text>
            {ACCIONES_XR.map((accion) => (
                <Container key={accion} flexDirection="row" gap={4} alignItems="center">
                    <Text color={CRISTAL.texto} fontSize={10}>{ETIQUETAS_ACCION[accion]}</Text>
                    <Text color={SECUNDARIO} fontSize={9}>{(mapa[accion] ?? []).map(gatilloLegible).join(" / ") || "sin gatillo"}</Text>
                    {capturarGatillo && (
                        <Container padding={3} borderRadius={6} cursor="pointer" backgroundColor={aprendiendo === accion ? ACENTO.base : undefined} onClick={() => void cambiar(accion)}>
                            <Text color={CRISTAL.texto} fontSize={9}>{aprendiendo === accion ? "Escuchando…" : "Cambiar"}</Text>
                        </Container>
                    )}
                </Container>
            ))}
            {!capturarGatillo && <Text color={SECUNDARIO} fontSize={9}>Cambiar: próximamente — la captura del siguiente gatillo la cablea XR1010AS.</Text>}
            {!validacion.ok && <Text color="#FF8A80" fontSize={9}>No se puede guardar: {validacion.problemas.join(" ")}</Text>}
            {aviso && <Text color={validacion.ok ? SECUNDARIO : "#FF8A80"} fontSize={9}>{aviso}</Text>}
            <Container flexDirection="row" gap={4}>
                <Container padding={4} borderRadius={6} cursor="pointer" backgroundColor={validacion.ok ? ACENTO.base : undefined} onClick={guardar}>
                    <Text color={CRISTAL.texto} fontSize={10}>Guardar</Text>
                </Container>
                <Container padding={4} borderRadius={6} cursor="pointer" onClick={restaurar}>
                    <Text color={CRISTAL.texto} fontSize={10}>Restaurar</Text>
                </Container>
            </Container>
            {hecho && <Text color={SECUNDARIO} fontSize={9}>{hecho}</Text>}
        </Container>
    );
}
