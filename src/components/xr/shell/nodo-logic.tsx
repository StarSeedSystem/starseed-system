"use client";
/**
 * StarSeed XR · NODO LOGIC (XR1010AG · contrato §3 d, e, j y k). Pestañas: «Calidad» (Auto o
 * nivel fijo, nivel actual y último motivo), «Comodidad», «Entrada» (`PanelVinculos`),
 * «Privacidad» (`POLITICA` + consentimientos con «Quitar») y «Conexiones» (`elegirTransporte`).
 * Todo escribe con `usePrefsXR` y se ve al instante.
 */
import { useState, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import { ANGULOS_SALTO, type PreferenciasConfort } from "../../../lib/xr/confort";
import { CLASES_DATO, POLITICA, type Consentimiento } from "../../../lib/xr/privacidad";
import { NIVELES_CALIDAD, type EntradaXR, type NivelCalidad } from "../../../lib/xr/tipos";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import { elegirTransporte, type Alcanzabilidad, type Sala, type TransporteSala } from "../../../lib/salas/sala";
import { usePrefsXR } from "./use-prefs-xr";
import { PanelVinculos } from "./panel-vinculos";
const ACENTO = COLORES_NODO.logic, SEC = CRISTAL.textoSecundario;
const NOMBRE_NIVEL: Record<NivelCalidad, string> = { minima: "Mínima", baja: "Baja", media: "Media", alta: "Alta", maxima: "Máxima" };
const NOMBRE_TRANSPORTE: Record<TransporteSala, string> = { "servidor-publico": "servidor público", "servidor-privado": "servidor privado", "malla-p2p": "malla P2P", local: "solo este aparato" };
const PESTANAS = [["calidad", "Calidad"], ["comodidad", "Comodidad"], ["entrada", "Entrada"], ["privacidad", "Privacidad"], ["conexiones", "Conexiones"]] as const;
type Pestana = (typeof PESTANAS)[number][0];
const nombreDato = (d: string): string => d.replace(/-/g, " ");
function Opcion({ activa, onClick, children }: { activa?: boolean; onClick: () => void; children: ReactNode }) {
    return <Container padding={3} borderRadius={6} cursor="pointer" backgroundColor={activa ? ACENTO.base : undefined} onClick={onClick}><Text color={CRISTAL.texto} fontSize={9}>{children}</Text></Container>;
}
function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
    return <Container flexDirection="row" gap={3} alignItems="center"><Text color={SEC} fontSize={9}>{titulo}</Text>{children}</Container>;
}
function PestanaCalidad(o: { nivel: NivelCalidad; motivo: string | null; calidad: "auto" | NivelCalidad; setCalidad: (c: { modo: "auto" | NivelCalidad }) => void }) {
    const opciones: ("auto" | NivelCalidad)[] = ["auto", ...NIVELES_CALIDAD];
    return (
        <Container flexDirection="column" gap={4}>
            <Container flexDirection="row" gap={3} flexWrap="wrap">
                {opciones.map((m) => <Opcion key={m} activa={o.calidad === m} onClick={() => o.setCalidad({ modo: m })}>{m === "auto" ? "Auto" : NOMBRE_NIVEL[m]}</Opcion>)}
            </Container>
            <Text color={CRISTAL.texto} fontSize={11}>Nivel actual: {NOMBRE_NIVEL[o.nivel]}</Text>
            <Text color={SEC} fontSize={9}>{o.motivo ?? "Sin cambios recientes."}</Text>
        </Container>);
}
function PestanaComodidad({ confort, setConfort }: { confort: PreferenciasConfort; setConfort: (c: PreferenciasConfort) => void }) {
    const c = (p: Partial<PreferenciasConfort>) => setConfort({ ...confort, ...p });
    return (
        <Container flexDirection="column" gap={3}>
            <Fila titulo="Giro">
                {ANGULOS_SALTO.map((a) => <Opcion key={a} activa={confort.giro === "saltos" && confort.anguloSalto === a} onClick={() => c({ giro: "saltos", anguloSalto: a })}>{a}°</Opcion>)}
                <Opcion activa={confort.giro === "continuo"} onClick={() => c({ giro: "continuo" })}>Continuo</Opcion>
            </Fila>
            <Fila titulo="Viñeta">{(["auto", "siempre", "nunca"] as const).map((v) => <Opcion key={v} activa={confort.vineta === v} onClick={() => c({ vineta: v })}>{v}</Opcion>)}</Fila>
            <Fila titulo="Subtítulos"><Opcion activa={confort.subtitulos} onClick={() => c({ subtitulos: !confort.subtitulos })}>{confort.subtitulos ? "Sí" : "No"}</Opcion></Fila>
            <Fila titulo="Movimiento reducido"><Opcion activa={confort.movimientoReducido} onClick={() => c({ movimientoReducido: !confort.movimientoReducido })}>{confort.movimientoReducido ? "Sí" : "No"}</Opcion></Fila>
            <Fila titulo="Contraste alto"><Opcion activa={confort.contrasteAlto} onClick={() => c({ contrasteAlto: !confort.contrasteAlto })}>{confort.contrasteAlto ? "Sí" : "No"}</Opcion></Fila>
            <Fila titulo="Reducir transparencias"><Opcion activa={confort.reducirTransparencia} onClick={() => c({ reducirTransparencia: !confort.reducirTransparencia })}>{confort.reducirTransparencia ? "Sí" : "No"}</Opcion></Fila>
            <Fila titulo="Postura">{(["de-pie", "sentado", "una-mano"] as const).map((p) => <Opcion key={p} activa={confort.postura === p} onClick={() => c({ postura: p })}>{p.replace("-", " ")}</Opcion>)}</Fila>
            <Fila titulo="Mano dominante">{(["izquierda", "derecha"] as const).map((m) => <Opcion key={m} activa={confort.manoDominante === m} onClick={() => c({ manoDominante: m })}>{m}</Opcion>)}</Fila>
            <Fila titulo="Escala">{[0.8, 1, 1.2, 1.5].map((e) => <Opcion key={e} activa={confort.escala === e} onClick={() => c({ escala: e })}>{e}</Opcion>)}</Fila>
            <Fila titulo="Altura de ojos"><Opcion activa={confort.alturaOjos === null} onClick={() => c({ alturaOjos: null })}>Auto</Opcion>{[1.5, 1.6, 1.8].map((a) => <Opcion key={a} activa={confort.alturaOjos === a} onClick={() => c({ alturaOjos: a })}>{a} m</Opcion>)}</Fila>
        </Container>);
}
function PestanaPrivacidad({ consentimientos, ahora, alQuitar }: { consentimientos: Consentimiento[]; ahora: number; alQuitar: (c: Consentimiento) => void }) {
    const vigentes = consentimientos.filter((c) => c.vence > ahora);
    return (
        <Container flexDirection="column" gap={4}>
            <Text color={ACENTO.vivo} fontSize={10}>Qué datos salen del aparato</Text>
            {CLASES_DATO.map((d) => (
                <Container key={d} flexDirection="column">
                    <Text color={CRISTAL.texto} fontSize={9}>{nombreDato(d)} · hasta {POLITICA[d].libre}{POLITICA[d].conConsentimiento ? ` (con permiso: ${POLITICA[d].conConsentimiento})` : " · nunca más allá"}</Text>
                    <Text color={SEC} fontSize={8}>{POLITICA[d].motivo}{d === "camara-passthrough" ? " Nunca sale del aparato." : ""}</Text>
                </Container>))}
            <Text color={ACENTO.vivo} fontSize={10}>Consentimientos vigentes</Text>
            {vigentes.length === 0 && <Text color={SEC} fontSize={9}>Ninguno: todo lo que sale de tu cuenta pide permiso antes.</Text>}
            {vigentes.map((c) => (
                <Container key={`${c.dato}-${c.hasta}-${c.vence}`} flexDirection="row" gap={3} alignItems="center">
                    <Text color={CRISTAL.texto} fontSize={9}>{nombreDato(c.dato)} → {c.hasta} · vence {new Date(c.vence).toLocaleString("es")}</Text>
                    <Opcion onClick={() => alQuitar(c)}>Quitar</Opcion>
                </Container>))}
        </Container>);
}
function PestanaConexiones({ sala, alcanzabilidad, alAbrirServidores }: { sala: Sala | null; alcanzabilidad: Alcanzabilidad; alAbrirServidores: () => void }) {
    const decision = sala ? elegirTransporte(sala, alcanzabilidad) : null;
    return (
        <Container flexDirection="column" gap={4}>
            <Text color={ACENTO.vivo} fontSize={10}>Conexiones de la sala</Text>
            {decision
                ? <><Text color={CRISTAL.texto} fontSize={10}>Transporte actual: {NOMBRE_TRANSPORTE[decision.transporte]}</Text><Text color={SEC} fontSize={9}>{decision.motivo}</Text></>
                : <Text color={SEC} fontSize={9}>Sin sala abierta: entra en una sala para ver por dónde viaja.</Text>}
            <Opcion onClick={alAbrirServidores}>Ver servidores y estaciones</Opcion>
        </Container>);
}
export interface PropsNodoLogic {
    nivelActual?: NivelCalidad;
    motivoCambio?: string | null;
    entrada?: EntradaXR;
    sala?: Sala | null;
    alcanzabilidad?: Alcanzabilidad;
    consentimientos?: Consentimiento[];
    alQuitarConsentimiento?: (c: Consentimiento) => void;
    ahora?: number;
    alAbrirServidores?: () => void;
}
const irAServidores = () => { if (typeof window !== "undefined") window.location.assign("/servidores"); };
export function NodoLogic(props: PropsNodoLogic) {
    const { confort, calidad, vinculos, setConfort, setCalidad, setVinculo } = usePrefsXR();
    const [pestana, setPestana] = useState<Pestana>("calidad");
    const [cons, setCons] = useState<Consentimiento[]>(() => props.consentimientos ?? []);
    const quitar = (c: Consentimiento) => {
        setCons((prev) => prev.filter((x) => !(x.dato === c.dato && x.hasta === c.hasta && x.vence === c.vence)));
        props.alQuitarConsentimiento?.(c);
    };
    return (
        <Container flexDirection="column" gap={8}>
            <Container flexDirection="row" gap={5} flexWrap="wrap">
                {PESTANAS.map(([id, nombre]) => <Opcion key={id} activa={pestana === id} onClick={() => setPestana(id)}>{nombre}</Opcion>)}
            </Container>
            {pestana === "calidad" && <PestanaCalidad nivel={props.nivelActual ?? "media"} motivo={props.motivoCambio ?? null} calidad={calidad.modo} setCalidad={setCalidad} />}
            {pestana === "comodidad" && <PestanaComodidad confort={confort} setConfort={setConfort} />}
            {pestana === "entrada" && <PanelVinculos entrada={props.entrada ?? "mandos"} vinculos={vinculos} setVinculo={setVinculo} />}
            {pestana === "privacidad" && <PestanaPrivacidad consentimientos={cons} ahora={props.ahora ?? Date.now()} alQuitar={quitar} />}
            {pestana === "conexiones" && <PestanaConexiones sala={props.sala ?? null} alcanzabilidad={props.alcanzabilidad ?? { internet: true, servidorPrivado: true, malla: true }} alAbrirServidores={props.alAbrirServidores ?? irAServidores} />}
        </Container>);
}
