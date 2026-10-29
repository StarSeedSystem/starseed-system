"use client";
/**
 * StarSeed XR · PIZARRA 3D (XR1010Y · contrato §3 b y h). Plano dibujado con el rayo o el dedo.
 * Si `salaId` enlaza una sala de tipo pizarra, los trazos pasan por `sincronia-sala.ts`
 * (`fusionarEstados`, lápidas, techo de 5000) y el rol decide si se dibuja o solo se mira.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Container } from "@react-three/uikit";
import type { PizarraMundo } from "../../../lib/xr/mundo-tipos";
import type { Vec3 } from "../../../lib/xr/tipos";
import { puedeEditar, type RolSala, type Sala } from "../../../lib/salas/sala";
import { excedeLimite, fusionarEstados, LIMITE_ELEMENTOS, type ElementoSala, type EstadoSala } from "../../../lib/salas/sincronia-sala";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
export const TIPO_TRAZO = "trazo-pizarra";
export interface TrazoPizarra { id: string; puntos: Vec3[]; color: string; grosor: number }
export interface DecisionPizarra { puedeDibujar: boolean; rol: RolSala | null; motivo: string }
export interface OpcionesTrazo { dispositivo: string; ahora: number; id?: string }

export function decidirPizarra(pizarra: PizarraMundo, sala: Sala | null | undefined, usuarioId: string | null | undefined): DecisionPizarra {
    if (!pizarra.salaId) return { puedeDibujar: true, rol: null, motivo: "Pizarra local: los trazos se quedan en este aparato." };
    if (!sala) return { puedeDibujar: false, rol: null, motivo: "La sala enlazada aún no ha llegado: por ahora solo se puede mirar." };
    if (sala.id !== pizarra.salaId) return { puedeDibujar: false, rol: null, motivo: "La sala no coincide con la pizarra: por ahora solo se puede mirar." };
    const rol = usuarioId ? sala.miembros[usuarioId] ?? null : null;
    const dibuja = !!usuarioId && puedeEditar(sala, usuarioId);
    return { puedeDibujar: dibuja, rol, motivo: dibuja ? "Tu rol permite dibujar en la pizarra compartida." : "Tu rol es de lectura: miras la pizarra, no dibujas." };
}
export function crearEstadoPizarra(salaId: string): EstadoSala { return { salaId, elementos: {}, reloj: 0 } }

export function trazoAElemento(trazo: TrazoPizarra, op: OpcionesTrazo): ElementoSala {
    return { id: op.id ?? trazo.id, tipo: TIPO_TRAZO, datos: { puntos: trazo.puntos, color: trazo.color, grosor: trazo.grosor }, actualizadoEn: op.ahora, porDispositivo: op.dispositivo };
}
export function agregarTrazo(estado: EstadoSala, trazo: TrazoPizarra, op: OpcionesTrazo): { estado: EstadoSala; ok: boolean; motivo?: string } {
    const elemento = trazoAElemento(trazo, op);
    const siguiente: EstadoSala = { salaId: estado.salaId, elementos: { ...estado.elementos, [elemento.id]: elemento }, reloj: Math.max(estado.reloj ?? 0, op.ahora) };
    if (excedeLimite(siguiente)) return { estado, ok: false, motivo: `La pizarra llegó a su límite de ${LIMITE_ELEMENTOS} elementos vivos: borra algo antes de seguir dibujando.` };
    return { estado: siguiente, ok: true };
}
export function fusionarPizarra(local: EstadoSala, remoto: EstadoSala, miDispositivo: string) { return fusionarEstados(local, remoto, miDispositivo) }
function esPunto(v: unknown): v is Vec3 { return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) }
export function trazosDeEstado(estado: EstadoSala): TrazoPizarra[] {
    return Object.values(estado.elementos).filter((e) => e.tipo === TIPO_TRAZO && !e.borrado).map((e) => {
        const d = e.datos as { puntos?: unknown; color?: unknown; grosor?: unknown };
        return { id: e.id, puntos: Array.isArray(d.puntos) ? d.puntos.filter(esPunto) : [], color: typeof d.color === "string" ? d.color : CRISTAL.texto, grosor: typeof d.grosor === "number" ? d.grosor : 0.01 };
    });
}
export function puntoEnPizarra(punto: { x: number; y: number; z: number }, pizarra: PizarraMundo): Vec3 {
    return [punto.x - pizarra.pos[0], punto.y - pizarra.pos[1], punto.z - pizarra.pos[2]];
}

function TrazoLinea({ trazo }: { trazo: TrazoPizarra }) {
    const linea = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(trazo.puntos.flat(), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color: trazo.color, linewidth: trazo.grosor }));
    }, [trazo.puntos, trazo.color, trazo.grosor]);
    useEffect(() => () => { linea.geometry.dispose(); (linea.material as THREE.Material).dispose(); }, [linea]);
    return <primitive object={linea} />;
}
interface EventoLienzo { point: { x: number; y: number; z: number } }
export interface PropsPizarra3D {
    pizarra: PizarraMundo;
    sala?: Sala | null;
    usuarioId?: string | null;
    estado?: EstadoSala | null;
    dispositivo?: string;
    ahora?: () => number;
    alCambiarEstado?: (estado: EstadoSala) => void;
}
export function Pizarra3D({ pizarra, sala, usuarioId, estado, dispositivo = "local", ahora, alCambiarEstado }: PropsPizarra3D) {
    const decision = decidirPizarra(pizarra, sala, usuarioId);
    const [actual, setActual] = useState<EstadoSala>(() => estado ?? crearEstadoPizarra(pizarra.salaId ?? "local"));
    useEffect(() => { if (estado) setActual(estado); }, [estado]);
    const [enCurso, setEnCurso] = useState<Vec3[] | null>(null);
    const idRef = useRef(0);
    const reloj = () => (ahora ? ahora() : Date.now());
    const registrar = (puntos: Vec3[]) => {
        const trazo: TrazoPizarra = { id: `${dispositivo}-${reloj()}-${idRef.current++}`, puntos, color: CRISTAL.texto, grosor: 0.01 };
        const r = agregarTrazo(actual, trazo, { dispositivo, ahora: reloj() });
        if (r.ok) { setActual(r.estado); alCambiarEstado?.(r.estado); }
    };
    const abajo = (e: EventoLienzo) => { if (decision.puedeDibujar) setEnCurso([puntoEnPizarra(e.point, pizarra)]); };
    const mover = (e: EventoLienzo) => { if (enCurso) setEnCurso([...enCurso, puntoEnPizarra(e.point, pizarra)]); };
    const soltar = () => { if (enCurso && enCurso.length > 1) registrar(enCurso); setEnCurso(null); };
    return (
        <group position={pizarra.pos} rotation={pizarra.rot}>
            <mesh onPointerDown={abajo} onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar}>
                <planeGeometry args={[pizarra.ancho, pizarra.alto]} />
                <meshBasicMaterial color={CRISTAL.fondoA.color} transparent opacity={0.82} side={THREE.DoubleSide} />
            </mesh>
            {trazosDeEstado(actual).map((t) => <TrazoLinea key={t.id} trazo={t} />)}
            {enCurso && enCurso.length > 1 ? <TrazoLinea trazo={{ id: "actual", puntos: enCurso, color: "#39FF14", grosor: 0.01 }} /> : null}
            {!decision.puedeDibujar ? (
                <group position={[0, 0, 0.01]}>
                    <PanelCristal nodo="logic" ancho={pizarra.ancho * 0.8} alto={pizarra.alto * 0.5}>
                        <Container flexDirection="column" alignItems="center" justifyContent="center" paddingTop={16} paddingBottom={16} paddingLeft={16} paddingRight={16} gapRow={8}>
                            <Texto3D distancia={2}>Solo lectura</Texto3D>
                            <Texto3D distancia={2} tono="textoSecundario">{decision.motivo}</Texto3D>
                        </Container>
                    </PanelCristal>
                </group>
            ) : null}
        </group>
    );
}
