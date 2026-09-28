"use client";

/**
 * AppContactos — la app de Contactos del OS (teal #14B8A6): lo mejor de una libreta de
 * contactos y de un CRM personal, en cristal StarSeed.
 *
 *  - Escritorio (≥1024 px): tres paneles — carpetas · lista · ficha.
 *  - Tableta (≥768 px): lista · ficha; las carpetas se abren en un panel lateral.
 *  - Móvil: pantallas apiladas (carpetas → lista → ficha) con transiciones de deslizamiento.
 *
 * Enlaces profundos: `?c=<id>` abre una ficha; `?nuevo=<usuario>` abre el editor ya rellenado
 * con su perfil StarSeed. Sin sesión → invitación a entrar. Si la nube falla, un aviso
 * discreto y la libreta sigue funcionando en local.
 */

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookUser, ChevronLeft, CopyCheck, Download, FileUp, FolderTree, MoreHorizontal, UserPlus } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useContactos } from "@/lib/contactos/store";
import { buscarDuplicados, proximosCumpleanos } from "@/lib/contactos/modelo";
import type { AgrupacionContactos, Contacto, ContactoEntrada, OrdenContactos } from "@/lib/contactos/tipos";
import { fetchProfileByUsername } from "@/lib/social/os-profiles";
import { cn } from "@/lib/utils";
import { EditorContacto } from "@/components/contactos/editor-contacto";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_PRINCIPAL,
    CLASE_ITEM_MENU,
    CLASE_MENU,
    CLASE_PANEL,
    RESORTE,
    pildora,
    useDisposicion,
    useMovimientoReducido,
} from "@/components/contactos/app/estilos";
import { BarraLateral } from "@/components/contactos/app/barra-lateral";
import { ListaContactos } from "@/components/contactos/app/lista-contactos";
import { FichaContacto } from "@/components/contactos/app/ficha-contacto";
import { DialogoDuplicados } from "@/components/contactos/app/duplicados";
import { AvisoError, EstadoVacio, Esqueleto, FichaVacia, InvitacionSesion } from "@/components/contactos/app/estados";
import { descargarVcf, leerArchivoVcf } from "@/components/contactos/app/archivos";
import { usePresenciaContactos } from "@/components/contactos/app/presencia-contactos";
import {
    DIAS_CUMPLEANOS,
    SELECCION_INICIAL,
    calcularVista,
    contarLateral,
    nombreArchivoVcf,
    tituloSeleccion,
    type SeleccionLateral,
} from "@/components/contactos/app/vista";

type Pantalla = "carpetas" | "lista" | "ficha";
const PROFUNDIDAD: Record<Pantalla, number> = { carpetas: 0, lista: 1, ficha: 2 };
const CLAVE_PREFERENCIAS = "starseed.contactos.vista.v1";

interface EstadoEditor {
    open: boolean;
    contactoId?: string;
    inicial?: ContactoEntrada;
}

function leerPreferencias(): { orden?: OrdenContactos; agrupacion?: AgrupacionContactos } {
    try {
        const raw = localStorage.getItem(CLAVE_PREFERENCIAS);
        if (!raw) return {};
        const p = JSON.parse(raw) as { orden?: OrdenContactos; agrupacion?: AgrupacionContactos };
        const ordenes: OrdenContactos[] = ["nombre", "reciente", "relacion", "creado"];
        const agrupaciones: AgrupacionContactos[] = ["letra", "relacion", "categoria", "ninguna"];
        return {
            orden: p.orden && ordenes.includes(p.orden) ? p.orden : undefined,
            agrupacion: p.agrupacion && agrupaciones.includes(p.agrupacion) ? p.agrupacion : undefined,
        };
    } catch {
        return {};
    }
}

function guardarPreferencias(p: { orden: OrdenContactos; agrupacion: AgrupacionContactos }) {
    try {
        localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(p));
    } catch {
        /* modo privado / sin almacenamiento: no pasa nada */
    }
}

