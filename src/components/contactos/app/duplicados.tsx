"use client";

/**
 * DialogoDuplicados — revisa los grupos de posibles duplicados (misma cuenta, teléfono, correo
 * o nombre) lado a lado, deja elegir la ficha principal y los fusiona en una: une teléfonos,
 * correos, enlaces, categorías y listas, y TRASLADA las notas privadas de la línea de tiempo a
 * la principal antes de borrar las demás (para que ninguna nota se quede huérfana).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AtSign, Check, CopyCheck, Loader2, Phone, Sparkles } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buscarDuplicados, fusionarContactos } from "@/lib/contactos/modelo";
import { useNotasContacto } from "@/lib/contactos/store";
import type { Contacto, ContactosApi } from "@/lib/contactos/tipos";
import { cn } from "@/lib/utils";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import { ACENTO, CLASE_BOTON, CLASE_BOTON_PRINCIPAL, CLASE_FOCO, CLASE_TARJETA, infoRelacion, pildora } from "@/components/contactos/app/estilos";
import { aplicarVisibilidad, camposEditables } from "@/components/contactos/app/acciones";

export interface DialogoDuplicadosProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    api: ContactosApi;
    onFusionado?: (id: string) => void;
}

function claveGrupo(g: Contacto[]): string {
    return g
        .map((c) => c.id)
        .sort()
        .join("|");
}

/** Copia las notas de una ficha a otra (invisible). Llama a `onHecho` una sola vez. */
function TrasladoNotas({ desdeId, haciaId, onHecho }: { desdeId: string; haciaId: string; onHecho: (desdeId: string, n: number) => void }) {
    const desde = useNotasContacto(desdeId);
    const hacia = useNotasContacto(haciaId);
    const hecho = useRef(false);
    const { agregar } = hacia;

    useEffect(() => {
        if (hecho.current || !desde.listo || !hacia.listo) return;
        hecho.current = true;
        for (const n of desde.notas) agregar({ texto: n.texto, tipo: n.tipo, fecha: n.fecha, etiquetas: n.etiquetas });
        onHecho(desdeId, desde.notas.length);
    }, [desde.listo, hacia.listo, desde.notas, agregar, onHecho, desdeId]);

    // Respaldo: si las notas no llegan a cargarse, no bloquear la fusión para siempre.
    useEffect(() => {
        const t = setTimeout(() => {
            if (hecho.current) return;
            hecho.current = true;
            onHecho(desdeId, 0);
        }, 4000);
        return () => clearTimeout(t);
    }, [desdeId, onHecho]);
    return null;
}

function TarjetaCandidato({ c, principal, onElegir }: { c: Contacto; principal: boolean; onElegir: () => void }) {
    const rel = infoRelacion(c.relacion);
    return (
        <button
            type="button"
            role="radio"
            aria-checked={principal}
            onClick={onElegir}
            className={cn(
                CLASE_TARJETA,
                "flex h-full w-full cursor-pointer flex-col gap-2.5 p-3.5 text-left transition-all duration-200",
                principal ? "border-[#14B8A6]/60 bg-[#14B8A6]/[0.08] shadow-[0_0_28px_-10px_rgba(20,184,166,0.9)]" : "hover:border-white/[0.14]",
                CLASE_FOCO,
            )}
        >
            <div className="flex items-center gap-3">
                <AvatarContacto nombre={c.nombre} avatarUrl={c.perfil?.avatarUrl} tam={44} relacion={c.relacion} />
                <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold text-white">{c.nombre}</p>
                    <p className="text-[12px] text-white/55">{c.username ? `@${c.username}` : rel.etiqueta}</p>
                </div>
                <span
                    aria-hidden
                    className="ss-redondo flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={principal ? { background: ACENTO } : { boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.3)" }}
                >
                    {principal ? <Check className="h-4 w-4 text-black/80" /> : null}
                </span>
            </div>
            <ul className="flex flex-col gap-1 text-[13px] text-white/75">
                {c.telefonos.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 break-all">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                        {t.valor}
                    </li>
                ))}
                {c.correos.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 break-all">
                        <AtSign className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                        {e.valor}
                    </li>
                ))}
                {c.organizacion ? <li className="break-words text-white/60">{c.organizacion}</li> : null}
                {!c.telefonos.length && !c.correos.length && !c.organizacion ? <li className="text-white/40">Sin más datos</li> : null}
            </ul>
            <p className="mt-auto text-[11px] text-white/40">
                {principal ? "Se conserva como principal" : "Se fusiona en la principal"}
            </p>
        </button>
    );
}

