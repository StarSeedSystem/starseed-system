"use client";
/**
 * StarSeed XR · PANEL DE VÍNCULOS (XR1010AG · contrato §3 e). Las 11 acciones para la forma de
 * entrada presente. «Cambiar» entra en modo aprender y la próxima tecla o gatillo elegido se
 * asigna con `asignar`; si estaba ocupado se avisa de quién lo perdió. `validarMapa` impide
 * guardar sin «salir»/«menu-mano» o con un gesto reservado. Escribe con `usePrefsXR`.
 */
import { useCallback, useEffect, useState } from "react";
import { Container, Text } from "@react-three/uikit";
import {
    ACCIONES_XR, GESTOS, GESTOS_RESERVADOS, MAPAS_DEFECTO, asignar, claveGatillo, validarMapa,
    type AccionXR, type Gatillo, type MapaEntrada,
} from "../../../lib/xr/vinculos-xr";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import type { EntradaXR } from "../../../lib/xr/tipos";
import { usePrefsXR } from "./use-prefs-xr";
const ACENTO = COLORES_NODO.logic, SECUNDARIO = CRISTAL.textoSecundario, MANOS = ["izquierda", "derecha"] as const;
export const ETIQUETA_ACCION: Record<AccionXR, string> = {
    seleccionar: "Seleccionar", agarrar: "Agarrar", "menu-mano": "Menú de mano", "abrir-dock": "Abrir dock",
    recentrar: "Recentrar", salir: "Salir", hablar: "Hablar", teletransporte: "Teletransportarse",
    "giro-izquierda": "Girar a la izquierda", "giro-derecha": "Girar a la derecha", atras: "Atrás",
};
export const PROXIMAMENTE_ENTRADA: Partial<Record<EntradaXR, string>> = {
    tactil: "próximamente: capturar toques dentro de la sesión llega con XR1010AS.",
    voz: "próximamente: capturar frases nuevas llega con XR1010T; aquí se editan las ya asignadas.",
};
/** Tipos de gatillo de esta entrada (derivados de su mapa por defecto). */
export function tiposDeEntrada(entrada: EntradaXR): Gatillo["tipo"][] {
    const tipos = new Set<Gatillo["tipo"]>();
    for (const lista of Object.values(MAPAS_DEFECTO[entrada])) for (const g of lista ?? []) tipos.add(g.tipo);
    return [...tipos];
}
/** Etiqueta humana de un gatillo; nunca muestra la clave interna. */
export function etiquetaGatillo(g: Gatillo): string {
    const lado = g.tipo === "boton" || g.tipo === "eje" ? (g.mano === "izquierda" ? "izq." : "der.") : "";
    if (g.tipo === "boton") return `${lado} botón ${g.indice}`;
    if (g.tipo === "eje") return `${lado} eje ${g.indice}${g.direccion}`;
    if (g.tipo === "gesto") return `gesto ${g.gesto}`;
    if (g.tipo === "tecla") return `tecla ${g.codigo}`;
    return `«${g.texto}»`;
}
/** Gatillos elegibles sin teclado: botones, ejes y gestos (nunca los reservados del sistema). */
export function gatillosCandidatos(entrada: EntradaXR): Gatillo[] {
    const salida: Gatillo[] = [];
    for (const tipo of tiposDeEntrada(entrada)) {
        if (tipo === "boton") for (const mano of MANOS) for (const indice of [0, 1, 2, 3, 4, 5]) salida.push({ tipo, indice, mano });
        if (tipo === "eje") for (const mano of MANOS) for (const indice of [2, 3]) for (const direccion of ["+", "-"] as const) salida.push({ tipo, indice, direccion, mano });
        if (tipo === "gesto") for (const gesto of GESTOS) if (!GESTOS_RESERVADOS.includes(gesto)) salida.push({ tipo, gesto, mano: "cualquiera" });
    }
    return salida;
}
function Opcion({ activa, onClick, children }: { activa?: boolean; onClick: () => void; children: string }) {
    return (
        <Container padding={3} borderRadius={6} cursor="pointer" backgroundColor={activa ? ACENTO.base : undefined} onClick={onClick}>
            <Text color={CRISTAL.texto} fontSize={9}>{children}</Text>
        </Container>);
}

