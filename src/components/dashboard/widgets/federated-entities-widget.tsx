"use client";

// ════════════════════════════════════════════════════════════════
// FederatedEntitiesWidget — las instituciones y proyectos de la Red (Ola 0929 · D)
// ----------------------------------------------------------------
// Entidades federativas REALES: páginas de tipo entidad, página o proyecto
// (`os_pages`), con su actividad medida de la semana (`os_posts`) y el
// porqué de su orden. Sin E.F. de relleno: lo que no está en la base no se
// enseña. Acciones reales: seguir (`os_follows`), invitar, abrir (las E.F.
// en /entidad/<slug>) y registrar una nueva con el diálogo real.
// Hooks compartidos de os-live.
//
// micro = cuántas · s = la más viva · m/torre = lista con motivos · l =
// tipo (E.F./proyecto/página) + búsqueda + seguir · xl = tarjetas ·
// panorámico = tarjetas en fila. Estados: cargando (lista), vacío con
// «Registrar una entidad»; sin error visible: los hooks degradan a lista
// vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Building2, FolderKanban, Landmark, Network, Plus } from "lucide-react";
import { useCurrentUid, useLivePages, useLivePosts, useMyMemberships } from "@/lib/widget-data/os-live";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono, Segmentos } from "./_social-d/piezas";
import { BotonRelacion, useAccionesEntidad } from "./_social-d/entidad-piezas";
import { actividadPorEntidad, claveEntidad, entidadDePagina, puntuar, type Puntuada } from "./_social-d/entidades";
import { VistaEntidades } from "./_social-d/vista-entidades";
import { useCrearEntidad } from "./_social-d/crear-entidad";
import { plural } from "./_social-d/formato";

const ACENTO = "#a855f7";
const CLASES = new Set(["entidad", "pagina", "proyecto"]);

type Filtro = "todas" | "entidad" | "proyecto" | "pagina";

export function FederatedEntitiesWidget() {
    const { uid } = useCurrentUid();
    const paginas = useLivePages();
    const posts = useLivePosts(40);
    const membresias = useMyMemberships(uid);
    const [filtro, setFiltro] = React.useState<Filtro>("todas");
    const crear = useCrearEntidad(() => void paginas.reload());
    const acciones = useAccionesEntidad(uid, React.useMemo(() => new Set(membresias.rows.map((m) => m.group_slug)), [membresias.rows]));

    const entidades: Puntuada[] = React.useMemo(() => {
        const ahora = Date.now();
        const act = actividadPorEntidad(posts.rows, ahora);
        return paginas.rows
            .filter((p) => CLASES.has((p.kind ?? "").toLowerCase()))
            .map(entidadDePagina)
            .map((e) => puntuar(e, act.get(claveEntidad("pagina", e.slug)) ?? null, new Map(), ahora))
            .sort((a, b) => b.puntos - a.puntos);
    }, [paginas.rows, posts.rows]);

    const cuenta = (c: string) => entidades.filter((p) => p.e.clase === c).length;
    const visibles = filtro === "todas" ? entidades : entidades.filter((p) => p.e.clase === filtro);
    const estado = estadoSocial({ cargando: paginas.loading, hayDatos: entidades.length > 0 });

    return (
        <>
            <MarcoSocial
                titulo="Entidades Federativas"
                subtitulo={`${plural(entidades.length, "entidad", "entidades")} · instituciones y proyectos`}
                icono={Network}
                categoria="red"
                acento={ACENTO}
                estado={estado}
                vivo
                esqueleto="lista"
                vacio={{ icono: Landmark, titulo: "Aún no hay entidades federativas", mensaje: "Registra la de tu territorio, tu institución o tu proyecto como página de la Red.", accion: { etiqueta: "Registrar una entidad", onClick: () => crear.abrir("page") } }}
                acciones={(t) => <BotonIcono icono={Plus} etiqueta="Registrar una entidad" onClick={() => crear.abrir("page")} acento={t.acento} tactil={t.tactil} />}
            >
                {(t) => (
                    <VistaEntidades t={t} lista={t.base === "l" || t.base === "xl" || t.clase === "panoramico" ? visibles : entidades} unidad="entidades" etiquetaLista="Entidades federativas"
                        controles={
                            <Segmentos<Filtro> etiqueta="Tipo de entidad" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={setFiltro}
                                opciones={[
                                    { id: "todas", etiqueta: "Todas", n: entidades.length },
                                    ...(cuenta("entidad") ? [{ id: "entidad" as const, etiqueta: "E.F.", n: cuenta("entidad"), icono: Building2 }] : []),
                                    ...(cuenta("proyecto") ? [{ id: "proyecto" as const, etiqueta: "Proyectos", n: cuenta("proyecto"), icono: FolderKanban }] : []),
                                    ...(cuenta("pagina") ? [{ id: "pagina" as const, etiqueta: "Páginas", n: cuenta("pagina"), icono: Landmark }] : []),
                                ]} />
                        }
                        accion={(p, soloIcono) => (
                            <BotonRelacion e={p.e} relacion={acciones.relacion(p.e)} onActuar={acciones.actuar} enCurso={acciones.enCurso === p.e.id} acento={t.acento} tactil={t.tactil} soloIcono={soloIcono} />
                        )} />
                )}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

export default FederatedEntitiesWidget;
