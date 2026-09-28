"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import type { Datos } from "@/lib/vivo/juegos/tipos";
import { useSalaViva } from "@/lib/vivo/juegos/usar-sala-viva";
import { programaAUiSpec } from "@/lib/vivo/programas/a-uispec";
import { basePrograma, buscarMotorProgramas, TIPO_REGISTRO_PROGRAMA } from "@/lib/vivo/programas/motor";
import { especificacionDePlantilla, type IdPlantilla } from "@/lib/vivo/programas/plantillas";
import { K, LIM, NOMBRE_TIPO_BLOQUE, TIPOS_BLOQUE_PROG, type BloqueProg, type EstadoPrograma, type TipoBloqueProg } from "@/lib/vivo/programas/tipos";
import { Aviso, Boton, IndicadorConexion, PresenciaSala, estilos as s } from "../juegos/comun";
import { EditorBloque } from "./editor-bloque";
import { idBloqueNuevo } from "./editor-modelo";
import { GaleriaPlantillas } from "./galeria-plantillas";
import { COLOR_BLOQUE, DESCRIPCION_BLOQUE, ICONO_BLOQUE } from "./iconos-bloque";
import { LateralPrograma } from "./lateral-programa";
import p from "./programas.module.css";
import { RenderPrograma } from "./render-programa";
import { useCompactacion } from "./usar-compactacion";

export interface PropsSalaPrograma {
    spaceId: string;
}

type EditorAbierto = { tipo: TipoBloqueProg; bloque: BloqueProg | null; idNuevo: string };
type AvisoLocal = { texto: string; tipo: "aviso" | "info" };

