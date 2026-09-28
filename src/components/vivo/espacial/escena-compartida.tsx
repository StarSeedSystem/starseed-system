"use client";

/**
 * ESCENA 3D COMPARTIDA · interfaz (L5 · 2026-09-28).
 * ============================================================================
 * La capa de interfaz (DOM, ligera) sobre el lienzo 3D (pesado, cargado con `next/dynamic` y
 * `ssr:false`). Sirve para las dos rutas:
 *   · `/escena/<id>` — la escena en 3D (ratón o dedos para orbitar), con VR/AR si el
 *     dispositivo lo admite;
 *   · `/sala-xr/…` — la misma escena con la entrada a VR/AR al frente y una nota honesta cuando
 *     el dispositivo no puede.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    Cloud,
    CloudOff,
    Eye,
    Glasses,
    Headset,
    Loader2,
    LogOut,
    Layers,
    Plus,
    Save,
    ScanEye,
    Users,
    X,
} from "lucide-react";
import type { FuenteEscena } from "@/lib/vivo/espacial/sesion";
import { objetosVivos, type OpcionesNuevoObjeto, type TipoObjeto, type Vec3 } from "@/lib/vivo/espacial/modelo";
import { describirSoporteXR, plataformaDe, type ModoXR } from "@/lib/vivo/xr";
import { rutaEscena } from "@/lib/vivo/escena3d";
import { useSesionEscena } from "./use-sesion-escena";
import { usePerfilRendimiento } from "./rendimiento";
import { PanelAnadir, PanelEscena, PanelInspector, PanelPersonas } from "./paneles";
import type { CamaraCompartida, ModoGizmo } from "./lienzo-escena";
import type { EstadoXR } from "./use-sesion-xr";
import css from "./escena.module.css";

const LienzoEscena = dynamic(() => import("./lienzo-escena"), {
    ssr: false,
    loading: () => null,
});

type Hoja = "anadir" | "escena" | "personas" | "inspector" | null;

export interface PropsEscenaCompartida {
    fuente: FuenteEscena;
    /** Viene de la sala XR: la entrada a VR/AR va al frente. */
    enfoqueXR?: boolean;
    /** Modo pedido (por ejemplo, desde una llamada «sala AR»). */
    modoPedido?: ModoXR | null;
    volver?: { ruta: string; etiqueta: string };
}

const ESTADO_GUARDADO: Record<string, { texto: string; color: string }> = {
    guardado: { texto: "Guardado", color: "#10B981" },
    pendiente: { texto: "Cambios sin guardar", color: "#FFBF00" },
    guardando: { texto: "Guardando…", color: "#007FFF" },
    error: { texto: "No se pudo guardar", color: "#DC143C" },
    efimera: { texto: "Sala de la llamada", color: "#14B8A6" },
    lectura: { texto: "Solo lectura", color: "#9aa0ad" },
};

/**
 * Evita que un toque en los paneles cuente como «seleccionar» dentro de la AR del móvil
 * (`beforexrselect`). Ref de función: los paneles aparecen y desaparecen.
 */
function useSinSeleccionXR<T extends HTMLElement>() {
    const anterior = useRef<{ el: T; fn: (e: Event) => void } | null>(null);
    return useCallback((el: T | null) => {
        if (anterior.current) {
            anterior.current.el.removeEventListener("beforexrselect", anterior.current.fn);
            anterior.current = null;
        }
        if (el) {
            const fn = (e: Event) => e.preventDefault();
            el.addEventListener("beforexrselect", fn);
            anterior.current = { el, fn };
        }
    }, []);
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
    return (
        <span className={css.chip} style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
            {children}
        </span>
    );
}

