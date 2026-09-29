'use client';

// ════════════════════════════════════════════════════════════════
// BarterMarketWidget — Trueque y Procomún (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Economía del don de verdad: los RECURSOS COMUNES reales de la red
// (herramientas, espacios, saberes, energía… del Área Política, con su
// estado y quién los usa). Una rueda enseña cuánto hay libre; cada
// recurso libre se usa a un toque (queda a tu nombre), lo tuyo se
// devuelve a un toque y puedes ofrecer algo al procomún aquí mismo.
// Lectura compartida cada 10 min y solo a la vista. Estados honestos:
// cargando, vacío (aún no hay nada en común), error y copia local.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { BookOpen, Boxes, Hand, Home, Package, Plus, Scale, Sprout, Undo2, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { uidActual } from "@/lib/consumo/usuario";
import { Lienzo, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, tinta } from "../gen5/_catalogo/piezas";
import { TIPOS_RECURSO, devolverRecurso, ofrecerRecurso, ordenarRecursos, usarRecurso, useProcomun, type EstadoRecurso, type Recurso } from "../gen5/_catalogo/procomun";

const COLOR: Record<EstadoRecurso, string> = { Disponible: "#10B981", "En uso": "#FFBF00", Mantenimiento: "#DC143C" };
const ICONO_TIPO: Record<string, LucideIcon> = { Herramienta: Wrench, Espacio: Home, Conocimiento: BookOpen, "Energía": Zap, "Semilla 3D": Sprout };

function Rueda({ D, recursos, uid, l, cifra = true }: { D: number; recursos: Recurso[]; uid: string | null; l: EstadoLienzo; cifra?: boolean }) {
    const c = D / 2, R = D * 0.43, g = Math.max(4, D * 0.09);
    const libres = recursos.filter((r) => r.estado === "Disponible").length;
    const orden: EstadoRecurso[] = ["Disponible", "En uso", "Mantenimiento"];
    const segs = orden.flatMap((e) => recursos.filter((r) => r.estado === e));
    const n = segs.length;
    const hueco = n > 1 ? Math.min(0.06, (Math.PI * 2) / n / 4) : 0;
    const punto = (a: number, r = R) => `${(c + Math.cos(a) * r).toFixed(2)} ${(c + Math.sin(a) * r).toFixed(2)}`;
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <circle cx={c} cy={c} r={R} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={g} />
            {n === 0 && <circle cx={c} cy={c} r={R} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 4" />}
            {n === 1 && <circle cx={c} cy={c} r={R} fill="none" stroke={COLOR[segs[0].estado]} strokeWidth={g} strokeOpacity={0.85} />}
            {n > 1 && segs.map((r, i) => {
                const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + hueco, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - hueco;
                const mio = !!uid && r.asignadoA === uid && r.estado === "En uso";
                return <path key={r.id} d={`M${punto(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${punto(a1)}`} fill="none" stroke={COLOR[r.estado]} strokeOpacity={mio ? 1 : 0.8} strokeWidth={mio ? g * 1.25 : g} strokeLinecap="butt" />;
            })}
            <circle cx={c} cy={c} r={R - g * 1.1} fill={conAlfa(COLOR.Disponible, libres ? 0.12 : 0.04)}
                className={libres && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "7s", transformBox: "fill-box", transformOrigin: "center" }} />
            {cifra && (
                <>
                    <text x={c} y={c + D * (D >= 110 ? 0.02 : 0.07)} textAnchor="middle" fill="#fff" style={{ fontSize: Math.max(12, D * 0.22), fontWeight: 300 }}>{libres}</text>
                    {D >= 110 && <text x={c} y={c + D * 0.15} textAnchor="middle" fill="#fff" opacity={0.55} style={{ fontSize: Math.max(9, D * 0.075) }}>libre{libres === 1 ? "" : "s"}</text>}
                </>
            )}
        </svg>
    );
}