export interface PropsPanelVinculos {
    entrada?: EntradaXR;
    vinculos?: Partial<Record<EntradaXR, MapaEntrada>>;
    setVinculo?: (v: Partial<Record<EntradaXR, MapaEntrada>>) => void;
}
export function PanelVinculos(props: PropsPanelVinculos) {
    const prefs = usePrefsXR();
    const vinculos = props.vinculos ?? prefs.vinculos;
    const setVinculo = props.setVinculo ?? prefs.setVinculo;
    const entrada = props.entrada ?? "mandos";
    const mapa = vinculos[entrada] ?? MAPAS_DEFECTO[entrada];
    const [aprendiendo, setAprendiendo] = useState<AccionXR | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const candidatos = gatillosCandidatos(entrada);

    const aplicar = useCallback((accion: AccionXR, g: Gatillo) => {
        const { mapa: nuevo, desplazada } = asignar(mapa, accion, g);
        const v = validarMapa(entrada, nuevo);
        setAprendiendo(null);
        if (!v.ok) { setError(v.problemas.join(" ")); return; }
        setVinculo({ ...vinculos, [entrada]: nuevo }); setError(null);
        setAviso(desplazada
            ? `Se lo quité a «${ETIQUETA_ACCION[desplazada]}» (${etiquetaGatillo(g)}).`
            : `«${ETIQUETA_ACCION[accion]}» ahora usa ${etiquetaGatillo(g)}.`);
    }, [mapa, entrada, vinculos, setVinculo]);

    useEffect(() => {
        if (aprendiendo === null || !tiposDeEntrada(entrada).includes("tecla")) return;
        const alPulsar = (e: KeyboardEvent) => { e.preventDefault(); aplicar(aprendiendo, { tipo: "tecla", codigo: e.code || e.key }); };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [aprendiendo, entrada, aplicar]);

    const restaurar = () => {
        setVinculo({ ...vinculos, [entrada]: MAPAS_DEFECTO[entrada] });
        setError(null); setAprendiendo(null); setAviso("Mapa restaurado a los valores por defecto.");
    };

    return (
        <Container flexDirection="column" gap={5}>
            {ACCIONES_XR.map((accion) => {
                const gatillos = mapa[accion] ?? [];
                return (
                    <Container key={accion} flexDirection="column" gap={1}>
                        <Text color={CRISTAL.texto} fontSize={10}>{ETIQUETA_ACCION[accion]}</Text>
                        <Container flexDirection="row" gap={3} alignItems="center">
                            <Text color={SECUNDARIO} fontSize={9}>{gatillos.length ? gatillos.map(etiquetaGatillo).join(" · ") : "sin gatillo"}</Text>
                            <Opcion onClick={() => { setAprendiendo(accion); setError(null); }}>Cambiar</Opcion>
                        </Container>
                    </Container>);
            })}
            {aprendiendo !== null && (tiposDeEntrada(entrada).includes("tecla")
                ? <Text color={ACENTO.vivo} fontSize={10}>Pulsa una tecla para «{ETIQUETA_ACCION[aprendiendo]}»…</Text>
                : candidatos.length > 0
                    ? <Container flexDirection="row" gap={3} flexWrap="wrap">{candidatos.map((g) => <Opcion key={claveGatillo(g)} onClick={() => aplicar(aprendiendo, g)}>{etiquetaGatillo(g)}</Opcion>)}</Container>
                    : <Text color={SECUNDARIO} fontSize={9}>{PROXIMAMENTE_ENTRADA[entrada] ?? "próximamente: capturar esta entrada."}</Text>)}
            {aviso !== null && <Text color={ACENTO.vivo} fontSize={10}>{aviso}</Text>}
            {error !== null && <Text color={CRISTAL.texto} fontSize={10}>No se guardó: {error}</Text>}
            <Opcion onClick={restaurar}>Restaurar</Opcion>
        </Container>);
}
