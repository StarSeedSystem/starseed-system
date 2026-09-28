"use client";

/**
 * Documento en vivo (L2 · 2026-09-28): la página completa de `/documento/<id>`.
 *
 * Cabecera de cristal (volver, título editable, estado de guardado, quién está, deshacer/rehacer,
 * menú vertical) · esquema de títulos a la izquierda en escritorio (en el móvil, en un botón) ·
 * hoja tipo A4 con la barra de formato acoplada arriba · pie con palabras, caracteres y lectura.
 * Quien solo puede ver recibe la misma hoja en lectura, con las marcas de quién escribe dónde.
 * Exportar a .md/.txt, imprimir o guardar como PDF (hoja de impresión propia) e historial.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
    CloudOff,
    FileDown,
    FileText,
    FileType2,
    History,
    Link2,
    ListTree,
    Loader2,
    Printer,
    Redo2,
    SearchX,
    Type,
    Undo2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextoRico } from "@/components/messages/rico/render-doc";
import type { OpcionesCambio } from "@/components/messages/rico/historial";
import { updateSpaceMeta } from "@/lib/spaces/spaces";
import { FUENTES_MENSAJE, type BloqueDoc, type FuenteMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import { PilaDeshacer } from "@/lib/vivo/doc-colaborativo/deshacer";
import type { CambioUnidad } from "@/lib/vivo/doc-colaborativo/modelo";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import { cambiosParaRestaurar, contenidoDeVersion } from "@/lib/vivo/doc-colaborativo/restaurar";
import { useSalaColaborativa } from "@/lib/vivo/doc-colaborativo/usar-sala";
import {
    APP_DOCUMENTO,
    MAX_BLOQUES_DOCUMENTO,
    META_DOCUMENTO_INICIAL,
    docDeUnidades,
    documentoAMarkdown,
    documentoATexto,
    esquemaDocumento,
    estadisticasDocumento,
    igualesBloques,
    nombreArchivo,
    resumenDocumento,
    rutaDocumento,
    validarBloqueDocumento,
    validarMetaDocumento,
    type MetaDocumento,
} from "@/lib/vivo/documento";
import {
    AvataresPresencia,
    AvisoError,
    BotonIcono,
    BotonPildora,
    BotonReintentar,
    EnlaceVolver,
    EstadoGuardadoChip,
    FilaMenu,
    MenuAcciones,
    PantallaEstado,
    copiarEnlace,
    descargarArchivo,
    useAvisosConflicto,
    useVersionesAutomaticas,
} from "./comun-colab";
import { EsquemaDocumento } from "./esquema-documento";
import { HojaEditable } from "./hoja-editable";
import { PanelVersiones } from "./panel-versiones";
import { VistaDocumento } from "./vista-documento";
import styles from "./documento.module.css";

const AZUL = "#60A5FA";
const TAMANOS_DOC = [14, 15, 16, 17, 18, 20];

/** Hoja de impresión: solo el documento, en papel blanco y letra oscura legible. */
const CSS_IMPRESION = `
@page { margin: 18mm 16mm; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #ss-doc-imprimible, #ss-doc-imprimible * { visibility: visible !important; color: #111 !important; }
  #ss-doc-imprimible { display: block !important; position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; font-size: 12pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #ss-doc-imprimible .ss-titulo-impreso { font-size: 22pt; font-weight: 700; margin: 0 0 14pt; }
  #ss-doc-imprimible pre, #ss-doc-imprimible code { background: #f4f4f5 !important; box-shadow: none !important; white-space: pre-wrap; }
  #ss-doc-imprimible a { color: #1d4ed8 !important; }
  #ss-doc-imprimible hr { background: #d4d4d8 !important; }
  #ss-doc-imprimible h1, #ss-doc-imprimible h2, #ss-doc-imprimible h3 { break-after: avoid; }
}
`;

function describirBloque(b: BloqueDoc | undefined): string {
    switch (b?.tipo) {
        case "titulo":
            return "este título";
        case "lista":
        case "tareas":
            return "esta lista";
        case "cita":
            return "esta cita";
        case "codigo":
            return "este bloque de código";
        default:
            return "este párrafo";
    }
}

function formatoNumero(n: number): string {
    return n.toLocaleString("es-ES");
}

