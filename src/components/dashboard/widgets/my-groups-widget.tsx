"use client";

// ════════════════════════════════════════════════════════════════
// MyGroupsWidget — tus grupos y los que te esperan (Ola 0929 · D)
// ----------------------------------------------------------------
// Los grupos REALES en los que estás (`os_memberships` + `os_groups`), con
// tu rol y su actividad de la semana (`os_posts`), y —en «Descubrir»— los
// que aún no, ordenados por señales medidas y afinidad con los tuyos.
// Acciones reales: unirte (`os_memberships`), invitar (hoja de compartir o
// enlace copiado), abrir y crear un grupo con el diálogo real. Hooks
// compartidos de os-live.
//
// micro = en cuántos estás · s = el más vivo · m/torre = tus grupos con su
// rol · l = Tuyos/Descubrir + búsqueda + acciones · xl = tarjetas ·
// panorámico = tarjetas en fila. Estados: cargando (lista), sin sesión,
// vacío con «Explorar grupos» (y «Crear grupo»); sin error visible: los
// hooks degradan a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Compass, Plus, Share2, Users } from "lucide-react";
import { useCurrentUid, useLiveGroups, useLivePosts, useMyMemberships } from "@/lib/widget-data/os-live";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono, Segmentos } from "./_social-d/piezas";
import { BotonRelacion, invitarA, useAccionesEntidad } from "./_social-d/entidad-piezas";
import { actividadPorEntidad, afinidadDe, claveEntidad, entidadDeGrupo, puntuar, rolLegible, type Puntuada } from "./_social-d/entidades";
import { VistaEntidades } from "./_social-d/vista-entidades";
import { useCrearEntidad } from "./_social-d/crear-entidad";
import { plural } from "./_social-d/formato";

const ACENTO = "#10b981";

type Vista = "tuyos" | "descubrir";

export function MyGroupsWidget() {
    const { uid, ready } = useCurrentUid();
    const grupos = useLiveGroups();
    const posts = useLivePosts(40);
    const membresias = useMyMemberships(uid);
    const [vista, setVista] = React.useState<Vista>("tuyos");
    const crear = useCrearEntidad(() => void grupos.reload());
    const miembroDe = React.useMemo(() => new Set(membresias.rows.map((m) => m.group_slug)), [membresias.rows]);
    const acciones = useAccionesEntidad(uid, miembroDe);
    const rolDe = React.useMemo(() => new Map(membresias.rows.map((m) => [m.group_slug, m.role])), [membresias.rows]);

    const { tuyos, otros } = React.useMemo(() => {
        const ahora = Date.now();
        const act = actividadPorEntidad(posts.rows, ahora);
        const ents = grupos.rows.map(entidadDeGrupo);
        const afin = afinidadDe(ents, membresias.rows);
        const todos = ents.map((e) => puntuar(e, act.get(claveEntidad("grupo", e.slug)) ?? null, afin, ahora));
        const esMio = (p: Puntuada) => miembroDe.has(p.e.slug) || (!!uid && p.e.duenoId === uid);
        return {
            tuyos: todos.filter(esMio).sort((a, b) => (b.actividad?.ultima ?? 0) - (a.actividad?.ultima ?? 0) || b.puntos - a.puntos),
            otros: todos.filter((p) => !esMio(p)).sort((a, b) => b.puntos - a.puntos),
        };
    }, [grupos.rows, posts.rows, membresias.rows, miembroDe, uid]);

    const lista = vista === "tuyos" ? tuyos : otros;
    const estado = estadoSocial({ sinSesion: ready && !uid, cargando: !ready || grupos.loading, hayDatos: tuyos.length > 0 });

    return (
        <>
            <MarcoSocial
                titulo="Mis Grupos"
                subtitulo={`${plural(tuyos.length, "grupo", "grupos")}${otros.length ? ` · ${otros.length} por descubrir` : ""}`}
                icono={Users}
                categoria="social"
                acento={ACENTO}
                estado={estado}
                vivo
                esqueleto="lista"
                sinSesion={{ mensaje: "Entra para ver tus grupos y los que te esperan." }}
                vacio={{ icono: Users, titulo: "Aún no estás en ningún grupo", mensaje: otros.length ? `Hay ${plural(otros.length, "grupo", "grupos")} en la Red esperándote: círculos, colectivos y asambleas.` : "Crea el primero: un círculo, un colectivo o una asamblea.", accion: otros.length ? { etiqueta: "Explorar grupos", href: "/explorer" } : { etiqueta: "Crear grupo", onClick: () => crear.abrir("group") } }}
                acciones={(t) => (
                    <>
                        <BotonIcono icono={Compass} etiqueta="Explorar la Red" href="/explorer" acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Plus} etiqueta="Crear grupo" onClick={() => crear.abrir("group")} acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => (
                    <VistaEntidades t={t} lista={t.base === "l" || t.base === "xl" || t.clase === "panoramico" ? lista : tuyos} unidad={vista === "tuyos" ? "grupos tuyos" : "grupos por descubrir"} etiquetaLista={vista === "tuyos" ? "Tus grupos" : "Grupos por descubrir"}
                        detalle={(p) => (miembroDe.has(p.e.slug) || p.e.duenoId === uid ? (p.e.duenoId === uid ? "Fundaste" : rolLegible(rolDe.get(p.e.slug))) : p.motivos[0] ?? "")}
                        vacioFiltro={vista === "descubrir" ? "Ya estás en todos los grupos de la Red." : undefined}
                        controles={
                            <Segmentos<Vista> etiqueta="Qué grupos" acento={t.acento} tactil={t.tactil} valor={vista} onCambio={setVista}
                                opciones={[{ id: "tuyos", etiqueta: "Tuyos", n: tuyos.length }, { id: "descubrir", etiqueta: "Descubrir", n: otros.length }]} />
                        }
                        accion={(p, soloIcono) => {
                            const rel = acciones.relacion(p.e);
                            return rel ? (
                                <BotonIcono icono={Share2} etiqueta={`Invitar a ${p.e.nombre}`} onClick={() => void invitarA(p.e)} acento={t.acento} tactil={t.tactil} />
                            ) : (
                                <BotonRelacion e={p.e} relacion={rel} onActuar={acciones.actuar} enCurso={acciones.enCurso === p.e.id} acento={t.acento} tactil={t.tactil} soloIcono={soloIcono} />
                            );
                        }} />
                )}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

export default MyGroupsWidget;
