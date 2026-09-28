"use client";
/**
 * Dashboard compartido: los MISMOS widgets del dashboard personal (`GridArea`), con su acomodo y
 * su configuración sincronizados entre las personas que lo abren. Aquí solo se conecta el motor
 * de documento vivo con `GridArea`; el modelo y la fusión por widget viven en
 * `@/lib/vivo/dashboard` y se prueban sin React.
 *
 * Honestidad: lo que se comparte es el acomodo y la configuración. Los datos de dentro de cada
 * widget (notas, tareas, ubicación…) son de quien mira, y la página lo dice.
 */
import { LayoutDashboard, Loader2, Pencil, Info, TriangleAlert, Users, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddWidgetDialog } from "@/components/dashboard/add-widget-dialog";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import { GridArea } from "@/components/dashboard/grid-area";
import { mejorHueco } from "@/components/dashboard/editor-superior/acomodo";
import { dimsTalla } from "@/components/dashboard/editor-superior/tallas";
import { getManifest } from "@/components/dashboard/widget-manifest";
import { toast } from "@/components/ui/use-toast";
import { WeatherLocationProvider } from "@/modules/weather/context/weather-location-context";
import { updateSpaceMeta } from "@/lib/spaces/spaces";
import {
    anadirWidget,
    aplicarWidgets,
    aWidgets,
    crearMotorDashboard,
    rutaDashboard,
    type DocDashboard,
} from "@/lib/vivo/dashboard";
import { BarraHerramientas, type ItemMenu } from "../tabla/barra-herramientas";
import { PanelCompartir } from "../tabla/panel-compartir";
import { usePerfiles } from "../tabla/personas";
import { useMotorVivo } from "../tabla/use-motor";
import { usePresencia } from "../tabla/use-presencia";
import css from "../tabla/tabla.module.css";

const NOTA_FUSION =
    "Cada widget se guarda por separado: si dos personas mueven o cambian widgets distintos a la vez se conservan los dos cambios. Si cambian el mismo widget a la vez, se queda lo último que se guardó. Los datos de dentro de cada widget no se comparten: cada persona ve los suyos.";

