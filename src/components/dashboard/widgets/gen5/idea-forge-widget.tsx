'use client';

// ════════════════════════════════════════════════════════════════
// IdeaForgeWidget — Incubadora de Quimeras (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Un crisol: dos conceptos que chocan (la «chispa» del día, que se
// puede barajar) y una pregunta puente. Debajo, un campo para apuntar
// TU idea: se guarda en tus Notas rápidas con la marca #idea (mismo
// bloc que el widget de Notas, sincronizado con la cuenta). Cada idea
// se puede anclar, llevar a la red como propuesta (/decisiones ya
// rellenada) o a Imaginación Intuitiva, y borrar con deshacer.
// Estados honestos: cargando (primer montaje), vacío (aún sin ideas:
// la chispa invita a la primera) y error del almacén local (si no se
// puede guardar, se dice).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Landmark, Lightbulb, Pin, PinOff, Plus, Shuffle, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useQuickNotes, readQuickNotes, type QuickNote } from "@/lib/notes/quick-notes";
import { buildProposalLink } from "@/lib/governance/links";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, Rot, tinta } from "./_catalogo/piezas";
import { chispa, comoNota, diaDe, ideasDe, textoChispa, textoIdea, tituloDe, type Chispa } from "./idea-forge-partes";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";

function Crisol({ c, D, l, conNombres }: { c: Chispa; D: number; l: EstadoLienzo; conNombres: boolean }) {
    const id = useIdSvg("crisol");
    const cx = D / 2, cy = D / 2;
    const R = D * 0.3;
    const r = D * 0.13;
    const fs = Math.max(10, D * 0.075);
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-a`} cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stopColor={tinta(l.acento, 0.55)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento, 0.25)} />
                </radialGradient>
                <radialGradient id={`${id}-b`} cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stopColor={tinta(l.acento2, 0.5)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0.25)} />
                </radialGradient>
                <radialGradient id={`${id}-f`}>
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="30%" stopColor={tinta(l.acento, 0.3)} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={l.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            {/* órbita compartida */}
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#fff" strokeOpacity={0.08} strokeDasharray="2 5" />
            {/* estelas hacia el centro */}
            <path d={`M${cx - R * 0.94 + r * 0.9} ${cy - R * 0.28}Q${cx - R * 0.3} ${cy - R * 0.1} ${cx} ${cy}`} fill="none" stroke={l.acento} strokeOpacity={0.5} strokeWidth={1.2} />
            <path d={`M${cx + R * 0.94 - r * 0.9} ${cy + R * 0.28}Q${cx + R * 0.3} ${cy + R * 0.1} ${cx} ${cy}`} fill="none" stroke={l.acento2} strokeOpacity={0.5} strokeWidth={1.2} />
            {/* los dos conceptos, flotando a destiempo */}
            <g className={l.animar ? "ss-flotar" : undefined} style={{ ["--ss-dur" as string]: "7s" }}>
                <circle cx={cx - R * 0.94} cy={cy - R * 0.34} r={r} fill={`url(#${id}-a)`} />
            </g>
            <g className={l.animar ? "ss-flotar" : undefined} style={{ ["--ss-dur" as string]: "8s", animationDelay: "-3s" }}>
                <circle cx={cx + R * 0.94} cy={cy + R * 0.34} r={r} fill={`url(#${id}-b)`} />
            </g>
            {/* la chispa */}
            <circle cx={cx} cy={cy} r={D * 0.2} fill={`url(#${id}-f)`} className={l.animar ? "ss-respirar" : undefined}
                style={{ ["--ss-dur" as string]: "4s", transformBox: "fill-box", transformOrigin: "center" }} />
            {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2 + 0.3;
                const r1 = D * 0.045, r2 = D * (i % 2 ? 0.09 : 0.12);
                return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke="#fff" strokeOpacity={0.7} strokeWidth={1.1} strokeLinecap="round" />;
            })}
            {conNombres && (() => {
                // Los nombres van en las esquinas libres (arriba a la izquierda y abajo a la derecha)
                // y encogen para caber siempre dentro del dibujo.
                const cabe = (t: string) => Math.min(fs, (D * 0.92) / Math.max(1, t.length * 0.6));
                return (
                    <>
                        <text x={2} y={cabe(c.a) + 1} textAnchor="start" fill={tinta(l.acento, 0.3)} style={{ fontSize: cabe(c.a), fontWeight: 600 }}>{c.a}</text>
                        <text x={D - 2} y={D - 3} textAnchor="end" fill={tinta(l.acento2, 0.4)} style={{ fontSize: cabe(c.b), fontWeight: 600 }}>{c.b}</text>
                    </>
                );
            })()}
        </svg>
    );
}

