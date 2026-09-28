"use client";

/**
 * Lanzador de escenas 3D (L5 · 2026-09-28): crear una escena nueva y abrir las mías o las que
 * me compartieron, en 3D (`/escena`) o en VR/AR (`/sala-xr`).
 */

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, ChevronRight, Glasses, Loader2, Plus, Users } from "lucide-react";
import { crearVivoEscena3d, rutaEscena } from "@/lib/vivo/escena3d";
import { rutaSalaXr } from "@/lib/vivo/xr";
import { listarEscenasCompartidas, listarEscenasPropias, type ResumenEscena } from "@/lib/vivo/espacial/persistencia";
import css from "./escena.module.css";

function fecha(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function LanzadorEscenas({ destino }: { destino: "escena" | "xr" }) {
    const router = useRouter();
    const [propias, setPropias] = useState<ResumenEscena[] | null>(null);
    const [compartidas, setCompartidas] = useState<ResumenEscena[]>([]);
    const [titulo, setTitulo] = useState("");
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idTitulo = useId();
    const esXR = destino === "xr";
    const ruta = (id: string) => (esXR ? rutaSalaXr(id) : rutaEscena(id));
    const color = esXR ? "#DC143C" : "#F97316";

    useEffect(() => {
        let vivo = true;
        void Promise.all([listarEscenasPropias(), listarEscenasCompartidas()]).then(([p, c]) => {
            if (!vivo) return;
            setPropias(p);
            setCompartidas(c);
        });
        return () => {
            vivo = false;
        };
    }, []);

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreando(true);
        setError(null);
        try {
            const { refId } = await crearVivoEscena3d(titulo.trim() || (esXR ? "Sala XR" : "Escena 3D"));
            router.push(ruta(refId));
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo crear la escena.");
            setCreando(false);
        }
    };

    const lista = (items: ResumenEscena[], vacio: string) =>
        items.length === 0 ? (
            <p className={css.nota}>{vacio}</p>
        ) : (
            <ul className={css.lista}>
                {items.map((e) => (
                    <li key={e.id}>
                        <Link href={ruta(e.id)} className={css.item}>
                            <span className={css.icono} style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
                                {esXR ? <Glasses className="size-[18px]" aria-hidden /> : <Box className="size-[18px]" aria-hidden />}
                            </span>
                            <span className={`${css.itemTexto} flex-1`}>
                                <span className={css.itemTitulo}>{e.titulo}</span>
                                <span className={css.itemDetalle}>
                                    {e.objetos} objeto{e.objetos === 1 ? "" : "s"}
                                    {e.actualizada ? ` · ${fecha(e.actualizada)}` : ""}
                                </span>
                            </span>
                            <ChevronRight className="size-4 text-white/40" aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
        );

    return (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
            <header>
                <h1 className="text-2xl font-semibold text-white">{esXR ? "Salas XR compartidas" : "Escenas 3D compartidas"}</h1>
                <p className="mt-1 text-[14px] leading-relaxed text-white/65">
                    {esXR
                        ? "Una escena 3D en la que entrar con un visor de realidad virtual o un móvil con realidad aumentada. En dispositivos sin WebXR se abre en 3D, con los mismos objetos y personas."
                        : "Un espacio tridimensional que varias personas abren a la vez: objetos, luces, imágenes y modelos, y el avatar de cada cual moviéndose en vivo."}
                </p>
            </header>

            <form onSubmit={crear} className={`${css.vidrio} rounded-[22px] p-4`}>
                <label htmlFor={idTitulo} className={css.rotulo} style={{ marginTop: 0 }}>
                    Nueva {esXR ? "sala" : "escena"}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        id={idTitulo}
                        className={css.entrada}
                        placeholder={esXR ? "Por ejemplo: Taller en VR" : "Por ejemplo: Maqueta del huerto"}
                        value={titulo}
                        maxLength={120}
                        onChange={(e) => setTitulo(e.target.value)}
                    />
                    <button type="submit" className={`${css.boton} shrink-0`} style={{ background: color }} disabled={creando}>
                        {creando ? <Loader2 className={`size-4 ${css.girar}`} aria-hidden /> : <Plus className="size-4" aria-hidden />}
                        {esXR ? "Crear sala" : "Crear escena"}
                    </button>
                </div>
                {error && (
                    <p role="alert" className="mt-2 text-[13px] text-amber-200">
                        {error}
                    </p>
                )}
                <p className={css.nota}>Se crea privada. Para abrirla con alguien, compártela en vivo desde un chat o invítale desde allí.</p>
            </form>

            <div className={`${css.vidrio} rounded-[22px] p-4`}>
                <span className={css.rotulo} style={{ marginTop: 0 }}>
                    Mis {esXR ? "salas y escenas" : "escenas"}
                </span>
                {propias === null ? (
                    <p className={css.nota} role="status">
                        Cargando…
                    </p>
                ) : (
                    lista(propias, "Aún no has creado ninguna. La primera está a un clic.")
                )}
                {compartidas.length > 0 && (
                    <>
                        <span className={css.rotulo}>
                            <Users className="mr-1 inline size-3" aria-hidden /> Compartidas conmigo
                        </span>
                        {lista(compartidas, "")}
                    </>
                )}
            </div>
        </section>
    );
}

export default LanzadorEscenas;