export function DashboardVivo({ id }: { id: string }) {
    const router = useRouter();
    const { motor, snap, uid } = useMotorVivo<DocDashboard>(id, (u) => crearMotorDashboard(id, u));
    const { presentes } = usePresencia(`dashboard:${id}`);
    const perfil = usePerfiles(useMemo(() => [...new Set([...(uid ? [uid] : []), ...(snap.propietario ? [snap.propietario] : []), ...presentes.map((p) => p.uid)])], [uid, snap.propietario, presentes]));

    const doc = snap.doc;
    const puedeEditar = snap.puedeEditar;
    const widgets = useMemo(() => (doc ? aWidgets(doc, id) : []), [doc, id]);
    const [editando, setEditando] = useState(false);
    const [compartir, setCompartir] = useState(false);
    const [tituloLocal, setTituloLocal] = useState<string | null>(null);
    const [accesoLocal, setAccesoLocal] = useState<string | null>(null);
    useEffect(() => setTituloLocal(null), [snap.titulo]);
    // Si se pierde el permiso de edición (cambió el rol), se sale de la edición.
    useEffect(() => {
        if (!puedeEditar) setEditando(false);
    }, [puedeEditar]);

    const ref = useRef(widgets);
    ref.current = widgets;

    const setWidgets = useCallback(
        (siguiente: DashboardWidget[]) => {
            motor?.aplicar((d, c) => aplicarWidgets(d, siguiente, c));
        },
        [motor],
    );

    const alAnadir = useCallback(
        (type: WidgetType) => {
            if (!motor) return;
            const d = dimsTalla(type, "M");
            const hueco = mejorHueco(ref.current, d.w, d.h);
            const out: { id: string | null } = { id: null };
            motor.aplicar((doc0, c) => {
                const r = anadirWidget(doc0, { tipo: type, pos: { x: hueco.x, y: hueco.y, w: d.w, h: d.h }, size: d.size, ajustes: {} }, c);
                out.id = r.id;
                return r.doc;
            });
            const nombre = getManifest(type)?.label ?? String(type).replace(/_/g, " ").toLowerCase();
            if (out.id) toast({ title: "Widget añadido", description: `${nombre} ya está en el dashboard compartido.` });
            else toast({ title: "No se pudo añadir el widget", description: "Se llegó al máximo de widgets, o este tipo no se puede compartir." });
        },
        [motor],
    );

    // «Fijar en pantalla»: una ficha flotante SOLO de este dispositivo. El HTML sale de una plantilla
    // fija con el tipo (validado: solo A-Z, 0-9 y «_») y jamás de la configuración compartida.
    const alFijar = useCallback((w: DashboardWidget) => {
        const tipo = String(w.widget_type);
        if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(tipo)) return;
        const nombre = getManifest(w.widget_type)?.label ?? tipo.replace(/_/g, " ");
        try {
            const CLAVE = "starseed_pinned_widgets";
            const previos = JSON.parse(localStorage.getItem(CLAVE) || "[]") as { id?: string }[];
            const lista = Array.isArray(previos) ? previos : [];
            if (lista.some((x) => x.id === w.id)) return;
            lista.push({
                id: w.id,
                htmlCode: `<div style="background:rgba(20,20,30,0.9);padding:24px;border-radius:20px;color:white;border:1px solid rgba(255,255,255,0.08);"><h3 style="font-size:16px;font-weight:600;margin:0 0 8px;">${tipo.replace(/_/g, " ")}</h3><p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Widget fijado desde un dashboard compartido</p></div>`,
                title: nombre.replace(/[<>&"']/g, ""),
                themeColor: "#007FFF",
                position: { x: 60 + lista.length * 30, y: 60 + lista.length * 30, width: 420, height: 340 },
            } as never);
            localStorage.setItem(CLAVE, JSON.stringify(lista));
            window.dispatchEvent(new Event("storage"));
        } catch {
            toast({ title: "No se pudo fijar el widget", description: "Este dispositivo no deja guardar la ficha." });
        }
    }, []);

    const renombrar = useCallback(
        async (nuevo: string) => {
            setTituloLocal(nuevo);
            const ok = await updateSpaceMeta(id, { title: nuevo });
            if (!ok) {
                setTituloLocal(null);
                toast({ title: "No se pudo cambiar el nombre", description: "Solo quien tiene permiso de edición puede hacerlo." });
            }
        },
        [id],
    );

    if (snap.fase === "cargando" || (!motor && snap.fase !== "no-disponible")) {
        return (
            <div className={css.raiz}>
                <div className={`${css.vacio} ${css.panel}`} role="status" aria-live="polite">
                    <Loader2 size={28} className={css.girar} aria-hidden="true" />
                    <p>Abriendo el dashboard…</p>
                </div>
            </div>
        );
    }
    if (snap.fase === "no-disponible" || !doc) {
        return (
            <div className={css.raiz}>
                <div className={`${css.vacio} ${css.panel}`} role="alert">
                    <TriangleAlert size={28} aria-hidden="true" />
                    <h2>No se pudo abrir el dashboard</h2>
                    <p>{snap.motivo ?? "Algo falló al abrirlo."}</p>
                    <div className={css.fichas}>
                        <button type="button" className={css.boton} onClick={() => window.location.reload()}>
                            Reintentar
                        </button>
                        <Link href="/dashboard-compartido" className={css.boton}>
                            Ver mis dashboards compartidos
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const menu: ItemMenu[] = [{ id: "lista", etiqueta: "Ver mis dashboards compartidos", icono: LayoutDashboard, alElegir: () => router.push("/dashboard-compartido") }];
    const esDueno = !!uid && snap.propietario === uid;

    return (
        <div className={css.raiz} data-testid="dashboard-vivo">
            <BarraHerramientas
                volverHref="/dashboard-compartido"
                volverEtiqueta="Volver a mis dashboards compartidos"
                titulo={tituloLocal ?? snap.titulo}
                puedeRenombrar={puedeEditar}
                alRenombrar={(n) => void renombrar(n)}
                guardado={snap.guardado}
                puedeEditar={puedeEditar}
                presentes={presentes}
                perfil={perfil}
                puedeDeshacer={snap.puedeDeshacer}
                puedeRehacer={snap.puedeRehacer}
                alDeshacer={() => void motor?.deshacer()}
                alRehacer={() => void motor?.rehacer()}
                alCompartir={() => setCompartir(true)}
                menu={menu}
            >
                {puedeEditar ? (
                    <>
                        <button type="button" className={`${css.boton} ${editando ? css.botonPrimario : ""}`} aria-pressed={editando} onClick={() => setEditando((e) => !e)}>
                            {editando ? <Check size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
                            {editando ? "Terminar de editar" : "Editar el acomodo"}
                        </button>
                        {editando ? <AddWidgetDialog onAdd={alAnadir} isEditMode /> : null}
                    </>
                ) : null}
            </BarraHerramientas>

            <div className={`${css.aviso} ${css.avisoInfo}`} role="note">
                <Info size={16} className={css.avisoIcono} aria-hidden="true" />
                <span>
                    Aquí se comparte el <strong>acomodo y la configuración</strong> de los widgets. Los datos de dentro (tus notas, tus tareas, tu ubicación…) no se comparten: cada persona ve cada widget con lo suyo.
                </span>
            </div>
            {!puedeEditar ? (
                <div className={css.aviso} role="note">
                    <Users size={16} className={css.avisoIcono} aria-hidden="true" />
                    <span>Estás mirando este dashboard sin permiso para editarlo.</span>
                </div>
            ) : null}
            {snap.motivo && puedeEditar ? (
                <div className={`${css.aviso} ${snap.guardado === "reintentando" ? css.avisoError : ""}`} role="alert">
                    <TriangleAlert size={16} className={css.avisoIcono} aria-hidden="true" />
                    <span>{snap.motivo}</span>
                </div>
            ) : null}

            <div className={css.dashArea}>
                <WeatherLocationProvider>
                    <GridArea
                        dashboardId={id}
                        widgets={widgets}
                        setWidgets={setWidgets}
                        isEditMode={puedeEditar && editando}
                        onAddWidget={(_dashId, type) => alAnadir(type)}
                        onPinWidget={alFijar}
                        cuadricula={editando}
                    />
                </WeatherLocationProvider>
            </div>

            <PanelCompartir
                abierto={compartir}
                alCambiar={setCompartir}
                espacioId={id}
                esDueno={esDueno}
                duenoUid={snap.propietario}
                acceso={accesoLocal ?? snap.acceso}
                rutaPublica={rutaDashboard(id)}
                nota={NOTA_FUSION}
                alCambiarAcceso={setAccesoLocal}
            />
        </div>
    );
}
