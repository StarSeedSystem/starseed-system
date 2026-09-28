"use client";
/**
 * Barra superior común de las apps en vivo: volver, título, estado de guardado, quién está
 * dentro, deshacer/rehacer, acciones principales (las pone cada app) y un menú vertical «Más».
 * Todo con texto completo: nada de botones con la etiqueta recortada.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Cloud, CloudOff, Ellipsis, Eye, Loader2, Pencil, Redo2, Share2, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { EstadoGuardado } from "@/lib/vivo/tabla/motor-colab";
import type { Presente } from "@/lib/vivo/tabla/presencia";
import { PanelModal } from "./panel-modal";
import { AvatarPersona, type PerfilCorto } from "./personas";
import css from "./tabla.module.css";

export interface ItemMenu {
    id: string;
    etiqueta: string;
    icono: LucideIcon;
    alElegir: () => void;
    peligro?: boolean;
    deshabilitado?: boolean;
    separadorAntes?: boolean;
}

/** El estado de guardado en una frase corta y con su color. */
export function estadoDeGuardado(g: EstadoGuardado, puedeEditar: boolean): { texto: string; color: string; icono: LucideIcon; girar?: boolean } {
    if (!puedeEditar || g === "sin-permiso") return { texto: "Solo lectura", color: "#FFBF00", icono: Eye };
    switch (g) {
        case "guardando":
            return { texto: "Guardando…", color: "#007FFF", icono: Loader2, girar: true };
        case "pendiente":
            return { texto: "Cambios sin guardar", color: "#7C5CFF", icono: Cloud };
        case "reintentando":
            return { texto: "Sin conexión, reintentando", color: "#DC143C", icono: CloudOff };
        default:
            return { texto: "Guardado", color: "#10B981", icono: Cloud };
    }
}

export function BarraHerramientas({
    volverHref,
    volverEtiqueta,
    titulo,
    puedeRenombrar,
    alRenombrar,
    guardado,
    puedeEditar,
    presentes,
    perfil,
    puedeDeshacer,
    puedeRehacer,
    alDeshacer,
    alRehacer,
    alCompartir,
    menu,
    children,
}: {
    volverHref: string;
    volverEtiqueta: string;
    titulo: string;
    puedeRenombrar: boolean;
    alRenombrar: (nuevo: string) => void;
    guardado: EstadoGuardado;
    puedeEditar: boolean;
    presentes: readonly Presente[];
    perfil: (uid: string) => PerfilCorto | undefined;
    puedeDeshacer?: boolean;
    puedeRehacer?: boolean;
    alDeshacer?: () => void;
    alRehacer?: () => void;
    alCompartir: () => void;
    menu: ItemMenu[];
    children?: ReactNode;
}) {
    const [renombrando, setRenombrando] = useState(false);
    const [borrador, setBorrador] = useState(titulo);
    useEffect(() => {
        if (!renombrando) setBorrador(titulo);
    }, [titulo, renombrando]);
    const est = estadoDeGuardado(guardado, puedeEditar);
    const Icono = est.icono;
    // Una persona con varias pestañas cuenta una sola vez.
    const unicos = [...new Map(presentes.map((p) => [p.uid, p])).values()];
    const items: ItemMenu[] = puedeRenombrar
        ? [{ id: "renombrar", etiqueta: "Cambiar el nombre", icono: Pencil, alElegir: () => setRenombrando(true) }, ...menu]
        : menu;

    return (
        <header className={`${css.barra} ${css.panel}`}>
            <div className={css.barraTitulo}>
                <Link href={volverHref} className={`${css.boton} ${css.botonIcono} ss-redondo`} aria-label={volverEtiqueta} title={volverEtiqueta}>
                    <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <h1 className={css.titulo} title={titulo}>
                    {titulo || "Sin título"}
                </h1>
                <span
                    className={`${css.pildora} ss-redondo`}
                    style={{ ["--c" as string]: est.color }}
                    role="status"
                    aria-live="polite"
                    data-testid="estado-guardado"
                >
                    <Icono size={14} aria-hidden="true" className={est.girar ? css.girar : undefined} />
                    {est.texto}
                </span>
            </div>

            <div className={css.acciones}>
                {unicos.length > 0 ? (
                    <div className={css.avatares} role="group" aria-label={`Ahora mismo hay ${unicos.length} ${unicos.length === 1 ? "persona más" : "personas más"} aquí`}>
                        {unicos.slice(0, 5).map((p) => (
                            <span key={p.uid} title={p.nombre}>
                                <AvatarPersona uid={p.uid} nombre={p.nombre} avatar={perfil(p.uid)?.avatar} />
                            </span>
                        ))}
                        {unicos.length > 5 ? (
                            <span className={`${css.avatar} ss-redondo`} style={{ ["--c" as string]: "#8a8fa8" }} aria-hidden="true">
                                +{unicos.length - 5}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {puedeEditar && alDeshacer && alRehacer ? (
                    <>
                        <button type="button" className={`${css.boton} ${css.botonIcono}`} disabled={!puedeDeshacer} onClick={alDeshacer} aria-label="Deshacer mi último cambio" title="Deshacer (Ctrl+Z)">
                            <Undo2 size={17} aria-hidden="true" />
                        </button>
                        <button type="button" className={`${css.boton} ${css.botonIcono}`} disabled={!puedeRehacer} onClick={alRehacer} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">
                            <Redo2 size={17} aria-hidden="true" />
                        </button>
                    </>
                ) : null}

                {children}

                <button type="button" className={css.boton} onClick={alCompartir}>
                    <Share2 size={16} aria-hidden="true" /> Compartir
                </button>

                <DropdownMenu.Root>
                    <DropdownMenu.Trigger className={css.boton} aria-label="Más opciones">
                        <Ellipsis size={18} aria-hidden="true" /> Más
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content className={css.menu} align="end" sideOffset={8} collisionPadding={12}>
                            {items.map((it) => (
                                <div key={it.id} style={{ display: "contents" }}>
                                    {it.separadorAntes ? <DropdownMenu.Separator className={css.menuSeparador} /> : null}
                                    <DropdownMenu.Item
                                        className={`${css.menuItem} ${it.peligro ? css.menuPeligro : ""}`}
                                        disabled={it.deshabilitado}
                                        onSelect={() => it.alElegir()}
                                    >
                                        <it.icono size={16} aria-hidden="true" />
                                        {it.etiqueta}
                                    </DropdownMenu.Item>
                                </div>
                            ))}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            </div>

            <PanelModal abierto={renombrando} alCambiar={setRenombrando} titulo="Cambiar el nombre" descripcion="Lo verán todas las personas con acceso.">
                <form
                    className={css.seccion}
                    onSubmit={(e) => {
                        e.preventDefault();
                        const limpio = borrador.trim();
                        if (limpio) alRenombrar(limpio);
                        setRenombrando(false);
                    }}
                >
                    <div className={css.campo}>
                        <label htmlFor="nuevo-nombre">Nombre</label>
                        <input id="nuevo-nombre" className={css.entrada} value={borrador} maxLength={80} autoFocus onChange={(e) => setBorrador(e.target.value)} />
                    </div>
                    <div className={css.fichas}>
                        <button type="submit" className={`${css.boton} ${css.botonPrimario}`} disabled={!borrador.trim()}>
                            Guardar el nombre
                        </button>
                        <button type="button" className={css.boton} onClick={() => setRenombrando(false)}>
                            Cancelar
                        </button>
                    </div>
                </form>
            </PanelModal>
        </header>
    );
}
