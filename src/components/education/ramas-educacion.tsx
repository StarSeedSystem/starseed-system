"use client";

/**
 * Ramas de Educación: la vista 3D/4D del mapa del conocimiento (MV1125K).
 * Usa el motor Ramas 4D con la plantilla Educación: rutas como ramas,
 * prerrequisitos como aristas dirigidas, progreso propio (brillo) y del
 * grupo (anillos), ramas de cualquier formato, siguiente paso y huecos.
 * La escena 3D se importa con next/dynamic({ ssr: false }).
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Compass, Layers, Loader2, Sparkles } from "lucide-react";
import { contentForNode, type EduTreeNode } from "@/lib/education/curriculum";
import { cursosDeNodo } from "@/lib/education/ossu";
import { loadLearningPath, progressPct } from "@/lib/education/progress";
import { disposicionRadial } from "@/lib/ramas4d/disposicion";
import {
    ETIQUETA_FORMATO,
    construirGrafoEducacion,
    type RamaEducativa,
    type TemaEducativo,
} from "@/lib/ramas4d/plantillas/educacion";

const EscenaRamas = dynamic(() => import("@/components/ramas4d/escena-ramas"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-[50vh] w-full items-center justify-center text-white/60">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando las ramas 4D…
        </div>
    ),
});

export interface RamasEducacionProps {
    tree: EduTreeNode[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** Progreso del grupo por tema (0..1); si falta, se muestra «sin dato». */
    progresoGrupo?: Record<string, number>;
}

function aplanar(tree: EduTreeNode[]): EduTreeNode[] {
    const salida: EduTreeNode[] = [];
    const walk = (lista: EduTreeNode[]) => {
        for (const nodo of lista) {
            salida.push(nodo);
            walk(nodo.children);
        }
    };
    walk(tree);
    return salida;
}

/** Ramas reales del tema: cursos OSSU asignados + cursos/artículos etiquetados. */
function ramasDeTema(tema: EduTreeNode): RamaEducativa[] {
    const ramas: RamaEducativa[] = [];
    for (const curso of cursosDeNodo(tema.id)) {
        ramas.push({
            id: `ossu-${curso.orden}`,
            titulo: curso.nombre,
            formato: "leccion",
            ref: curso.url,
            completada: false,
        });
    }
    const { courses, articles } = contentForNode(tema.name);
    for (const curso of courses) {
        ramas.push({ id: `curso-${curso.id}`, titulo: curso.title, formato: "leccion", ref: curso.href });
    }
    for (const articulo of articles) {
        ramas.push({ id: `articulo-${articulo.id}`, titulo: articulo.title, formato: "enlace", ref: articulo.href });
    }
    return ramas;
}

