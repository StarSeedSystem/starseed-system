"use client";

/*
 * PoliGenesis — el Genesis de grupos y páginas (2026-10-10). Eliges la entidad que gestionas;
 * tu rol sale de os_entity_roles (o de ser la cuenta dueña) y el modo del motor de gobernanza:
 *   · jerárquico + rol de gestión → aplicas con confirmación y deshacer;
 *   · democrático → cada cambio es una propuesta que la entidad vota en Decisiones; cuando se
 *     aprueba, quien gestiona la aplica aquí (se vuelve a validar).
 * SOP: architecture/genesis-personas-poligenesis.md
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Landmark, Loader2, RefreshCw, Users2, Vote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aplicarOperacion } from "@/lib/genesis/aplicar";
import { anotar, leerHistorial } from "@/lib/genesis/historial";
import { puertosDelOs } from "@/lib/genesis/puertos-os";
import { misEntidades, modoDe, proponer, propuestaAprobada, propuestasDe, type EntidadGestionable, type PropuestaGenesis } from "@/lib/genesis/entidades";
import { decidirAplicacion, type Ambito } from "@/lib/genesis/operaciones";
import { PanelOperaciones } from "./panel-operaciones";

const SUGERENCIAS = ["Actualiza la descripción para presentar mejor al grupo", "Cambia el color de acento a verde esmeralda", "Crea un agente público que dé la bienvenida a quien llega"];

export function PoliGenesis({ entidadInicial }: { entidadInicial?: string | null }) {
    const [lista, setLista] = useState<EntidadGestionable[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [elegida, setElegida] = useState<string>("");
    const [modo, setModo] = useState<{ democratico: boolean; explicito: boolean } | null>(null);
    const [propuestas, setPropuestas] = useState<PropuestaGenesis[]>([]);
    const [aplicadas, setAplicadas] = useState<Set<string>>(new Set());
    const [aplicando, setAplicando] = useState<string | null>(null);
    const puertos = useMemo(() => puertosDelOs(), []);

    useEffect(() => {
        void misEntidades().then((r) => {
            if (!r.ok) return setError(r.motivo);
            setLista(r.lista);
            const inicial = r.lista.find((e) => e.id === entidadInicial || e.slug === entidadInicial) ?? r.lista[0];
            if (inicial) setElegida(inicial.id);
        });
    }, [entidadInicial]);

    const entidad = lista?.find((e) => e.id === elegida) ?? null;
    const ambito: Ambito | null = useMemo(() => (entidad ? { tipo: "entidad", entidad: { tipo: entidad.tipo, id: entidad.id, slug: entidad.slug, nombre: entidad.nombre } } : null), [entidad]);

    const cargarPropuestas = useCallback(async () => {
        if (!entidad || !ambito) return;
        const [r, h] = await Promise.all([propuestasDe(entidad), leerHistorial(ambito)]);
        if (r.ok) setPropuestas(r.lista);
        setAplicadas(new Set(h.entradas.filter((x) => x.estado === "aplicada" && x.propuestaId).map((x) => x.propuestaId as string)));
    }, [entidad, ambito]);

    useEffect(() => {
        if (!entidad) return;
        setModo(null);
        void modoDe(entidad).then(setModo);
        void cargarPropuestas();
    }, [entidad, cargarPropuestas]);

    const cargarContexto = useCallback(async () => {
        if (!entidad) return { contexto: {} };
        const l = await puertos.entidad.leer(entidad.tipo, entidad.slug);
        const descripcion = l.ok && typeof l.valores.description === "string" ? l.valores.description : undefined;
        return { contexto: { entidad: { nombre: entidad.nombre, tipo: entidad.tipo, descripcion } } };
    }, [entidad, puertos]);

    const aplicarAprobada = async (p: PropuestaGenesis) => {
        if (!p.op || !ambito) return;
        setAplicando(p.id);
        try {
            const r = await aplicarOperacion(p.op, ambito, puertos);
            if (!r.ok) {
                toast.error(r.motivo);
                return;
            }
            await anotar({ ...r.entrada, propuestaId: p.id, resultado: `${r.resultado} (propuesta aprobada)` });
            toast.success("Aplicado lo que aprobó la entidad.");
            await cargarPropuestas();
        } finally {
            setAplicando(null);
        }
    };

    if (error) return <p className="rounded-xl border border-white/10 p-3 text-sm text-white/70">{error}</p>;
    if (!lista)
        return (
            <p className="flex items-center gap-2 text-xs text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando los grupos y páginas que gestionas…
            </p>
        );
    if (lista.length === 0)
        return (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70" data-testid="poligenesis-vacio">
                <p>No gestionas ningún grupo ni página todavía (hace falta ser la cuenta dueña o tener rol de colaboración o de gestión).</p>
                <Link href="/hub" className="inline-flex cursor-pointer items-center gap-1 text-emerald-300 hover:underline">
                    Ir al Hub de comunidades <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
            </div>
        );

    const decision = ambito && modo ? decidirAplicacion(ambito, entidad?.rango ?? 0, modo.democratico) : null;
    const enVotacion = propuestas.filter((p) => p.estado === "open");
    const aprobadas = propuestas.filter((p) => propuestaAprobada(p.estado) && !aplicadas.has(p.id));

    return (
        <section className="space-y-4" data-testid="poligenesis">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
                <Users2 className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                <label htmlFor="poligenesis-entidad" className="text-xs text-white/70">
                    Entidad
                </label>
                <select
                    id="poligenesis-entidad"
                    className="min-w-0 flex-1 cursor-pointer rounded-lg border border-white/15 bg-black/30 p-2 text-sm sm:max-w-xs"
                    value={elegida}
                    onChange={(e) => setElegida(e.target.value)}
                >
                    {lista.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.nombre} · {e.tipo === "grupo" ? "grupo" : "página"} · {e.dueña ? "dueña" : e.rol}
                        </option>
                    ))}
                </select>
                {entidad ? (
                    <span className="flex items-center gap-1 text-[11px] text-white/55">
                        <Landmark className="h-3.5 w-3.5" aria-hidden />
                        {modo ? (modo.democratico ? `democrática${modo.explicito ? "" : " (por defecto del OS)"}` : "jerárquica") : "comprobando modo…"}
                    </span>
                ) : null}
            </div>

            {ambito && decision ? (
                <PanelOperaciones
                    key={ambito.tipo === "entidad" ? ambito.entidad.id : "x"}
                    ambito={ambito}
                    modo={decision.modo}
                    motivoModo={decision.motivo}
                    puertos={puertos}
                    cargarContexto={cargarContexto}
                    onProponer={(op) => (entidad ? proponer(entidad, op) : Promise.resolve({ ok: false as const, motivo: "Elige una entidad." }))}
                    puedeGestionar={(entidad?.rango ?? 0) >= 3}
                    sugerencias={SUGERENCIAS}
                />
            ) : (
                <p className="flex items-center gap-2 text-xs text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comprobando tu rol y el modo de gobierno…
                </p>
            )}

            {enVotacion.length + aprobadas.length > 0 ? (
                <section className="space-y-2" aria-label="Propuestas de PoliGenesis">
                    <div className="flex items-center gap-2">
                        <Vote className="h-4 w-4 text-cyan-300" aria-hidden />
                        <h3 className="text-sm font-semibold text-white/85">Propuestas de esta entidad</h3>
                        <Button variant="ghost" size="sm" className="ml-auto h-7 cursor-pointer gap-1 text-xs" onClick={() => void cargarPropuestas()}>
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
                        </Button>
                    </div>
                    <ul className="space-y-1.5">
                        {[...aprobadas, ...enVotacion].map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-white/90">{p.titulo}</span>
                                    <span className="block text-[11px] text-white/45">
                                        {propuestaAprobada(p.estado) ? "aprobada, falta aplicarla" : "en votación"}
                                        {p.problema ? ` · ya no se puede aplicar: ${p.problema}` : ""}
                                    </span>
                                </span>
                                <Link href={`/decisiones?p=${p.id}`} className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-cyan-200 hover:underline">
                                    Ver votación <ExternalLink className="h-3 w-3" aria-hidden />
                                </Link>
                                {propuestaAprobada(p.estado) && p.op && (entidad?.rango ?? 0) >= 3 ? (
                                    <Button size="sm" className="h-7 cursor-pointer gap-1 text-xs" disabled={aplicando !== null} onClick={() => void aplicarAprobada(p)}>
                                        {aplicando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                                        Aplicar lo aprobado
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </section>
    );
}
