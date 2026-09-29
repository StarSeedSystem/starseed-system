"use client";

// ════════════════════════════════════════════════════════════════
// MyPagesWidget — lo que cuidas en la Red: tus páginas y grupos (Ola 0929 · D)
// ----------------------------------------------------------------
// Las páginas que fundaste (`os_pages.owner_id`) y los grupos que fundaste
// o en los que participas (`os_groups` + `os_memberships`, con tu rol), con
// su actividad REAL de la semana (publicaciones de `os_posts` que las
// nombran, día a día) — fuera la «sparkline» de ruido que había. Acciones
// reales: abrir, invitar (hoja de compartir o enlace copiado) y crear una
// página o un grupo con el diálogo real. Hooks compartidos de os-live.
//
// micro = cuántas cuidas · s = la más viva · m/torre = tus espacios con su
// pulso de 7 días · l = tipo + pulso + invitar · xl = tarjetas con portada
// · panorámico = tarjetas en fila. Estados: cargando (lista), sin sesión,
// vacío con «Crear página» y «Explorar»; sin error visible: los hooks
// degradan a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { Compass, Crown, LayoutGrid, Plus, Share2, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUid, useLiveGroups, useLivePages, useLivePosts, useMyMemberships } from "@/lib/widget-data/os-live";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono, Pastilla, Segmentos, estilosSocial as estilos, tintaDe } from "./_social-d/piezas";
import { Escudo, FilaEntidad, Pulso, TarjetaEntidad, invitarA } from "./_social-d/entidad-piezas";
import { actividadPorEntidad, claveEntidad, entidadDeGrupo, entidadDePagina, puntuar, rolLegible, type Puntuada } from "./_social-d/entidades";
import { useCrearEntidad } from "./_social-d/crear-entidad";
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from "./_social-d/tamano";
import { formatoNumero, plural } from "./_social-d/formato";

const ACENTO = "#38bdf8";

type Filtro = "todo" | "pagina" | "grupo";

interface Mio { p: Puntuada; rol: string }

