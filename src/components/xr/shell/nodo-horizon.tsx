"use client";

/**
 * StarSeed XR · NODO HORIZON (oeste de la Trinity) — XR1010AO · contrato `architecture/starseed-xr.md`
 * §3 a, b y h. Tres pestañas: «Crear» (plantillas y el cuadro «Dime cómo es tu mundo»), «Destinos»
 * (estaciones, servidores y grupos, desde `destinos.ts`) y «Biblioteca» (tus mundos y objetos, desde
 * `listarMiosXr`). Colores siempre de `tokens-3d.ts`. Pulsar un destino llama `alIr(destino)`: la
 * confirmación de espacio público de XR1010X y el cableado del nodo los hace XR1010AS.
 */
import { useEffect, useState } from "react";
import { Container, Input, Text } from "@react-three/uikit";
import { listarEstaciones } from "@/lib/estaciones/datos";
import { listarMiosXr } from "@/lib/vivo/xr";
import { PLANTILLAS } from "@/lib/salas/plantillas-sala";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import { estacionASala, listarDestinos, mundosASalas, type CategoriaDestino, type GrupoDestinos, type ItemDestino } from "./destinos";

export interface PropiedadesNodoHorizon {
    yo: string;
    /** Pulsar un destino. La confirmación de espacio público (XR1010X) la pone quien cablea. */
    alIr: (destino: ItemDestino) => void;
    /** Cuadro «Dime cómo es tu mundo» → frase a la voz de Astraura (XR1010P/T). */
    alDictar?: (frase: string) => void;
}

const PESTANAS = [["crear", "Crear"], ["destinos", "Destinos"], ["biblioteca", "Biblioteca"]] as const;
type Pestana = (typeof PESTANAS)[number][0];

const TITULOS_GRUPO: Record<CategoriaDestino, string> = {
    "mis-mundos": "Mis mundos y salas", "estaciones-en-vivo": "Estaciones en vivo", servidores: "Servidores", grupos: "Grupos", };

const ACENTO = COLORES_NODO.horizon, SECUNDARIO = CRISTAL.textoSecundario;

/** Los mandos sin efecto real no se pintan: se dice cuándo llegarán (honestidad, §0.4). */
const PROXIMAMENTE = {
    servidores: "Servidores: próximamente — se leen de tus servidores (credenciales en tu cuenta).",
    grupos: "Grupos: próximamente falta la lectura simple de grupos del OS.",
    avatares: "Los modelos y avatares de la Biblioteca se eligen al editar un mundo (selector por cablear con XR1010AP).",
    voz: "sin efecto todavía: la voz de Astraura entra con las tareas XR1010P/T.",
} as const;

function PestanaCrear({ alDictar }: { alDictar?: (frase: string) => void }) {
    const [frase, setFrase] = useState("");
    return (
        <Container flexDirection="column" gap={8}>
            <Text color={ACENTO.vivo} fontSize={11}>Dime cómo es tu mundo</Text>
            <Container flexDirection="row" gap={6} alignItems="center">
                <Input value={frase} onValueChange={(v) => setFrase(String(v ?? ""))} placeholder="crea un mundo virtual…" width={170} fontSize={10} color={CRISTAL.texto} />
                <Container padding={4} borderRadius={8} cursor={alDictar ? "pointer" : undefined} backgroundColor={ACENTO.base} onClick={alDictar && frase.trim() ? () => alDictar(frase.trim()) : undefined}>
                    <Text color={CRISTAL.texto} fontSize={10}>Hablar</Text></Container>
            </Container>
            {!alDictar && frase.trim() !== "" && <Text color={SECUNDARIO} fontSize={9}>«Hablar» {PROXIMAMENTE.voz}</Text>}
            {PLANTILLAS.slice(0, 6).map((t) => (
                <Container key={t.id} flexDirection="column" gap={2}>
                    <Text color={CRISTAL.texto} fontSize={11}>{t.nombre}</Text>
                    <Text color={SECUNDARIO} fontSize={9}>{t.porque}</Text></Container>))}
        </Container>
    );}

