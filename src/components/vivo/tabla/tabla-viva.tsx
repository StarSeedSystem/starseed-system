"use client";
/**
 * La Tabla de datos colaborativa, montada: motor de documento vivo + presencia + rejilla de
 * escritorio o tarjetas de móvil + paneles (columna, compartir, fila). Aquí solo se conectan
 * las piezas; la lógica de datos vive en `@/lib/vivo/tabla/*` y se prueba sin React.
 */
import { Download, FileSpreadsheet, Loader2, Plus, Settings2, TriangleAlert, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { updateSpaceMeta, listSpaceEditors } from "@/lib/spaces/spaces";
import { crearMotorTabla, rutaTabla } from "@/lib/vivo/tabla";
import { csvDesdeTabla, importarCsv, type ResultadoImportar } from "@/lib/vivo/tabla/csv";
import { crearCalculadora } from "@/lib/vivo/tabla/formulas";
import {
    ETIQUETA_TIPO,
    columnasVisibles,
    esUuid,
    filasVisibles,
    normalizarNombre,
    tablaVacia,
    type Columna,
    type Ctx,
    type Tabla,
    type ValorCelda,
} from "@/lib/vivo/tabla/modelo";
import * as ops from "@/lib/vivo/tabla/operaciones";
import { aplicarVista, guardarVista, leerVista, limpiarVista, operadoresDe, vistaVacia, VISTA_VACIA, type VistaTabla } from "@/lib/vivo/tabla/vista";
import { BarraHerramientas, type ItemMenu } from "./barra-herramientas";
import { BarraVista, type PanelVista } from "./barra-vista";
import { EditorColumna } from "./editor-columna";
import { descargarTexto, leerArchivoTexto, nombreArchivo } from "./importar-exportar";
import { PanelCompartir } from "./panel-compartir";
import { PanelModal } from "./panel-modal";
import { usePerfiles, type PerfilCorto } from "./personas";
import { Rejilla } from "./rejilla";
import { HojaFila, Tarjetas } from "./tarjetas";
import type { AccionesColumna, AccionesTabla } from "./tipos";
import { useMotorVivo } from "./use-motor";
import { usePresencia } from "./use-presencia";
import { useEsMovil } from "./use-media";
import css from "./tabla.module.css";

const NOTA_FUSION =
    "Cada celda se guarda por separado: si dos personas editan celdas distintas a la vez se conservan las dos. Si editan la misma celda a la vez, se queda lo último que se guardó.";

function mensajeInvalido(col: Columna, texto: string): string {
    const t = texto.length > 40 ? `${texto.slice(0, 40)}…` : texto;
    switch (col.tipo.v) {
        case "numero":
            return `«${t}» no es un número. La celda se quedó como estaba.`;
        case "fecha":
            return `«${t}» no es una fecha válida. Prueba con AAAA-MM-DD o DD/MM/AAAA.`;
        case "persona":
            return "No encontramos a esa persona. Elígela de la lista.";
        case "casilla":
            return "Escribe Sí o No para una casilla.";
        default:
            return `«${t}» no encaja en la columna ${col.nombre.v}.`;
    }
}

export function TablaViva({ id }: { id: string }) {
    const { motor, snap, uid } = useMotorVivo<Tabla>(id, (u) => crearMotorTabla(id, u));
    const { presentes, anunciar } = usePresencia(`tabla:${id}`);
    const esMovil = useEsMovil();

    const tabla: Tabla | null = snap.doc;
    const listo = snap.fase === "listo" && !!tabla;
    const puedeEditar = snap.puedeEditar;

    // ── vista personal (orden y filtros: solo en este dispositivo) ──
    const [vista, setVista] = useState<VistaTabla>(VISTA_VACIA);
    useEffect(() => setVista(leerVista(id)), [id]);
    const [panelVista, setPanelVista] = useState<PanelVista>(null);

    const calc = useMemo(() => crearCalculadora(tabla ?? tablaVacia()), [tabla]);
    const columnas = useMemo(() => (tabla ? columnasVisibles(tabla) : []), [tabla]);
    const vistaEfectiva = useMemo(() => (tabla ? limpiarVista(tabla, vista) : vista), [tabla, vista]);
    const filaIds = useMemo(() => (tabla ? aplicarVista(tabla, vistaEfectiva, calc) : []), [tabla, vistaEfectiva, calc]);
    const totalFilas = useMemo(() => (tabla ? filasVisibles(tabla).length : 0), [tabla]);

    const cambiarVista = useCallback(
        (v: VistaTabla) => {
            const n = vistaVacia(v) ? VISTA_VACIA : v;
            setVista(n);
            guardarVista(id, n);
        },
        [id],
    );

    // ── personas (columna «Persona», presencia, compartir) ──
    const [editoresUids, setEditoresUids] = useState<string[]>([]);
    useEffect(() => {
        if (!listo || !puedeEditar) return;
        let vivo = true;
        void listSpaceEditors(id).then((l) => vivo && setEditoresUids(l.map((e) => e.account)));
        return () => {
            vivo = false;
        };
    }, [id, listo, puedeEditar]);
    const uidsCeldas = useMemo(() => {
        if (!tabla) return [] as string[];
        const personaCols = new Set(columnas.filter((c) => c.tipo.v === "persona").map((c) => c.id));
        if (!personaCols.size) return [] as string[];
        const s = new Set<string>();
        for (const [k, r] of Object.entries(tabla.celdas)) {
            const colId = k.slice(k.indexOf("|") + 1);
            if (personaCols.has(colId) && typeof r.v === "string" && esUuid(r.v)) s.add(r.v);
            if (s.size >= 200) break;
        }
        return [...s];
    }, [tabla, columnas]);
    const todosUids = useMemo(
        () => [...new Set([...(uid ? [uid] : []), ...(snap.propietario ? [snap.propietario] : []), ...editoresUids, ...presentes.map((p) => p.uid), ...uidsCeldas])],
        [uid, snap.propietario, editoresUids, presentes, uidsCeldas],
    );
    const perfil = usePerfiles(todosUids);
    const candidatos = useMemo(
        () => todosUids.map((u) => perfil(u)).filter((p): p is PerfilCorto => !!p),
        // `perfil` es estable; los uids cambian cuando llegan perfiles nuevos (ver `usePerfiles`).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [todosUids, perfil, presentes],
    );

    // Estado que las acciones leen sin volver a crearse en cada cambio.
    const ref = useRef({ tabla, vista: vistaEfectiva, filaIds, candidatos, columnas, puedeEditar });
    ref.current = { tabla, vista: vistaEfectiva, filaIds, candidatos, columnas, puedeEditar };

    // ── interfaz ──
    const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);
    const [listaColumnas, setListaColumnas] = useState(false);
    const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
    const [compartir, setCompartir] = useState(false);
    const [irAlFinal, setIrAlFinal] = useState(0);
    const [tituloLocal, setTituloLocal] = useState<string | null>(null);
    const [accesoLocal, setAccesoLocal] = useState<string | null>(null);
    const [resumen, setResumen] = useState<ResultadoImportar | null>(null);
    const selector = useRef<HTMLInputElement>(null);
    useEffect(() => setTituloLocal(null), [snap.titulo]);

    const aplicar = useCallback((fn: (t: Tabla, c: Ctx) => Tabla) => motor?.aplicar(fn) ?? false, [motor]);

    const resolverPersona = useCallback((texto: string): string | null => {
        const n = normalizarNombre(texto).replace(/^@/, "");
        if (!n) return null;
        const hit = ref.current.candidatos.find((p) => normalizarNombre(p.nombre) === n || p.usuario.toLowerCase() === n);
        return hit?.uid ?? null;
    }, []);

    const avisarFilaOculta = useCallback(() => {
        if (ref.current.vista.filtros.length > 0) {
            toast({ title: "Fila añadida", description: "No cumple tus filtros, así que no la ves. Quita los filtros para verla." });
        }
    }, []);

    const acciones = useMemo<AccionesTabla>(
        () => ({
            escribir: (cambios) => void aplicar((t, c) => ops.aplicarCeldas(t, cambios, c)),
            escribirTexto: (filaId, colId, texto) => {
                const t = ref.current.tabla;
                const col = t?.columnas[colId];
                if (!t || !col || col.borrada?.v || col.tipo.v === "calculado") return;
                const v = ops.coaccionarTexto(col, texto, resolverPersona);
                if (v === undefined && col.tipo.v === "seleccion" && texto.trim()) {
                    aplicar((tb, c) => {
                        const r = ops.anadirOpcion(tb, colId, texto.trim(), c);
                        return r.opcionId ? ops.establecerCelda(r.tabla, filaId, colId, r.opcionId, c) : tb;
                    });
                    return;
                }
                if (v === undefined) {
                    toast({ title: "No se pudo guardar el valor", description: mensajeInvalido(col, texto) });
                    return;
                }
                aplicar((tb, c) => ops.establecerCelda(tb, filaId, colId, v as ValorCelda, c));
            },
            pegar: (matriz, destino) => {
                const out: { r: ops.ResultadoPegado | null } = { r: null };
                aplicar((t, c) => {
                    out.r = ops.aplicarPegado(t, matriz, destino, c, resolverPersona);
                    return out.r.tabla;
                });
                if (out.r && out.r.omitidas > 0) {
                    toast({ title: "Pegado con avisos", description: `${out.r.omitidas} ${out.r.omitidas === 1 ? "valor no cabía o no era válido y se saltó" : "valores no cabían o no eran válidos y se saltaron"}.` });
                }
                return out.r?.filasNuevas ?? 0;
            },
            limpiar: (filas, cols) => void aplicar((t, c) => ops.limpiarCeldas(t, filas, cols, c)),
            alternarCasilla: (filaId, colId) => {
                const actual = ref.current.tabla?.celdas[`${filaId}|${colId}`]?.v;
                aplicar((t, c) => ops.establecerCelda(t, filaId, colId, actual === true ? false : true, c));
            },
            crearOpcion: (colId, nombre) => {
                const out: { id: string | null } = { id: null };
                aplicar((t, c) => {
                    const r = ops.anadirOpcion(t, colId, nombre, c);
                    out.id = r.opcionId;
                    return r.tabla;
                });
                return out.id;
            },
            anadirFila: (donde) => {
                const out: { id: string | null } = { id: null };
                const hecho = aplicar((t, c) => {
                    const r = ops.anadirFila(t, c, donde ?? {});
                    out.id = r.filaId;
                    return r.tabla;
                });
                if (!hecho || !out.id) {
                    if (ref.current.puedeEditar) toast({ title: "No se pudo añadir la fila", description: "La tabla llegó al máximo de filas." });
                    return;
                }
                if (!donde) setIrAlFinal((n) => n + 1);
                avisarFilaOculta();
            },
            duplicarFila: (filaId) => {
                const out: { id: string | null } = { id: null };
                aplicar((t, c) => {
                    const r = ops.duplicarFila(t, filaId, c);
                    out.id = r.filaId;
                    return r.tabla;
                });
                if (!out.id) {
                    if (ref.current.puedeEditar) toast({ title: "No se pudo duplicar la fila", description: "La tabla llegó al máximo de filas." });
                } else avisarFilaOculta();
            },
            borrarFilas: (ids) => {
                if (aplicar((t, c) => ops.borrarFilas(t, ids, c))) {
                    toast({ title: ids.length === 1 ? "Fila eliminada" : `${ids.length} filas eliminadas`, description: "Puedes recuperarla con Deshacer." });
                }
            },
            moverFila: (filaId, hacia) => void aplicar((t, c) => ops.moverFila(t, filaId, hacia, c)),
            moverColumna: (colId, hacia) => void aplicar((t, c) => ops.moverColumna(t, colId, hacia, c)),
            redimensionar: (colId, ancho) => void aplicar((t, c) => ops.redimensionarColumna(t, colId, ancho, c)),
            abrirColumna: (colId) => setColumnaAbierta(colId),
            ordenar: (colId, dir) => cambiarVista({ ...ref.current.vista, orden: dir ? { col: colId, dir } : null }),
            filtrarPor: (colId) => {
                const col = ref.current.tabla?.columnas[colId];
                const v = ref.current.vista;
                if (col && !v.filtros.some((f) => f.col === colId)) cambiarVista({ ...v, filtros: [...v.filtros, { col: colId, op: operadoresDe(col)[0], valor: "" }] });
                setPanelVista("filtros");
            },
            borrarColumna: (colId) => {
                if (aplicar((t, c) => ops.borrarColumna(t, colId, c))) {
                    setColumnaAbierta((a) => (a === colId ? null : a));
                    toast({ title: "Columna eliminada", description: "Puedes recuperarla con Deshacer." });
                }
            },
            establecerTotal: (colId, fn) => void aplicar((t, c) => ops.establecerTotal(t, colId, fn, c)),
            deshacer: () => void motor?.deshacer(),
            rehacer: () => void motor?.rehacer(),
        }),
        [aplicar, motor, resolverPersona, cambiarVista, avisarFilaOculta],
    );

    const accionesColumna = useMemo<AccionesColumna>(
        () => ({
            renombrar: (colId, nombre) => void aplicar((t, c) => ops.renombrarColumna(t, colId, nombre, c)),
            cambiarTipo: (colId, tipo) => void aplicar((t, c) => ops.cambiarTipoColumna(t, colId, tipo, c)),
            establecerFormula: (colId, f) => void aplicar((t, c) => ops.establecerFormula(t, colId, f, c)),
            establecerTotal: (colId, fn) => void aplicar((t, c) => ops.establecerTotal(t, colId, fn, c)),
            redimensionar: (colId, ancho) => void aplicar((t, c) => ops.redimensionarColumna(t, colId, ancho, c)),
            mover: (colId, delta) => {
                const i = ref.current.columnas.findIndex((c) => c.id === colId);
                if (i >= 0) void aplicar((t, c) => ops.moverColumna(t, colId, i + delta, c));
            },
            borrar: (colId) => acciones.borrarColumna(colId),
            anadirOpcion: (colId, nombre) => acciones.crearOpcion(colId, nombre),
            editarOpcion: (colId, opId, cambio) => void aplicar((t, c) => ops.editarOpcion(t, colId, opId, cambio, c)),
            quitarOpcion: (colId, opId) => void aplicar((t, c) => ops.quitarOpcion(t, colId, opId, c)),
            moverOpcion: (colId, opId, delta) => void aplicar((t, c) => ops.moverOpcion(t, colId, opId, delta, c)),
        }),
        [aplicar, acciones],
    );

    const anadirColumna = useCallback(() => {
        const out: { id: string | null } = { id: null };
        aplicar((t, c) => {
            const r = ops.anadirColumna(t, c, {});
            out.id = r.colId;
            return r.tabla;
        });
        if (out.id) {
            setListaColumnas(false);
            setColumnaAbierta(out.id);
        } else toast({ title: "No se pudo añadir la columna", description: "La tabla llegó al máximo de columnas." });
    }, [aplicar]);

    const anadirFilaMovil = useCallback(() => {
        const out: { id: string | null } = { id: null };
        aplicar((t, c) => {
            const r = ops.anadirFila(t, c, {});
            out.id = r.filaId;
            return r.tabla;
        });
        if (out.id) setFilaAbierta(out.id);
        else toast({ title: "No se pudo añadir la fila", description: "La tabla llegó al máximo de filas." });
    }, [aplicar]);

    // ── importar y exportar ──
    const exportar = useCallback(
        (excel: boolean) => {
            if (!tabla) return;
            const texto = csvDesdeTabla(tabla, {
                filaIds,
                calc,
                nombrePersona: (u) => perfil(u)?.nombre ?? null,
                separador: excel ? ";" : ",",
            });
            descargarTexto(nombreArchivo(snap.titulo || "tabla", "csv"), texto, "text/csv", excel);
            toast({ title: "Archivo listo", description: `Se exportaron ${filaIds.length} ${filaIds.length === 1 ? "fila" : "filas"}.` });
        },
        [tabla, filaIds, calc, perfil, snap.titulo],
    );

    const alElegirArchivo = useCallback(
        async (archivo: File | undefined) => {
            if (!archivo) return;
            const l = await leerArchivoTexto(archivo);
            if (!l.ok) {
                toast({ title: "No se pudo importar", description: l.mensaje });
                return;
            }
            const out: { r: ResultadoImportar | null } = { r: null };
            aplicar((t, c) => {
                out.r = importarCsv(t, l.texto, c);
                return out.r.tabla;
            });
            if (out.r) setResumen(out.r);
        },
        [aplicar],
    );

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

    const menu: ItemMenu[] = [
        { id: "importar", etiqueta: "Importar un archivo CSV", icono: Upload, alElegir: () => selector.current?.click(), deshabilitado: !puedeEditar },
        { id: "exportar", etiqueta: vistaVacia(vistaEfectiva) ? "Exportar como CSV" : "Exportar como CSV (solo lo que ves)", icono: Download, alElegir: () => exportar(false), separadorAntes: true },
        { id: "excel", etiqueta: "Exportar como CSV para Excel", icono: FileSpreadsheet, alElegir: () => exportar(true) },
        { id: "columnas", etiqueta: "Ver y editar las columnas", icono: Settings2, alElegir: () => setListaColumnas(true), separadorAntes: true },
    ];

    // ── estados sin tabla ──
    if (snap.fase === "cargando" || (!motor && snap.fase !== "no-disponible")) {
        return (
            <div className={css.raiz}>
                <div className={`${css.vacio} ${css.panel}`} role="status" aria-live="polite">
                    <Loader2 size={28} className={css.girar} aria-hidden="true" />
                    <p>Abriendo la tabla…</p>
                </div>
            </div>
        );
    }
    if (snap.fase === "no-disponible" || !tabla) {
        return (
            <div className={css.raiz}>
                <div className={`${css.vacio} ${css.panel}`} role="alert">
                    <TriangleAlert size={28} aria-hidden="true" />
                    <h2>No se pudo abrir la tabla</h2>
                    <p>{snap.motivo ?? "Algo falló al abrirla."}</p>
                    <div className={css.fichas}>
                        <button type="button" className={css.boton} onClick={() => window.location.reload()}>
                            Reintentar
                        </button>
                        <Link href="/tabla" className={css.boton}>
                            Ver mis tablas
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const titulo = tituloLocal ?? snap.titulo;
    const esDueno = !!uid && snap.propietario === uid;
    const filaSeleccionada = filaAbierta && esMovil ? filaAbierta : null;

    return (
        <div className={css.raiz} data-testid="tabla-viva">
            <BarraHerramientas
                volverHref="/tabla"
                volverEtiqueta="Volver a mis tablas"
                titulo={titulo}
                puedeRenombrar={puedeEditar}
                alRenombrar={(n) => void renombrar(n)}
                guardado={snap.guardado}
                puedeEditar={puedeEditar}
                presentes={presentes}
                perfil={perfil}
                puedeDeshacer={snap.puedeDeshacer}
                puedeRehacer={snap.puedeRehacer}
                alDeshacer={() => acciones.deshacer()}
                alRehacer={() => acciones.rehacer()}
                alCompartir={() => setCompartir(true)}
                menu={menu}
            >
                {puedeEditar ? (
                    <>
                        <button type="button" className={`${css.boton} ${css.botonPrimario}`} onClick={() => (esMovil ? anadirFilaMovil() : acciones.anadirFila())}>
                            <Plus size={16} aria-hidden="true" /> Añadir fila
                        </button>
                        <button type="button" className={css.boton} onClick={anadirColumna}>
                            <Plus size={16} aria-hidden="true" /> Añadir columna
                        </button>
                    </>
                ) : null}
            </BarraHerramientas>

            {!puedeEditar ? (
                <div className={`${css.aviso} ${css.avisoInfo}`} role="note">
                    <Users size={16} className={css.avisoIcono} aria-hidden="true" />
                    <span>Estás mirando esta tabla sin permiso para editarla. Puedes ordenar y filtrar solo para ti.</span>
                </div>
            ) : null}
            {snap.motivo && puedeEditar ? (
                <div className={`${css.aviso} ${snap.guardado === "reintentando" ? css.avisoError : ""}`} role="alert">
                    <TriangleAlert size={16} className={css.avisoIcono} aria-hidden="true" />
                    <span>{snap.motivo}</span>
                </div>
            ) : null}

            <BarraVista columnas={columnas} vista={vistaEfectiva} alCambiar={cambiarVista} abierto={panelVista} setAbierto={setPanelVista} filaVisibles={filaIds.length} filasTotal={totalFilas} />

            {esMovil ? (
                <Tarjetas
                    tabla={tabla}
                    calc={calc}
                    columnas={columnas}
                    filaIds={filaIds}
                    puedeEditar={puedeEditar}
                    presentes={presentes}
                    perfil={perfil}
                    acciones={acciones}
                    alAbrirFila={setFilaAbierta}
                    mensajeVacio={totalFilas === 0 ? "Esta tabla aún no tiene filas." : "Ninguna fila cumple tus filtros."}
                />
            ) : (
                <Rejilla
                    tabla={tabla}
                    calc={calc}
                    columnas={columnas}
                    filaIds={filaIds}
                    puedeEditar={puedeEditar}
                    ordenEditable={vistaVacia(vistaEfectiva)}
                    vista={vistaEfectiva}
                    presentes={presentes}
                    perfil={perfil}
                    candidatosPersonas={candidatos}
                    acciones={acciones}
                    onPosicion={anunciar}
                    irAlFinal={irAlFinal}
                    mensajeVacio={columnas.length === 0 ? "Esta tabla no tiene columnas. Añade la primera con «Añadir columna»." : totalFilas === 0 ? "Esta tabla aún no tiene filas. Añade la primera con «Añadir fila»." : "Ninguna fila cumple tus filtros."}
                />
            )}

            <HojaFila
                tabla={tabla}
                calc={calc}
                columnas={columnas}
                filaIds={filaIds}
                filaId={filaSeleccionada}
                puedeEditar={puedeEditar}
                perfil={perfil}
                candidatosPersonas={candidatos}
                acciones={acciones}
                alCerrar={() => setFilaAbierta(null)}
                alIr={setFilaAbierta}
                onPosicion={anunciar}
            />

            <EditorColumna tabla={tabla} colId={columnaAbierta} puedeEditar={puedeEditar} lado={esMovil ? "abajo" : "centro"} acciones={accionesColumna} alCerrar={() => setColumnaAbierta(null)} />

            <PanelModal abierto={listaColumnas} alCambiar={setListaColumnas} titulo="Columnas" descripcion="Toca una columna para cambiar su nombre, su tipo o su fórmula." lado={esMovil ? "abajo" : "centro"}>
                <ul className={css.listaOpciones} style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {columnas.map((c) => (
                        <li key={c.id}>
                            <button
                                type="button"
                                className={css.boton}
                                style={{ width: "100%", justifyContent: "space-between" }}
                                onClick={() => {
                                    setListaColumnas(false);
                                    setColumnaAbierta(c.id);
                                }}
                            >
                                <span>{c.nombre.v}</span>
                                <span className={css.secundario}>{ETIQUETA_TIPO[c.tipo.v]}</span>
                            </button>
                        </li>
                    ))}
                    {columnas.length === 0 ? <li className={css.ayuda}>Aún no hay columnas.</li> : null}
                </ul>
                {puedeEditar ? (
                    <button type="button" className={`${css.boton} ${css.botonPrimario}`} onClick={anadirColumna}>
                        <Plus size={16} aria-hidden="true" /> Añadir columna
                    </button>
                ) : null}
            </PanelModal>

            <PanelCompartir
                abierto={compartir}
                alCambiar={setCompartir}
                espacioId={id}
                esDueno={esDueno}
                duenoUid={snap.propietario}
                acceso={accesoLocal ?? snap.acceso}
                rutaPublica={rutaTabla(id)}
                nota={NOTA_FUSION}
                alCambiarAcceso={setAccesoLocal}
            />

            <PanelModal abierto={!!resumen} alCambiar={(a) => !a && setResumen(null)} titulo="Importación terminada" lado={esMovil ? "abajo" : "centro"}>
                {resumen ? (
                    <>
                        <p style={{ margin: 0 }}>
                            Se {resumen.filasAnadidas === 1 ? "añadió 1 fila" : `añadieron ${resumen.filasAnadidas} filas`}
                            {resumen.columnasNuevas ? ` y ${resumen.columnasNuevas === 1 ? "1 columna nueva" : `${resumen.columnasNuevas} columnas nuevas`}` : ""}.
                        </p>
                        {resumen.avisos.length > 0 ? (
                            <ul className={css.ayuda} style={{ margin: 0, paddingLeft: 18 }}>
                                {resumen.avisos.slice(0, 12).map((a, i) => (
                                    <li key={i}>{a}</li>
                                ))}
                            </ul>
                        ) : null}
                        <button type="button" className={`${css.boton} ${css.botonPrimario}`} onClick={() => setResumen(null)}>
                            Entendido
                        </button>
                    </>
                ) : null}
            </PanelModal>

            <input
                ref={selector}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                hidden
                aria-label="Elegir un archivo CSV para importar"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void alElegirArchivo(f);
                }}
            />
        </div>
    );
}