export function EscenaCompartida({ fuente, enfoqueXR = false, modoPedido = null, volver }: PropsEscenaCompartida) {
    const { sesion, estado, avatares } = useSesionEscena(fuente);
    const perfil = usePerfilRendimiento();
    const [seleccion, setSeleccion] = useState<string | null>(null);
    const [hoja, setHoja] = useState<Hoja>(null);
    const [modoGizmo, setModoGizmo] = useState<ModoGizmo>("translate");
    const [xr, setXr] = useState<EstadoXR | null>(null);
    const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
    const [avisoCerrado, setAvisoCerrado] = useState<string | null>(null);
    const [raizOverlay, setRaizOverlay] = useState<HTMLDivElement | null>(null);
    const [tarjetaXRCerrada, setTarjetaXRCerrada] = useState(false);
    const [copia, setCopia] = useState<{ estado: "guardando" | "hecho" | "error"; texto: string } | null>(null);
    const camaraRef = useRef<CamaraCompartida | null>(null);
    const erroresVistos = useRef(new Set<string>());
    const refBarra = useSinSeleccionXR<HTMLElement>();
    const refHoja = useSinSeleccionXR<HTMLDivElement>();
    const refAviso = useSinSeleccionXR<HTMLDivElement>();
    const refTarjetaXR = useSinSeleccionXR<HTMLDivElement>();
    const refDock = useSinSeleccionXR<HTMLElement>();

    const objSel = seleccion ? estado.doc.objetos[seleccion] : undefined;
    const vivos = useMemo(() => objetosVivos(estado.doc), [estado.doc]);

    // Escape cierra el panel abierto (y deja de seleccionar).
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            setHoja(null);
            setSeleccion(null);
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, []);
    // Si el objeto seleccionado desaparece (lo borró otra persona), se cierra el inspector.
    useEffect(() => {
        if (seleccion && (!objSel || objSel.borrado)) {
            setSeleccion(null);
            setHoja((h) => (h === "inspector" ? null : h));
        }
    }, [seleccion, objSel]);

    // El modo del avatar (3D/VR/AR) sigue a la sesión XR.
    useEffect(() => {
        if (!sesion) return;
        sesion.cambiarModo(xr?.activa ? (xr.modo === "immersive-ar" ? "ar" : "vr") : "3d");
    }, [sesion, xr?.activa, xr?.modo]);

    const alXR = useCallback((e: EstadoXR) => setXr(e), []);
    const alSeleccionar = useCallback((id: string | null) => {
        setSeleccion(id);
        setHoja((h) => (id ? "inspector" : h === "inspector" ? null : h));
    }, []);
    const alErrorObjeto = useCallback((_id: string, mensaje: string) => {
        if (erroresVistos.current.has(mensaje)) return;
        erroresVistos.current.add(mensaje);
        setAvisoLocal(mensaje);
    }, []);

    const anadir = useCallback(
        (tipo: TipoObjeto, opciones: OpcionesNuevoObjeto) => {
            if (!sesion) return false;
            // Aparece donde miras: donde tu mirada toca el suelo (entre 2,5 y 10 m), y los carteles
            // e imágenes nacen girados hacia ti.
            const c = camaraRef.current;
            let pos: Vec3 | undefined;
            let giroY: number | undefined;
            if (c) {
                const horiz = Math.hypot(c.dir[0], c.dir[2]) || 1;
                const dist = c.dir[1] < -0.05 ? Math.min(10, Math.max(2.5, (c.pos[1] / -c.dir[1]) * horiz)) : 4;
                const x = c.pos[0] + (c.dir[0] / horiz) * dist;
                const z = c.pos[2] + (c.dir[2] / horiz) * dist;
                const alto: Partial<Record<TipoObjeto, number>> = { texto: 1.4, imagen: 1.3, luz: 2.5, modelo: 0, plano: 0.01, toro: 0.8 };
                const r = (n: number) => Math.round(n * 100) / 100;
                pos = [r(x), alto[tipo] ?? 0.5, r(z)];
                giroY = r(Math.atan2(c.pos[0] - x, c.pos[2] - z));
            }
            const nuevo = sesion.anadir(tipo, { ...opciones, pos, giroY });
            if (nuevo) {
                setSeleccion(nuevo.id);
                setHoja("inspector");
            }
            return !!nuevo;
        },
        [sesion],
    );

    const soporte = useMemo(() => {
        const plataforma = typeof navigator !== "undefined" ? plataformaDe(navigator.userAgent, (navigator.maxTouchPoints ?? 0) > 1) : "escritorio";
        const seguro = typeof window === "undefined" || window.isSecureContext !== false;
        return describirSoporteXR({ vr: xr?.vr ?? null, ar: xr?.ar ?? null, seguro, plataforma }, modoPedido);
    }, [xr?.vr, xr?.ar, modoPedido]);

    const aviso = avisoLocal ?? estado.aviso;
    const mostrarAviso = aviso && aviso !== avisoCerrado;
    const guardado = ESTADO_GUARDADO[estado.guardado] ?? ESTADO_GUARDADO.lectura;
    const otros = avatares.otros;
    const enXR = !!xr?.activa;

    const guardarCopia = async () => {
        if (!sesion) return;
        setCopia({ estado: "guardando", texto: "Guardando una copia…" });
        const r = await sesion.guardarCopia("Sala de la llamada");
        if ("id" in r) setCopia({ estado: "hecho", texto: rutaEscena(r.id) });
        else setCopia({ estado: "error", texto: r.error });
    };

    const botonXR = (modo: "immersive-vr" | "immersive-ar") => {
        const vr = modo === "immersive-vr";
        const Icon = vr ? Headset : ScanEye;
        return (
            <button
                key={modo}
                type="button"
                className={css.boton}
                style={{ background: vr ? "linear-gradient(135deg,#7C5CFF,#4F46E5)" : "linear-gradient(135deg,#14B8A6,#007FFF)" }}
                onClick={() => void xr?.entrar(modo)}
            >
                <Icon className="size-4" aria-hidden /> {vr ? "Entrar en VR" : "Entrar en AR"}
            </button>
        );
    };

    const titulo = estado.titulo || (fuente.tipo === "llamada" ? "Sala de la llamada" : "Escena 3D");

    return (
        <section className={css.escena} aria-label={titulo}>
            <div className={css.lienzo}>
                {sesion && estado.fase === "lista" && (
                    <LienzoEscena
                        sesion={sesion}
                        doc={estado.doc}
                        otros={otros}
                        seleccion={seleccion}
                        onSeleccionar={alSeleccionar}
                        modoGizmo={modoGizmo}
                        puedeEditar={estado.puedeEditar}
                        eco={perfil.eco}
                        reducido={perfil.reducido}
                        camaraRef={camaraRef}
                        raizOverlay={raizOverlay}
                        onXR={alXR}
                        onErrorObjeto={alErrorObjeto}
                    />
                )}
            </div>

            {estado.fase === "cargando" && (
                <div className={css.centro} role="status">
                    <div className={css.tarjeta}>
                        <Loader2 className={`mx-auto size-7 text-violet-300 ${css.girar}`} aria-hidden />
                        <p className="mt-3 font-semibold">Abriendo la escena…</p>
                        <p className="mt-1 text-[12.5px] text-white/60">Cargando objetos y buscando a quien ya está dentro.</p>
                    </div>
                </div>
            )}

            {estado.fase === "error" && (
                <div className={css.centro} role="alert">
                    <div className={css.tarjeta} style={{ pointerEvents: "auto" }}>
                        <AlertTriangle className="mx-auto size-7 text-amber-300" aria-hidden />
                        <p className="mt-3 font-semibold">No se pudo abrir la escena</p>
                        <p className="mt-1 text-[13px] text-white/70">{estado.error}</p>
                        <Link href={volver?.ruta ?? "/escena"} className={`${css.boton} mt-4 w-full`} style={{ background: "#7C5CFF" }}>
                            <ArrowLeft className="size-4" aria-hidden /> {volver?.etiqueta ?? "Ver mis escenas"}
                        </Link>
                    </div>
                </div>
            )}

            <div className={css.capa} ref={setRaizOverlay}>
                <header className={css.barra} ref={refBarra}>
                    <Link href={volver?.ruta ?? "/escena"} className={css.volver} aria-label={volver?.etiqueta ?? "Volver a mis escenas"}>
                        <ArrowLeft className="size-5" aria-hidden />
                    </Link>
                    <div className={css.titulos}>
                        <h1 className={css.titulo}>{titulo}</h1>
                        <div className={css.subtitulo}>
                            {estado.fase === "lista" && (
                                <Chip color={guardado.color}>
                                    {estado.guardado === "lectura" ? <Eye className="size-3" aria-hidden /> : <Cloud className="size-3" aria-hidden />}
                                    {guardado.texto}
                                </Chip>
                            )}
                            {estado.fase === "lista" && !estado.conectado && (
                                <Chip color="#FFBF00">
                                    <CloudOff className="size-3" aria-hidden /> Conectando en vivo…
                                </Chip>
                            )}
                            {estado.sinConfirmar > 0 && <span>{estado.sinConfirmar} cambio(s) de otras personas por confirmar</span>}
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`${css.pila} cursor-pointer rounded-full ss-redondo p-1`}
                        onClick={() => setHoja((h) => (h === "personas" ? null : "personas"))}
                        aria-label={`Personas dentro: ${otros.length + 1}`}
                    >
                        {[avatares.yo, ...otros].filter(Boolean).slice(0, 4).map((a) => (
                            <span key={a!.clave} className={css.punto} style={{ background: a!.color }} aria-hidden>
                                {a!.nombre.slice(0, 1).toUpperCase()}
                            </span>
                        ))}
                        {otros.length > 3 && (
                            <span className={css.punto} style={{ background: "#F5F5F7" }} aria-hidden>
                                +{otros.length - 3}
                            </span>
                        )}
                    </button>
                </header>

                {mostrarAviso && (
                    <div className={css.aviso} role="status" ref={refAviso}>
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
                        <span className="flex-1">{aviso}</span>
                        <button
                            type="button"
                            className={`${css.cerrar} ss-redondo`}
                            style={{ width: 28, height: 28 }}
                            aria-label="Cerrar aviso"
                            onClick={() => {
                                setAvisoCerrado(aviso);
                                setAvisoLocal(null);
                            }}
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </div>
                )}

                <div className={css.cuerpo}>
                    {enfoqueXR && !enXR && !tarjetaXRCerrada && estado.fase === "lista" && (
                        <div className={css.tarjetaXR} style={{ position: "absolute", left: 0, top: 0 }} ref={refTarjetaXR}>
                            <div className="flex items-start gap-3">
                                <span className="grid size-10 shrink-0 place-items-center rounded-[14px]" style={{ background: "#DC143C1f", boxShadow: "inset 0 0 0 1px #DC143C66", color: "#ff7a93" }}>
                                    <Glasses className="size-5" aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{soporte.titulo}</p>
                                    <p className="mt-1 text-[12.5px] leading-snug text-white/65">{soporte.detalle}</p>
                                </div>
                            </div>
                            {soporte.puede && (
                                <div className={css.acciones}>
                                    {xr?.vr && (modoPedido !== "ar" || !xr.ar) && botonXR("immersive-vr")}
                                    {xr?.ar && (modoPedido !== "vr" || !xr.vr) && botonXR("immersive-ar")}
                                </div>
                            )}
                            {xr?.error && <p className="mt-2 text-[12.5px] text-rose-300">{xr.error}</p>}
                            <button type="button" className={`${css.boton} mt-2 w-full`} style={{ background: "rgba(255,255,255,.06)" }} onClick={() => setTarjetaXRCerrada(true)}>
                                Seguir en 3D
                            </button>
                        </div>
                    )}

                    {hoja && (
                        <div className={css.hoja} ref={refHoja} role="dialog" aria-label="Panel de la escena">
                            {hoja === "anadir" && <PanelAnadir puedeEditar={estado.puedeEditar} onAnadir={anadir} onCerrar={() => setHoja(null)} />}
                            {hoja === "escena" && (
                                <PanelEscena
                                    objetos={vivos}
                                    seleccion={seleccion}
                                    onElegir={alSeleccionar}
                                    ambiente={estado.doc.ambiente}
                                    puedeEditar={estado.puedeEditar}
                                    onCambiar={(c) => sesion?.cambiarAmbiente(c)}
                                    onCerrar={() => setHoja(null)}
                                />
                            )}
                            {hoja === "personas" && (
                                <>
                                    <PanelPersonas yo={avatares.yo} otros={otros} persistente={estado.persistente} onCerrar={() => setHoja(null)} />
                                    {!estado.persistente && (
                                        <div className={css.acciones}>
                                            <button type="button" className={css.boton} style={{ background: "#7C5CFF" }} disabled={copia?.estado === "guardando"} onClick={() => void guardarCopia()}>
                                                <Save className="size-4" aria-hidden /> Guardar una copia en mis escenas
                                            </button>
                                            {copia?.estado === "hecho" && (
                                                <Link href={copia.texto} className={css.boton} style={{ background: "rgba(16,185,129,.16)", boxShadow: "inset 0 0 0 1px rgba(16,185,129,.5)" }}>
                                                    Abrir la copia guardada
                                                </Link>
                                            )}
                                            {copia?.estado === "error" && <p className="text-[12.5px] text-rose-300">{copia.texto}</p>}
                                        </div>
                                    )}
                                </>
                            )}
                            {hoja === "inspector" && objSel && !objSel.borrado && (
                                <PanelInspector
                                    obj={objSel}
                                    puedeEditar={estado.puedeEditar}
                                    modoGizmo={modoGizmo}
                                    onModoGizmo={setModoGizmo}
                                    onActualizar={(c) => sesion?.actualizar(objSel.id, c)}
                                    onDuplicar={() => {
                                        const d = sesion?.duplicar(objSel.id);
                                        if (d) setSeleccion(d.id);
                                    }}
                                    onBorrar={() => {
                                        sesion?.borrar(objSel.id);
                                        alSeleccionar(null);
                                    }}
                                    onCerrar={() => alSeleccionar(null)}
                                />
                            )}
                        </div>
                    )}
                </div>

                {estado.fase === "lista" && (
                    <nav className={css.dock} aria-label="Herramientas de la escena" ref={refDock}>
                        <button type="button" className={css.botonDock} aria-pressed={hoja === "anadir"} onClick={() => setHoja((h) => (h === "anadir" ? null : "anadir"))}>
                            <Plus className="size-5" aria-hidden />
                            Añadir
                        </button>
                        <button type="button" className={css.botonDock} aria-pressed={hoja === "escena"} onClick={() => setHoja((h) => (h === "escena" ? null : "escena"))}>
                            <Layers className="size-5" aria-hidden />
                            Escena
                        </button>
                        <button type="button" className={css.botonDock} aria-pressed={hoja === "personas"} onClick={() => setHoja((h) => (h === "personas" ? null : "personas"))}>
                            <Users className="size-5" aria-hidden />
                            Personas
                        </button>
                        {enXR ? (
                            <button type="button" className={css.botonDock} onClick={() => void xr?.salir()} style={{ color: "#ff7a93" }}>
                                <LogOut className="size-5" aria-hidden />
                                Salir de {xr?.modo === "immersive-ar" ? "AR" : "VR"}
                            </button>
                        ) : xr?.vr || xr?.ar ? (
                            <button
                                type="button"
                                className={css.botonDock}
                                onClick={() => void xr?.entrar(modoPedido === "ar" && xr.ar ? "immersive-ar" : xr.vr ? "immersive-vr" : "immersive-ar")}
                            >
                                {modoPedido === "ar" && xr.ar ? <ScanEye className="size-5" aria-hidden /> : xr.vr ? <Headset className="size-5" aria-hidden /> : <ScanEye className="size-5" aria-hidden />}
                                {modoPedido === "ar" && xr.ar ? "Entrar en AR" : xr.vr ? "Entrar en VR" : "Entrar en AR"}
                            </button>
                        ) : null}
                    </nav>
                )}
                {estado.fase === "lista" && !enXR && (
                    <p className={css.pista} aria-hidden>
                        arrastra para orbitar · rueda o pellizca para acercarte · toca un objeto para editarlo
                    </p>
                )}
            </div>
        </section>
    );
}

export default EscenaCompartida;