export function PaginaDocumento({ espacioId }: { espacioId: string }) {
    const { apertura, espacio, sala, inst, reintentar } = useSalaColaborativa<BloqueDoc, MetaDocumento>({
        app: APP_DOCUMENTO,
        espacioId,
        validarDatos: validarBloqueDocumento,
        validarMeta: validarMetaDocumento,
        metaInicial: META_DOCUMENTO_INICIAL,
        nombreCosa: "documento",
        maxUnidades: MAX_BLOQUES_DOCUMENTO,
    });
    const pila = useRef(new PilaDeshacer<BloqueDoc>());
    const [, setPasos] = useState(0);
    const [repintar, setRepintar] = useState(0);
    const [foco, setFoco] = useState<string | null>(null);
    const [irA, setIrA] = useState<{ id: string; n: number } | null>(null);
    const [versiones, setVersiones] = useState(false);
    const [letra, setLetra] = useState(false);
    const [esquemaMovil, setEsquemaMovil] = useState(false);
    const [tituloLocal, setTituloLocal] = useState<string | null>(null);
    const [errorCerrado, setErrorCerrado] = useState<string | null>(null);
    const tTitulo = useRef<ReturnType<typeof setTimeout> | null>(null);

    const unidades = useMemo(() => inst?.unidades ?? [], [inst?.unidades]);
    const meta = inst?.meta ?? META_DOCUMENTO_INICIAL;
    const puedeEditar = !!inst?.puedeEditar;
    const titulo = tituloLocal ?? (meta.titulo || espacio?.title || "Documento sin título");
    const bloques = useMemo(() => docDeUnidades(unidades).bloques, [unidades]);
    const estadisticas = useMemo(() => estadisticasDocumento(bloques), [bloques]);
    const esquema = useMemo(() => esquemaDocumento(unidades), [unidades]);
    const estiloBase = useMemo(() => ({ fuente: meta.fuente, tamano: meta.tamano }), [meta.fuente, meta.tamano]);

    useEffect(() => {
        if (typeof document !== "undefined") document.title = `${titulo} · Documento · StarSeed`;
    }, [titulo]);

    useAvisosConflicto(sala, (id) => describirBloque(sala?.unidad(id)?.datos));

    const versionesAuto = useVersionesAutomaticas({
        espacioId,
        activo: puedeEditar,
        contenido: () => contenidoDeVersion(APP_DOCUMENTO, sala?.instantanea().unidades ?? [], sala?.meta() ?? META_DOCUMENTO_INICIAL),
        resumen: () => resumenDocumento(docDeUnidades(sala?.instantanea().unidades ?? []).bloques),
        autorNombre: sala?.yo.nombre ?? null,
    });

    const aplicar = useCallback(
        (cambios: CambioUnidad<BloqueDoc>[], opciones?: OpcionesCambio) => {
            if (!sala) return;
            // Lo propio pasa la MISMA lista blanca que lo ajeno: así todos guardan exactamente lo mismo.
            const validados: CambioUnidad<BloqueDoc>[] = [];
            for (const c of cambios) {
                if (c.datos === undefined) {
                    validados.push(c);
                    continue;
                }
                const v = validarBloqueDocumento(c.datos);
                if (v) validados.push(igualesBloques(v, c.datos) ? c : { ...c, datos: v });
            }
            const parches = sala.cambiar(validados);
            if (!parches.length) return;
            pila.current.registrar(parches, opciones);
            versionesAuto.marcarCambio();
            setPasos((n) => n + 1);
        },
        [sala, versionesAuto],
    );

    const deshacer = useCallback(() => {
        if (!sala) return;
        const cambios = pila.current.deshacer((id) => sala.unidad(id));
        if (cambios?.length) sala.cambiar(cambios);
        setRepintar((n) => n + 1);
        setPasos((n) => n + 1);
    }, [sala]);

    const rehacer = useCallback(() => {
        if (!sala) return;
        const cambios = pila.current.rehacer((id) => sala.unidad(id));
        if (cambios?.length) sala.cambiar(cambios);
        setRepintar((n) => n + 1);
        setPasos((n) => n + 1);
    }, [sala]);

    const enfocar = useCallback(
        (id: string | null) => {
            setFoco(id);
            sala?.enfocar(id);
        },
        [sala],
    );

    const cambiarTitulo = (v: string) => {
        setTituloLocal(v);
        if (!sala || !puedeEditar) return;
        sala.cambiarMeta({ ...sala.meta(), titulo: v.slice(0, 200) });
        if (tTitulo.current) clearTimeout(tTitulo.current);
        tTitulo.current = setTimeout(() => void updateSpaceMeta(espacioId, { title: v.trim() || "Documento sin título" }), 1200);
    };

    const cambiarLetra = (cambio: Partial<MetaDocumento>) => {
        if (!sala || !puedeEditar) return;
        sala.cambiarMeta({ ...sala.meta(), ...cambio });
    };

    const restaurar = (contenido: unknown): boolean => {
        if (!sala) return false;
        const todas = sala.instantanea().unidades;
        const r = cambiosParaRestaurar(contenido, APP_DOCUMENTO, todas, validarBloqueDocumento, validarMetaDocumento);
        if (!r) return false;
        // Lo que falte de lo visible (borrado después) se revive: el motor encuentra su lápida.
        aplicar(r.cambios, { agrupar: `restaurar-${Date.now()}` });
        if (r.meta) sala.cambiarMeta({ ...r.meta, titulo: sala.meta().titulo || r.meta.titulo });
        setRepintar((n) => n + 1);
        return true;
    };

    // Sección activa (la del último título por encima del cursor) y quién está en cada una.
    const indicePorId = useMemo(() => new Map(unidades.map((u, i) => [u.id, i])), [unidades]);
    const seccionDe = useCallback(
        (id: string | null): string | null => {
            if (!id) return null;
            const i = indicePorId.get(id);
            if (i === undefined) return null;
            let actual: string | null = null;
            for (const e of esquema) {
                if (e.indice <= i) actual = e.id;
                else break;
            }
            return actual;
        },
        [indicePorId, esquema],
    );
    const presentes = inst?.presentes ?? [];
    const porSeccion = useMemo(() => {
        const m = new Map<string, Presente[]>();
        for (const p of presentes) {
            const s = seccionDe(p.unidad);
            if (!s) continue;
            m.set(s, [...(m.get(s) ?? []), p]);
        }
        return m;
    }, [presentes, seccionDe]);
    const describirDonde = (p: Presente) => {
        const s = seccionDe(p.unidad);
        const e = s ? esquema.find((x) => x.id === s) : null;
        return e ? `en «${e.texto}»` : p.unidad ? "en el documento" : null;
    };

    const ir = (id: string) => {
        setIrA({ id, n: Date.now() });
        setEsquemaMovil(false);
    };

    // ── Pantallas de estado ──
    if (apertura === "cargando" || !inst || (inst.cargando && !inst.error)) {
        return <PantallaEstado icono={Loader2} cargando color={AZUL} titulo="Abriendo el documento…" texto="Conectando con quienes ya están dentro." />;
    }
    if (apertura === "no-encontrado") {
        return (
            <PantallaEstado icono={SearchX} color="#FFBF00" titulo="No encontramos este documento" texto="Puede que el enlace no sea correcto o que aún no te hayan invitado. Pide a quien lo creó que te lo comparta desde el chat.">
                <EnlaceTexto href="/documentos">Ir a Mis documentos</EnlaceTexto>
            </PantallaEstado>
        );
    }
    if (apertura === "red") {
        return (
            <PantallaEstado icono={CloudOff} color="#FFBF00" titulo="Sin conexión" texto="No pudimos llegar al servidor. Revisa la conexión y vuelve a intentarlo.">
                <BotonReintentar onClick={reintentar} />
            </PantallaEstado>
        );
    }
    if (inst.error && !inst.puedeEditar && unidades.length === 0 && /no abre|no encontramos/i.test(inst.error)) {
        return (
            <PantallaEstado icono={SearchX} color="#FFBF00" titulo="Este enlace no abre un documento" texto={inst.error}>
                <EnlaceTexto href="/documentos">Ir a Mis documentos</EnlaceTexto>
            </PantallaEstado>
        );
    }

    const mostrarError = inst.error && inst.error !== errorCerrado ? inst.error : null;

    return (
        <div className={cn(styles.marco, "mx-auto flex h-[calc(100dvh-6rem)] min-h-[520px] w-full max-w-[1480px] flex-col gap-3 px-2 pt-2 sm:px-4 sm:pt-4")} data-documento-vivo="">
            <header className={cn(styles.cabecera, "flex flex-wrap items-center gap-x-2 gap-y-2 px-2 py-2 sm:px-3")}>
                <EnlaceVolver href="/documentos" etiqueta="Volver a Mis documentos y presentaciones" />
                <span className="hidden h-10 w-10 flex-none place-items-center rounded-[14px] sm:grid" style={{ background: `${AZUL}1f`, boxShadow: `inset 0 0 0 1px ${AZUL}66` }} aria-hidden="true">
                    <FileText className="h-5 w-5" style={{ color: AZUL }} />
                </span>
                <div className="min-w-[10rem] flex-1">
                    {puedeEditar ? (
                        <input
                            className={styles.tituloEntrada}
                            value={titulo}
                            onChange={(e) => cambiarTitulo(e.target.value)}
                            onBlur={() => setTituloLocal(null)}
                            aria-label="Título del documento"
                            placeholder="Documento sin título"
                            maxLength={200}
                        />
                    ) : (
                        <h1 className="truncate px-2.5 text-[17px] font-semibold">{titulo}</h1>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <EstadoGuardadoChip guardado={inst.guardado} puedeEditar={puedeEditar} conectado={inst.conectado} />
                    <AvataresPresencia presentes={presentes} describir={describirDonde} />
                    {puedeEditar && (
                        <>
                            <BotonIcono etiqueta="Deshacer (Ctrl+Z)" onClick={deshacer} disabled={!pila.current.puedeDeshacer}>
                                <Undo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                            <BotonIcono etiqueta="Rehacer (Ctrl+Mayús+Z)" onClick={rehacer} disabled={!pila.current.puedeRehacer}>
                                <Redo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                        </>
                    )}
                    <BotonPildora onClick={() => setEsquemaMovil(true)} color={AZUL} className="lg:hidden" etiqueta="Ver el esquema del documento">
                        <ListTree className="h-4 w-4" aria-hidden="true" /> Esquema
                    </BotonPildora>
                    <MenuAcciones etiqueta="Más acciones del documento">
                        <FilaMenu icono={History} etiqueta="Historial de versiones" ayuda="Las 20 últimas, restaurables" onClick={() => setVersiones(true)} />
                        {puedeEditar && <FilaMenu icono={Type} etiqueta="Letra del documento" ayuda="Fuente y tamaño para todos" color="#14B8A6" onClick={() => setLetra(true)} />}
                        <FilaMenu icono={FileDown} etiqueta="Exportar a Markdown" ayuda="Archivo .md con títulos, listas y enlaces" color="#10B981" onClick={() => descargarArchivo(nombreArchivo(titulo, "md"), documentoAMarkdown(bloques, titulo), "text/markdown")} />
                        <FilaMenu icono={FileType2} etiqueta="Exportar a texto" ayuda="Archivo .txt sin formato" color="#10B981" onClick={() => descargarArchivo(nombreArchivo(titulo, "txt"), documentoATexto(bloques, titulo), "text/plain")} />
                        <FilaMenu icono={Printer} etiqueta="Imprimir o guardar como PDF" ayuda="Elige «Guardar como PDF» en la ventana de impresión" color="#FFBF00" onClick={() => window.print()} />
                        <FilaMenu icono={Link2} etiqueta="Copiar enlace" ayuda="Lo abre quien tenga acceso" color="#007FFF" onClick={() => void copiarEnlace(rutaDocumento(espacioId))} />
                    </MenuAcciones>
                </div>
            </header>

            {mostrarError && <AvisoError texto={mostrarError} onCerrar={() => setErrorCerrado(mostrarError)} />}

            <div className="flex min-h-0 flex-1 gap-4">
                <aside className={cn(styles.cristal, "hidden w-[250px] flex-none flex-col rounded-[22px] p-2 lg:flex")} aria-label="Esquema">
                    <EsquemaDocumento entradas={esquema} activo={seccionDe(foco)} onIr={ir} presentesPorSeccion={porSeccion} className="min-h-0 flex-1" />
                </aside>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Documento">
                    {puedeEditar ? (
                        <HojaEditable
                            unidades={unidades}
                            onCambios={aplicar}
                            onDeshacer={deshacer}
                            onRehacer={rehacer}
                            onFoco={enfocar}
                            presentes={presentes}
                            estiloBase={estiloBase}
                            etiqueta={`Texto del documento «${titulo}»`}
                            repintar={repintar}
                            irA={irA}
                            className="flex-1"
                        />
                    ) : (
                        <VistaDocumento unidades={unidades} version={inst.version} presentes={presentes} estiloBase={estiloBase} irA={irA} className="flex-1" />
                    )}
                    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 pt-1.5 text-[12.5px] text-white/60" aria-label="Recuento">
                        <span>
                            <strong className="font-semibold text-white/85">{formatoNumero(estadisticas.palabras)}</strong> {estadisticas.palabras === 1 ? "palabra" : "palabras"}
                        </span>
                        <span>
                            <strong className="font-semibold text-white/85">{formatoNumero(estadisticas.caracteres)}</strong> caracteres
                        </span>
                        {estadisticas.minutos > 0 && <span>{estadisticas.minutos} min de lectura</span>}
                        <span className="ml-auto">{puedeEditar ? "Todo se guarda solo" : "Estás viendo: para editar, pide que te inviten como editor"}</span>
                    </footer>
                </section>
            </div>

            <Dialog open={esquemaMovil} onOpenChange={setEsquemaMovil}>
                <DialogContent className="max-h-[80dvh] max-w-md rounded-[24px] border-white/[0.08] bg-[rgba(12,14,34,.95)] text-white">
                    <DialogHeader>
                        <DialogTitle>Esquema</DialogTitle>
                        <DialogDescription className="text-white/60">Toca un título para ir a esa parte.</DialogDescription>
                    </DialogHeader>
                    <EsquemaDocumento entradas={esquema} activo={seccionDe(foco)} onIr={ir} presentesPorSeccion={porSeccion} />
                </DialogContent>
            </Dialog>

            <Dialog open={letra} onOpenChange={setLetra}>
                <DialogContent className="max-w-md rounded-[24px] border-white/[0.08] bg-[rgba(12,14,34,.95)] text-white">
                    <DialogHeader>
                        <DialogTitle>Letra del documento</DialogTitle>
                        <DialogDescription className="text-white/60">Cambia la letra base para todas las personas. El formato de cada palabra (negrita, color…) se mantiene.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Fuente</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {FUENTES_MENSAJE.map((f) => {
                                    const activa = (meta.fuente ?? "inter") === f.id;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            aria-pressed={activa}
                                            onClick={() => cambiarLetra({ fuente: f.id as FuenteMensaje })}
                                            className={cn(
                                                "min-h-11 cursor-pointer rounded-[14px] px-3 text-left text-[15px] transition-colors duration-200",
                                                activa ? "bg-[#7C5CFF]/20 text-white shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.04] text-white/85 hover:bg-white/[0.08]",
                                            )}
                                            style={{ fontFamily: f.css }}
                                        >
                                            {f.nombre}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Tamaño</p>
                            <div className="flex flex-wrap gap-1.5">
                                {TAMANOS_DOC.map((t) => {
                                    const activo = (meta.tamano ?? 16) === t;
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            aria-pressed={activo}
                                            onClick={() => cambiarLetra({ tamano: t })}
                                            className={cn(
                                                "ss-redondo min-h-10 min-w-12 cursor-pointer rounded-full px-3 text-[13.5px] font-semibold transition-colors duration-200",
                                                activo ? "bg-[#7C5CFF] text-white" : "bg-white/[0.05] text-white/80 hover:bg-white/[0.09]",
                                            )}
                                        >
                                            {t} px
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <PanelVersiones
                abierto={versiones}
                onCerrar={() => setVersiones(false)}
                espacioId={espacioId}
                puedeEditar={puedeEditar}
                cosa="documento"
                autorNombre={sala?.yo.nombre ?? null}
                contenidoActual={() => contenidoDeVersion(APP_DOCUMENTO, unidades, meta)}
                resumenActual={() => resumenDocumento(bloques)}
                onRestaurar={restaurar}
            />

            {/* Solo para imprimir / guardar como PDF. */}
            <div id="ss-doc-imprimible" className={styles.imprimible} aria-hidden="true">
                <p className="ss-titulo-impreso">{titulo}</p>
                <TextoRico doc={{ bloques }} estatico />
            </div>
            <style media="print">{CSS_IMPRESION}</style>
        </div>
    );
}

function EnlaceTexto({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className="ss-redondo inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.03]"
        >
            {children}
        </Link>
    );
}
