"use client";

/**
 * StarSeed XR · NODO HORIZON (XR1010AO · contrato §3 a/h). Contenido del nodo
 * Horizon en tres pestañas: «Crear» (plantillas y «Dime cómo es tu mundo», con la
 * voz de XR1010P/T), «Destinos» (los servicios REALES en una sola pasada; tocar
 * uno llama a `alIr`, donde la confirmación de espacio público es de XR1010X) y
 * «Biblioteca» (listarMiosXr). Sin cableado se dice «próximamente: <motivo>».
 */

import { useEffect, useState } from "react";
import { Container } from "@react-three/uikit";
import { CRISTAL, type NodoCardinal } from "@/lib/xr/tokens-3d";
import { fetchGroups } from "@/lib/os-social";
import { PLANTILLAS } from "@/lib/salas/plantillas-sala";
import { listarEstaciones } from "@/lib/estaciones/datos";
import { listServers } from "@/lib/servers/app-servers";
import { listarMiosXr } from "@/lib/vivo/xr";
import { listarEscenasCompartidas, usuarioActual } from "@/lib/vivo/espacial/persistencia";
import { Texto3D } from "./panel-cristal";
import { destinoDeEstacion, destinoDeGrupo, destinoDeMundo, destinoDeSala, destinoDeServidor, listarDestinos, type CategoriaDestino, type GrupoDestinos, type ItemDestino } from "./destinos";

export interface DestinoActivo {
    categoria: CategoriaDestino; id: string; nombre: string;
    /** «Público», «Privado» o «De tu grupo»; XR1010X la lee para confirmar. */
    etiqueta: string; privado: boolean;
}

export interface PropsNodoHorizon {
    nodo?: NodoCardinal;
    /** Toca un destino: XR1010AS cablea aquí la confirmación de espacio público (XR1010X). */
    alIr: (destino: DestinoActivo) => void;
    alDictar?: () => void;            /* la voz de XR1010P/T */
    alCrear?: (plantillaId: string) => void;   /* ejecutores de XR1010T */
    alElegir?: (refId: string) => void;        /* Protomolécula XR1010AP */
    distancia?: number;
}

type NodoBiblioteca = { refId: string; titulo: string; ruta: string };
const PESTANNAS = [{ id: "crear", etiqueta: "Crear" }, { id: "destinos", etiqueta: "Destinos" }, { id: "biblioteca", etiqueta: "Biblioteca" }] as const;
const TITULO: Record<CategoriaDestino, string> = { "mis-mundos": "Mis mundos", "estaciones-en-vivo": "Estaciones en vivo", servidores: "Servidores", grupos: "Grupos" };
const VIA: Record<ItemDestino["transporte"], string> = { "servidor-publico": "servidor público", "servidor-privado": "servidor privado", "malla-p2p": "malla P2P", local: "solo en este aparato", desconocido: "" };

/** Botón de fila de cristal: principal, secundario opcional («próximamente: …») y acción. Sin acción no se pinta clicable. */
function BotonItem({ principal, secundario, distancia, onClick }: { principal: string; secundario?: string; distancia: number; onClick?: () => void }) {
    return (
        <Container onClick={onClick} cursor={onClick ? "pointer" : "default"} backgroundColor={CRISTAL.fondoB.color} padding={2} flexDirection="column" gap={1}>
            <Texto3D distancia={distancia}>{principal}</Texto3D>
            {secundario ? <Texto3D distancia={distancia} tono="textoSecundario">{secundario}</Texto3D> : null}
        </Container>
    );
}

export function NodoHorizon({ alIr, alDictar, alCrear, alElegir, distancia = 0.6 }: PropsNodoHorizon) {
    const [pestanna, setPestanna] = useState<(typeof PESTANNAS)[number]["id"]>("crear");
    const [destinos, setDestinos] = useState<GrupoDestinos[]>([]);
    const [mios, setMios] = useState<NodoBiblioteca[]>([]);
    const [cargando, setCargando] = useState(true);
    // Lecturas de UNA sola vez: pocos eventos y gruesos, nada de sondeos en bucle.
    useEffect(() => {
        let vivo = true;
        const cargar = async () => {
            const yo = await usuarioActual();
            if (!yo) { if (vivo) { setDestinos([]); setCargando(false); } return; }
            const [es, svMios, svPublicos, gs, mundos, salas] = await Promise.all([
                listarEstaciones({ limite: 30 }).catch(() => []), listServers("mine").catch(() => []),
                listServers("public").catch(() => []), fetchGroups().catch(() => []),
                listarMiosXr().catch(() => []), listarEscenasCompartidas().catch(() => []),
            ]);
            if (!vivo) return;
            const vistos = new Set(svMios.map((s) => s.id));
            const servidores = [...svMios, ...svPublicos.filter((s) => !vistos.has(s.id))];
            setDestinos(listarDestinos({
                mundos: mundos.map((m) => destinoDeMundo(m, yo)), estaciones: es.map((e) => destinoDeEstacion(e, yo)),
                servidores: servidores.map((s) => destinoDeServidor(s, yo)), grupos: gs.map((g) => destinoDeGrupo(g)), salas: salas.map((s) => destinoDeSala(s, yo)),
            }, yo));
            setMios(mundos); setCargando(false);
        };
        void cargar(); return () => { vivo = false; };
    }, []);
    return (
        <Container flexDirection="column" gap={4}>
            <Container flexDirection="row" gap={2}>
                {PESTANNAS.map((p) => (
                    <Container key={p.id} onClick={() => setPestanna(p.id)} cursor="pointer" padding={2} backgroundColor={pestanna === p.id ? CRISTAL.fondoB.color : CRISTAL.fondoA.color}>
                        <Texto3D distancia={distancia} tono={pestanna === p.id ? "texto" : "textoSecundario"}>{p.etiqueta}</Texto3D>
                    </Container>
                ))}
            </Container>
            {pestanna === "crear" && (
                <Container flexDirection="column" gap={3}>
                    <BotonItem distancia={distancia} principal="Dime cómo es tu mundo" secundario={alDictar ? undefined : "próximamente: la voz de Astraura se cablea en XR1010T"}
                        onClick={alDictar ? () => alDictar() : undefined} />
                    {PLANTILLAS.map((p) => (
                        <BotonItem key={p.id} distancia={distancia} principal={p.nombre} secundario={p.porque} onClick={alCrear ? () => alCrear(p.id) : undefined} />
                    ))}
                </Container>
            )}
            {pestanna === "destinos" && (
                <Container flexDirection="column" gap={3}>
                    {cargando && <Texto3D distancia={distancia}>Cargando destinos…</Texto3D>}
                    {destinos.map((g) => (
                        <Container key={g.categoria} flexDirection="column" gap={2}>
                            <Texto3D distancia={distancia} tono="textoSecundario">{TITULO[g.categoria]}</Texto3D>
                            {g.items.map((i) => (
                                <BotonItem key={i.id} distancia={distancia} principal={i.nombre} secundario={[VIA[i.transporte], i.etiqueta].filter(Boolean).join(" · ")}
                                    onClick={() => alIr({ categoria: g.categoria, id: i.id, nombre: i.nombre, privado: i.privado, etiqueta: i.etiqueta })} />
                            ))}
                        </Container>
                    ))}
                </Container>
            )}
            {pestanna === "biblioteca" && (
                <Container flexDirection="column" gap={2}>
                    {mios.map((m) => (                        <BotonItem key={m.refId} distancia={distancia} principal={m.titulo} onClick={alElegir ? () => alElegir(m.refId) : undefined} />
                    ))}
                </Container>
            )}
        </Container>
    );
}
