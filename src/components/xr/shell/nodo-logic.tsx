"use client";
/** StarSeed XR · NODO LOGIC (XR1010AG · contrato §3 d/e/j/k): calidad, comodidad, entrada, privacidad y conexiones. */
import { useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";
import { PanelVinculos } from "./panel-vinculos";
import { ANGULOS_SALTO, type PreferenciasConfort } from "../../../lib/xr/confort";
import { NIVELES_CALIDAD, type EntradaXR, type NivelCalidad } from "../../../lib/xr/tipos";
import { CLASES_DATO, POLITICA, type ClaseDato, type Consentimiento, type Destino } from "../../../lib/xr/privacidad";
import { elegirTransporte, type Alcanzabilidad, type Sala, type TransporteSala } from "../../../lib/salas/sala";
export const PESTANAS_LOGIC = ["calidad", "comodidad", "entrada", "privacidad", "conexiones"] as const;
export type PestanaLogic = (typeof PESTANAS_LOGIC)[number];
export const ETIQUETAS_PESTANA: Record<PestanaLogic, string> = { calidad: "Calidad", comodidad: "Comodidad", entrada: "Entrada", privacidad: "Privacidad", conexiones: "Conexiones" };
export const ETIQUETAS_NIVEL: Record<NivelCalidad, string> = { minima: "Mínima", baja: "Baja", media: "Media", alta: "Alta", maxima: "Máxima" };
export const ETIQUETAS_DATO: Record<ClaseDato, string> = {
    "camara-passthrough": "Cámara del passthrough", "mapa-sala": "Mapa de la habitación", mirada: "Mirada", "manos-articulaciones": "Articulaciones de las manos",
    biometria: "Biometría", "ubicacion-fisica": "Ubicación física", "voz-audio": "Voz (audio)", "voz-texto": "Voz (texto dictado)", "pose-avatar": "Pose del avatar", avatar: "Avatar", "mundo-spec": "Mundo",
};
export const ETIQUETAS_DESTINO: Record<Destino, string> = {
    dispositivo: "el aparato", "mismas-cuentas": "tus cuentas", "nube-propia": "tu nube", "sala-privada": "sala privada", "sala-grupo": "sala de grupo", "sala-publica": "sala pública", "nube-terceros": "nube de terceros",
};
export const ETIQUETAS_TRANSPORTE: Record<TransporteSala, string> = { "servidor-publico": "Servidor público", "servidor-privado": "Servidor privado", "malla-p2p": "Malla P2P", local: "Solo este aparato" };
const MODOS_CALIDAD = ["auto", ...NIVELES_CALIDAD] as const;
const D = 1.5;
export function resumenPrivacidad(dato: ClaseDato): string {
    const r = POLITICA[dato];
    if (r.libre === "dispositivo") return r.conConsentimiento === null ? `nunca sale del aparato. ${r.motivo}` : `sólo en el aparato; con permiso hasta ${ETIQUETAS_DESTINO[r.conConsentimiento]}. ${r.motivo}`;
    const permiso = r.conConsentimiento ? `; con permiso hasta ${ETIQUETAS_DESTINO[r.conConsentimiento]}` : "";
    return `hasta ${ETIQUETAS_DESTINO[r.libre]}${permiso}. ${r.motivo}`;
}
export const consentimientosVigentes = (lista: readonly Consentimiento[], ahora: number): Consentimiento[] => lista.filter((c) => c.vence > ahora);
export const resumenConexion = (sala: Sala, a: Alcanzabilidad): { transporte: string; motivo: string } => {
    const d = elegirTransporte(sala, a); return { transporte: ETIQUETAS_TRANSPORTE[d.transporte], motivo: d.motivo };
};
export const descripcionCalidad = (modo: "auto" | NivelCalidad, actual: NivelCalidad): string => modo === "auto"
    ? `Automática: el aparato decide; ahora en ${ETIQUETAS_NIVEL[actual]}.`
    : `Fija en ${ETIQUETAS_NIVEL[modo]}; el ajuste automático no la cambia.`;
function Boton({ children, onClick, activo = false }: { children: ReactNode; onClick: () => void; activo?: boolean }) {
    return <Container cursor="pointer" onClick={onClick} backgroundColor={activo ? "#FFFFFF33" : "#FFFFFF14"} paddingLeft={8} paddingRight={8}><Texto3D distancia={D}>{children}</Texto3D></Container>;
}
function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
    return <Container flexDirection="row" gapColumn={8}><Texto3D distancia={D}>{etiqueta}</Texto3D>{children}</Container>;
}
function Alternar({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: boolean; alCambiar: () => void }) {
    return <Fila etiqueta={etiqueta}><Boton activo={valor} onClick={alCambiar}>{valor ? "Sí" : "No"}</Boton></Fila>;
}
function Rango({ etiqueta, valor, alRestar, alSumar, extra }: { etiqueta: string; valor: string; alRestar: () => void; alSumar: () => void; extra?: ReactNode }) {
    return <Fila etiqueta={etiqueta}><Boton onClick={alRestar}>−</Boton><Texto3D distancia={D}>{valor}</Texto3D><Boton onClick={alSumar}>+</Boton>{extra}</Fila>;
}
function Opciones<T extends string | number>({ etiqueta, valores, actual, texto, alElegir }: {
    etiqueta: string; valores: readonly T[]; actual: T; texto: (v: T) => string; alElegir: (v: T) => void;
}) {
    return <Fila etiqueta={etiqueta}>{valores.map((v) => <Boton key={String(v)} activo={v === actual} onClick={() => alElegir(v)}>{texto(v)}</Boton>)}</Fila>;
}
export interface PropsNodoLogic {
    entrada?: EntradaXR; nivelActual?: NivelCalidad; ultimoCambio?: { de: string; a: string; motivo: string } | null;
    consentimientos?: readonly Consentimiento[]; alQuitarConsentimiento?: (dato: ClaseDato) => void;
    sala?: Sala | null; alcanzabilidad?: Alcanzabilidad; alAbrirServidores?: () => void;
}
export function NodoLogic(o: PropsNodoLogic) {
    const entrada = o.entrada ?? "mandos", nivelActual = o.nivelActual ?? "media", ultimoCambio = o.ultimoCambio ?? null, consentimientos = o.consentimientos ?? [], sala = o.sala ?? null;
    const alcanzabilidad = o.alcanzabilidad ?? { internet: true, servidorPrivado: false, malla: false };
    const { confort, calidad, setConfort, setCalidad } = usePrefsXR();
    const [pestana, setPestana] = useState<PestanaLogic>("calidad");
    const vigentes = consentimientosVigentes(consentimientos, Date.now());
    const decision = sala ? resumenConexion(sala, alcanzabilidad) : null;
    const cambiar = (cambio: Partial<PreferenciasConfort>): void => setConfort({ ...confort, ...cambio });
    const abrirServidores = o.alAbrirServidores ?? (() => { if (typeof window !== "undefined") window.location.assign("/servidores"); });
    const calidadTab = (
        <>
            <Opciones etiqueta="Modo" valores={MODOS_CALIDAD} actual={calidad.modo} texto={(v) => v === "auto" ? "Auto" : ETIQUETAS_NIVEL[v]} alElegir={(v) => setCalidad({ modo: v })} />
            <Texto3D distancia={D}>{`Calidad actual: ${ETIQUETAS_NIVEL[nivelActual]}`}</Texto3D>
            <Texto3D distancia={D} tono="textoSecundario">{descripcionCalidad(calidad.modo, nivelActual)}</Texto3D>
            <Texto3D distancia={D} tono="textoSecundario">{ultimoCambio ? `Último cambio: ${ultimoCambio.motivo}` : "Aún no ha habido cambios de calidad."}</Texto3D>
        </>
    );
    const comodidadTab = (
        <>
            <Opciones etiqueta="Giro" valores={["saltos", "continuo"] as const} actual={confort.giro} texto={(v) => v === "saltos" ? "Por saltos" : "Continuo"} alElegir={(v) => cambiar({ giro: v })} />
            <Opciones etiqueta="Ángulo" valores={ANGULOS_SALTO} actual={confort.anguloSalto} texto={(v) => `${v}°`} alElegir={(v) => cambiar({ anguloSalto: v })} />
            <Opciones etiqueta="Viñeta" valores={["auto", "siempre", "nunca"] as const} actual={confort.vineta} texto={(v) => v} alElegir={(v) => cambiar({ vineta: v })} />
            <Alternar etiqueta="Subtítulos" valor={confort.subtitulos} alCambiar={() => cambiar({ subtitulos: !confort.subtitulos })} />
            <Alternar etiqueta="Movimiento reducido" valor={confort.movimientoReducido} alCambiar={() => cambiar({ movimientoReducido: !confort.movimientoReducido })} />
            <Alternar etiqueta="Contraste alto" valor={confort.contrasteAlto} alCambiar={() => cambiar({ contrasteAlto: !confort.contrasteAlto })} />
            <Alternar etiqueta="Reducir transparencias" valor={confort.reducirTransparencia} alCambiar={() => cambiar({ reducirTransparencia: !confort.reducirTransparencia })} />
            <Opciones etiqueta="Postura" valores={["de-pie", "sentado", "una-mano"] as const} actual={confort.postura} texto={(v) => v} alElegir={(v) => cambiar({ postura: v })} />
            <Opciones etiqueta="Mano dominante" valores={["izquierda", "derecha"] as const} actual={confort.manoDominante} texto={(v) => v} alElegir={(v) => cambiar({ manoDominante: v })} />
            <Rango etiqueta="Escala" valor={confort.escala.toFixed(1)} alRestar={() => cambiar({ escala: Math.max(0.8, Math.round((confort.escala - 0.1) * 10) / 10) })} alSumar={() => cambiar({ escala: Math.min(1.5, Math.round((confort.escala + 0.1) * 10) / 10) })} />
            <Rango etiqueta="Altura de ojos" valor={confort.alturaOjos === null ? "la del visor" : `${confort.alturaOjos.toFixed(2)} m`} alRestar={() => cambiar({ alturaOjos: Math.max(0.8, Math.round(((confort.alturaOjos ?? 1.6) - 0.05) * 100) / 100) })} alSumar={() => cambiar({ alturaOjos: Math.min(2.1, Math.round(((confort.alturaOjos ?? 1.6) + 0.05) * 100) / 100) })} extra={<Boton activo={confort.alturaOjos === null} onClick={() => cambiar({ alturaOjos: null })}>Automática</Boton>} />
        </>
    );
    const privacidadTab = (
        <>
            <Texto3D distancia={D}>Qué sale de este aparato</Texto3D>
            {CLASES_DATO.map((d) => <Texto3D key={d} distancia={D} tono="textoSecundario">{`${ETIQUETAS_DATO[d]}: ${resumenPrivacidad(d)}`}</Texto3D>)}
            <Texto3D distancia={D}>Consentimientos vigentes</Texto3D>
            {vigentes.length === 0 ? <Texto3D distancia={D} tono="textoSecundario">No hay consentimientos vigentes.</Texto3D> : vigentes.map((c) => (
                <Container key={`${c.dato}:${c.hasta}`} flexDirection="row" gapColumn={8}>
                    <Texto3D distancia={D} tono="textoSecundario">{`${ETIQUETAS_DATO[c.dato]} hasta ${ETIQUETAS_DESTINO[c.hasta]} · caduca ${new Date(c.vence).toLocaleString("es-ES")}`}</Texto3D>
                    {o.alQuitarConsentimiento ? <Boton onClick={() => o.alQuitarConsentimiento?.(c.dato)}>Quitar</Boton> : <Texto3D distancia={D} tono="textoSecundario">próximamente: aún no se pueden revocar desde aquí</Texto3D>}
                </Container>
            ))}
        </>
    );
    const conexionesTab = (
        <>
            {decision ? <><Texto3D distancia={D}>{`Transporte: ${decision.transporte}`}</Texto3D><Texto3D distancia={D} tono="textoSecundario">{decision.motivo}</Texto3D></> : <Texto3D distancia={D} tono="textoSecundario">próximamente: aún no hay una sala abierta en el visor</Texto3D>}
            <Boton onClick={abrirServidores}>Abrir /servidores</Boton>
        </>
    );
    const contenido = pestana === "calidad" ? calidadTab : pestana === "comodidad" ? comodidadTab : pestana === "entrada" ? <PanelVinculos entrada={entrada} /> : pestana === "privacidad" ? privacidadTab : conexionesTab;
    return (
        <PanelCristal nodo="logic" ancho={1.4} alto={1.1}>
            <Container flexDirection="row" gapColumn={6}>{PESTANAS_LOGIC.map((p) => <Boton key={p} activo={p === pestana} onClick={() => setPestana(p)}>{ETIQUETAS_PESTANA[p]}</Boton>)}</Container>
            <Container flexDirection="column" gapRow={4}>{contenido}</Container>
        </PanelCristal>
    );
}
