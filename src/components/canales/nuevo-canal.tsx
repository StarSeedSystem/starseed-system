"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canales StarSeed (Ola 285 · K5) — alta y edición de un canal.
 * ---------------------------------------------------------------------------
 * Formulario para que CUALQUIERA publique su canal al instante en el directorio
 * abierto (lectura pública, escritura solo del dueño por RLS). Al pegar el
 * enlace se deduce la plataforma automáticamente (pero se puede cambiar). Las
 * categorías son LIBRES: se escriben y se confirman con Enter o coma, se
 * normalizan con `normalizarCategorias` y no hay lista cerrada.
 *
 * En modo edición (`canal` presente) usa `editarCanal` y precarga los campos.
 * Sin sesión muestra un aviso con enlace a /login (la escritura exige sesión).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Link2, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
    validarCanalPublico, publicarCanal, editarCanal, deducirPlataforma,
    normalizarCategorias, type CanalPublico, type CanalPlataforma, type CanalTipo,
    type ParcialCanal,
} from "@/lib/canales/publicos";

const PLATAFORMAS: CanalPlataforma[] = ["telegram", "youtube", "whatsapp", "x", "instagram", "rss", "web", "otro"];
const TIPOS: CanalTipo[] = ["canal", "grupo", "lista"];
const ETIQUETAS: Record<string, string> = { canal: "Canal", grupo: "Grupo", lista: "Lista", telegram: "Telegram", youtube: "YouTube", whatsapp: "WhatsApp", x: "X / Twitter", instagram: "Instagram", rss: "RSS", web: "Web", otro: "Otro" };
// Estilo compartido de los campos de entrada del formulario.
const INPUT = "h-9 w-full rounded-md border border-white/10 bg-white/5 px-2.5 text-sm text-white outline-none focus:border-white/25";

export function NuevoCanal({ onPublicado, canal, sugerencias = [] }: {
    onPublicado?: () => void;
    canal?: CanalPublico | null;
    sugerencias?: string[];
}) {
    const [enlace, setEnlace] = useState(canal?.enlace ?? "");
    const [plataforma, setPlataforma] = useState<CanalPlataforma>(canal?.plataforma ?? "web");
    const [nombre, setNombre] = useState(canal?.nombre ?? "");
    const [descripcion, setDescripcion] = useState(canal?.descripcion ?? "");
    const [tipo, setTipo] = useState<CanalTipo>(canal?.tipo ?? "canal");
    const [idioma, setIdioma] = useState(canal?.idioma ?? "es");
    const [imagen, setImagen] = useState(canal?.imagen ?? "");
    const [categorias, setCategorias] = useState<string[]>(canal?.categorias ?? []);
    const [categoriaInput, setCategoriaInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [tieneSesion, setTieneSesion] = useState<boolean | null>(null);

    // Al montar comprobamos si hay sesión (la escritura la exige). SSR-safe.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let vivo = true;
        (async () => {
            try {
                const { data } = await createClient().auth.getUser();
                if (vivo) setTieneSesion(Boolean(data.user));
            } catch {
                if (vivo) setTieneSesion(false);
            }
        })();
        return () => { vivo = false; };
    }, []);

    // Al cambiar el enlace deducimos la plataforma (se puede corregir a mano).
    const alCambiarEnlace = (valor: string) => {
        setEnlace(valor);
        setPlataforma(deducirPlataforma(valor));
    };

    // Añade categorías normalizadas; Enter o coma confirman el chip.
    const confirmarCategoria = (bruto: string) => {
        const limpias = normalizarCategorias(bruto);
        if (limpias.length === 0) return;
        setCategorias((prev) => Array.from(new Set([...prev, ...limpias])).slice(0, 8));
    };
    const onKeyDownCategoria = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            confirmarCategoria(categoriaInput);
            setCategoriaInput("");
        }
    };
    const quitarCategoria = (c: string) => setCategorias((prev) => prev.filter((x) => x !== c));

    // Envío: valida con `validarCanalPublico` (su error se muestra tal cual).
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const parcial: ParcialCanal = { nombre, enlace, plataforma, tipo, descripcion, categorias, idioma, imagen: imagen || undefined };
        const veredicto = validarCanalPublico(parcial);
        if (!veredicto.ok) { setError(veredicto.error); return; }
        setEnviando(true);
        const resultado = canal ? await editarCanal(canal.id, parcial) : await publicarCanal(parcial);
        setEnviando(false);
        if (!resultado.ok) { setError(resultado.error); return; }
        onPublicado?.();
    };

    if (tieneSesion === false) {
        return (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-6 text-center backdrop-blur">
                <p className="text-sm text-muted-foreground">Entra con tu cuenta para publicar un canal.</p>
                <Link href="/login" className="mt-2 inline-block cursor-pointer text-sm font-medium text-emerald-300 hover:underline">Iniciar sesión →</Link>
            </div>
        );
    }

    return (
        <form onSubmit={(e) => void enviar(e)} data-testid="nuevo-canal" className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="h-4 w-4 text-emerald-300" />{canal ? "Editar canal" : "Publicar mi canal"}
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Enlace *
                <div className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    <input value={enlace} onChange={(e) => alCambiarEnlace(e.target.value)} placeholder="https://t.me/micanal" className={INPUT} />
                </div>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Plataforma
                <select value={plataforma} onChange={(e) => setPlataforma(e.target.value as CanalPlataforma)} className={"cursor-pointer " + INPUT}>
                    {PLATAFORMAS.map((p) => <option key={p} value={p} className="bg-black">{ETIQUETAS[p]}</option>)}
                </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nombre *
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mi canal de ciencia" className={INPUT} />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Descripción
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="De qué va este canal…" className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-white/25" />
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
                    <select value={tipo} onChange={(e) => setTipo(e.target.value as CanalTipo)} className={"cursor-pointer " + INPUT}>
                        {TIPOS.map((t) => <option key={t} value={t} className="bg-black">{ETIQUETAS[t]}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Idioma
                    <input value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="es" className={INPUT} />
                </label>
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Imagen (URL opcional)
                <input value={imagen} onChange={(e) => setImagen(e.target.value)} placeholder="https://…/portada.png" className={INPUT} />
            </label>

            {/* Categorías LIBRES: Enter o coma crea un chip normalizado. */}
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">Categorías (libres, con Enter o coma)
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
                    {categorias.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/80">{c}
                            <button type="button" onClick={() => quitarCategoria(c)} className="cursor-pointer text-white/50 hover:text-white" aria-label={`Quitar ${c}`}><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                    <input value={categoriaInput} onChange={(e) => setCategoriaInput(e.target.value)} onKeyDown={onKeyDownCategoria}
                        onBlur={() => { confirmarCategoria(categoriaInput); setCategoriaInput(""); }}
                        placeholder={categorias.length === 0 ? "ciencia, arte, …" : ""}
                        className="min-w-24 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
                </div>
                {sugerencias.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {sugerencias.map((s) => categorias.includes(s) ? null : (
                            <button key={s} type="button" onClick={() => confirmarCategoria(s)} className="cursor-pointer rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10">+ {s}</button>
                        ))}
                    </div>
                )}
            </div>

            {error && <p className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">{error}</p>}

            <button type="submit" disabled={enviando} className="cursor-pointer rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60">
                {enviando ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</span> : canal ? "Guardar cambios" : "Publicar canal"}
            </button>
        </form>
    );
}