export function AppContactos() {
    const api = useContactos();
    const router = useRouter();
    const pathname = usePathname() || "/contactos";
    const params = useSearchParams();
    const disposicion = useDisposicion();
    const reducido = useMovimientoReducido();

    const [seleccion, setSeleccion] = useState<SeleccionLateral>(SELECCION_INICIAL);
    const [texto, setTexto] = useState("");
    const [orden, setOrden] = useState<OrdenContactos>("nombre");
    const [agrupacion, setAgrupacion] = useState<AgrupacionContactos>("letra");
    const [pantalla, setPantalla] = useState<Pantalla>("lista");
    const [direccion, setDireccion] = useState(1);
    const [carpetasAbiertas, setCarpetasAbiertas] = useState(false);
    const [editor, setEditor] = useState<EstadoEditor>({ open: false });
    const [duplicadosAbierto, setDuplicadosAbierto] = useState(false);
    const [errorCerrado, setErrorCerrado] = useState<string | null>(null);
    const entradaArchivo = useRef<HTMLInputElement>(null);
    const refBusqueda = useRef<HTMLInputElement>(null);

    const activoId = params?.get("c") ?? null;
    const nuevoParam = params?.get("nuevo") ?? null;

    // Preferencias de vista (por espectador, solo comodidad).
    useEffect(() => {
        const p = leerPreferencias();
        if (p.orden) setOrden(p.orden);
        if (p.agrupacion) setAgrupacion(p.agrupacion);
    }, []);
    const cambiarOrden = (o: OrdenContactos) => {
        setOrden(o);
        guardarPreferencias({ orden: o, agrupacion });
    };
    const cambiarAgrupacion = (a: AgrupacionContactos) => {
        setAgrupacion(a);
        guardarPreferencias({ orden, agrupacion: a });
    };

    const claveDia = new Date().toDateString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const hoy = useMemo(() => new Date(), [claveDia]);

    const vista = useMemo(
        () => calcularVista({ contactos: api.contactos, categorias: api.categorias, seleccion, texto, orden, agrupacion, hoy }),
        [api.contactos, api.categorias, seleccion, texto, orden, agrupacion, hoy],
    );
    const recuentos = useMemo(() => contarLateral(api.contactos, hoy), [api.contactos, hoy]);
    const proximos = useMemo(() => proximosCumpleanos(api.contactos, hoy, DIAS_CUMPLEANOS), [api.contactos, hoy]);
    const numDuplicados = useMemo(() => buscarDuplicados(api.contactos).length, [api.contactos]);
    const titulo = tituloSeleccion(seleccion, api.categorias, api.listas);
    const activo = activoId ? api.porId(activoId) : undefined;

    const idsPresencia = useMemo(() => {
        const ids = vista.visibles.map((c) => c.userId);
        if (activo?.userId) ids.unshift(activo.userId);
        return ids;
    }, [vista.visibles, activo?.userId]);
    const presencia = usePresenciaContactos(idsPresencia);

    // ── Navegación ──
    const pantallaRef = useRef<Pantalla>(pantalla);
    pantallaRef.current = pantalla;
    const irA = useCallback((p: Pantalla) => {
        setDireccion(PROFUNDIDAD[p] >= PROFUNDIDAD[pantallaRef.current] ? 1 : -1);
        setPantalla(p);
    }, []);

    const fijarUrl = useCallback(
        (id: string | null) => {
            router.replace(id ? `${pathname}?c=${encodeURIComponent(id)}` : pathname, { scroll: false });
        },
        [router, pathname],
    );

    const abrir = useCallback(
        (id: string) => {
            fijarUrl(id);
            irA("ficha");
        },
        [fijarUrl, irA],
    );

    const cerrarFicha = useCallback(() => {
        fijarUrl(null);
        irA("lista");
    }, [fijarUrl, irA]);

    const seleccionar = (s: SeleccionLateral) => {
        setSeleccion(s);
        setCarpetasAbiertas(false);
        if (disposicion === "movil") irA("lista");
    };

    // En móvil, un enlace `?c=` abre directamente la ficha.
    useEffect(() => {
        if (activoId && disposicion === "movil") setPantalla("ficha");
    }, [activoId, disposicion]);

    // `?c=` que ya no existe. Si la ficha se estaba viendo (se acaba de borrar aquí, en lote, al
    // fusionar duplicados o en otro dispositivo) se cierra sin más; si es un enlace que nunca
    // llegó a abrirse (viejo, de otra cuenta), se avisa con amabilidad.
    const vistos = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (activo) vistos.current.add(activo.id);
    }, [activo]);
    useEffect(() => {
        if (!api.listo || api.sinSesion || !activoId || activo) return;
        if (!vistos.current.has(activoId)) toast.info("Ese contacto ya no está en tu libreta.");
        vistos.current.add(activoId);
        fijarUrl(null);
        setPantalla("lista");
    }, [api.listo, api.sinSesion, activoId, activo, fijarUrl]);

    // `?nuevo=<usuario>`: abre el editor con su perfil StarSeed.
    const apiRef = useRef(api);
    apiRef.current = api;
    const montado = useRef(true);
    useEffect(() => {
        montado.current = true;
        return () => {
            montado.current = false;
        };
    }, []);
    const nuevoProcesado = useRef<string | null>(null);
    useEffect(() => {
        if (!api.listo || api.sinSesion || !nuevoParam) return;
        if (nuevoProcesado.current === nuevoParam) return;
        nuevoProcesado.current = nuevoParam;
        const usuario = nuevoParam.replace(/^@+/, "").trim();
        void (async () => {
            const perfil = usuario ? await fetchProfileByUsername(usuario) : null;
            if (!montado.current) return;
            router.replace(pathname, { scroll: false });
            if (perfil) {
                const ya = apiRef.current.porUserId(perfil.userId);
                if (ya) {
                    toast.info(`${ya.nombre} ya está en tus contactos`);
                    abrir(ya.id);
                    return;
                }
                setEditor({
                    open: true,
                    inicial: {
                        nombre: perfil.displayName,
                        userId: perfil.userId,
                        username: perfil.username,
                        perfil: { nombre: perfil.displayName, avatarUrl: perfil.avatarUrl, bio: perfil.bio || undefined, tomada: new Date().toISOString() },
                        relacion: "amistad",
                        origen: "starseed",
                    },
                });
            } else {
                toast.info(usuario ? `No encontramos a @${usuario} en la red: puedes crear la ficha a mano.` : "Crea la ficha a mano.");
                setEditor({ open: true, inicial: { nombre: "" } });
            }
        })();
    }, [api.listo, api.sinSesion, nuevoParam, router, pathname, abrir]);

    // Atajo: «/» enfoca la búsqueda (fuera de campos de texto).
    useEffect(() => {
        const alTeclear = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            if (!refBusqueda.current) return;
            e.preventDefault();
            refBusqueda.current.focus();
        };
        window.addEventListener("keydown", alTeclear);
        return () => window.removeEventListener("keydown", alTeclear);
    }, []);

    // ── Importar / exportar ──
    const pedirArchivo = () => entradaArchivo.current?.click();
    const alElegirArchivo = async (archivo: File | undefined) => {
        if (!archivo) return;
        const r = await leerArchivoVcf(archivo);
        if (!r.ok) {
            toast.error(r.error);
            return;
        }
        const { nuevos, fusionados } = api.importar(r.entradas);
        toast.success(`${nuevos === 1 ? "1 nuevo" : `${nuevos} nuevos`}, ${fusionados === 1 ? "1 fusionado" : `${fusionados} fusionados`}`);
    };
    const exportarTodos = () => {
        if (!api.contactos.length) {
            toast.info("Aún no hay contactos que exportar.");
            return;
        }
        const ok = descargarVcf(api.contactos, nombreArchivoVcf(hoy));
        if (ok) toast.success(`${api.contactos.length} contactos exportados (sin notas privadas)`);
        else toast.error("Este navegador no permite descargar el archivo.");
    };
    const exportarVista = () => {
        const ok = descargarVcf(vista.visibles, nombreArchivoVcf(hoy, "vista"));
        if (ok) toast.success(`${vista.visibles.length} contactos de «${titulo}» exportados`);
        else toast.error("Este navegador no permite descargar el archivo.");
    };

    const abrirNuevo = () => setEditor({ open: true });
    const abrirEditar = (id: string) => setEditor({ open: true, contactoId: id });
    const alGuardar = (c: Contacto) => {
        if (c.id !== activoId) abrir(c.id);
    };

    // ── Estados globales ──
    if (!api.listo) return <Esqueleto />;
    if (api.sinSesion) return <InvitacionSesion />;

    const mostrarError = api.error && api.error !== errorCerrado;

    const barra = <BarraLateral api={api} seleccion={seleccion} onSeleccionar={seleccionar} recuentos={recuentos} />;

    const cabeceraLista =
        disposicion === "movil" ? (
            <button type="button" onClick={() => irA("carpetas")} aria-label="Carpetas" title="Carpetas" className={cn(CLASE_BOTON, "px-2.5 py-1.5")}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Carpetas
            </button>
        ) : disposicion === "tableta" ? (
            <button type="button" onClick={() => setCarpetasAbiertas(true)} className={cn(CLASE_BOTON, "px-2.5 py-1.5")}>
                <FolderTree className="h-4 w-4" aria-hidden />
                Carpetas
            </button>
        ) : null;

    const lista = (
        <ListaContactos
            api={api}
            titulo={titulo}
            vista={vista}
            seleccion={seleccion}
            texto={texto}
            onTexto={setTexto}
            orden={orden}
            onOrden={cambiarOrden}
            agrupacion={agrupacion}
            onAgrupacion={cambiarAgrupacion}
            activoId={activoId}
            onAbrir={abrir}
            presencia={presencia}
            hoy={hoy}
            proximos={proximos}
            onVerCumpleanos={() => seleccionar({ tipo: "cumpleanos" })}
            cabecera={cabeceraLista}
            vacio={<EstadoVacio onNuevo={abrirNuevo} onImportar={pedirArchivo} />}
            refBusqueda={refBusqueda}
        />
    );

    const ficha = activo ? (
        <FichaContacto
            key={activo.id}
            contacto={activo}
            api={api}
            enLinea={Boolean(activo.userId && presencia[activo.userId])}
            hoy={hoy}
            onEditar={() => abrirEditar(activo.id)}
            onVolver={disposicion === "movil" ? cerrarFicha : undefined}
            onEliminado={cerrarFicha}
        />
    ) : (
        <FichaVacia total={recuentos.todos} favoritos={recuentos.favoritos} cumpleanos={recuentos.cumpleanos} />
    );

    const variantes = {
        entra: (d: number) => (reducido ? { opacity: 0 } : { x: d > 0 ? "100%" : "-30%", opacity: d > 0 ? 1 : 0.4 }),
        centro: { x: 0, opacity: 1 },
        sale: (d: number) => (reducido ? { opacity: 0 } : { x: d > 0 ? "-30%" : "100%", opacity: d > 0 ? 0.4 : 1 }),
    };

    return (
        <div className="mx-auto flex h-[calc(100dvh-6rem)] min-h-[520px] w-full max-w-[1680px] flex-col gap-3 px-3 pt-3 sm:px-4 sm:pt-4 lg:gap-4" data-testid="app-contactos">
            {/* ── Cabecera ── */}
            <header className="flex flex-wrap items-center gap-3">
                <span
                    aria-hidden
                    className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:flex"
                    style={{ ...pildora(ACENTO), boxShadow: `inset 0 0 0 1px ${ACENTO}66, 0 0 28px -8px ${ACENTO}` }}
                >
                    <BookUser className="h-5 w-5 text-white" />
                </span>
                <div className="min-w-[8rem] flex-1">
                    <h1 className="text-[20px] font-semibold leading-tight text-white sm:text-[22px]">Contactos</h1>
                    <p className="text-[12px] text-white/55">
                        <span className="hidden sm:inline">Tu libreta privada · </span>
                        {api.contactos.length === 1 ? "1 persona" : `${api.contactos.length} personas`}
                    </p>
                </div>
                {disposicion === "escritorio" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDuplicadosAbierto(true)} className={CLASE_BOTON} disabled={!api.contactos.length}>
                            <CopyCheck className="h-4 w-4" aria-hidden />
                            Duplicados
                            {numDuplicados ? (
                                <span className="ss-redondo rounded-full px-1.5 text-[11px] font-semibold text-white" style={pildora("#F59E0B")}>
                                    {numDuplicados}
                                </span>
                            ) : null}
                        </button>
                        <button type="button" onClick={pedirArchivo} className={CLASE_BOTON}>
                            <FileUp className="h-4 w-4" aria-hidden />
                            Importar
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button type="button" className={CLASE_BOTON} disabled={!api.contactos.length}>
                                    <Download className="h-4 w-4" aria-hidden />
                                    Exportar
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className={CLASE_MENU}>
                                <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={exportarTodos}>
                                    Todos los contactos ({api.contactos.length})
                                </DropdownMenuItem>
                                <DropdownMenuItem className={CLASE_ITEM_MENU} disabled={!vista.visibles.length} onSelect={exportarVista}>
                                    Solo «{titulo}» ({vista.visibles.length})
                                </DropdownMenuItem>
                                <p className="px-3 pb-1.5 pt-1 text-[11px] text-white/40">Formato vCard 4.0 · nunca incluye tus notas</p>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <button type="button" onClick={abrirNuevo} className={CLASE_BOTON_PRINCIPAL}>
                            <UserPlus className="h-4 w-4" aria-hidden />
                            Nuevo contacto
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={abrirNuevo} className={CLASE_BOTON_PRINCIPAL}>
                            <UserPlus className="h-4 w-4" aria-hidden />
                            Nuevo
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button type="button" className={CLASE_BOTON} aria-label="Más acciones">
                                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                                    Más
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" collisionPadding={12} className={CLASE_MENU}>
                                <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={pedirArchivo}>
                                    <FileUp className="h-4 w-4 text-white/60" aria-hidden />
                                    Importar vCard (.vcf)
                                </DropdownMenuItem>
                                <DropdownMenuItem className={CLASE_ITEM_MENU} disabled={!api.contactos.length} onSelect={exportarTodos}>
                                    <Download className="h-4 w-4 text-white/60" aria-hidden />
                                    Exportar todos ({api.contactos.length})
                                </DropdownMenuItem>
                                <DropdownMenuItem className={CLASE_ITEM_MENU} disabled={!vista.visibles.length} onSelect={exportarVista}>
                                    <Download className="h-4 w-4 text-white/60" aria-hidden />
                                    Exportar «{titulo}» ({vista.visibles.length})
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1 bg-white/10" />
                                <DropdownMenuItem className={CLASE_ITEM_MENU} disabled={!api.contactos.length} onSelect={() => setDuplicadosAbierto(true)}>
                                    <CopyCheck className="h-4 w-4 text-white/60" aria-hidden />
                                    Revisar duplicados{numDuplicados ? ` (${numDuplicados})` : ""}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
                <input
                    ref={entradaArchivo}
                    type="file"
                    accept=".vcf,.vcard,text/vcard,text/x-vcard"
                    className="hidden"
                    aria-hidden
                    tabIndex={-1}
                    data-testid="entrada-vcf"
                    onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        e.target.value = "";
                        void alElegirArchivo(archivo);
                    }}
                />
            </header>

            {mostrarError ? <AvisoError texto={api.error as string} onCerrar={() => setErrorCerrado(api.error)} /> : null}

            {/* ── Paneles ── */}
            {disposicion === "escritorio" ? (
                <div className="flex min-h-0 flex-1 gap-4 pb-2">
                    <aside className={cn(CLASE_PANEL, "w-[250px] shrink-0 overflow-y-auto overscroll-contain xl:w-[270px]")}>{barra}</aside>
                    <section aria-label="Lista de contactos" className={cn(CLASE_PANEL, "flex w-[360px] shrink-0 flex-col overflow-hidden xl:w-[400px]")}>
                        {lista}
                    </section>
                    <section aria-label="Ficha del contacto" className={cn(CLASE_PANEL, "min-w-0 flex-1 overflow-y-auto overscroll-contain")}>
                        {ficha}
                    </section>
                </div>
            ) : disposicion === "tableta" ? (
                <div className="flex min-h-0 flex-1 gap-3 pb-2">
                    <section aria-label="Lista de contactos" className={cn(CLASE_PANEL, "flex w-[340px] shrink-0 flex-col overflow-hidden")}>
                        {lista}
                    </section>
                    <section aria-label="Ficha del contacto" className={cn(CLASE_PANEL, "min-w-0 flex-1 overflow-y-auto overscroll-contain")}>
                        {ficha}
                    </section>
                    <Sheet open={carpetasAbiertas} onOpenChange={setCarpetasAbiertas}>
                        <SheetContent side="left" className="w-[300px] overflow-y-auto border-white/10 bg-[rgba(10,12,30,0.94)] p-0 text-white backdrop-blur-2xl sm:max-w-[300px]">
                            <div className="px-5 pb-1 pt-5">
                                <SheetTitle className="text-[17px] font-semibold text-white">Carpetas</SheetTitle>
                                <SheetDescription className="text-[12px] text-white/55">Vistas, relaciones, categorías y listas</SheetDescription>
                            </div>
                            {barra}
                        </SheetContent>
                    </Sheet>
                </div>
            ) : (
                <div className={cn(CLASE_PANEL, "relative mb-2 min-h-0 flex-1 overflow-hidden")}>
                    <AnimatePresence initial={false} custom={direccion} mode="popLayout">
                        <motion.div
                            key={pantalla === "ficha" && !activo ? "lista" : pantalla}
                            custom={direccion}
                            variants={variantes}
                            initial="entra"
                            animate="centro"
                            exit="sale"
                            transition={reducido ? { duration: 0.15 } : RESORTE}
                            className="absolute inset-0 flex flex-col overflow-hidden rounded-[22px] bg-[rgb(11,13,32)] shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.6)]"
                        >
                            {pantalla === "carpetas" ? (
                                <div className="flex h-full flex-col">
                                    <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
                                        <h2 className="flex-1 text-[17px] font-semibold text-white">Carpetas</h2>
                                        <button type="button" onClick={() => irA("lista")} className={cn(CLASE_BOTON, "px-3 py-1.5")}>
                                            Ver contactos
                                        </button>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{barra}</div>
                                </div>
                            ) : pantalla === "ficha" && activo ? (
                                <div className="h-full overflow-y-auto overscroll-contain">{ficha}</div>
                            ) : (
                                lista
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            )}

            <EditorContacto
                open={editor.open}
                onOpenChange={(v) => setEditor((e) => ({ ...e, open: v }))}
                contactoId={editor.contactoId}
                inicial={editor.inicial}
                onGuardado={alGuardar}
            />
            <DialogoDuplicados open={duplicadosAbierto} onOpenChange={setDuplicadosAbierto} api={api} onFusionado={(id) => abrir(id)} />
        </div>
    );
}

export default AppContactos;
