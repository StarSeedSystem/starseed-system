'use client';

// ════════════════════════════════════════════════════════════════
// Patrimonio común — los medios de producción compartidos (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: el catálogo de granos disfrazado de «recursos» y reservas de mentira, con un
// canal en tiempo real propio. Ahora, los RECURSOS COMUNES REALES que la comunidad
// administra en el Área Política → Ejecutivo (`loadCommonsResources`: entity_state con
// espejo local si la nube no responde, y se dice). Usar un recurso o liberarlo es real
// (`upsertCommonsResource`), igual que en su panel. Sin sondeo: una lectura compartida
// (TTL 10 min). Invariante (§3): los medios de producción son procomún, acceso libre.
//
//   micro      → anillo: cuántos recursos están libres ahora.
//   s          → la matriz (una celda por recurso) y «N libres de M».
//   m          → matriz por tipo + recuento + «Gestionar».
//   panorámico → matriz a la izquierda, uso por tipo a la derecha.   torre → en columna.
//   l          → uso por tipo y la lista con «Usar» / «Liberar».
//   xl         → matriz, uso por tipo, lista completa y lo que tienes en uso.
// Estados honestos: cargando, error con reintento, copia local y vacío con «Registrar».
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Boxes, RefreshCw, ExternalLink, Hand, Undo2, WifiOff } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { invalidarCompartido, leerCompartido, useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";
import { CLAVE_PROCOMUN, COLOR_ESTADO_RECURSO, cargarProcomun, porTipo, type DatosProcomun, type RecursoComun } from "../gen2/_paquete-b/datos-procomun";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
const CLAVE = CLAVE_PROCOMUN;
export { porTipo, COLOR_ESTADO_RECURSO };
export type { RecursoComun };

export function CommonsMatrixWidget() {
    const marco = useMarcoUnificado();
    const { uid } = useCurrentUid();
    const datos = useDatoCompartido<DatosProcomun>(CLAVE, cargarProcomun);
    return (
        <WidgetShell
            title="Patrimonio común"
            subtitle="Medios compartidos, acceso libre"
            icon={Boxes}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar el patrimonio común"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} uid={uid} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, uid, datos }: { size: ElementSize; uid: string | null; datos: ResultadoDato<DatosProcomun> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const [enCurso, setEnCurso] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

    const cambiar = useCallback((r: RecursoComun, usar: boolean) => {
        if (!uid) { setAviso({ texto: "Entra en tu cuenta para usar un recurso común.", ok: false }); return; }
        setEnCurso(r.id);
        setAviso(null);
        void (async () => {
            try {
                const { upsertCommonsResource, labelForUser } = await import("@/lib/governance/political");
                const etiqueta = usar ? await labelForUser(uid) : null;
                const res = await upsertCommonsResource({ ...r, status: usar ? "En uso" : "Disponible", assignedTo: usar ? uid : null, assignedLabel: etiqueta });
                if (!res.ok) throw new Error("No se pudo guardar.");
                setAviso({ texto: usar ? `«${r.name}» queda en tu uso${res.degraded ? " (guardado en este dispositivo)" : ""}.` : `«${r.name}» vuelve a estar libre.`, ok: true });
                invalidarCompartido(CLAVE);
                void leerCompartido(CLAVE, cargarProcomun);
            } catch {
                setAviso({ texto: "No se pudo cambiar el recurso ahora.", ok: false });
            } finally {
                setEnCurso(null);
            }
        })();
    }, [uid]);

    let contenido: ReactNode;
    if (!datos.dato) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer el patrimonio común."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (datos.dato.lista.length === 0) {
        contenido = lienzo.base === "micro"
            ? <a href="/network/politics" className={cn(estilosB.foco, "grid h-full place-items-center text-center text-[11px] text-white/65")}>sin recursos</a>
            : <WidgetEmptyState icon={Boxes} title="Aún no hay recursos comunes" message="Registra herramientas, espacios o vehículos que la comunidad comparte." actionLabel="Registrar el primero" actionHref="/network/politics" accent={lienzo.acento} />;
    } else {
        contenido = <Composicion d={datos.dato} uid={uid} lienzo={lienzo} cambiar={cambiar} enCurso={enCurso} aviso={aviso} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ d, uid, lienzo, cambiar, enCurso, aviso }: {
    d: DatosProcomun; uid: string | null; lienzo: LienzoB; cambiar: (r: RecursoComun, usar: boolean) => void;
    enCurso: string | null; aviso: { texto: string; ok: boolean } | null;
}) {
    const tipos = useMemo(() => porTipo(d.lista), [d.lista]);
    const libres = d.lista.filter((r) => r.status === "Disponible").length;
    const mios = d.lista.filter((r) => uid && r.assignedTo === uid);
    const b = lienzo.base;
    const frase = `${libres} de ${d.lista.length} recursos libres ahora`;
    const copia = d.copiaLocal && (
        <p className="inline-flex items-center gap-1 text-[11px] text-amber-200/80" role="status"><WifiOff className="size-3" aria-hidden /> Copia de este dispositivo: la red no respondió.</p>
    );

    if (b === "micro") {
        return (
            <a href="/network/politics" aria-label={`${frase}. Gestionar`} title={frase} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <AnilloB fraccion={d.lista.length ? libres / d.lista.length : 0} lado={72} color={COLOR_ESTADO_RECURSO.Disponible}>
                    <text x={36} y={32} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={22} fontWeight={300}>{libres}</text>
                    <text x={36} y={50} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={9} fontWeight={600} letterSpacing=".08em">LIBRES</text>
                </AnilloB>
            </a>
        );
    }
    const matriz = <Matriz lista={d.lista} uid={uid} lienzo={lienzo} etiqueta={frase} />;
    const gestionar = <AccionB href="/network/politics" icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil}>Gestionar</AccionB>;
    const avisoNodo = aviso && <p role="status" className="text-[11px]" style={{ color: aviso.ok ? "#6ee7b7" : "#fda4af" }}>{aviso.texto}</p>;

    if (b === "s") return <div className="flex h-full min-h-0 flex-col gap-1.5">{matriz}<p className="text-[12px] text-white/70">{frase}</p></div>;
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>
                {matriz}
                <div className="flex min-w-0 flex-col gap-2"><Tipos tipos={tipos} max={3} />{gestionar}</div>
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{matriz}<p className="text-[12px] text-white/70">{frase}</p>{copia}<div className="mt-auto">{gestionar}</div></div>;
    }
    const lista = (max: number) => <Lista lista={d.lista} uid={uid} lienzo={lienzo} cambiar={cambiar} enCurso={enCurso} max={max} />;
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <Tipos tipos={tipos} max={lienzo.clase === "torre" ? 4 : 3} />
                {lista(b === "l" ? 4 : 5)}
                {avisoNodo}
                {copia}
                <div className="mt-auto">{gestionar}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                {matriz}
                <Tipos tipos={tipos} max={6} />
                {copia}
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                {mios.length > 0 && <RotuloB color={tintaB(COLOR_ESTADO_RECURSO["En uso"], 0.3)}>En tu uso: {mios.map((r) => r.name).join(", ")}</RotuloB>}
                {lista(8)}
                {avisoNodo}
                <div className="mt-auto">{gestionar}</div>
            </div>
        </div>
    );
}

