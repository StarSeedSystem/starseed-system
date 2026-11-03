"use client";
/** StarSeed XR · CONTENIDO DE LA TRINITY (XR1010AS · §3 a–h): Zenith = OrbeAstraura + FlujoVoz;
 * Horizon = HorizonMontado + Parametros3D; Logic = NodoLogic + UiSpec; Anchor = Dock3D; más menú
 * de mano, mundo validado (zonas/pantallas/pizarras) y presencia/audio. Sin fila de sala no hay
 * presencia ni audio ajenos: no se inventa ninguna. */
import { useEffect, useMemo, useState } from "react";
import { astrauraChat } from "@/ai/astraura/router"; import { candidatosDe } from "@/lib/protomolecula/registro-atomos"; import { controladorActivo } from "@/lib/protomolecula/controlador-activo";
import { validarMundo } from "@/lib/xr/mundo-spec"; import type { MundoSpec } from "@/lib/xr/mundo-tipos"; import type { ModoXR, NivelCalidad } from "@/lib/xr/tipos";
import type { NodoEspacial } from "@/lib/xr/espacio-trinity"; import type { ResultadoPortal } from "@/lib/xr/zonas"; import type { Pose } from "@/lib/vivo/espacial/avatares";
import { leerMundo } from "@/lib/vivo/xr-mundo"; import { AvatarRemotoXR, rangoCercania } from "@/components/vivo/espacial/avatar-remoto-xr"; import { useSesionEscena } from "@/components/vivo/espacial/use-sesion-escena";
import type { ContextoAcciones } from "./acciones-xr"; import type { ContextoCompartir } from "./ejecutor-compartir"; import { refSalaDeUrl, type ContextoMundo } from "./ejecutor-mundo";
import { Dock3D } from "./dock-3d"; import { FlujoVoz } from "./flujo-voz"; import { HorizonMontado } from "./horizon-montado"; import { MenuMano } from "./menu-mano";
import MundoRender from "./mundo-render"; import { NivelCalidadContext } from "./panel-cristal"; import { NodoLogic } from "./nodo-logic"; import { OrbeAstraura } from "./orbe-astraura";
import { Parametros3D } from "./parametros-3d"; import { RigTrinity, type ContenidoNodos } from "./rig-trinity"; import { UiSpec3D } from "./uispec-uikit";
import { usePrefsXR } from "./use-prefs-xr"; import { useAudioEspacial } from "./use-audio-espacial";

