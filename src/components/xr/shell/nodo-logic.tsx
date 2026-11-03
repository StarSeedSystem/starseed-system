"use client";
/**
 * StarSeed XR · NODO LOGIC (XR1010AG · contrato `architecture/starseed-xr.md` §3 a, b, d, e, j, k).
 * Contenido del nodo de control (este): calidad, comodidad, entrada, privacidad y conexiones.
 * Todo escribe con `usePrefsXR` (XR1010C) y se ve al instante. Colores sólo de `tokens-3d.ts`.
 * El montaje dentro del panel de Logic lo hace XR1010AS.
 */
import { useState, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import { NIVELES_CALIDAD, type EntradaXR, type NivelCalidad } from "../../../lib/xr/tipos";
import { ANGULOS_SALTO, type PreferenciasConfort } from "../../../lib/xr/confort";
import { CLASES_DATO, POLITICA, type ClaseDato, type Consentimiento, type Destino } from "../../../lib/xr/privacidad";
import { elegirTransporte, type Alcanzabilidad, type Sala, type TransporteSala } from "@/lib/salas/sala";
import { usePrefsXR } from "./use-prefs-xr";
import { PanelVinculos, type PropsPanelVinculos } from "./panel-vinculos";

const ACENTO = COLORES_NODO.logic, SECUNDARIO = CRISTAL.textoSecundario;
const NIVEL: Record<NivelCalidad, string> = { minima: "Mínima", baja: "Baja", media: "Media", alta: "Alta", maxima: "Máxima" };
const TRANSPORTE: Record<TransporteSala, string> = { "servidor-publico": "Servidor público", "servidor-privado": "Servidor privado", "malla-p2p": "Malla P2P", local: "Sólo este aparato" };
const PESTANAS = [["calidad", "Calidad"], ["comodidad", "Comodidad"], ["entrada", "Entrada"], ["privacidad", "Privacidad"], ["conexiones", "Conexiones"]] as const;
type Pestana = (typeof PESTANAS)[number][0];

export interface FilaPrivacidad { dato: ClaseDato; motivo: string; hasta: Destino; nuncaSale: boolean }
/** La política como tabla legible; la cámara y la mirada se marcan como lo que son: nunca salen. */
export function resumenPrivacidad(): FilaPrivacidad[] {
    return CLASES_DATO.map((dato) => {
        const r = POLITICA[dato];
        return { dato, motivo: r.motivo, hasta: r.conConsentimiento ?? r.libre, nuncaSale: r.conConsentimiento === null && r.libre === "dispositivo" };
    });
}
export const consentimientoVigente = (c: Consentimiento, ahora: number): boolean => c.vence > ahora;
export function caducidadLegible(vence: number, ahora: number): string {
    const minutos = Math.max(0, Math.ceil((vence - ahora) / 60_000));
    return minutos >= 60 ? `${Math.ceil(minutos / 60)} h` : `${minutos} min`;
}

const Boton = ({ children, alPulsar, activo }: { children: ReactNode; alPulsar: () => void; activo?: boolean }) => (
    <Container padding={4} borderRadius={6} cursor="pointer" backgroundColor={activo ? ACENTO.base : undefined} onClick={alPulsar}><Text color={CRISTAL.texto} fontSize={9}>{children}</Text></Container>);
const Fila = ({ etiqueta, children }: { etiqueta: string; children?: ReactNode }) => (
    <Container flexDirection="column" gap={2}><Text color={SECUNDARIO} fontSize={9}>{etiqueta}</Text><Container flexDirection="row" gap={4}>{children}</Container></Container>);

export interface PropsNodoLogic {
    nivelActual?: NivelCalidad; motivoUltimoCambio?: string | null;
    entradaActual?: EntradaXR; capturarGatillo?: PropsPanelVinculos["capturarGatillo"];
    /** Sala abierta y caminos disponibles: el transporte se decide con `elegirTransporte`. */
    sala?: Sala | null; alcanzabilidad?: Alcanzabilidad;
    consentimientos?: readonly Consentimiento[]; alQuitarConsentimiento?: (c: Consentimiento) => void;
    /** Navegación 2D a `/servidores`; por defecto `window.location.assign`. */
    alAbrirServidores?: () => void;
}

export function NodoLogic(props: PropsNodoLogic) {
    const { confort: c, calidad, setConfort, setCalidad } = usePrefsXR();
    const [pestana, setPestana] = useState<Pestana>("calidad");
    const set = (p: Partial<PreferenciasConfort>) => setConfort({ ...c, ...p });
    const ahora = Date.now();
    const nivel = props.nivelActual ?? (calidad.modo === "auto" ? "media" : calidad.modo);
    const transporte = props.sala ? elegirTransporte(props.sala, props.alcanzabilidad ?? { internet: true, servidorPrivado: false, malla: false }) : null;
    const vigentes = (props.consentimientos ?? []).filter((x) => consentimientoVigente(x, ahora));
    const abrirServidores = props.alAbrirServidores ?? (() => window.location.assign("/servidores"));
    const escala = (d: number) => set({ escala: Math.min(1.5, Math.max(0.8, Math.round((c.escala + d) * 10) / 10)) });
    const altura = (d: number) => set({ alturaOjos: Math.min(2.1, Math.max(0.8, Math.round(((c.alturaOjos ?? 1.6) + d) * 100) / 100)) });
    return (
        <Container flexDirection="column" gap={8}>
            <Text color={ACENTO.vivo} fontSize={12}>Logic · control</Text>
            <Container flexDirection="row" gap={6}>
                {PESTANAS.map(([id, nombre]) => (
                    <Container key={id} padding={4} borderRadius={8} cursor="pointer" backgroundColor={pestana === id ? ACENTO.base : undefined} onClick={() => setPestana(id)}>
                        <Text color={CRISTAL.texto} fontSize={10}>{nombre}</Text>
                    </Container>
                ))}
            </Container>
            {pestana === "calidad" && (
                <Container flexDirection="column" gap={4}>
                    <Text color={CRISTAL.texto} fontSize={10}>Modo {calidad.modo === "auto" ? "automático" : "fijo"} · nivel actual: {NIVEL[nivel]}.</Text>
                    <Fila etiqueta="Calidad"><Boton activo={calidad.modo === "auto"} alPulsar={() => setCalidad({ modo: "auto" })}>Auto</Boton>{NIVELES_CALIDAD.map((n) => <Boton key={n} activo={calidad.modo === n} alPulsar={() => setCalidad({ modo: n })}>{NIVEL[n]}</Boton>)}</Fila>
                    <Text color={SECUNDARIO} fontSize={9}>{props.motivoUltimoCambio ?? "Sin cambios recientes: la calidad la fija el aparato."}</Text>
                </Container>
            )}
            {pestana === "comodidad" && (
                <Container flexDirection="column" gap={4}>
                    <Fila etiqueta="Giro"><Boton activo={c.giro === "saltos"} alPulsar={() => set({ giro: "saltos" })}>Por saltos</Boton><Boton activo={c.giro === "continuo"} alPulsar={() => set({ giro: "continuo" })}>Continuo</Boton></Fila>
                    <Fila etiqueta="Ángulo de giro">{ANGULOS_SALTO.map((a) => <Boton key={a} activo={c.anguloSalto === a} alPulsar={() => set({ anguloSalto: a })}>{a}°</Boton>)}</Fila>
                    <Fila etiqueta="Viñeta">{(["auto", "siempre", "nunca"] as const).map((v) => <Boton key={v} activo={c.vineta === v} alPulsar={() => set({ vineta: v })}>{v}</Boton>)}</Fila>
                    <Fila etiqueta="Subtítulos"><Boton activo={c.subtitulos} alPulsar={() => set({ subtitulos: !c.subtitulos })}>{c.subtitulos ? "Sí" : "No"}</Boton></Fila>
                    <Fila etiqueta="Movimiento reducido"><Boton activo={c.movimientoReducido} alPulsar={() => set({ movimientoReducido: !c.movimientoReducido })}>{c.movimientoReducido ? "Sí" : "No"}</Boton></Fila>
                    <Fila etiqueta="Contraste alto"><Boton activo={c.contrasteAlto} alPulsar={() => set({ contrasteAlto: !c.contrasteAlto })}>{c.contrasteAlto ? "Sí" : "No"}</Boton></Fila>
                    <Fila etiqueta="Reducir transparencias"><Boton activo={c.reducirTransparencia} alPulsar={() => set({ reducirTransparencia: !c.reducirTransparencia })}>{c.reducirTransparencia ? "Sí" : "No"}</Boton></Fila>
                    <Fila etiqueta="Postura">{(["de-pie", "sentado", "una-mano"] as const).map((p) => <Boton key={p} activo={c.postura === p} alPulsar={() => set({ postura: p })}>{p}</Boton>)}</Fila>
                    <Fila etiqueta="Mano dominante">{(["izquierda", "derecha"] as const).map((m) => <Boton key={m} activo={c.manoDominante === m} alPulsar={() => set({ manoDominante: m })}>{m}</Boton>)}</Fila>
                    <Fila etiqueta={`Escala ${c.escala.toFixed(1)}`}><Boton alPulsar={() => escala(-0.1)}>−</Boton><Boton alPulsar={() => escala(0.1)}>+</Boton></Fila>
                    <Fila etiqueta={`Altura de ojos ${c.alturaOjos === null ? "automática" : `${c.alturaOjos.toFixed(2)} m`}`}><Boton activo={c.alturaOjos === null} alPulsar={() => set({ alturaOjos: null })}>Auto</Boton><Boton alPulsar={() => altura(-0.05)}>−</Boton><Boton alPulsar={() => altura(0.05)}>+</Boton></Fila>
                </Container>
            )}
            {pestana === "entrada" && <PanelVinculos entrada={props.entradaActual ?? "mandos"} capturarGatillo={props.capturarGatillo} />}
            {pestana === "privacidad" && (
                <Container flexDirection="column" gap={3}>
                    {resumenPrivacidad().map((f) => <Text key={f.dato} color={CRISTAL.texto} fontSize={9}>{f.dato} · {f.nuncaSale ? "nunca sale del aparato" : `hasta ${f.hasta}`} — {f.motivo}</Text>)}
                    <Text color={ACENTO.vivo} fontSize={10}>Consentimientos vigentes ({vigentes.length})</Text>
                    {vigentes.length === 0 ? <Text color={SECUNDARIO} fontSize={9}>Ninguno.</Text> : vigentes.map((x) => (
                        <Container key={`${x.dato}-${x.vence}`} flexDirection="row" gap={4} alignItems="center">
                            <Text color={CRISTAL.texto} fontSize={9}>{x.dato} → {x.hasta} · vence en {caducidadLegible(x.vence, ahora)}</Text>
                            {props.alQuitarConsentimiento && <Boton alPulsar={() => props.alQuitarConsentimiento?.(x)}>Quitar</Boton>}
                        </Container>
                    ))}
                </Container>
            )}
            {pestana === "conexiones" && (
                <Container flexDirection="column" gap={4}>
                    {transporte ? <><Text color={CRISTAL.texto} fontSize={10}>Transporte actual: {TRANSPORTE[transporte.transporte]}</Text><Text color={SECUNDARIO} fontSize={9}>{transporte.motivo}</Text></> : <Text color={SECUNDARIO} fontSize={9}>No hay ninguna sala abierta ahora mismo.</Text>}
                    <Boton alPulsar={abrirServidores}>Ir a servidores</Boton>
                </Container>
            )}
        </Container>
    );
}

// Cableado en el árbol de Logic: pendiente de XR1010AS.