/** Una celda por recurso, del color de su estado; las tuyas con anillo. */
function Matriz({ lista, uid, lienzo, etiqueta }: { lista: RecursoComun[]; uid: string | null; lienzo: LienzoB; etiqueta: string }) {
    const ordenada = [...lista].sort((a, b) => (a.type ?? "").localeCompare(b.type ?? "", "es") || a.name.localeCompare(b.name, "es")).slice(0, 60);
    return (
        <ul className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${lienzo.tv ? 22 : 16}px, 1fr))` }} role="img" aria-label={etiqueta}>
            {ordenada.map((r, i) => {
                const c = COLOR_ESTADO_RECURSO[r.status] ?? "#64748b";
                const mio = !!uid && r.assignedTo === uid;
                return (
                    <li key={r.id} title={`${r.name} · ${r.type} · ${r.status}${r.assignedLabel ? ` · ${r.assignedLabel}` : ""}`}
                        className={cn("aspect-square rounded-[5px]", estilosB.entrar)}
                        style={{ background: r.status === "Disponible" ? `${c}` : `${c}66`, boxShadow: mio ? `0 0 0 2px #fff` : `inset 0 0 0 1px ${c}`, animationDelay: `${i * 12}ms`, opacity: r.status === "Mantenimiento" ? 0.6 : 1 }} />
                );
            })}
        </ul>
    );
}

