"use client";

/**
 * StarSeed XR · PIZARRA 3D (XR1010Y · contrato §3 h): plano con trazo de rayo o dedo. Con
 * `salaId` enlaza la sala: trazos como `ElementoSala`, fusión con lápidas, techo de 5000;
 * el rol decide si dibuja o mira. Sin `salaId`, pizarra local. Lógica pura exportada.
 */
import { useEffect, useRef, useState } from "react";
import { Text, Line } from "@react-three/drei";
import type { PizarraMundo } from "@/lib/xr/mundo-tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { puedeEditar, type Sala } from "@/lib/salas/sala";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "@/lib/salas/sincronia-sala";

export interface PuntoPizarra { x: number; y: number }
export interface TrazoDatos { puntos: PuntoPizarra[]; color: string; grosor: number }
export interface TrazoVivo { id: string; datos: TrazoDatos }
export const COLOR_TRAZO = CRISTAL.texto, GROSOR_TRAZO = 0.004;

/** De la textura UV (0–1) del plano a metros sobre la pizarra, ceñido a su borde. */
export function puntoDe(uv: { x: number; y: number } | null, ancho: number, alto: number): PuntoPizarra | null {
    if (!uv || !Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return null;
    return { x: Math.min(ancho / 2, Math.max(-ancho / 2, (uv.x - 0.5) * ancho)), y: Math.min(alto / 2, Math.max(-alto / 2, (0.5 - uv.y) * alto)) };
}

export const estadoDeSala = (salaId: string): EstadoSala => ({ salaId, elementos: {}, reloj: 0 });

/** Trazos vivos, en orden determinista (tiempo, luego id): todos los aparatos pintan igual. */
export function trazosVivos(e: EstadoSala | null): TrazoVivo[] {
    const lista = Object.entries(e?.elementos ?? {}).filter(([, el]) => el.tipo === "trazo" && !el.borrado).map(([id, el]) => ({ id, el }));
    lista.sort((a, b) => a.el.actualizadoEn - b.el.actualizadoEn || (a.id < b.id ? -1 : 1));
    return lista.map(({ id, el }) => ({ id, datos: el.datos as unknown as TrazoDatos }));
}

export interface ResultadoTrazo { aceptado: boolean; motivo: string | null; estado: EstadoSala }

/** Un trazo nuevo entra al estado: primero el permiso, luego el techo de elementos. */
export function intentarTrazo(o: {
    estado: EstadoSala; puedeEditar: boolean;
    puntos: PuntoPizarra[]; al: number; como: string; color?: string; grosor?: number;
}): ResultadoTrazo {
    if (!o.puedeEditar) return { aceptado: false, motivo: "No tienes permiso para dibujar en esta pizarra.", estado: o.estado };
    const puntos = o.puntos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (puntos.length < 2) return { aceptado: false, motivo: "El trazo es demasiado pequeño para guardarse.", estado: o.estado };
    const vivos = Object.values(o.estado.elementos).reduce((n, el) => n + (el.borrado ? 0 : 1), 0);
    if (vivos >= LIMITE_ELEMENTOS) return { aceptado: false, motivo: `La pizarra está llena (${LIMITE_ELEMENTOS} trazos).`, estado: o.estado };
    let id = `trazo-${o.al}-${o.como}`;
    if (o.estado.elementos[id]) id = `${id}-${vivos + 1}`;
    const datos: TrazoDatos = { puntos, color: o.color ?? COLOR_TRAZO, grosor: o.grosor ?? GROSOR_TRAZO };
    const nuevo: ElementoSala = { id, tipo: "trazo", datos, actualizadoEn: o.al, porDispositivo: o.como };
    const elementos: Record<string, ElementoSala> = { ...o.estado.elementos, [id]: nuevo };
    return { aceptado: true, motivo: null, estado: { salaId: o.estado.salaId, elementos, reloj: Math.max(o.estado.reloj, o.al) } };
}

/** La fusión determinista de `sincronia-sala` atada a los trazos: nadie pierde su trazo. */
export function fusionarTrazos(local: EstadoSala, remoto: EstadoSala | null, miDispositivo: string): { resultado: EstadoSala; conflictos: string[] } {
    if (!remoto) return { resultado: local, conflictos: [] };
    return fusionarEstados(local, remoto, miDispositivo);
}

export interface PropsPizarra3D {
    pizarra: PizarraMundo; estadoRemoto?: EstadoSala | null;
    sala?: Sala | null; usuarioId?: string; puedeEditar?: boolean;
    dispositivo?: string; alCambiarEstado?: (e: EstadoSala) => void;
    ahora?: () => number;
}

export function Pizarra3D({ pizarra, estadoRemoto = null, sala = null, usuarioId = null, puedeEditar: permiso, dispositivo = "yo", alCambiarEstado, ahora = Date.now }: PropsPizarra3D) {
    const edita = permiso ?? (sala ? puedeEditar(sala, usuarioId ?? "") : true);
    const [estado, setEstado] = useState<EstadoSala>(() => estadoDeSala(pizarra.salaId ?? "local"));
    const [enCurso, setEnCurso] = useState<PuntoPizarra[]>([]);
    const [aviso, setAviso] = useState<string | null>(null);
    const estadoRef = useRef(estado);
    const aplicar = (e: EstadoSala): void => { estadoRef.current = e; setEstado(e); alCambiarEstado?.(e); };

    useEffect(() => {
        if (!estadoRemoto || !pizarra.salaId) return;
        const f = fusionarTrazos(estadoRef.current, estadoRemoto, dispositivo);
        aplicar(f.resultado);
        if (f.conflictos.length > 0) setAviso("Alguien tocó lo mismo que tú: se guarda el cambio más nuevo.");
    }, [estadoRemoto, dispositivo, pizarra.salaId]);

    type Evt = { uv?: { x: number; y: number } } | null;
    const alPunto = (e: Evt): PuntoPizarra | null => puntoDe(e?.uv ?? null, pizarra.ancho, pizarra.alto);
    const empezar = (e: Evt): void => {
        if (!edita) { setAviso("Estás mirando la pizarra: no puedes dibujar."); return; }
        const u = alPunto(e);
        if (u) setEnCurso([u]);
    };
    const seguir = (e: Evt): void => {
        const u = enCurso.length === 0 ? null : alPunto(e);
        if (u) setEnCurso((prev) => {
            const ultimo = prev[prev.length - 1];
            return ultimo && Math.hypot(u.x - ultimo.x, u.y - ultimo.y) < 0.01 ? prev : [...prev, u];
        });
    };
    const terminar = (): void => {
        const r = intentarTrazo({ estado, puedeEditar: edita, puntos: enCurso, al: ahora(), como: dispositivo });
        if (r.motivo) setAviso(r.motivo); else aplicar(r.estado);
        setEnCurso([]);
    };

    const enCursoDatos: TrazoDatos | null = enCurso.length > 1 ? { puntos: enCurso, color: COLOR_TRAZO, grosor: GROSOR_TRAZO } : null;
    const pts = (t: TrazoDatos) => t.puntos.map((p) => [p.x, p.y, 0.005] as [number, number, number]);
    return (
        <group position={pizarra.pos} rotation={pizarra.rot} data-testid="pizarra-3d">
            <mesh onPointerDown={empezar} onPointerMove={seguir} onPointerUp={terminar}>
                <planeGeometry args={[pizarra.ancho, pizarra.alto]} />
                <meshBasicMaterial color={CRISTAL.fondoA.color} transparent opacity={CRISTAL.fondoA.alfa} />
            </mesh>
            {trazosVivos(estado).map((t) => (<Line key={t.id} points={pts(t.datos)} color={t.datos.color} lineWidth={2} />))}
            {enCursoDatos !== null && <Line points={pts(enCursoDatos)} color={enCursoDatos.color} lineWidth={2} />}
            <Text position={[0, pizarra.alto / 2 + 0.05, 0.012]} fontSize={0.03} color={CRISTAL.texto} data-testid="pizarra-estado">{edita ? "Pizarra: dibuja con el mando o el dedo" : "Pizarra: solo mirar"}</Text>
            {aviso && <Text position={[0, -pizarra.alto / 2 - 0.05, 0.012]} fontSize={0.026} color={CRISTAL.textoSecundario}>{aviso}</Text>}
        </group>
    );
}