export function RamasEducacion({ tree, selectedId, onSelect, progresoGrupo }: RamasEducacionProps) {
    const planos = useMemo(() => aplanar(tree), [tree]);
    const [progreso, setProgreso] = useState<Record<string, number>>({});

    useEffect(() => {
        let vivo = true;
        const propios = planos.filter((n) => n.custom);
        void Promise.all(
            propios.map(async (n) => {
                const pasos = await loadLearningPath(n.id);
                return [n.id, progressPct(pasos) / 100] as const;
            }),
        )
            .then((pares) => {
                if (!vivo) return;
                const mapa: Record<string, number> = {};
                for (const [id, pct] of pares) mapa[id] = pct;
                setProgreso(mapa);
            })
            .catch(() => {
                /* sin sesión o sin datos: se queda en cero; nunca se inventa */
            });
        return () => {
            vivo = false;
        };
    }, [planos]);

    const { grafo, siguientePaso, huecos, padres, anillos } = useMemo(() => {
        const ramas = new Map(planos.map((n) => [n.id, ramasDeTema(n)]));
        const temas: TemaEducativo[] = planos.map((n) => ({
            id: n.id,
            titulo: n.name,
            padreId: n.parentId,
            progresoPropio: progreso[n.id] ?? 0,
            progresoGrupo: progresoGrupo?.[n.id],
            tipo: n.kind === "category" ? "carpeta" : "leccion",
            estructura: n.kind === "category",
            ramas: ramas.get(n.id) ?? [],
            alcance: n.custom ? "privado" : "publico",
            dueno: n.custom ? "usuario" : "sistema",
        }));
        return construirGrafoEducacion({ temas, ahora: Date.now() });
    }, [planos, progreso, progresoGrupo]);

    const posiciones = useMemo(() => {
        const ids = Array.from(grafo.nodos.keys());
        const indice = new Map(ids.map((id, i) => [id, i]));
        const listaPadres = ids.map((id) => {
            const padre = padres.get(id) ?? null;
            return padre ? indice.get(padre) ?? -1 : -1;
        });
        return disposicionRadial(listaPadres, { radioAnillo: 7, alturaAnillo: 2.4 });
    }, [grafo, padres]);

    const seleccionado = selectedId ? `edu:${selectedId}` : null;
    const anillosSeleccionado = seleccionado ? anillos.get(seleccionado) ?? 0 : null;
    const hayDatoGrupo = Array.from(anillos.values()).some((n) => n > 0);
    const tituloSiguiente = siguientePaso ? grafo.nodos.get(`edu:${siguientePaso}`)?.titulo ?? siguientePaso : null;
    const sinRamas = huecos.filter((h) => h.motivo === "sin-ramas");
    const formatos = new Set(
        Array.from(grafo.nodos.values())
            .filter((n) => n.categoria === "rama-aprendizaje")
            .map((n) => n.formato),
    );

    return (
        <div className="relative min-h-[60vh] h-[70vh] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <EscenaRamas
                grafo={grafo}
                posiciones={posiciones}
                seleccionado={seleccionado}
                onSeleccionar={(id) => {
                    if (id && grafo.nodos.get(id)?.categoria === "ruta-aprendizaje") onSelect(id.replace(/^edu:/, ""));
                }}
                capasVisibles={[]}
            />
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[min(22rem,calc(100%-1.5rem))] flex-col gap-1.5 text-[11px] text-white/75">
                <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur">
                    <p className="flex items-center gap-1.5 font-semibold text-white/90">
                        <Compass className="h-3.5 w-3.5 text-[hsl(var(--trinity-azure-hsl))]" /> Siguiente paso
                    </p>
                    <p className="mt-0.5 truncate text-white/70">
                        {tituloSiguiente ?? "Ruta completa: elige una rama para repasar."}
                    </p>
                </div>
                <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur">
                    <p className="flex items-center gap-1.5 font-semibold text-white/90">
                        <Layers className="h-3.5 w-3.5 text-[hsl(var(--trinity-lime-hsl))]" /> Formatos y progreso
                    </p>
                    <p className="mt-0.5 text-white/60">
                        {formatos.size > 0
                            ? `Ramas: ${Array.from(formatos).map((f) => (ETIQUETA_FORMATO as Record<string, string>)[f] ?? f).join(" · ")}`
                            : "Aún no hay ramas de contenido."}
                    </p>
                    <p className="text-white/45">Brillo = progreso propio · anillos = progreso del grupo.</p>
                </div>
                {sinRamas.length > 0 && (
                    <div className="pointer-events-auto rounded-xl border border-[hsl(var(--trinity-amber-hsl)/0.25)] bg-black/55 px-3 py-2 backdrop-blur">
                        <p className="flex items-center gap-1.5 font-semibold text-[hsl(var(--trinity-amber-hsl))]">
                            <AlertTriangle className="h-3.5 w-3.5" /> Huecos de la ruta: {sinRamas.length}
                        </p>
                        <p className="mt-0.5 truncate text-white/55">
                            {sinRamas.slice(0, 3).map((h) => grafo.nodos.get(`edu:${h.temaId}`)?.titulo ?? h.temaId).join(" · ")}
                        </p>
                    </div>
                )}
                <p className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-white/45 backdrop-blur">
                    <Sparkles className="h-3 w-3" /> Anillos del grupo:{" "}
                    {hayDatoGrupo && anillosSeleccionado !== null
                        ? `${"●".repeat(anillosSeleccionado)}${"○".repeat(3 - anillosSeleccionado)}`
                        : hayDatoGrupo
                          ? "elige un tema"
                          : "sin dato"}
                </p>
            </div>
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] text-white/60 backdrop-blur">
                {grafo.nodos.size} cuerpos · {grafo.aristas.length} conexiones
            </div>
        </div>
    );
}