export function DialogoDuplicados({ open, onOpenChange, api, onFusionado }: DialogoDuplicadosProps) {
    const grupos = useMemo(() => buscarDuplicados(api.contactos), [api.contactos]);
    const [ignorados, setIgnorados] = useState<Set<string>>(() => new Set());
    const [principal, setPrincipal] = useState<Record<string, string>>({});
    const [fusion, setFusion] = useState<{ clave: string; baseId: string; otros: string[] } | null>(null);
    const pendientes = useRef<Set<string>>(new Set());
    const notasMovidas = useRef(0);

    const visibles = grupos.filter((g) => !ignorados.has(claveGrupo(g)));

    const principalDe = (g: Contacto[]): string => {
        const elegido = principal[claveGrupo(g)];
        if (elegido && g.some((c) => c.id === elegido)) return elegido;
        // Por defecto: la que tiene cuenta StarSeed, si no la más completa, si no la más antigua.
        const puntos = (c: Contacto) => (c.userId ? 100 : 0) + c.telefonos.length + c.correos.length + c.enlaces.length + (c.descripcion ? 2 : 0);
        return [...g].sort((a, b) => puntos(b) - puntos(a) || (Date.parse(a.creado) || 0) - (Date.parse(b.creado) || 0))[0].id;
    };

    const empezarFusion = (g: Contacto[]) => {
        const baseId = principalDe(g);
        const otros = g.map((c) => c.id).filter((id) => id !== baseId);
        pendientes.current = new Set(otros);
        notasMovidas.current = 0;
        setFusion({ clave: claveGrupo(g), baseId, otros });
    };

    const terminarFusion = async (f: { baseId: string; otros: string[] }) => {
        const base = api.porId(f.baseId);
        if (!base) {
            setFusion(null);
            return;
        }
        let fundido = base;
        const otros = f.otros.map((id) => api.porId(id)).filter((c): c is Contacto => Boolean(c));
        for (const o of otros) fundido = fusionarContactos(fundido, o);
        api.actualizar(base.id, camposEditables(fundido));
        for (const o of otros) api.eliminar(o.id);
        // Borrar un gemelo público con la misma cuenta retira la fila pública: se vuelve a publicar.
        if (base.visibilidad === "publica" && fundido.userId) await aplicarVisibilidad(api, base.id, "publica");
        const notas = notasMovidas.current;
        toast.success(
            `Fusionado en «${fundido.nombre}»${notas ? ` · ${notas === 1 ? "1 nota trasladada" : `${notas} notas trasladadas`}` : ""}`,
        );
        setFusion(null);
        onFusionado?.(base.id);
    };

    const [, forzar] = useState(0);
    const onHecho = useCallback((desdeId: string, n: number) => {
        notasMovidas.current += n;
        pendientes.current.delete(desdeId);
        forzar((x) => x + 1);
    }, []);

    // Cuando todas las notas se han trasladado, se fusiona (una sola vez por fusión).
    const terminando = useRef(false);
    useEffect(() => {
        if (!fusion || pendientes.current.size > 0 || terminando.current) return;
        terminando.current = true;
        void terminarFusion(fusion).finally(() => {
            terminando.current = false;
        });
    });

    return (
        <Dialog open={open} onOpenChange={(v) => !fusion && onOpenChange(v)}>
            <DialogContent
                className={cn(
                    "gap-0 p-0 text-white sm:max-h-[min(90dvh,900px)] sm:max-w-4xl sm:rounded-[24px]",
                    "max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0",
                )}
                data-testid="dialogo-duplicados"
            >
                <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[rgba(10,12,30,0.88)] px-5 py-4 pr-16 backdrop-blur-xl">
                    <span aria-hidden className="ss-redondo flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={pildora(ACENTO)}>
                        <CopyCheck className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <DialogTitle className="text-[18px] font-semibold text-white">Posibles duplicados</DialogTitle>
                        <DialogDescription className="text-[12px] text-white/55">
                            Misma cuenta, teléfono, correo o nombre. Elige la ficha principal y fusiona: nada se pierde.
                        </DialogDescription>
                    </div>
                </header>

                <div className="flex flex-col gap-5 px-5 py-5">
                    {visibles.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <span aria-hidden className="ss-redondo flex h-14 w-14 items-center justify-center rounded-full" style={pildora("#10B981")}>
                                <Sparkles className="h-6 w-6 text-emerald-200" />
                            </span>
                            <p className="text-[15px] font-medium text-white">Tu libreta está limpia</p>
                            <p className="text-[13px] text-white/55">No encontramos fichas repetidas.</p>
                        </div>
                    ) : (
                        visibles.map((g) => {
                            const clave = claveGrupo(g);
                            const baseId = principalDe(g);
                            const base = g.find((c) => c.id === baseId);
                            const enCurso = fusion?.clave === clave;
                            return (
                                <section key={clave} className="flex flex-col gap-3" aria-label={`Duplicados de ${base?.nombre ?? ""}`}>
                                    <div role="radiogroup" aria-label="Elige la ficha principal" className={cn("grid gap-2.5", g.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
                                        {g.map((c) => (
                                            <TarjetaCandidato
                                                key={c.id}
                                                c={c}
                                                principal={c.id === baseId}
                                                onElegir={() => setPrincipal((p) => ({ ...p, [clave]: c.id }))}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={Boolean(fusion)}
                                            onClick={() => setIgnorados((s) => new Set(s).add(clave))}
                                            className={CLASE_BOTON}
                                        >
                                            No son la misma persona
                                        </button>
                                        <button type="button" disabled={Boolean(fusion)} onClick={() => empezarFusion(g)} className={CLASE_BOTON_PRINCIPAL}>
                                            {enCurso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CopyCheck className="h-4 w-4" aria-hidden />}
                                            Fusionar en «{base?.nombre}»
                                        </button>
                                    </div>
                                    <div aria-hidden className="h-px bg-white/[0.06]" />
                                </section>
                            );
                        })
                    )}
                </div>

                {fusion
                    ? fusion.otros.map((id) => <TrasladoNotas key={id} desdeId={id} haciaId={fusion.baseId} onHecho={onHecho} />)
                    : null}
            </DialogContent>
        </Dialog>
    );
}