/** Un programa en vivo: la plantilla a elegir si está vacío, o los bloques con su estado compartido. */
export function SalaPrograma({ spaceId }: PropsSalaPrograma) {
    const { controlador, instantanea: inst, reintentar } = useSalaViva(spaceId, "programa", buscarMotorProgramas);
    const [avisoLocal, setAvisoLocal] = useState<AvisoLocal | null>(null);
    const [modoEdicion, setModoEdicion] = useState(false);
    const [editor, setEditor] = useState<EditorAbierto | null>(null);
    const [creando, setCreando] = useState(false);

    const registro = inst.registro;
    const estado = (registro && inst.estado ? (inst.estado as EstadoPrograma) : null) as EstadoPrograma | null;
    const yoUid = inst.yo.uid;
    const puedeParticipar = !inst.soloLectura && !!yoUid;
    const esCreador = !!estado && !!yoUid && estado.creador === yoUid;
    const puedeEstructura = !!estado && puedeParticipar && (estado.abierto || esCreador);

    useCompactacion(controlador, inst, puedeParticipar);

    // El aviso local se retira solo.
    useEffect(() => {
        if (!avisoLocal) return;
        const id = setTimeout(() => setAvisoLocal(null), 5000);
        return () => clearTimeout(id);
    }, [avisoLocal]);

    // Si dejo de poder editar la estructura, se cierra el modo edición.
    useEffect(() => {
        if (!puedeEstructura) {
            setModoEdicion(false);
            setEditor(null);
        }
    }, [puedeEstructura]);

    const enviar = useCallback(
        (k: string, d?: Datos): boolean => {
            if (!controlador) return false;
            const r = controlador.proponer(k, d);
            if (!r.ok) {
                setAvisoLocal({ texto: r.motivo, tipo: "aviso" });
                return false;
            }
            return true;
        },
        [controlador],
    );

    const editarBloque = useCallback((b: BloqueProg) => setEditor({ tipo: b.tipo, bloque: b, idNuevo: b.id }), []);

    const elegirPlantilla = (id: IdPlantilla) => {
        if (!controlador) return;
        setCreando(true);
        const r = controlador.nuevoRegistro(TIPO_REGISTRO_PROGRAMA, basePrograma(yoUid ?? "", especificacionDePlantilla(id, inst.titulo ?? undefined)));
        if (!r.ok) setAvisoLocal({ texto: r.motivo, tipo: "aviso" });
        setCreando(false);
    };

    const guardarBloque = (bloque: BloqueProg, esNuevo: boolean): boolean => {
        const limpio = JSON.parse(JSON.stringify(bloque)) as Datos;
        return enviar(esNuevo ? K.bloqueAdd : K.bloqueEditar, { bloque: limpio });
    };

    const copiarInterfaz = async () => {
        if (!estado) return;
        try {
            const foto = programaAUiSpec(estado, { id: spaceId });
            await navigator.clipboard.writeText(JSON.stringify(foto, null, 2));
            setAvisoLocal({ texto: "Copiado. Es una foto de solo lectura del programa, sin los datos personales de los formularios.", tipo: "info" });
        } catch {
            setAvisoLocal({ texto: "No se pudo copiar al portapapeles.", tipo: "aviso" });
        }
    };

    const titulo = estado?.titulo ?? inst.titulo ?? "Programa";
    const cabecera = (
        <header className={`${s.vidrio} ${s.cabecera}`}>
            <Link href="/programa" className={s.volver} aria-label="Volver a los programas">
                <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <div className={s.titulos}>
                <h1 className={s.titulo}>{titulo}</h1>
                <span className={s.subtitulo}>{estado?.descripcion || (estado ? `${estado.bloques.length} ${estado.bloques.length === 1 ? "bloque" : "bloques"}` : "Programa en vivo")}</span>
            </div>
            <div className={s.acciones}>
                <PresenciaSala presentes={inst.presentes} />
                {inst.fase === "listo" && <IndicadorConexion conexion={inst.conexion} />}
                {inst.pendientes > 0 && (
                    <span className={`${s.pildora} ${s.reconectando}`} role="status">
                        Guardando…
                    </span>
                )}
                {puedeEstructura && (
                    <Boton
                        onClick={() => {
                            setModoEdicion((v) => !v);
                            setEditor(null);
                        }}
                        aria-pressed={modoEdicion}
                        variante={modoEdicion ? "primario" : "normal"}
                        icono={<Pencil size={16} aria-hidden="true" />}
                    >
                        {modoEdicion ? "Terminar de editar" : "Editar programa"}
                    </Boton>
                )}
            </div>
        </header>
    );

    const avisos = (
        <>
            {inst.fase === "listo" && inst.soloLectura && (
                <Aviso tipo="info">
                    {yoUid
                        ? "Tienes permiso solo para mirar este programa: puedes ver lo que hace el grupo pero no participar."
                        : "Inicia sesión para participar. Sin cuenta puedes mirar, pero no votar ni escribir."}
                </Aviso>
            )}
            {inst.aviso && <Aviso alCerrar={() => controlador?.descartarAviso()}>{inst.aviso}</Aviso>}
            {avisoLocal && (
                <Aviso tipo={avisoLocal.tipo === "info" ? "info" : "aviso"} alCerrar={() => setAvisoLocal(null)}>
                    {avisoLocal.texto}
                </Aviso>
            )}
        </>
    );

    const idsBloques = useMemo(() => estado?.bloques.map((b) => b.id) ?? [], [estado]);

    if (inst.fase === "cargando") {
        return (
            <div className={s.sala}>
                {cabecera}
                <div className={`${s.vidrio} ${s.panel}`} role="status" style={{ alignItems: "center", padding: 32 }}>
                    <Loader2 size={28} className="animate-spin" aria-hidden="true" />
                    <span>Abriendo el programa…</span>
                </div>
            </div>
        );
    }
    if (inst.fase === "error") {
        return (
            <div className={s.sala}>
                {cabecera}
                <Aviso tipo="error">{inst.error ?? "No se pudo abrir el programa."}</Aviso>
                <div>
                    <Boton onClick={reintentar} icono={<RefreshCw size={16} aria-hidden="true" />}>
                        Reintentar
                    </Boton>
                </div>
            </div>
        );
    }

    // Vacío: aún no se ha elegido plantilla.
    if (!registro) {
        return (
            <div className={s.sala}>
                {cabecera}
                {avisos}
                <section className={`${s.vidrio} ${s.panel}`} style={{ padding: 20 }} aria-label="Elegir plantilla">
                    <h2 className={s.titulo}>¿Con qué empezamos?</h2>
                    {puedeParticipar ? (
                        <GaleriaPlantillas etiquetaConfirmar="Empezar con esta plantilla" ocupado={creando} alConfirmar={elegirPlantilla} />
                    ) : (
                        <p className={s.nota}>Aún no se ha preparado este programa. Quien tenga permiso de edición puede hacerlo desde aquí.</p>
                    )}
                </section>
            </div>
        );
    }

    if (!estado || !controlador) {
        return (
            <div className={s.sala}>
                {cabecera}
                <Aviso tipo="error">Este programa tiene un formato que esta versión del sistema no conoce. Actualiza la aplicación.</Aviso>
            </div>
        );
    }

    return (
        <div className={s.sala}>
            {cabecera}
            {avisos}
            <div className={s.cuerpo}>
                <div className={p.pila}>
                    {puedeEstructura && modoEdicion && (
                        <>
                            {editor ? (
                                <EditorBloque
                                    key={editor.bloque?.id ?? editor.idNuevo}
                                    bloque={editor.bloque}
                                    tipo={editor.tipo}
                                    idNuevo={editor.idNuevo}
                                    alGuardar={guardarBloque}
                                    alCancelar={() => setEditor(null)}
                                />
                            ) : (
                                <section className={`${s.vidrio} ${s.panel}`} aria-label="Añadir un bloque">
                                    <span className={s.rotulo}>Añadir un bloque</span>
                                    <div className={s.menuVertical}>
                                        {TIPOS_BLOQUE_PROG.map((tipo) => {
                                            const Icono = ICONO_BLOQUE[tipo];
                                            return (
                                                <button
                                                    key={tipo}
                                                    type="button"
                                                    className={s.boton}
                                                    onClick={() => setEditor({ tipo, bloque: null, idNuevo: idBloqueNuevo(idsBloques) })}
                                                    disabled={estado.bloques.length >= LIM.bloques}
                                                >
                                                    <Plus size={16} aria-hidden="true" />
                                                    <Icono size={16} aria-hidden="true" style={{ color: COLOR_BLOQUE[tipo] }} />
                                                    <span style={{ flex: 1 }}>{NOMBRE_TIPO_BLOQUE[tipo]}</span>
                                                    <span className={p.etiquetaPequena}>{DESCRIPCION_BLOQUE[tipo]}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                    <RenderPrograma
                        estado={estado}
                        yoUid={yoUid}
                        yoNombre={inst.yo.nombre}
                        puedeParticipar={puedeParticipar}
                        modoEdicion={modoEdicion}
                        enviar={enviar}
                        editarBloque={editarBloque}
                    />
                </div>
                <LateralPrograma
                    estado={estado}
                    puedeEstructura={puedeEstructura}
                    esCreador={esCreador}
                    modoEdicion={modoEdicion}
                    alGuardarTitulo={(t, d) => enviar(K.titulo, { titulo: t, descripcion: d })}
                    alAlternarAbierto={() => enviar(K.abierto, { abierto: !estado.abierto })}
                    alCopiarInterfaz={() => void copiarInterfaz()}
                />
            </div>
        </div>
    );
}