export function MyPagesWidget() {
    const { uid, ready } = useCurrentUid();
    const paginas = useLivePages();
    const grupos = useLiveGroups();
    const posts = useLivePosts(40);
    const membresias = useMyMemberships(uid);
    const [filtro, setFiltro] = React.useState<Filtro>("todo");
    const crear = useCrearEntidad(() => { void paginas.reload(); void grupos.reload(); });

    const mios: Mio[] = React.useMemo(() => {
        if (!uid) return [];
        const ahora = Date.now();
        const act = actividadPorEntidad(posts.rows, ahora);
        const rolDe = new Map(membresias.rows.map((m) => [m.group_slug, m.role]));
        const lista: Mio[] = [];
        for (const r of paginas.rows) {
            if (r.owner_id !== uid) continue;
            const e = entidadDePagina(r);
            lista.push({ p: puntuar(e, act.get(claveEntidad("pagina", e.slug)) ?? null, new Map(), ahora), rol: "Fundaste" });
        }
        for (const r of grupos.rows) {
            const propio = r.owner_id === uid;
            if (!propio && !rolDe.has(r.slug)) continue;
            const e = entidadDeGrupo(r);
            lista.push({ p: puntuar(e, act.get(claveEntidad("grupo", e.slug)) ?? null, new Map(), ahora), rol: propio ? "Fundaste" : rolLegible(rolDe.get(r.slug)) });
        }
        // Lo más vivo primero: publicaciones de la semana, luego miembros.
        return lista.sort((a, b) => (b.p.actividad?.semana ?? 0) - (a.p.actividad?.semana ?? 0) || b.p.e.miembros - a.p.e.miembros);
    }, [uid, paginas.rows, grupos.rows, posts.rows, membresias.rows]);

    const visibles = filtro === "todo" ? mios : mios.filter((m) => m.p.e.origen === filtro);
    const miembros = mios.reduce((n, m) => n + m.p.e.miembros, 0);
    const estado = estadoSocial({ sinSesion: ready && !uid, cargando: !ready || (paginas.loading && grupos.loading), hayDatos: mios.length > 0 });

    const acciones = (m: Mio, t: TamanoSocial) => (
        <span className="flex shrink-0 items-center gap-1">
            <BotonIcono icono={Share2} etiqueta={`Invitar a ${m.p.e.nombre}`} onClick={() => void invitarA(m.p.e)} acento={t.acento} tactil={t.tactil} />
        </span>
    );

    return (
        <>
            <MarcoSocial
                titulo="Mis Páginas"
                subtitulo={`${plural(mios.length, "espacio", "espacios")} · ${plural(miembros, "persona", "personas")}`}
                icono={LayoutGrid}
                categoria="perfil"
                acento={ACENTO}
                estado={estado}
                vivo
                esqueleto="lista"
                sinSesion={{ mensaje: "Entra para ver las páginas y grupos que cuidas." }}
                vacio={{ icono: LayoutGrid, titulo: "Aún no cuidas ningún espacio", mensaje: "Crea una página para tu comunidad o proyecto, o únete a un grupo desde Explorar Red.", accion: { etiqueta: "Crear página", onClick: () => crear.abrir("page") } }}
                acciones={(t) => (
                    <>
                        <BotonIcono icono={Compass} etiqueta="Explorar la Red" href="/explorer" acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Plus} etiqueta="Crear página o grupo" onClick={() => crear.abrir("page")} acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    const top = mios[0];
                    if (t.base === "micro") {
                        const lado = Math.max(40, Math.min(t.ancho, t.alto));
                        return (
                            <Link href={top.p.e.href} aria-label={`${plural(mios.length, "espacio", "espacios")} que cuidas; el más vivo: ${top.p.e.nombre}`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                                <span className="font-light tabular-nums text-white" style={{ fontSize: lado * 0.36, lineHeight: 1 }}>{mios.length}</span>
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">espacios</span>
                            </Link>
                        );
                    }
                    if (t.base === "s") {
                        return (
                            <div className="flex h-full min-h-0 flex-col justify-center gap-2">
                                <Link href={top.p.e.href} className="flex cursor-pointer items-center gap-2.5" aria-label={`${top.p.e.nombre}, ${top.rol}`}>
                                    <Escudo e={top.p.e} tam={40} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-semibold text-white">{top.p.e.nombre}</span>
                                        <span className="block truncate text-[11px]" style={{ color: tintaDe(t.acento) }}>{top.rol} · {formatoNumero(top.p.e.miembros)} personas</span>
                                    </span>
                                </Link>
                                {top.p.actividad && <Pulso serie={top.p.actividad.serie} color={top.p.e.acento} ancho={Math.min(140, t.ancho - 10)} alto={18} etiqueta={`Publicaciones de la semana en ${top.p.e.nombre}: ${top.p.actividad.serie.join(", ")}`} />}
                            </div>
                        );
                    }
                    if (t.clase === "panoramico" || t.base === "xl") {
                        const cols = t.clase === "panoramico" ? columnasQueCaben(t.ancho, 210, 1, 6) : columnasQueCaben(t.ancho, 200, 2, 4);
                        const filas = t.clase === "panoramico" ? 1 : Math.max(1, Math.floor((t.alto - 44) / 220));
                        if (t.clase === "panoramico" && t.alto < 200) {
                            return (
                                <ul className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Tus espacios">
                                    {mios.slice(0, cols).map((m) => <li key={m.p.e.id} className="min-w-0"><FilaEntidad p={m.p} acento={t.acento} tactil={t.tactil} detalle={` · ${m.rol}`} derecha={acciones(m, t)} /></li>)}
                                </ul>
                            );
                        }
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                {t.base === "xl" && <Filtros t={t} filtro={filtro} setFiltro={setFiltro} mios={mios} />}
                                <ul className="grid min-h-0 flex-1 auto-rows-fr gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Tus espacios">
                                    {visibles.slice(0, cols * filas).map((m) => (
                                        <li key={m.p.e.id} className="relative min-h-0">
                                            <TarjetaEntidad p={m.p} acento={t.acento} tactil={t.tactil} accion={acciones(m, t)} altoPortada={t.clase === "panoramico" ? Math.max(56, Math.min(100, t.alto * 0.26)) : 72} />
                                            <Rol rol={m.rol} t={t} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    }
                    const conFiltros = t.base === "l";
                    const lista = conFiltros ? visibles : mios;
                    const max = filasQueCaben(t.alto - (conFiltros ? 44 : 0), t.tactil ? 62 : 54, 2, 9);
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            {conFiltros && <Filtros t={t} filtro={filtro} setFiltro={setFiltro} mios={mios} />}
                            <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll", lista.length > max && estilos.desvanece)} aria-label="Tus espacios">
                                {lista.slice(0, max).map((m) => (
                                    <li key={m.p.e.id} className={estilos.aparece}>
                                        <FilaEntidad p={m.p} acento={t.acento} tactil={t.tactil}
                                            detalle={<> · {m.rol} · {formatoNumero(m.p.e.miembros)} personas</>}
                                            derecha={
                                                <span className="flex shrink-0 items-center gap-2">
                                                    {t.ancho > 300 && <Pulso serie={m.p.actividad?.serie ?? [0, 0, 0, 0, 0, 0, 0]} color={m.p.e.acento} etiqueta={`Publicaciones de la semana en ${m.p.e.nombre}: ${(m.p.actividad?.serie ?? []).join(", ") || "ninguna"}`} />}
                                                    {conFiltros && acciones(m, t)}
                                                </span>
                                            } />
                                    </li>
                                ))}
                                {lista.length === 0 && <li className="grid flex-1 place-items-center py-4 text-center text-[12px] text-white/55">Nada con este filtro.</li>}
                            </ul>
                            {conFiltros && (
                                <div className="flex flex-wrap gap-1.5">
                                    <Pastilla acento={t.acento} icono={Plus} onClick={() => crear.abrir("page")} tactil={t.tactil}>Nueva página</Pastilla>
                                    <Pastilla acento={t.acento} icono={Users} onClick={() => crear.abrir("group")} tactil={t.tactil}>Nuevo grupo</Pastilla>
                                </div>
                            )}
                        </div>
                    );
                }}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

function Filtros({ t, filtro, setFiltro, mios }: { t: TamanoSocial; filtro: Filtro; setFiltro: (f: Filtro) => void; mios: Mio[] }) {
    return (
        <Segmentos<Filtro> etiqueta="Tipo de espacio" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={setFiltro}
            opciones={[
                { id: "todo", etiqueta: "Todo", n: mios.length },
                { id: "pagina", etiqueta: "Páginas", n: mios.filter((m) => m.p.e.origen === "pagina").length },
                { id: "grupo", etiqueta: "Grupos", n: mios.filter((m) => m.p.e.origen === "grupo").length },
            ]} />
    );
}

function Rol({ rol, t }: { rol: string; t: TamanoSocial }) {
    const Icono = rol === "Fundaste" ? Crown : rol === "Administras" || rol === "Moderas" ? Shield : Users;
    return (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full ss-redondo bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Icono className="size-3" style={{ color: tintaDe(t.acento) }} aria-hidden />{rol}
        </span>
    );
}

export default MyPagesWidget;
