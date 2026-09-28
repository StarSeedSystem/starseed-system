"use client";
/**
 * Lista de espacios vivos (tablas o paneles compartidos): los míos, los que me compartieron y las
 * invitaciones sin aceptar, más un formulario para crear uno nuevo. La usan `/tabla` y
 * `/dashboard-compartido`.
 */
import { Loader2, Plus, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { deleteSpace } from "@/lib/spaces/spaces";
import { listarEspaciosVivos, type ResumenEspacio, type TipoVivoEspacio } from "@/lib/vivo/tabla/espacio";
import css from "./tabla.module.css";

const FECHA = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }) : null;

function fechaLegible(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) || !FECHA ? "" : FECHA.format(d);
}

export function ListaEspacios({
    tipo,
    titulo,
    descripcion,
    Icono,
    color,
    rutaDe,
    crear,
    etiquetaCrear,
    ayudaVacio,
    opcionCrear,
}: {
    tipo: TipoVivoEspacio;
    titulo: string;
    descripcion: string;
    Icono: LucideIcon;
    color: string;
    rutaDe: (id: string) => string;
    crear: (titulo: string, opcion: boolean) => Promise<{ refId: string; ruta: string }>;
    etiquetaCrear: string;
    ayudaVacio: string;
    /** Casilla extra en el formulario (p. ej. «empezar con mi dashboard»). */
    opcionCrear?: { etiqueta: string; ayuda: string; porDefecto: boolean };
}) {
    const router = useRouter();
    const [lista, setLista] = useState<ResumenEspacio[] | null>(null);
    const [nombre, setNombre] = useState("");
    const [opcion, setOpcion] = useState(opcionCrear?.porDefecto ?? false);
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [borrando, setBorrando] = useState<string | null>(null);

    const cargar = useCallback(async () => setLista(await listarEspaciosVivos(tipo)), [tipo]);
    useEffect(() => {
        void cargar();
    }, [cargar]);

    const alCrear = async (e: FormEvent) => {
        e.preventDefault();
        if (creando) return;
        setCreando(true);
        setError(null);
        try {
            const r = await crear(nombre.trim(), opcion);
            router.push(r.ruta);
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : "No se pudo crear. Inténtalo de nuevo.");
            setCreando(false);
        }
    };

    const eliminar = async (id: string) => {
        const ok = await deleteSpace(id);
        setBorrando(null);
        if (ok) setLista((l) => (l ? l.filter((x) => x.refId !== id) : l));
        else setError("No se pudo eliminar. Solo la persona dueña puede hacerlo.");
    };

    return (
        <div className={css.raiz} style={{ height: "auto", minHeight: "100dvh", overflowY: "auto" }}>
            <div className={css.listaPagina} style={{ ["--c" as string]: color }}>
                <div className={css.listaCabecera}>
                    <div>
                        <span className={css.rotulo}>App en vivo</span>
                        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Icono size={26} aria-hidden="true" style={{ color }} />
                            {titulo}
                        </h1>
                        <p className={css.secundario} style={{ margin: "4px 0 0", maxWidth: 560 }}>
                            {descripcion}
                        </p>
                    </div>
                </div>

                <form className={`${css.formCrear} ${css.panel}`} onSubmit={alCrear} aria-label={etiquetaCrear}>
                    <div className={css.campo} style={{ flex: "1 1 240px" }}>
                        <label htmlFor="nuevo-espacio">Nombre</label>
                        <input id="nuevo-espacio" className={css.entrada} value={nombre} maxLength={80} placeholder={titulo} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
                    </div>
                    {opcionCrear ? (
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: "1 1 100%", cursor: "pointer" }}>
                            <input type="checkbox" checked={opcion} onChange={(e) => setOpcion(e.target.checked)} style={{ marginTop: 3, accentColor: "#7C5CFF", width: 18, height: 18 }} />
                            <span>
                                {opcionCrear.etiqueta}
                                <span className={css.ayuda} style={{ display: "block" }}>
                                    {opcionCrear.ayuda}
                                </span>
                            </span>
                        </label>
                    ) : null}
                    <button type="submit" className={`${css.boton} ${css.botonPrimario}`} disabled={creando} style={{ alignSelf: "flex-end" }}>
                        {creando ? <Loader2 size={16} className={css.girar} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        {creando ? "Creando…" : etiquetaCrear}
                    </button>
                </form>

                {error ? (
                    <div className={`${css.aviso} ${css.avisoError}`} role="alert">
                        {error}
                    </div>
                ) : null}

                {lista === null ? (
                    <div className={css.vacio} role="status">
                        <Loader2 size={24} className={css.girar} aria-hidden="true" />
                        <p>Buscando lo tuyo…</p>
                    </div>
                ) : lista.length === 0 ? (
                    <div className={`${css.vacio} ${css.panel}`} role="status">
                        <Icono size={28} aria-hidden="true" style={{ color }} />
                        <p>{ayudaVacio}</p>
                    </div>
                ) : (
                    <ul className={css.listaRejilla} style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {lista.map((e) => (
                            <li key={e.refId} style={{ display: "contents" }}>
                                <article className={css.espacio} style={{ ["--c" as string]: color }}>
                                    <Link href={rutaDe(e.refId)} className={css.espacioTitulo} style={{ color: "inherit", textDecoration: "none" }}>
                                        {e.titulo}
                                    </Link>
                                    <span className={css.secundario}>
                                        {e.pendiente ? "Invitación sin aceptar: se acepta al abrirla" : e.esMio ? "Tuya" : "Compartida contigo"}
                                        {e.actualizado ? ` · ${fechaLegible(e.actualizado)}` : ""}
                                    </span>
                                    <div className={css.fichas} style={{ marginTop: "auto" }}>
                                        <Link href={rutaDe(e.refId)} className={`${css.boton} ${css.botonChico}`}>
                                            Abrir
                                        </Link>
                                        {e.esMio ? (
                                            borrando === e.refId ? (
                                                <>
                                                    <button type="button" className={`${css.boton} ${css.botonChico} ${css.botonPeligro}`} onClick={() => void eliminar(e.refId)}>
                                                        <Trash2 size={14} aria-hidden="true" /> Sí, eliminar
                                                    </button>
                                                    <button type="button" className={`${css.boton} ${css.botonChico}`} onClick={() => setBorrando(null)}>
                                                        Cancelar
                                                    </button>
                                                </>
                                            ) : (
                                                <button type="button" className={`${css.boton} ${css.botonChico}`} onClick={() => setBorrando(e.refId)} aria-label={`Eliminar ${e.titulo}`}>
                                                    <Trash2 size={14} aria-hidden="true" /> Eliminar
                                                </button>
                                            )
                                        ) : null}
                                    </div>
                                </article>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
