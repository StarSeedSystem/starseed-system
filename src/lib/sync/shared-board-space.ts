"use client";

/*
 * shared-board-space — modo COLABORATIVO de una pizarra compartida (os_spaces kind='board', SOP §11).
 * SVF1A5f: ya no se guarda el documento entero (el último en escribir ganaba y dos personas dibujando
 * a la vez se pisaban): cada bloque y arista es un registro con reloj (`vivo/pizarra*`) y se guarda con
 * compare-and-swap y fusión (`crearMotorPizarra`). La firma del hook no cambia; solo se AÑADEN
 * `soloLectura` y `aviso`. Un doc guardado en el formato viejo se abre y se migra sin perder campos.
 * Uso en canvas-board.tsx: `remoteDoc` es el lienzo fusionado; al mutar, `pushDoc({blocks, edges})`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getSpace, type Space } from "@/lib/spaces/spaces";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { miUid } from "@/lib/vivo/tabla/espacio";
import { MotorColab, SNAPSHOT_INICIAL, type SnapshotMotor } from "@/lib/vivo/tabla/motor-colab";
import type { DocPizarra } from "@/lib/vivo/pizarra";
import { desdeLienzo, haciaLienzo } from "@/lib/vivo/pizarra-lienzo";
import { depsPizarra } from "@/lib/vivo/pizarra-motor";

export interface BoardSpaceDoc {
    blocks: CanvasBlock[];
    edges: CanvasEdge[];
}

export interface UseSharedBoardSpace {
    space: Space | null;
    loading: boolean;
    /** El lienzo fusionado (lo propio y lo de los demás) — null si no hay espacio o aún carga. */
    remoteDoc: BoardSpaceDoc | null;
    /** Entrega el lienzo actual al motor (guarda con compare-and-swap y fusión). No-op sin espacio abierto. */
    pushDoc: (doc: BoardSpaceDoc) => void;
    /** Hay espacio abierto pero esta persona no puede editarlo. */
    soloLectura: boolean;
    /** Lo que hay que decirle a la persona (solo lectura, sin conexión, no disponible). */
    aviso: string | null;
}

const SIN_MOTOR = { subscribe: () => () => {}, getSnapshot: () => SNAPSHOT_INICIAL as SnapshotMotor<DocPizarra> };

/** `remoto` en el orden que ya tiene la persona (lo nuevo, al final); si es lo mismo, devuelve `local` (misma referencia). */
export function alinear<T extends { id: string }>(local: readonly T[], remoto: readonly T[]): T[] {
    const resto = new Map(remoto.map((x) => [x.id, x]));
    const salida: T[] = [];
    for (const l of local) {
        const r = resto.get(l.id);
        if (r) (salida.push(r), resto.delete(l.id));
    }
    salida.push(...resto.values());
    const igual = salida.length === local.length && salida.every((x, i) => x === local[i] || JSON.stringify(x) === JSON.stringify(local[i]));
    return igual ? (local as T[]) : salida;
}

/** Hook de montaje único (por lienzo): con `spaceId` entra en modo colaborativo; con null, no-op total (lienzo personal). */
export function useSharedBoardSpace(spaceId: string | null, debounceMs = 900): UseSharedBoardSpace {
    const [motor, setMotor] = useState<MotorColab<DocPizarra> | null>(null);
    const [space, setSpace] = useState<Space | null>(null);
    const motorRef = useRef<MotorColab<DocPizarra> | null>(null);
    const pendiente = useRef<BoardSpaceDoc | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Aplica al motor lo último que entregó el lienzo (un solo cambio, aunque lleguen muchos seguidos).
    const volcar = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        const doc = pendiente.current;
        pendiente.current = null;
        if (doc) motorRef.current?.aplicar((d, c) => desdeLienzo(doc.blocks, doc.edges, d, { ahora: c.t, autor: c.a }));
    }, []);

    useEffect(() => {
        if (!spaceId) {
            setMotor(null);
            setSpace(null);
            return;
        }
        let vivo = true;
        let m: MotorColab<DocPizarra> | null = null;
        void getSpace(spaceId).then((sp) => vivo && setSpace(sp));
        void miUid().then((uid) => {
            if (!vivo) return;
            const deps = depsPizarra(spaceId, uid);
            // Antes de absorber lo ajeno se vuelca lo propio pendiente: lo que la persona acaba de hacer no se pisa.
            m = new MotorColab<DocPizarra>({ ...deps, debounceMs, suscribir: (cb) => deps.suscribir((c) => (volcar(), cb(c))) });
            motorRef.current = m;
            setMotor(m);
            void m.iniciar();
        });
        return () => {
            vivo = false;
            volcar();
            m?.destruir();
            motorRef.current = null;
        };
    }, [spaceId, debounceMs, volcar]);

    const snap = useSyncExternalStore((motor ?? SIN_MOTOR).subscribe, (motor ?? SIN_MOTOR).getSnapshot, () => SNAPSHOT_INICIAL as SnapshotMotor<DocPizarra>);
    const remoteDoc = useMemo(() => (spaceId && snap.fase === "listo" && snap.doc ? haciaLienzo(snap.doc) : null), [spaceId, snap.fase, snap.doc]);

    const pushDoc = useCallback(
        (doc: BoardSpaceDoc) => {
            if (!spaceId) return;
            pendiente.current = doc;
            if (!timer.current) timer.current = setTimeout(volcar, 0); // no se toca el motor dentro del render del lienzo
        },
        [spaceId, volcar],
    );

    const soloLectura = !!spaceId && snap.fase === "listo" && !snap.puedeEditar;
    const aviso = !spaceId ? null : snap.motivo ?? (soloLectura ? "Esta pizarra está en solo lectura: no tienes permiso para editarla." : null);
    return {
        space: space && snap.titulo ? { ...space, title: snap.titulo } : space,
        loading: !!spaceId && snap.fase === "cargando",
        remoteDoc,
        pushDoc,
        soloLectura,
        aviso,
    };
}