function lineaDestino(d: ItemDestino, alIr: (x: ItemDestino) => void) {
    return (
        <Container key={d.id} cursor="pointer" padding={4} borderRadius={6} onClick={() => alIr(d)}>
            <Text color={d.privado ? CRISTAL.texto : SECUNDARIO} fontSize={10}>
                {d.nombre} · {d.etiqueta} · {d.puedeEditar ? "puede editar" : "puede ver"}
            </Text></Container>);}

function mostrarDestinos(grupos: GrupoDestinos[], alIr: (x: ItemDestino) => void) {
    return (
        <Container flexDirection="column" gap={6}>
            {grupos.map((g) =>
                g.items.length === 0 ? null : (
                    <Container key={g.categoria} flexDirection="column" gap={2}>
                        <Text color={ACENTO.vivo} fontSize={10}>{TITULOS_GRUPO[g.categoria]}</Text>
                        {g.items.map((d) => lineaDestino(d, alIr))}
                    </Container>
                ),
            )}
            <Text color={SECUNDARIO} fontSize={9}>{PROXIMAMENTE.servidores} {PROXIMAMENTE.grupos}</Text>
        </Container>);}


function PestanaBiblioteca({ mundos }: { mundos: { refId: string; titulo: string }[] | null }) {
    if (!mundos) return <Text color={SECUNDARIO} fontSize={10}>Buscando en la Biblioteca…</Text>;
    return (
        <Container flexDirection="column" gap={6}>
            <Text color={ACENTO.vivo} fontSize={10}>Tus mundos guardados ({mundos.length})</Text>
            {mundos.map((m) => (<Text key={m.refId} color={CRISTAL.texto} fontSize={10}>{m.titulo}</Text>))}
            {mundos.length === 0 && <Text color={SECUNDARIO} fontSize={9}>Nada guardado todavía. Crea un mundo en «Crear».</Text>}
            <Text color={SECUNDARIO} fontSize={9}>{PROXIMAMENTE.avatares}</Text>
        </Container>);}

/** El contenido del nodo Horizon, completo. XR1010AS lo monta dentro del panel de Horizon. */
export function NodoHorizon({ yo, alIr, alDictar }: PropiedadesNodoHorizon) {
    const [pestana, setPestana] = useState<Pestana>("crear");
    const [grupos, setGrupos] = useState<GrupoDestinos[] | null>(null);
    const [guardados, setGuardados] = useState<{ refId: string; titulo: string }[] | null>(null);

    useEffect(() => {
        let vivo = true;
        void (async () => {
            const [propias, estaciones] = await Promise.all([listarMiosXr(), listarEstaciones({ limite: 30 })]);
            if (!vivo) return;
            const d = listarDestinos({ mundos: mundosASalas(propias, yo), estaciones: estaciones.map((e) => estacionASala(e, yo)), servidores: [], grupos: [], salas: [] }, yo);
            setGrupos(d); setGuardados(propias.map((p) => ({ refId: p.refId, titulo: p.titulo }))); })(); return () => { vivo = false; };}, [yo]);

    return (
        <Container flexDirection="column" gap={8}>
            <Container flexDirection="row" gap={6}>
                {PESTANAS.map(([id, nombre]) => (
                    <Container key={id} padding={4} borderRadius={8} cursor="pointer" backgroundColor={pestana === id ? ACENTO.base : undefined} onClick={() => setPestana(id)}>
                        <Text color={CRISTAL.texto} fontSize={10}>{nombre}</Text>
                    </Container>
                ))}
            </Container>
            {pestana === "crear" && <PestanaCrear alDictar={alDictar} />}
            {pestana === "destinos" && (grupos ? mostrarDestinos(grupos, alIr) : <Text color={SECUNDARIO} fontSize={10}>Buscando destinos…</Text>)}
            {pestana === "biblioteca" && <PestanaBiblioteca mundos={guardados} />}
        </Container>
    );
}
