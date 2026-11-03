"use client";
/**
 * StarSeed XR · NODO LOGIC (este de la Trinity) — XR1010AG · contrato §3 d, e, j y k. Cinco
 * pestañas: calidad (Auto o nivel fijo, nivel vigente y motivo del último cambio), comodidad
 * (`sanearConfort`), entrada (`PanelVinculos`), privacidad (`POLITICA` y consentimientos) y
 * conexiones (`elegirTransporte` y /servidores). Escribe con `usePrefsXR`; XR1010AS lo monta.
 */
import { useState, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import { ANGULOS_SALTO, type PreferenciasConfort } from "@/lib/xr/confort";
import { acotar, NIVELES_CALIDAD, type EntradaXR, type Mano, type NivelCalidad, type Postura } from "@/lib/xr/tipos";
import { CLASES_DATO, POLITICA, type ClaseDato, type Consentimiento } from "@/lib/xr/privacidad";
import { elegirTransporte, type Alcanzabilidad, type Sala } from "@/lib/salas/sala";
import { COLORES_NODO, CRISTAL } from "@/lib/xr/tokens-3d";
import { usePrefsXR } from "./use-prefs-xr";
import { PanelVinculos } from "./panel-vinculos";

const ACENTO = COLORES_NODO.logic, SECUNDARIO = CRISTAL.textoSecundario, PESTANAS = ["Calidad", "Comodidad", "Entrada", "Privacidad", "Conexiones"] as const;
type Pestana = (typeof PESTANAS)[number];
const NOMBRES_NIVEL: Record<NivelCalidad, string> = { minima: "Mínima", baja: "Baja", media: "Media", alta: "Alta", maxima: "Máxima" }, NOMBRES_POSTURA: Record<Postura, string> = { "de-pie": "De pie", sentado: "Sentado", "una-mano": "Una mano" };
const NOMBRES_DATO: Record<ClaseDato, string> = {
    "camara-passthrough": "Cámara del passthrough", "mapa-sala": "Mapa de la habitación", mirada: "Mirada", "manos-articulaciones": "Articulaciones de las manos",
    biometria: "Biometría", "ubicacion-fisica": "Ubicación física", "voz-audio": "Voz (audio)", "voz-texto": "Voz (texto dictado)", "pose-avatar": "Pose del avatar", avatar: "Avatar", "mundo-spec": "Mundo (MundoSpec)",
};
const TODO_ALCANZABLE: Alcanzabilidad = { internet: true, servidorPrivado: true, malla: true };
const TOGGLES = [["subtitulos", "Subtítulos"], ["movimientoReducido", "Movimiento reducido"], ["contrasteAlto", "Contraste alto"], ["reducirTransparencia", "Reducir transparencias"]] as const;

function Boton({ children, activo, onClick }: { children: ReactNode; activo?: boolean; onClick: () => void }) {
    return <Container padding={3} borderRadius={6} cursor="pointer" backgroundColor={activo ? ACENTO.base : undefined} onClick={onClick}><Text color={activo ? CRISTAL.texto : SECUNDARIO} fontSize={9}>{children}</Text></Container>;
}

export interface PropiedadesNodoLogic {
    entrada?: EntradaXR;
    nivelActual?: NivelCalidad;
    motivoUltimoCambio?: string;
    consentimientos?: readonly Consentimiento[];
    alQuitarConsentimiento?: (c: Consentimiento) => void;
    sala?: Sala;
    alcanzabilidad?: Alcanzabilidad;
    alAbrirServidores?: () => void;
}

export function NodoLogic({
    entrada = "mandos", nivelActual = "media", motivoUltimoCambio = "Sin cambios desde que entraste.",
    consentimientos = [], alQuitarConsentimiento, sala, alcanzabilidad, alAbrirServidores,
}: PropiedadesNodoLogic) {
    const { confort, calidad, vinculos, setConfort, setCalidad, setVinculo } = usePrefsXR();
    const [pestana, setPestana] = useState<Pestana>("Calidad");
    const [retirados, setRetirados] = useState<string[]>([]);
    const ahora = Date.now();
    const clave = (c: Consentimiento): string => `${c.dato}|${c.hasta}|${c.vence}`;
    const vigentes = consentimientos.filter((c) => c.vence > ahora && !retirados.includes(clave(c)));
    const poner = (t: Partial<PreferenciasConfort>): void => setConfort({ ...confort, ...t });
    const nivel = calidad.modo === "auto" ? nivelActual : calidad.modo;
    const transporte = sala ? elegirTransporte(sala, alcanzabilidad ?? TODO_ALCANZABLE) : null;
    const abrirServidores = alAbrirServidores ?? ((): void => { if (typeof window !== "undefined") window.location.assign("/servidores"); });
    return (
        <Container flexDirection="column" gap={8}>
            <Container flexDirection="row" gap={4} flexWrap="wrap">{PESTANAS.map((p) => <Boton key={p} activo={pestana === p} onClick={() => setPestana(p)}>{p}</Boton>)}</Container>
            {pestana === "Calidad" && (<Container flexDirection="column" gap={4}>
                <Text color={CRISTAL.texto} fontSize={10}>Nivel actual: {NOMBRES_NIVEL[nivel]}{calidad.modo === "auto" ? " (automático)" : " (fijo)"}</Text>
                <Text color={SECUNDARIO} fontSize={9}>Último cambio: {motivoUltimoCambio}</Text>
                <Container flexDirection="row" gap={3} flexWrap="wrap">
                    <Boton activo={calidad.modo === "auto"} onClick={() => setCalidad({ modo: "auto" })}>Auto</Boton>
                    {NIVELES_CALIDAD.map((n) => <Boton key={n} activo={calidad.modo === n} onClick={() => setCalidad({ modo: n })}>{NOMBRES_NIVEL[n]}</Boton>)}
                </Container>
            </Container>)}
            {pestana === "Comodidad" && (<Container flexDirection="column" gap={4}>
                    <Text color={CRISTAL.texto} fontSize={9}>Giro por saltos o continuo</Text>
                    <Container flexDirection="row" gap={3}>{(["saltos", "continuo"] as const).map((g) => <Boton key={g} activo={confort.giro === g} onClick={() => poner({ giro: g })}>{g}</Boton>)}</Container>
                    <Container flexDirection="row" gap={3} flexWrap="wrap">{ANGULOS_SALTO.map((a) => <Boton key={a} activo={confort.anguloSalto === a} onClick={() => poner({ anguloSalto: a })}>{a}°</Boton>)}</Container>
                    <Text color={CRISTAL.texto} fontSize={9}>Viñeta</Text>
                    <Container flexDirection="row" gap={3}>{(["auto", "siempre", "nunca"] as const).map((v) => <Boton key={v} activo={confort.vineta === v} onClick={() => poner({ vineta: v })}>{v}</Boton>)}</Container>
                    <Container flexDirection="row" gap={3} flexWrap="wrap">{TOGGLES.map(([claveConfort, etiqueta]) => <Boton key={claveConfort} activo={confort[claveConfort]} onClick={() => poner({ [claveConfort]: !confort[claveConfort] })}>{etiqueta}: {confort[claveConfort] ? "Sí" : "No"}</Boton>)}</Container>
                    <Container flexDirection="row" gap={3} flexWrap="wrap">
                        {(Object.keys(NOMBRES_POSTURA) as Postura[]).map((p) => <Boton key={p} activo={confort.postura === p} onClick={() => poner({ postura: p })}>{NOMBRES_POSTURA[p]}</Boton>)}
                        {(["izquierda", "derecha"] as Mano[]).map((m) => <Boton key={m} activo={confort.manoDominante === m} onClick={() => poner({ manoDominante: m })}>Mano {m}</Boton>)}
                    </Container>
                    <Container flexDirection="row" gap={3} alignItems="center">
                        <Text color={CRISTAL.texto} fontSize={9}>Escala {confort.escala.toFixed(1).replace(".", ",")}</Text>
                        <Boton onClick={() => poner({ escala: acotar(confort.escala - 0.1, 0.8, 1.5) })}>−</Boton>
                        <Boton onClick={() => poner({ escala: acotar(confort.escala + 0.1, 0.8, 1.5) })}>+</Boton>
                    </Container>
                    <Container flexDirection="row" gap={3} flexWrap="wrap">
                        <Text color={CRISTAL.texto} fontSize={9}>Altura de ojos: {confort.alturaOjos === null ? "la que mide el visor" : `${confort.alturaOjos.toFixed(2).replace(".", ",")} m`}</Text>
                        {([null, 1.6, 1.7, 1.8] as const).map((h) => <Boton key={String(h)} activo={confort.alturaOjos === h} onClick={() => poner({ alturaOjos: h })}>{h === null ? "Auto" : `${h.toFixed(1).replace(".", ",")} m`}</Boton>)}
                    </Container>
                </Container>)}
            {pestana === "Entrada" && <PanelVinculos key={entrada} entrada={entrada} mapaInicial={vinculos[entrada]} alGuardar={(m) => setVinculo({ ...vinculos, [entrada]: m })} />}
            {pestana === "Privacidad" && (<Container flexDirection="column" gap={4}>
                {CLASES_DATO.map((d) => (
                    <Container key={d} flexDirection="column" gap={1}>
                        <Text color={CRISTAL.texto} fontSize={9}>{NOMBRES_DATO[d]}</Text>
                        <Text color={SECUNDARIO} fontSize={8}>{POLITICA[d].motivo}</Text>
                        {d === "camara-passthrough" && <Text color={ACENTO.vivo} fontSize={8}>Nunca sale del aparato</Text>}
                    </Container>
                ))}
                <Text color={CRISTAL.texto} fontSize={9}>Consentimientos vigentes</Text>
                {vigentes.length === 0 && <Text color={SECUNDARIO} fontSize={8}>Ninguno vigente.</Text>}
                {vigentes.map((c) => (
                    <Container key={clave(c)} flexDirection="row" gap={4} alignItems="center">
                        <Text color={SECUNDARIO} fontSize={8}>{`Consentimiento: ${c.dato} → ${c.hasta} · vence ${new Date(c.vence).toLocaleString("es")}`}</Text>
                        <Boton onClick={() => { setRetirados([...retirados, clave(c)]); alQuitarConsentimiento?.(c); }}>Quitar</Boton>
                    </Container>
                ))}
            </Container>)}
            {pestana === "Conexiones" && (<Container flexDirection="column" gap={4}>
                {transporte ? (
                    <Container flexDirection="column" gap={1}>
                        <Text color={CRISTAL.texto} fontSize={9}>Transporte actual: {transporte.transporte}</Text>
                        <Text color={SECUNDARIO} fontSize={8}>{transporte.motivo}</Text>
                    </Container>
                ) : <Text color={SECUNDARIO} fontSize={9}>Aún no hay una sala abierta en el visor.</Text>}
                <Boton onClick={abrirServidores}>Abrir /servidores</Boton>
            </Container>            )}
        </Container>
    );
}

export default NodoLogic;
