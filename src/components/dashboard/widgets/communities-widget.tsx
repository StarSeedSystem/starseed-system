"use client";

// ════════════════════════════════════════════════════════════════
// CommunitiesWidget — las comunidades de la Red, REALES (Ola 0929 · D)
// ----------------------------------------------------------------
// Páginas de tipo «comunidad» (`os_pages`), con su actividad medida
// (publicaciones de la semana en `os_posts`), su antigüedad y su afinidad
// con tus grupos: cada una dice por qué aparece. Acciones reales: seguir
// (`os_follows`), invitar (hoja de compartir o enlace copiado), abrir y
// fundar una nueva con el diálogo real. Hooks compartidos de os-live.
//
// micro = cuántas · s = la más viva con su acción · m/torre = lista con
// motivos · l = orden (vivas/nuevas/grandes) + búsqueda + seguir · xl =
// tarjetas con portada · panorámico = tarjetas en fila. Estados: cargando
// (lista), vacío con «Fundar una comunidad»; sin error visible: los hooks
// degradan a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Globe2, Plus, Share2, Sprout } from "lucide-react";
import { useCurrentUid, useLiveGroups, useLivePages, useLivePosts, useMyMemberships } from "@/lib/widget-data/os-live";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono, Segmentos } from "./_social-d/piezas";
import { BotonRelacion, invitarA, useAccionesEntidad } from "./_social-d/entidad-piezas";
import { actividadPorEntidad, afinidadDe, claveEntidad, entidadDeGrupo, entidadDePagina, puntuar, type Puntuada } from "./_social-d/entidades";
import { VistaEntidades } from "./_social-d/vista-entidades";
import { useCrearEntidad } from "./_social-d/crear-entidad";
import { formatoNumero, plural } from "./_social-d/formato";

const ACENTO = "#9FE870";

type Orden = "vivas" | "nuevas" | "grandes";

export function CommunitiesWidget() {
    const { uid } = useCurrentUid();
    const paginas = useLivePages();
    const grupos = useLiveGroups();
    const posts = useLivePosts(40);
    const membresias = useMyMemberships(uid);
    const [orden, setOrden] = React.useState<Orden>("vivas");
    const crear = useCrearEntidad(() => void paginas.reload());
    const acciones = useAccionesEntidad(uid, React.useMemo(() => new Set(membresias.rows.map((m) => m.group_slug)), [membresias.rows]));

    const comunidades: Puntuada[] = React.useMemo(() => {
        const ahora = Date.now();
        const act = actividadPorEntidad(posts.rows, ahora);
        const afin = afinidadDe(grupos.rows.map(entidadDeGrupo), membresias.rows);
        return paginas.rows
            .filter((p) => (p.kind ?? "").toLowerCase() === "comunidad")
            .map(entidadDePagina)
            .map((e) => puntuar(e, act.get(claveEntidad("pagina", e.slug)) ?? null, afin, ahora));
    }, [paginas.rows, grupos.rows, posts.rows, membresias.rows]);

    const ordenadas = React.useMemo(() => {
        const l = [...comunidades];
        if (orden === "nuevas") return l.sort((a, b) => b.e.creada - a.e.creada);
        if (orden === "grandes") return l.sort((a, b) => b.e.miembros - a.e.miembros);
        return l.sort((a, b) => b.puntos - a.puntos);
    }, [comunidades, orden]);

    const personas = comunidades.reduce((n, p) => n + p.e.miembros, 0);
    const estado = estadoSocial({ cargando: paginas.loading, hayDatos: comunidades.length > 0 });

    return (
        <>
            <MarcoSocial
                titulo="Comunidades"
                subtitulo={`${plural(comunidades.length, "comunidad", "comunidades")} · ${formatoNumero(personas)} personas`}
                icono={Globe2}
                categoria="social"
                acento={ACENTO}
                estado={estado}
                vivo
                esqueleto="lista"
                vacio={{ icono: Sprout, titulo: "Aún no hay comunidades en la Red", mensaje: "Una comunidad es la página de una sangha, una biorregión o un colectivo. Funda la primera.", accion: { etiqueta: "Fundar una comunidad", onClick: () => crear.abrir("page") } }}
                acciones={(t) => (
                    <>
                        <BotonIcono icono={Globe2} etiqueta="Abrir el Hub de comunidades" href="/hub" acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Plus} etiqueta="Fundar una comunidad" onClick={() => crear.abrir("page")} acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => (
                    <VistaEntidades t={t} lista={ordenadas} unidad="comunidades" etiquetaLista="Comunidades"
                        controles={
                            <Segmentos<Orden> etiqueta="Orden" acento={t.acento} tactil={t.tactil} valor={orden} onCambio={setOrden}
                                opciones={[{ id: "vivas", etiqueta: "Más vivas" }, { id: "nuevas", etiqueta: "Nuevas" }, { id: "grandes", etiqueta: "Más grandes" }]} />
                        }
                        accion={(p, soloIcono) => (
                            <span className="flex shrink-0 items-center gap-1">
                                <BotonRelacion e={p.e} relacion={acciones.relacion(p.e)} onActuar={acciones.actuar} enCurso={acciones.enCurso === p.e.id} acento={t.acento} tactil={t.tactil} soloIcono={soloIcono} />
                                {t.base !== "m" && t.base !== "s" && <BotonIcono icono={Share2} etiqueta={`Invitar a ${p.e.nombre}`} onClick={() => void invitarA(p.e)} acento={t.acento} tactil={t.tactil} />}
                            </span>
                        )} />
                )}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

export default CommunitiesWidget;
