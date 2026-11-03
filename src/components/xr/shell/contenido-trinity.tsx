"use client";
/** StarSeed XR · CONTENIDO DE LA TRINITY (XR1010AS · §3 a–h): Zenith (OrbeAstraura + FlujoVoz), Horizonte
 * (NodoHorizon + Parametros3D), Logic, Anchor (Dock3D), menú de mano y mundo/zonas/pantallas/pizarras. */
import { useEffect, useMemo, useState } from "react";
import type { ModoXR, NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import { validarMundo } from "@/lib/xr/mundo-spec";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import type { NodoEspacial } from "@/lib/xr/espacio-trinity";
import type { ResultadoPortal } from "@/lib/xr/zonas";
import type { Controlador } from "@/lib/protomolecula/controlador";
import type { CandidatoParametro } from "@/lib/protomolecula/tipos";
import type { ConexionEscena } from "@/lib/vivo/espacial/canal";
import { astrauraChat } from "@/ai/astraura/router";
import { NivelCalidadContext } from "./panel-cristal"; import { RigTrinity, type ContenidoNodos } from "./rig-trinity";
import { OrbeAstraura } from "./orbe-astraura"; import { FlujoVoz } from "./flujo-voz";
import { NodoHorizon } from "./nodo-horizon";
import { Parametros3D } from "./parametros-3d";
import { NodoLogic } from "./nodo-logic";
import { Dock3D } from "./dock-3d";
import { MenuMano } from "./menu-mano";
import { UiSpec3D } from "./uispec-uikit";
import MundoRender from "./mundo-render";
import { ZonasPortales } from "./zonas-portales";
import { Pantalla3D } from "./pantalla-3d"; import { Pizarra3D } from "./pizarra-3d";
import { AvatarXR, type PoseAvatarXR } from "./avatar-xr"; import { protegerConexion } from "./guardia-privacidad";
import { useAudioEspacial } from "./use-audio-espacial"; import type { ContextoAcciones } from "./acciones-xr";
import type { ContextoMundo } from "./ejecutor-mundo"; import type { ContextoCompartir } from "./ejecutor-compartir"; import type { ItemDestino } from "./destinos";

export type ClavePieza = "orbe" | "flujo" | "horizonte" | "parametros" | "logic" | "dock" | "menu" | "mundo" | "pantallas" | "presencia" | "audio";
export interface MiembroVisible { id: string; pose: PoseAvatarXR; color: string; preferencia?: { vrmUrl?: string } | null }
export interface PropsMontajeTrinity {
    modo: ModoXR; nivel: NivelCalidad; alturaOjos?: number; mundo?: MundoSpec | null; mundoRefId?: string | null; yo?: string | null;
    pagina?: unknown | null; acciones?: ContextoAcciones | null; menuAbierto?: boolean; controlador?: Controlador | null; candidatos?: readonly CandidatoParametro[];
    conexion?: ConexionEscena | null; jugadores?: readonly MiembroVisible[]; alIr?: (destino: ItemDestino) => void; alDictar?: (frase: string) => void; alAbrirApp?: (id: string) => void;
    voz?: { mundo: ContextoMundo; compartir: ContextoCompartir } | null; omitir?: readonly ClavePieza[];
}

/** El menú viaja pegado a la muñeca: sin desplazamiento extra (contrato §3 a). */
const NODO_MENU: NodoEspacial = {
    id: "menuMano", capa: "cercana", anclaje: "muneca", visible: true, posicion: [0, 0, 0],
    rotacion: { pitch: 0, yaw: 0, roll: 0 }, ancho: 0.16, alto: 0.2, distancia: 0.3,
    azimutDeg: 0, elevacionDeg: 0, curvatura: null,
};

/** Valida y devuelve el mundo que se puede montar; `null` si no hay o no es válido. */
export function mundoMontable(m: MundoSpec | null | undefined): MundoSpec | null {
    if (!m) return null;
    const r = validarMundo(m);
    return r.ok ? r.mundo : null;
}

/** Lo que no está conectado en `/xr/os` lo dice: nunca finge éxito. */
const DEPENDENCIAS_SIN_CUENTA = {
    sala: null, miembrosDeGrupo: async () => [], concederAcceso: async () => 0, enviarMensaje: async () => 0,
    guardarBiblioteca: async () => ({ ok: false, error: "La Biblioteca no está conectada en este montaje." }),
    subirEstacion: async () => ({ ok: false, error: "Las estaciones no están conectadas en este montaje." }),
    publicar: async () => ({ ok: false, error: "Publicar no está conectado en este montaje." }),
};

/** Voz por defecto: crear/editar mundos sí; lo que sale de la cuenta avisa honesto. */
function vozPorDefecto(nivel: NivelCalidad, refId: string | null, mundo: MundoSpec | null) {
    const contextoMundo: ContextoMundo = {
        nivel, mundoActual: refId && mundo ? { refId, mundo } : null,
        razonar: (prompt) => astrauraChat({ messages: [{ role: "user", content: prompt }], taskHint: "reasoning", temperature: 0.2 }).then((r) => r.text),
    };
    const compartir: ContextoCompartir = { refId: refId ?? "", usuario: "", ahora: Date.now(), consentimientos: [], deps: DEPENDENCIAS_SIN_CUENTA };
    return { mundo: contextoMundo, compartir };
}

/** Monta la Trinity completa. Solo recibe datos; la decisión vive en los módulos puros de cada pieza. */
export function MontajeTrinity(p: PropsMontajeTrinity) {
    const nivel = p.nivel, altura = p.alturaOjos ?? 1.6, omitir = p.omitir ?? [];
    const hay = (c: ClavePieza): boolean => !omitir.includes(c);
    const mundo = hay("mundo") ? mundoMontable(p.mundo) : null;
    const voz = p.voz === null ? null : p.voz ?? vozPorDefecto(nivel, p.mundoRefId ?? null, mundo);
    const contenido: Partial<ContenidoNodos> = {
        zenith: hay("orbe") || (hay("flujo") && voz !== null) ? (<>{hay("orbe") && <OrbeAstraura />}{hay("flujo") && voz !== null && <FlujoVoz mundo={voz.mundo} compartir={voz.compartir} nivel={nivel} />}</>) : null,
        horizon: (<>{hay("horizonte") && <NodoHorizon yo={p.yo ?? ""} alIr={p.alIr ?? (() => undefined)} alDictar={p.alDictar} />}{hay("parametros") && p.controlador && <Parametros3D controlador={p.controlador} candidatos={[...(p.candidatos ?? [])]} />}</>),
        logic: (<>{hay("logic") && <NodoLogic nivelActual={nivel} />}{p.pagina != null && <UiSpec3D spec={p.pagina} />}</>),
        anchor: hay("dock") ? <Dock3D alturaOjos={altura} modo={p.modo} nivel={nivel} abrir={p.alAbrirApp} /> : null,
    };
    return (
        <NivelCalidadContext.Provider value={nivel}>
            <RigTrinity modo={p.modo} nivel={nivel} alturaOjosMedida={p.alturaOjos ?? null} contenido={contenido} />
            {hay("menu") && p.acciones && <MenuMano nodo={NODO_MENU} contexto={p.acciones} nivel={nivel} abierto={p.menuAbierto} />}
            {mundo !== null && (
                <>
                    <MundoRender mundo={{ ...mundo, zonas: [], portales: [], pantallas: [], pizarras: [] }} nivel={nivel} posicion={[0, altura, 0]} />
                    <ZonasPortales posicion={[0, altura, 0]} zonas={mundo.zonas} portales={mundo.portales} alIr={(d: ResultadoPortal) => { if (d.tipo === "ruta") window.location.assign(d.ruta); }} />
                    {hay("pantallas") && mundo.pantallas.map((pantalla) => <Pantalla3D key={pantalla.id} pantalla={pantalla} capas={false} alSalir2D={(r) => window.location.assign(r)} />)}
                    {hay("pantallas") && mundo.pizarras.map((pizarra) => <Pizarra3D key={pizarra.id} pizarra={pizarra} sala={null} usuarioId={p.yo ?? null} />)}
                </>
            )}
            {hay("audio") && <CapaAudio nivel={nivel} salaId={p.mundoRefId ?? mundo?.nombre ?? "xr-os"} jugadores={p.jugadores ?? []} />}
            {hay("presencia") && p.conexion && p.yo && <CapaPresencia yo={p.yo} conexion={p.conexion} jugadores={p.jugadores ?? []} nivel={nivel} />}
        </NivelCalidadContext.Provider>
    );
}

/** Audio espacial (§3 h): el motor nace con el primer gesto; sin fuentes no suena nada. */
function CapaAudio({ nivel, salaId, jugadores }: { nivel: NivelCalidad; salaId: string; jugadores: readonly MiembroVisible[] }) {
    const poses = jugadores.map((j) => ({ id: j.id, pos: [j.pose.cabeza.p[0], j.pose.cabeza.p[1], j.pose.cabeza.p[2]] as Vec3 }));
    useAudioEspacial({ nivel, salaId, poses });
    return null;
}

/** Presencia y avatares (§3 h): la conexión pasa SIEMPRE por el guardián de privacidad (§3 k). */
function CapaPresencia({ yo, conexion, jugadores, nivel }: { yo: string; conexion: ConexionEscena; jugadores: readonly MiembroVisible[]; nivel: NivelCalidad }) {
    const [conectados, setConectados] = useState<readonly string[]>([]);
    const protegida = useMemo(() => protegerConexion(conexion, { destino: "sala-publica", consentimientos: () => [], ahora: () => Date.now(), alBloquear: () => undefined }), [conexion]);
    useEffect(() => {
        const quitar = protegida.onPresencia((estado) => {
            const ids = Array.isArray(estado.jugadores) ? estado.jugadores.map((j) => (j as { id?: unknown }).id).filter((id): id is string => typeof id === "string") : [];
            setConectados(ids);
        });
        return () => { quitar(); };
    }, [protegida]);
    return <>{jugadores.filter((j) => j.id !== yo && (conectados.length === 0 || conectados.includes(j.id))).map((j) => <AvatarXR key={j.id} pose={j.pose} nivel={nivel} preferencia={j.preferencia ?? null} color={j.color} />)}</>;
}