function Tipos({ tipos, max }: { tipos: ReturnType<typeof porTipo>; max: number }) {
    return (
        <ul className="flex flex-col gap-1.5" aria-label="Uso por tipo">
            {tipos.slice(0, max).map((t) => (
                <li key={t.tipo} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: "minmax(0, 6rem) minmax(0, 1fr) auto" }}>
                    <span className="text-white/80 line-clamp-1" title={t.tipo}>{t.tipo}</span>
                    <span className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label={`${t.libres} libres, ${t.enUso} en uso, ${t.mant} en mantenimiento`}>
                        <span className={estilosB.crecer} style={{ width: `${(t.libres / t.total) * 100}%`, background: COLOR_ESTADO_RECURSO.Disponible }} />
                        <span className={estilosB.crecer} style={{ width: `${(t.enUso / t.total) * 100}%`, background: COLOR_ESTADO_RECURSO["En uso"] }} />
                        <span className={estilosB.crecer} style={{ width: `${(t.mant / t.total) * 100}%`, background: COLOR_ESTADO_RECURSO.Mantenimiento }} />
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-white/60">{t.libres}/{t.total} libres</span>
                </li>
            ))}
        </ul>
    );
}

function Lista({ lista, uid, lienzo, cambiar, enCurso, max }: {
    lista: RecursoComun[]; uid: string | null; lienzo: LienzoB; cambiar: (r: RecursoComun, usar: boolean) => void; enCurso: string | null; max: number;
}) {
    const orden = [...lista].sort((a, b) => Number(b.assignedTo === uid) - Number(a.assignedTo === uid) || Number(b.status === "Disponible") - Number(a.status === "Disponible"));
    return (
        <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Recursos comunes">
            {orden.slice(0, max).map((r) => {
                const mio = !!uid && r.assignedTo === uid;
                const c = COLOR_ESTADO_RECURSO[r.status] ?? "#64748b";
                return (
                    <li key={r.id} className={cn("flex items-center gap-2", lienzo.tactil ? "min-h-11" : "min-h-8")}>
                        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: c }} aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold text-white/85 line-clamp-1" title={r.name}>{r.name}</span>
                            <span className="block text-[10px] text-white/50 line-clamp-1">{r.type} · {mio ? "en tu uso" : r.status === "En uso" && r.assignedLabel ? `lo usa ${r.assignedLabel}` : r.status.toLowerCase()}</span>
                        </span>
                        {mio ? (
                            <AccionB onClick={() => cambiar(r, false)} disabled={enCurso === r.id} icono={Undo2} color={COLOR_ESTADO_RECURSO.Disponible} tactil={lienzo.tactil} aria-label={`Liberar ${r.name}`}>Liberar</AccionB>
                        ) : r.status === "Disponible" ? (
                            <AccionB onClick={() => cambiar(r, true)} disabled={enCurso === r.id} icono={Hand} color={lienzo.acento} tactil={lienzo.tactil} aria-label={`Usar ${r.name}`}>Usar</AccionB>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