export function BarterMarketWidget() {
    const l = useLienzo("#10B981", "#FFBF00");
    const pc = useProcomun(l.visible);
    const [uid, setUid] = React.useState<string | null>(null);
    const [ofreciendo, setOfreciendo] = React.useState(false);
    const [nombre, setNombre] = React.useState("");
    const [tipo, setTipo] = React.useState<string>(TIPOS_RECURSO[0]);
    const [ocupado, setOcupado] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<{ texto: string; error?: boolean } | null>(null);

    React.useEffect(() => {
        let vivo = true;
        void uidActual().then((u) => { if (vivo) setUid(u); }).catch(() => undefined);
        return () => { vivo = false; };
    }, []);

    const recursos = React.useMemo(() => ordenarRecursos(pc.datos?.recursos ?? [], uid), [pc.datos, uid]);
    const libres = recursos.filter((r) => r.estado === "Disponible").length;
    const enUso = recursos.filter((r) => r.estado === "En uso").length;
    const reparando = recursos.length - libres - enUso;
    const mios = recursos.filter((r) => uid && r.asignadoA === uid && r.estado === "En uso").length;
    const cargando = !pc.datos && !pc.error;
    const sinDatos = !pc.datos && !!pc.error;

    const hacer = async (id: string, accion: () => Promise<{ ok: true; local: boolean } | { ok: false; error: string }>, bien: string) => {
        setOcupado(id);
        setAviso(null);
        try {
            const r = await accion();
            setAviso(r.ok ? { texto: r.local ? `${bien} Guardado en este dispositivo: se subirá a la red cuando responda.` : bien } : { texto: r.error, error: true });
            return r.ok;
        } catch {
            setAviso({ texto: "No se pudo guardar ahora (error de conexión).", error: true });
            return false;
        } finally {
            setOcupado(null);
        }
    };

    const ofrecer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await hacer("nuevo", () => ofrecerRecurso(nombre, tipo), "Ofrecido al procomún.")) { setNombre(""); setOfreciendo(false); }
    };

    const etiqueta = cargando ? "Trueque y procomún: cargando los recursos comunes"
        : sinDatos ? "Trueque y procomún: error, no se pudieron leer los recursos comunes"
        : recursos.length === 0 ? "Trueque y procomún: aún no hay recursos comunes"
        : `Trueque y procomún: ${libres} libre${libres === 1 ? "" : "s"} de ${recursos.length} (${enUso} en uso, ${reparando} en mantenimiento)${mios ? `. Tienes ${mios} en uso` : ""}`;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Trueque y Procomún" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Rueda D={l.lado - 10} recursos={recursos} uid={uid} l={l} /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Trueque y Procomún" etiqueta={etiqueta} sinCabecera>
                <Link href="/network/politics" className="flex h-full cursor-pointer flex-col items-center justify-center gap-1" aria-label={`Abrir los recursos comunes: ${libres} libres de ${recursos.length}`}>
                    <Rueda D={Math.max(70, Math.min(l.ancho - 20, l.alto - 44))} recursos={recursos} uid={uid} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">{cargando ? "Cargando…" : recursos.length ? `${libres} de ${recursos.length} libres` : "Procomún vacío"}</span>
                </Link>
            </Lienzo>
        );
    }

    const cab = 52;
    const hb = Math.max(80, l.alto - cab - 12);
    const estrecho = l.ancho < 440;

    const fila = (r: Recurso, detalle: boolean) => {
        const I = ICONO_TIPO[r.tipo] ?? Package;
        const mio = !!uid && r.asignadoA === uid && r.estado === "En uso";
        const estado = r.estado === "Disponible" ? "libre" : r.estado === "Mantenimiento" ? "en mantenimiento" : mio ? "en uso por ti" : `en uso${r.asignadoNombre ? ` por ${r.asignadoNombre}` : ""}`;
        return (
            <li key={r.id} className="flex min-w-0 items-center gap-2 rounded-xl px-1.5" style={{ minHeight: l.toque + 4 }} title={`${r.nombre} · ${r.tipo} · ${estado}`}>
                {detalle || !l.torre
                    ? <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: conAlfa(COLOR[r.estado], 0.14), color: tinta(COLOR[r.estado], 0.3) }}><I className="size-3.5" /></span>
                    : <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: COLOR[r.estado] }} />}
                <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] leading-snug text-white/90 ${detalle ? "truncate" : "line-clamp-2"}`}>{r.nombre}</span>
                    {detalle && <span className="block truncate text-[11px] text-white/50">{r.tipo} · {estado}</span>}
                </span>
                {r.estado === "Disponible" && (
                    <Accion color={COLOR.Disponible} alto={l.toque} icono={Hand} soloIcono={!detalle || estrecho} disabled={ocupado === r.id}
                        onClick={() => void hacer(r.id, () => usarRecurso(r), `«${r.nombre}» queda a tu nombre.`)} etiqueta={`Usar «${r.nombre}»`}>Usar</Accion>
                )}
                {mio && (
                    <Accion color={COLOR["En uso"]} alto={l.toque} icono={Undo2} soloIcono={!detalle || estrecho} disabled={ocupado === r.id}
                        onClick={() => void hacer(r.id, () => devolverRecurso(r), `«${r.nombre}» vuelve al procomún.`)} etiqueta={`Devolver «${r.nombre}»`}>Devolver</Accion>
                )}
            </li>
        );
    };

    const lista = (max: number, detalle = true) => {
        if (cargando) return <CargandoSilueta color={l.acento} filas={Math.min(3, max)} etiqueta="Cargando los recursos comunes…" />;
        if (sinDatos) return <ErrorHonesto error={pc.error} color={l.acento} onReintentar={pc.recargar} compacto />;
        if (!recursos.length) return (
            <div role="status" className="min-w-0">
                <p className="text-[13.5px] font-medium text-white/90">Aún no hay nada en común</p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Ofrece una herramienta, un espacio o un saber: la red lo usa y lo devuelve.</p>
            </div>
        );
        return <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Recursos comunes">{recursos.slice(0, max).map((r) => fila(r, detalle))}</ul>;
    };

    const formulario = (
        <form onSubmit={ofrecer} className="flex min-w-0 flex-col gap-1.5" aria-label="Ofrecer al procomún">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="¿Qué ofreces?" aria-label="Qué ofreces"
                className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de recurso"
                className="ss-redondo min-w-0 cursor-pointer rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }}>
                {TIPOS_RECURSO.map((t) => <option key={t} value={t} className="bg-[#0b0d18]">{t}</option>)}
            </select>
            <div className="flex gap-1.5">
                <Accion color={l.acento} solida alto={l.toque} type="submit" disabled={!nombre.trim() || ocupado === "nuevo"} icono={Boxes}>{ocupado === "nuevo" ? "Guardando…" : "Ofrecer"}</Accion>
                <Accion color="#ffffff" alto={l.toque} soloIcono icono={X} onClick={() => setOfreciendo(false)} etiqueta="Cancelar">Cancelar</Accion>
            </div>
        </form>
    );

    const avisos = (
        <>
            {aviso && <p role={aviso.error ? "alert" : "status"} className={`line-clamp-2 text-[11.5px] ${aviso.error ? "text-rose-200/90" : "text-white/70"}`}>{aviso.texto}</p>}
            {pc.datos?.local && recursos.length > 0 && (l.base === "xl" || l.horizontal) && <p className="text-[11px] text-amber-200/80">Copia de este dispositivo: la red aún no la confirmó.</p>}
        </>
    );

    const pie = !cargando && !sinDatos && (
        <div className="flex flex-wrap gap-1.5">
            <Accion color={l.acento} alto={l.toque} icono={Plus} onClick={() => { setAviso(null); setOfreciendo(true); }} etiqueta="Ofrecer algo al procomún">{recursos.length || estrecho ? "Ofrecer" : "Ofrecer algo"}</Accion>
            {(l.base === "xl" || l.horizontal) && <Accion color={l.acento2} alto={l.toque} icono={Scale} href="/network/politics" soloIcono={l.horizontal} etiqueta="Abrir los recursos comunes en el Área Política">Área Política</Accion>}
        </div>
    );

    const columna = (max: number, detalle = true) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto" style={{ justifyContent: "safe center" }}>
            {ofreciendo ? formulario : <>{lista(max, detalle)}{pie}</>}
            {avisos}
        </div>
    );

    const leyenda = recursos.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Recursos por estado">
            {(["Disponible", "En uso", "Mantenimiento"] as EstadoRecurso[]).map((e) => (
                <li key={e} className="flex items-center gap-2 text-[11.5px] text-white/60">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: COLOR[e] }} />
                    <span className="min-w-0 flex-1 truncate">{e === "Disponible" ? "Libres" : e}</span>
                    <span className="tabular-nums text-white/85">{e === "Disponible" ? libres : e === "En uso" ? enUso : reparando}</span>
                </li>
            ))}
        </ul>
    );

    if (l.horizontal) {
        const D = Math.max(90, Math.min(hb, l.ancho * 0.22));
        return (
            <Lienzo l={l} titulo="Trueque y Procomún" icono={Boxes} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Rueda D={D} recursos={recursos} uid={uid} l={l} />
                    {columna(Math.max(1, Math.floor((hb - 44) / 46)))}
                    <div className="shrink-0" style={{ width: Math.min(170, l.ancho * 0.2) }}>{leyenda}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const D = Math.max(90, Math.min(l.ancho - 30, hb * 0.36));
        return (
            <Lienzo l={l} titulo="Procomún" icono={Boxes} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3">
                    <Rueda D={D} recursos={recursos} uid={uid} l={l} />
                    <div className="flex w-full min-h-0 flex-1 flex-col">{columna(Math.max(1, Math.floor((hb - D - 60) / 48)), false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const D = Math.max(120, Math.min(l.ancho * 0.34, hb * 0.5));
        return (
            <Lienzo l={l} titulo="Trueque y Procomún" subtitulo="Lo que la red comparte: úsalo, devuélvelo, ofrece" icono={Boxes} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 gap-4">
                    <div className="flex shrink-0 flex-col items-center justify-center gap-3" style={{ width: D }}>
                        <Rueda D={D} recursos={recursos} uid={uid} l={l} />
                        <div className="w-full">{leyenda}</div>
                    </div>
                    {columna(Math.max(3, Math.floor((hb - 60) / 46)))}
                </div>
            </Lienzo>
        );
    }

    const D = Math.max(90, Math.min(hb - 8, l.ancho * 0.36));
    return (
        <Lienzo l={l} titulo="Trueque y Procomún" subtitulo={l.ancho >= 300 ? "Lo que la red comparte" : undefined} icono={Boxes} etiqueta={etiqueta}
            acciones={l.base === "l" ? <Accion color={l.acento2} alto={28} soloIcono icono={Scale} href="/network/politics" etiqueta="Abrir los recursos comunes en el Área Política">Área Política</Accion> : undefined}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Rueda D={D} recursos={recursos} uid={uid} l={l} />
                {columna(Math.max(1, Math.min(4, Math.floor((hb - 44) / 46))), l.base === "l")}
            </div>
        </Lienzo>
    );
}
