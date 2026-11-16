"use client";

/*
 * shared-board-space — pizarra COMPARTIDA (os_spaces kind='board', SOP §11) sincronizada por
 * REGISTRO con reloj, autor y lápida (`@/lib/vivo/pizarra` + `pizarra-fusion`): dos ediciones
 * distintas se conservan en vez de pisarse. El doc viejo `{blocks, edges}` se migra al leerlo.
 * Guardado compare-and-swap por `rev`; cambios locales por `pushDoc`, ajenos por `remoteDoc`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { acceptSpaceInvite, getSpace, subscribeSpace, type Space } from "@/lib/spaces/spaces";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { docPizarra, maxTiempoPizarra, normalizarPizarra, pizarraVacia, podarPizarra, type DocPizarra } from "@/lib/vivo/pizarra";
import { aplicarLienzo, fusionarPizarras, lienzoDePizarra, pizarrasIguales } from "@/lib/vivo/pizarra-fusion";
import { guardarEspacioCAS, miUid } from "@/lib/vivo/tabla/espacio";
import { autorCorto } from "@/lib/vivo/tabla/modelo";
export interface BoardSpaceDoc { blocks: CanvasBlock[]; edges: CanvasEdge[]; }
export interface UseSharedBoardSpace {
    space: Space | null;
    loading: boolean;
    /** Lienzo ya fusionado (solo registros vivos) — null si no hay espacio o aún carga. */
    remoteDoc: BoardSpaceDoc | null;
    /** Empuja el lienzo local; solo se sellan los bloques/aristas que cambiaron. */
    pushDoc: (doc: BoardSpaceDoc) => void;
}
const aDoc = (raw: unknown): DocPizarra => podarPizarra(normalizarPizarra(raw), Date.now());
export function useSharedBoardSpace(spaceId: string | null, debounceMs = 900): UseSharedBoardSpace {
    const [space, setSpace] = useState<Space | null>(null);
    const [doc, setDoc] = useState<DocPizarra | null>(null);
    const [loading, setLoading] = useState(!!spaceId);
    const docRef = useRef(pizarraVacia());
    const revRef = useRef(0);
    const reloj = useRef(0);
    const autor = useRef("anonimo");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const guardar = useCallback(async () => {
        if (!spaceId) return;
        let enviado = docRef.current;
        let rev = revRef.current;
        for (let i = 0; i < 4; i += 1) {
            const r = await guardarEspacioCAS(spaceId, docPizarra(enviado), rev);
            if (r.ok) return void (revRef.current = Math.max(rev, r.espacio.rev));
            if (r.motivo !== "conflicto") return;
            const sp = await getSpace(spaceId);
            if (!sp) return;
            rev = revRef.current = sp.rev;
            const remoto = aDoc(sp.doc);
            enviado = podarPizarra(fusionarPizarras(remoto, enviado), Date.now());
            docRef.current = podarPizarra(fusionarPizarras(docRef.current, remoto), Date.now());
            reloj.current = Math.max(reloj.current, maxTiempoPizarra(remoto));
            setDoc(docRef.current);
        }
    }, [spaceId]);

    const programar = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void guardar(), debounceMs);
    }, [guardar, debounceMs]);

    useEffect(() => {
        if (!spaceId) {
            setSpace(null);
            setDoc(null);
            setLoading(false);
            return;
        }
        let vivo = true;
        setLoading(true);
        void miUid().then((u) => void (vivo && (autor.current = autorCorto(u))));
        void acceptSpaceInvite(spaceId);
        void getSpace(spaceId).then((sp) => {
            if (!vivo) return;
            setSpace(sp);
            if (sp) {
                revRef.current = sp.rev;
                docRef.current = aDoc(sp.doc);
                reloj.current = maxTiempoPizarra(docRef.current);
                setDoc(docRef.current);
            }
            setLoading(false);
        });
        const unsub = subscribeSpace(spaceId, (sp) => {
            if (!vivo || sp.rev <= revRef.current) return;
            revRef.current = sp.rev;
            const remoto = aDoc(sp.doc);
            const fusion = podarPizarra(fusionarPizarras(docRef.current, remoto), Date.now());
            const aporta = !pizarrasIguales(fusion, remoto);
            docRef.current = fusion;
            reloj.current = Math.max(reloj.current, maxTiempoPizarra(remoto));
            setDoc(fusion);
            setSpace(sp);
            if (aporta) programar();
        });
        return () => {
            vivo = false;
            unsub();
            if (timer.current) clearTimeout(timer.current);
        };
    }, [spaceId, programar]);
    const pushDoc = useCallback(
        (entrante: BoardSpaceDoc) => {
            if (!spaceId) return;
            const t = Math.max(Date.now(), reloj.current + 1);
            reloj.current = t;
            const siguiente = aplicarLienzo(docRef.current, entrante.blocks, entrante.edges, { t, a: autor.current });
            if (siguiente === docRef.current) return;
            docRef.current = podarPizarra(siguiente, t);
            programar();
        },
        [spaceId, programar],
    );
    const remoteDoc = useMemo(() => (doc ? lienzoDePizarra(doc) : null), [doc]);
    return { space, loading, remoteDoc, pushDoc };
}
