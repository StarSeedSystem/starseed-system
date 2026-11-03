"use client";
/**
 * StarSeed XR · PANEL DE VÍNCULOS (XR1010AG · contrato `architecture/starseed-xr.md` §3 e).
 * Lista las 11 acciones para la forma de entrada presente y deja reasignar cada gatillo con
 * `asignar`: si estaba ocupado, dice a qué acción se lo quitó. `validarMapa` bloquea guardar un
 * mapa sin «salir» o «menu-mano» (nadie queda atrapado) y «Restaurar» vuelve a los valores por
 * defecto de esa entrada. La captura real de mandos y manos vive en `use-entrada-xr.ts`; aquí se
 * aprende con la próxima tecla, toque o frase, nunca en silencio.
 */
import { useEffect, useState } from "react";
import { Container, Input, Text } from "@react-three/uikit";
import {
    ACCIONES_XR, MAPAS_DEFECTO, asignar, validarMapa,
    type AccionXR, type Gatillo, type MapaEntrada,
} from "../../../lib/xr/vinculos-xr";
import type { EntradaXR } from "../../../lib/xr/tipos";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";

const ACENTO = COLORES_NODO.logic, SECUNDARIO = CRISTAL.textoSecundario;

export const NOMBRES_ACCION: Record<AccionXR, string> = {
    seleccionar: "Seleccionar", agarrar: "Agarrar", "menu-mano": "Menú de mano", "abrir-dock": "Abrir dock",
    recentrar: "Recentrar", salir: "Salir", hablar: "Hablar", teletransporte: "Teletransporte",
    "giro-izquierda": "Girar a la izquierda", "giro-derecha": "Girar a la derecha", atras: "Atrás",
};

/** Texto legible de un gatillo; los ids internos no se enseñan a la persona. */
export function describirGatillo(g: Gatillo): string {
    switch (g.tipo) {
        case "boton": return `Botón ${g.indice} (${g.mano})`;
        case "eje": return `Stick ${g.indice} ${g.direccion} (${g.mano})`;
        case "gesto": return `Gesto ${g.gesto.replace(/-/g, " ")} (${g.mano})`;
        case "tecla": return `Tecla ${g.codigo}`;
        case "frase": return `«${g.texto}»`;
    }
}

export interface PropiedadesPanelVinculos {
    entrada: EntradaXR;
    mapaInicial?: MapaEntrada;
    alGuardar?: (mapa: MapaEntrada) => void;
}

export function PanelVinculos({ entrada, mapaInicial, alGuardar }: PropiedadesPanelVinculos) {
    const [mapa, setMapa] = useState<MapaEntrada>(() => mapaInicial ?? MAPAS_DEFECTO[entrada]);
    const [aprendiendo, setAprendiendo] = useState<AccionXR | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [problemas, setProblemas] = useState<string[]>([]);
    const [frase, setFrase] = useState("");
    const capturar = (g: Gatillo): void => {
        if (!aprendiendo) return;
        const r = asignar(mapa, aprendiendo, g);
        setMapa(r.mapa); setProblemas([]); setAprendiendo(null);
        setAviso(r.desplazada ? `Se lo quité a «${NOMBRES_ACCION[r.desplazada]}»` : null);
    };
    useEffect(() => {
        if (!aprendiendo) return;
        const alPulsar = (e: KeyboardEvent): void => { capturar({ tipo: "tecla", codigo: e.code }); };
        const alTocar = (): void => {
            if (entrada === "manos" || entrada === "mirada-pellizco") capturar({ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" });
            else if (entrada === "tactil") capturar({ tipo: "frase", texto: "toque" });
            else capturar({ tipo: "boton", indice: 0, mano: "derecha" });
        };
        window.addEventListener("keydown", alPulsar);
        if (entrada !== "voz" && entrada !== "teclado-raton") window.addEventListener("pointerdown", alTocar);
        return () => { window.removeEventListener("keydown", alPulsar); window.removeEventListener("pointerdown", alTocar); };
    }, [aprendiendo, mapa, entrada]); // capturar se reconstruye con el mapa
    const guardar = (): void => {
        const v = validarMapa(entrada, mapa);
        if (!v.ok) { setProblemas(v.problemas); return; }
        alGuardar?.(mapa); setProblemas([]); setAviso("Mapa guardado.");
    };
    const restaurar = (): void => {
        const d = MAPAS_DEFECTO[entrada];
        setMapa(d); setProblemas([]); setAviso("Mapa restaurado a los valores por defecto."); alGuardar?.(d);
    };
    return (
        <Container flexDirection="column" gap={4}>
            <Text color={ACENTO.vivo} fontSize={10}>Vínculos · {entrada}</Text>
            {ACCIONES_XR.map((accion) => (
                <Container key={accion} flexDirection="row" gap={4} alignItems="center">
                    <Text color={CRISTAL.texto} fontSize={9}>{NOMBRES_ACCION[accion]}</Text>
                    <Text color={SECUNDARIO} fontSize={8}>{(mapa[accion] ?? []).map(describirGatillo).join(" · ") || "Sin gatillo"}</Text>
                    <Container padding={2} borderRadius={4} cursor="pointer" backgroundColor={aprendiendo === accion ? ACENTO.base : undefined} onClick={() => { setAprendiendo(accion); setAviso(null); }}>
                        <Text color={CRISTAL.texto} fontSize={8}>Cambiar</Text>
                    </Container>
                </Container>
            ))}
            {aprendiendo && <Text color={SECUNDARIO} fontSize={8}>Aprende: pulsa una tecla, toca o dicta una frase para «{NOMBRES_ACCION[aprendiendo]}».</Text>}
            {aprendiendo && (
                <Container flexDirection="row" gap={4} alignItems="center">
                    <Input value={frase} onValueChange={(v) => setFrase(String(v ?? ""))} placeholder="frase" width={120} fontSize={8} color={CRISTAL.texto} />
                    <Container padding={2} borderRadius={4} cursor="pointer" backgroundColor={ACENTO.base} onClick={() => { const t = frase.trim(); if (t) capturar({ tipo: "frase", texto: t }); }}>
                        <Text color={CRISTAL.texto} fontSize={8}>Asignar frase</Text>
                    </Container>
                </Container>
            )}
            {aviso && <Text color={ACENTO.vivo} fontSize={8}>{aviso}</Text>}
            {problemas.map((p) => <Text key={p} color="#FF8A8A" fontSize={8}>{p}</Text>)}
            <Container flexDirection="row" gap={4}>
                <Container padding={2} borderRadius={4} cursor="pointer" backgroundColor={ACENTO.base} onClick={guardar}><Text color={CRISTAL.texto} fontSize={8}>Guardar</Text></Container>
                <Container padding={2} borderRadius={4} cursor="pointer" onClick={restaurar}><Text color={CRISTAL.texto} fontSize={8}>Restaurar</Text></Container>
            </Container>
        </Container>
    );
}

export default PanelVinculos;