export function IdeaForgeWidget() {
    const l = useLienzo("#ffbf00", "#7c5cff");
    const { notes, add, togglePin, remove } = useQuickNotes();
    const [montado, setMontado] = React.useState(false);
    const [vuelta, setVuelta] = React.useState(0);
    const [borrador, setBorrador] = React.useState("");
    const [estado, setEstado] = React.useState<{ tipo: "guardada" | "error"; texto: string } | null>(null);
    const [borrada, setBorrada] = React.useState<QuickNote | null>(null);
    React.useEffect(() => { setMontado(true); }, []);
    React.useEffect(() => {
        if (!estado && !borrada) return;
        const t = window.setTimeout(() => { setEstado(null); setBorrada(null); }, 6000);
        return () => window.clearTimeout(t);
    }, [estado, borrada]);

    const c = chispa(diaDe(Date.now()), vuelta);
    const ideas = React.useMemo(() => ideasDe(notes), [notes]);

    const guardar = (texto: string) => {
        const t = comoNota(texto);
        if (!t) return;
        const antes = readQuickNotes().length;
        add(t);
        // El bloc nunca lanza: si no creció, el almacén está lleno o bloqueado y hay que decirlo.
        if (readQuickNotes().length <= antes && !readQuickNotes().some((n) => n.text === t)) {
            setEstado({ tipo: "error", texto: "No se pudo guardar (almacén del navegador lleno o bloqueado)." });
            return;
        }
        setEstado({ tipo: "guardada", texto: "Guardada en tus Notas con #idea." });
    };
    const enviar = (e: React.FormEvent) => { e.preventDefault(); if (borrador.trim()) { guardar(borrador); setBorrador(""); } };
    const borrar = (n: QuickNote) => { remove(n.id); setBorrada(n); };
    const deshacer = () => { if (borrada) { add(borrada.text); setBorrada(null); } };

    const etiqueta = `Incubadora de quimeras: chispa de hoy ${c.a} por ${c.b}. ${ideas.length} idea${ideas.length === 1 ? "" : "s"} guardada${ideas.length === 1 ? "" : "s"}.`;

    if (!montado) {
        return (
            <Lienzo l={l} titulo="Incubadora de Quimeras" icono={Lightbulb} etiqueta="Incubadora de quimeras: cargando tus ideas">
                <div role="status" className="grid h-full place-items-center text-[12px] text-white/60">Cargando tus ideas…</div>
            </Lienzo>
        );
    }

    const barajar = <Accion color={l.acento} alto={l.toque} icono={Shuffle} onClick={() => setVuelta((v) => v + 1)} soloIcono={l.base === "s"} etiqueta="Barajar otra chispa">Otra chispa</Accion>;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Incubadora de Quimeras" etiqueta={etiqueta} sinCabecera>
                <div className="relative grid h-full place-items-center">
                    <Crisol c={c} D={l.lado - 14} l={l} conNombres={false} />
                    <span className="absolute bottom-0 right-1 text-[12px] font-semibold tabular-nums text-white/85" aria-hidden>{ideas.length}</span>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        const D = Math.max(80, Math.min(l.ancho - 16, l.alto - l.toque - 20));
        return (
            <Lienzo l={l} titulo="Incubadora de Quimeras" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    <Crisol c={c} D={D} l={l} conNombres />
                    {barajar}
                </div>
            </Lienzo>
        );
    }

    const puente = (
        <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: tinta(l.acento, 0.3) }}>
                {c.a} <span className="text-white/45">×</span> <span style={{ color: tinta(l.acento2, 0.4) }}>{c.b}</span>
            </p>
            <p className="mt-1 text-[13.5px] leading-snug text-white/90">{c.puente}</p>
        </div>
    );

    const campo = (
        <form onSubmit={enviar} className="flex min-w-0 flex-col gap-1">
            <div className="ss-redondo flex min-w-0 items-center gap-1 rounded-full pl-3 pr-1" style={{ background: conAlfa(l.acento, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(l.acento, 0.4)}`, minHeight: l.toque }}>
                <input value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="Apunta tu idea…" aria-label="Nueva idea (se guarda en tus Notas con #idea)"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none" />
                <button type="submit" aria-label="Guardar la idea" className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
                    style={{ width: Math.min(l.toque, 36) - 6, height: Math.min(l.toque, 36) - 6 }}>
                    <Plus className="size-4" />
                </button>
            </div>
            <div className="flex min-h-[18px] flex-wrap items-center gap-2 text-[11px]" aria-live="polite">
                {estado && <span className={estado.tipo === "error" ? "text-amber-200" : "text-white/60"} role={estado.tipo === "error" ? "alert" : undefined}>{estado.texto}</span>}
                {borrada && (
                    <button type="button" onClick={deshacer} className="ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-white/80 transition-colors duration-200 hover:bg-white/10">
                        <Undo2 aria-hidden className="size-3" />Deshacer el borrado
                    </button>
                )}
            </div>
        </form>
    );

    const guardarChispa = <Accion color={l.acento2} alto={l.toque} icono={Sparkles} onClick={() => guardar(textoChispa(c))} etiqueta="Guardar esta chispa como idea">Guardar chispa</Accion>;

    const listaIdeas = (max: number) => ideas.length === 0 ? (
        <p className="text-[12px] leading-snug text-white/55">Aún no hay ideas (bloc vacío). La primera puede salir de esta chispa.</p>
    ) : (
        <ul className="flex min-h-0 flex-col gap-1.5" aria-label="Tus ideas">
            {ideas.slice(0, max).map((n) => (
                <li key={n.id} className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="ss-redondo size-1.5 shrink-0 rounded-full" style={{ background: n.pinned ? l.acento : conAlfa("#ffffff", 0.4) }} />
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/85" title={textoIdea(n.text)}>{textoIdea(n.text)}</p>
                    <div className="flex shrink-0 items-center gap-1">
                        <Accion color={l.acento} alto={Math.min(l.toque, 28)} soloIcono icono={Landmark}
                            href={buildProposalLink("", { title: tituloDe(n.text), description: textoIdea(n.text) })}
                            etiqueta={`Proponer a la red: ${tituloDe(n.text)}`}>Proponer</Accion>
                        <Accion color="#ffffff" alto={Math.min(l.toque, 28)} soloIcono icono={n.pinned ? PinOff : Pin} onClick={() => togglePin(n.id)}
                            etiqueta={n.pinned ? `Desanclar: ${tituloDe(n.text)}` : `Anclar: ${tituloDe(n.text)}`}>{n.pinned ? "Desanclar" : "Anclar"}</Accion>
                        <Accion color="#ffffff" alto={Math.min(l.toque, 28)} soloIcono icono={Trash2} onClick={() => borrar(n)} etiqueta={`Borrar: ${tituloDe(n.text)}`}>Borrar</Accion>
                    </div>
                </li>
            ))}
        </ul>
    );

    const subtitulo = ideas.length ? `${ideas.length} idea${ideas.length === 1 ? "" : "s"} en tus Notas` : "La chispa de hoy";
    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.25 || l.base === "xl";
    const cab = 52;
    const D = fila ? Math.max(90, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.24 : 0.38))) : Math.max(90, Math.min(l.ancho - 28, (l.alto - cab) * 0.34));
    const acciones = <div className="flex flex-wrap items-center gap-1.5">{barajar}{grande && guardarChispa}{grande && <Accion color={l.acento2} alto={l.toque} icono={Sparkles} href="/imaginacion" etiqueta="Abrir Imaginación Intuitiva">Imaginar</Accion>}</div>;

    return (
        <Lienzo l={l} titulo="Incubadora de Quimeras" subtitulo={subtitulo} icono={Lightbulb} etiqueta={etiqueta}>
            {l.horizontal ? (
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Crisol c={c} D={D} l={l} conNombres />
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">{puente}{campo}</div>
                    <div className="flex w-[36%] min-w-0 flex-col justify-center gap-2"><Rot>Tus ideas</Rot>{listaIdeas(3)}</div>
                </div>
            ) : fila ? (
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Crisol c={c} D={D} l={l} conNombres />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2.5">
                        {puente}
                        {acciones}
                        {campo}
                        {l.base === "xl" && <><Rot>Tus ideas</Rot>{listaIdeas(4)}</>}
                    </div>
                </div>
            ) : (
                // (Pulido 0930) Si la columna no cabe, cede primero la lista y luego el crisol (antes
                // el aviso del bloc vacío quedaba 20-40 px bajo la tarjeta).
                <PilaAjustable niveles={2} className="justify-center gap-2.5">
                    <div className={`flex shrink-0 gap-3 ${l.ancho < 300 ? "flex-col items-center text-center" : "items-center"}`}>
                        <Prescindible nivel={2}><Crisol c={c} D={Math.min(D, 110)} l={l} conNombres={false} /></Prescindible>
                        {puente}
                    </div>
                    <div className="shrink-0">{campo}</div>
                    {grande ? <Prescindible nivel={1}>{listaIdeas(l.torre ? 3 : 2)}</Prescindible> : <div className="shrink-0">{acciones}</div>}
                </PilaAjustable>
            )}
        </Lienzo>
    );
}