export type ClavePieza = "orbe" | "flujo" | "horizon" | "parametros" | "logic" | "dock" | "menu" | "mundo" | "pagina" | "presencia" | "audio";
export interface PropsMontajeTrinity {
    modo: ModoXR; nivel: NivelCalidad; alturaOjosMedida?: number | null; mundo?: MundoSpec | null;
    /** UiSpec que publica Astraura: se pinta en Logic, nunca se ejecuta. */
    pagina?: unknown | null; acciones?: ContextoAcciones | null; menuAbierto?: boolean; omitir?: readonly ClavePieza[];
}
/** El menú viaja pegado a la muñeca: sin desplazamiento extra (contrato §3 a). */
const NODO_MENU: NodoEspacial = {
    id: "menuMano", capa: "cercana", anclaje: "muneca", visible: true, posicion: [0, 0, 0],
    rotacion: { pitch: 0, yaw: 0, roll: 0 }, ancho: 0.16, alto: 0.2, distancia: 0.3,
    azimutDeg: 0, elevacionDeg: 0, curvatura: null,
};
/** Un mundo solo se pinta si `validarMundo` lo acepta; si no, no se finge uno. */
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
/** La fila viva que la URL ya nombra (`?mundo=` o `/sala-xr/<id>`); sin ella no hay presencia. */
function useRefSala(): string | null {
    const [refId, setRefId] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        setRefId(refSalaDeUrl(window.location.pathname, window.location.search));
    }, []);
    return refId;
}
/** El mundo abierto sale de la MISMA fila de la sala que ya lee la voz. */
function useMundoAbierto(refId: string | null): MundoSpec | null {
    const [mundo, setMundo] = useState<MundoSpec | null>(null);
    useEffect(() => {
        if (!refId) return;
        let vivo = true;
        void leerMundo(refId).then((m) => { if (vivo) setMundo(m); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [refId]);
    return mundo;
}
/** Monta la Trinity completa. Solo recibe datos; la decisión vive en los módulos puros. */
export function MontajeTrinity(p: PropsMontajeTrinity) {
    const refId = useRefSala();
    const abierto = useMundoAbierto(refId);
    const nivel = p.nivel;
    const altura = p.alturaOjosMedida ?? 1.6;
    const omitir = p.omitir ?? [];
    const hay = (c: ClavePieza): boolean => !omitir.includes(c);
    const mundo = hay("mundo") ? mundoMontable(p.mundo !== undefined ? p.mundo : abierto) : null;
    const voz = vozPorDefecto(nivel, refId, mundo);
    const controlador = hay("parametros") ? controladorActivo() : null;
    const contenido: Partial<ContenidoNodos> = {
        zenith: (<>{hay("orbe") && <OrbeAstraura />}{hay("flujo") && <FlujoVoz mundo={voz.mundo} compartir={voz.compartir} nivel={nivel} />}</>),
        horizon: (<>{hay("horizon") && <HorizonMontado />}{controlador && <Parametros3D controlador={controlador} candidatos={candidatosDe(controlador.obtener().molecula)} />}</>),
        logic: (<>{hay("logic") && <NodoLogic nivelActual={nivel} />}{hay("pagina") && p.pagina != null && <UiSpec3D spec={p.pagina} />}</>),
        anchor: hay("dock") ? <Dock3D alturaOjos={altura} modo={p.modo} nivel={nivel} /> : null,
    };
    const alIr = (d: ResultadoPortal): void => { if (d.tipo === "ruta") window.location.assign(d.ruta); };
    return (
        <NivelCalidadContext.Provider value={nivel}>
            <RigTrinity modo={p.modo} nivel={nivel} alturaOjosMedida={p.alturaOjosMedida} contenido={contenido} />
            {hay("menu") && p.acciones && <MenuMano nodo={NODO_MENU} contexto={p.acciones} nivel={nivel} abierto={p.menuAbierto} />}
            {mundo !== null && <MundoRender mundo={mundo} nivel={nivel} alIr={alIr} />}
            {(hay("presencia") || hay("audio")) && <CapaViva nivel={nivel} refId={refId} presencia={hay("presencia")} audio={hay("audio")} />}
        </NivelCalidadContext.Provider>
    );
}
/** Presencia y audio espacial (§3 h): sin fila de sala no hay avatares ni fuentes que sonar. */
const SIN_POSES = new Map<string, { pose: Pose; recibida: number }>();
function CapaViva({ nivel, refId, presencia, audio }: { nivel: NivelCalidad; refId: string | null; presencia: boolean; audio: boolean }) {
    const { confort } = usePrefsXR();
    const { sesion, avatares, adns } = useSesionEscena(refId ? { tipo: "espacio", id: refId } : null);
    const poses = sesion?.poses; const otros = avatares.otros;
    const rangos = useMemo(() => rangoCercania(null, otros, (a) => poses?.get(a.clave)?.pose.p ?? null), [otros, poses]);
    const posesAudio = useMemo(() => otros.flatMap((a) => { const p = poses?.get(a.clave)?.pose.p; return p ? [{ id: a.clave, pos: p }] : []; }), [otros, poses]);
    useAudioEspacial({ nivel, salaId: audio ? refId ?? "xr-os" : "", poses: audio ? posesAudio : [] });
    if (!presencia || !refId) return null;
    return <>{otros.map((a, i) => (
        <AvatarRemotoXR key={a.clave} meta={a} poses={poses ?? SIN_POSES} nivel={nivel}
            jugadoresVisibles={rangos.get(a.clave) ?? i} reducido={confort.movimientoReducido}
            adn={a.adnRef ? adns[a.adnRef] ?? null : null} />
    ))}</>;
}
export default MontajeTrinity;
