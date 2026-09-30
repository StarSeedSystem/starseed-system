'use client';

// ════════════════════════════════════════════════════════════════
// MentorMatchWidget — Mentoría Híbrida (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Mentoría humana + IA, con datos REALES:
//   · Personas: tus contactos con relación «Mentoría» (la libreta de
//     Contactos, local primero y sincronizada con la cuenta). Cada una
//     se abre en su ficha o se le escribe a un toque.
//   · IA: Aurora como «Mentora Sabia» en la sección Educación (la
//     personalidad real del OS), que se enciende o apaga desde aquí.
// Una rosa de los vientos: las personas mentoras en el anillo, la aguja
// hacia tu favorita y la estrella de Aurora en el centro.
// Estados honestos: cargando (libreta), vacío (aún sin mentores: cómo
// añadir el primero, y la mentora IA siempre disponible) y error de
// sincronía de la libreta (se dice; lo local sigue a la vista).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import Link from "next/link";
import { Compass, GraduationCap, MessageCircle, Sparkles, UserPlus } from "lucide-react";
import { useContactos } from "@/lib/contactos/store";
import type { Contacto } from "@/lib/contactos/tipos";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, Rot, VacioHonesto, tinta } from "../gen5/_catalogo/piezas";

const ORO = "#D4AF37";
const MENTORA_ID = "preset-mentora-sabia";
const CLAVE_PERSONALIDAD = "starseed.aurora.personality.active.v1";
const EVENTO_PERSONALIDAD = "starseed:aurora-personality";

/** ¿Aurora es la Mentora Sabia en Educación? (lectura local, sin cargar el módulo de personalidades). */
function mentoraActiva(): boolean {
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE_PERSONALIDAD) || "null");
        return j?.porSeccion?.educacion === MENTORA_ID;
    } catch { return false; }
}

function useMentoraIA(): { activa: boolean; alternar: () => Promise<void>; error: string | null } {
    const [activa, setActiva] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => {
        const leer = () => setActiva(mentoraActiva());
        leer();
        const alm = (e: StorageEvent) => { if (e.key === CLAVE_PERSONALIDAD) leer(); };
        window.addEventListener(EVENTO_PERSONALIDAD, leer);
        window.addEventListener("storage", alm);
        return () => { window.removeEventListener(EVENTO_PERSONALIDAD, leer); window.removeEventListener("storage", alm); };
    }, []);
    const alternar = React.useCallback(async () => {
        setError(null);
        try {
            const m = await import("@/lib/aurora/personalities");
            m.setActivePersonality({ scope: "seccion", seccion: "educacion" }, mentoraActiva() ? null : MENTORA_ID);
            setActiva(mentoraActiva());
        } catch {
            setError("No se pudo cambiar la personalidad de Aurora.");
        }
    }, []);
    return { activa, alternar, error };
}

export function mentoresDe(cs: Contacto[]): Contacto[] {
    return cs
        .filter((c) => c.relacion === "mentoria")
        .sort((a, b) => Number(b.favorito) - Number(a.favorito) || b.actualizado.localeCompare(a.actualizado));
}

function iniciales(n: string): string {
    const p = n.trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

function Rosa({ D, mentores, ia, l }: { D: number; mentores: Contacto[]; ia: boolean; l: EstadoLienzo }) {
    const id = useIdSvg("rosa");
    const c = D / 2, R = D * 0.4;
    const vis = mentores.slice(0, 8);
    const n = Math.max(1, vis.length);
    const ang = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
    const aguja = vis.length ? ang(0) : -Math.PI / 2;
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-f`} cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stopColor={conAlfa(ORO, 0.16)} />
                    <stop offset="100%" stopColor={conAlfa(ORO, 0)} />
                </radialGradient>
                <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="100%" stopColor={ORO} />
                </linearGradient>
            </defs>
            <circle cx={c} cy={c} r={R * 1.12} fill={`url(#${id}-f)`} />
            <circle cx={c} cy={c} r={R} fill="none" stroke={ORO} strokeOpacity={0.35} />
            <circle cx={c} cy={c} r={R * 0.72} fill="none" stroke="#fff" strokeOpacity={0.08} strokeDasharray="2 4" />
            {/* rosa de los vientos: 8 puntas */}
            {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2, larga = i % 2 === 0, r = R * (larga ? 0.62 : 0.4), w = R * 0.07;
                const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
                const px = Math.cos(a + Math.PI / 2) * w, py = Math.sin(a + Math.PI / 2) * w;
                return <path key={i} d={`M${c + px} ${c + py}L${x} ${y}L${c - px} ${c - py}Z`} fill={larga ? conAlfa(ORO, 0.35) : conAlfa("#ffffff", 0.12)} />;
            })}
            {/* la aguja hacia tu mentor favorito */}
            <g style={{ transform: `rotate(${(aguja * 180) / Math.PI}deg)`, transformOrigin: `${c}px ${c}px`, transition: l.animar ? "transform .8s cubic-bezier(.22,1,.36,1)" : undefined }}>
                <path d={`M${c} ${c - R * 0.05}L${c + R * 0.78} ${c}L${c} ${c + R * 0.05}Z`} fill={`url(#${id}-a)`} opacity={vis.length ? 0.95 : 0.3} />
            </g>
            {/* Aurora en el centro */}
            <circle cx={c} cy={c} r={R * 0.14} fill={ia ? l.acento : conAlfa("#ffffff", 0.15)} className={ia && l.animar ? "ss-respirar" : undefined}
                style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center", filter: ia && l.nivel === "pleno" ? `drop-shadow(0 0 6px ${l.acento})` : undefined }} />
            {/* las personas mentoras */}
            {vis.map((m, i) => {
                const x = c + Math.cos(ang(i)) * R, y = c + Math.sin(ang(i)) * R, r = Math.max(9, D * 0.07);
                return (
                    <g key={m.id}>
                        <circle cx={x} cy={y} r={r} fill="#161433" stroke={i === 0 ? ORO : conAlfa(ORO, 0.55)} strokeWidth={i === 0 ? 2 : 1.2} />
                        <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ fontSize: r * 0.8, fontWeight: 500 }}>{iniciales(m.nombre)}</text>
                    </g>
                );
            })}
        </svg>
    );
}

export function MentorMatchWidget() {
    const l = useLienzo("#7c5cff", "#23d5ab");
    const api = useContactos();
    const ia = useMentoraIA();
    const mentores = React.useMemo(() => mentoresDe(api.contactos), [api.contactos]);
    const principal = mentores[0];

    const etiqueta = !api.listo ? "Mentoría híbrida: cargando tu libreta"
        : `Mentoría híbrida: ${mentores.length} persona${mentores.length === 1 ? "" : "s"} mentora${mentores.length === 1 ? "" : "s"}${principal ? `, destaca ${principal.nombre}` : ""}. Aurora ${ia.activa ? "es tu mentora en Educación" : "no está en modo mentora"}.`;

    const botonIA = (compacto: boolean) => (
        <Accion color={l.acento} alto={l.toque} icono={GraduationCap} onClick={() => void ia.alternar()} pulsado={ia.activa} soloIcono={compacto}
            etiqueta={ia.activa ? "Quitar a Aurora el modo mentora en Educación" : "Hacer de Aurora tu mentora en Educación"}>
            {ia.activa ? "Aurora mentora" : "Mentora IA"}
        </Accion>
    );

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Mentoría Híbrida" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Rosa D={l.lado - 12} mentores={mentores} ia={ia.activa} l={l} /></div>
            </Lienzo>
        );
    }

    if (!api.listo) {
        return (
            <Lienzo l={l} titulo="Mentoría Híbrida" icono={Compass} etiqueta={etiqueta} sinCabecera={l.base === "s"}>
                <CargandoSilueta color={ORO} etiqueta="Cargando tu libreta…" />
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Mentoría Híbrida" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <Rosa D={Math.max(64, Math.min(l.ancho - 24, l.alto - l.toque - 20))} mentores={mentores} ia={ia.activa} l={l} />
                    {principal
                        ? <p className="max-w-full truncate text-[12px] text-white/80" title={principal.nombre}>{principal.nombre}</p>
                        : botonIA(false)}
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.1;
    const cab = 52;
    const D = fila ? Math.max(90, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.24 : 0.38))) : Math.max(90, Math.min(l.ancho * 0.55, (l.alto - cab) * 0.38));

    const detalle = (m: Contacto) => m.relacionDetalle || [m.cargo, m.organizacion].filter(Boolean).join(" · ") || (m.username ? `@${m.username}` : "Mentoría");
    const persona = (m: Contacto, destacada: boolean) => (
        <li key={m.id} className="flex min-w-0 items-center gap-2">
            <Link href={`/contactos?c=${encodeURIComponent(m.id)}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 transition-colors duration-200 hover:text-white" style={{ minHeight: Math.min(l.toque, 34) }}
                aria-label={`Abrir la ficha de ${m.nombre}`}>
                <span aria-hidden className="ss-redondo grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-medium text-white" style={{ background: "#161433", boxShadow: `inset 0 0 0 ${destacada ? 2 : 1}px ${destacada ? ORO : conAlfa(ORO, 0.5)}` }}>{iniciales(m.nombre)}</span>
                <span className="min-w-0">
                    <span className={`block truncate ${destacada ? "text-[14px] text-white" : "text-[12.5px] text-white/85"}`} title={m.nombre}>{m.nombre}</span>
                    <span className="block truncate text-[11px] text-white/50" title={detalle(m)}>{detalle(m)}</span>
                </span>
            </Link>
            {m.username && <Accion color={ORO} alto={Math.min(l.toque, 30)} soloIcono icono={MessageCircle} href={`/messages?to=${encodeURIComponent(m.username)}`} etiqueta={`Escribir a ${m.nombre}`}>Escribir</Accion>}
        </li>
    );

    const vacio = !mentores.length && (
        <VacioHonesto icono={UserPlus} color={ORO} compacto llenar={false} titulo="Aún no tienes personas mentoras"
            ayuda={grande ? "Marca la relación «Mentoría» en un contacto y aparecerá aquí." : undefined}
            accion={<Accion color={ORO} alto={l.toque} icono={UserPlus} href="/contactos?nuevo=1">Añadir en Contactos</Accion>} />
    );
    const lista = mentores.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-1" aria-label="Tus personas mentoras">
            {mentores.slice(0, l.base === "xl" ? 5 : l.horizontal ? 3 : grande ? 2 : 1).map((m, i) => persona(m, i === 0))}
        </ul>
    );
    const lineaIA = (
        <div className="flex min-w-0 flex-col gap-1.5">
            {grande && <Rot>Mentora IA</Rot>}
            <div className="flex flex-wrap items-center gap-1.5">
                {botonIA(false)}
                {ia.activa && grande && <Accion color={l.acento2} alto={l.toque} icono={Sparkles} href="/agent?tab=chat" soloIcono={l.base === "l"} etiqueta="Conversar con Aurora mentora">Conversar</Accion>}
            </div>
            {ia.error && <p role="alert" className="text-[11px] text-amber-200">{ia.error}</p>}
            {api.error && grande && <p className="text-[11px] text-amber-200/80" title={api.error}>La libreta no se pudo sincronizar (error): ves lo guardado aquí.</p>}
        </div>
    );

    return (
        <Lienzo l={l} titulo="Mentoría Híbrida" subtitulo={`${mentores.length} persona${mentores.length === 1 ? "" : "s"} · Aurora ${ia.activa ? "mentora" : "en su modo"}`} icono={Compass} etiqueta={etiqueta}>
            <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col items-center"}`} style={{ justifyContent: "safe center" }}>
                <Rosa D={D} mentores={mentores} ia={ia.activa} l={l} />
                {/* Si no cabe, se retira antes la ayuda del vacío o la lista que la mentora IA. */}
                <PilaAjustable niveles={1} className={`min-h-0 min-w-0 ${fila ? "flex-1" : "w-full flex-1"}`}>
                    <div className="my-auto flex min-w-0 flex-col gap-2.5">
                        <Prescindible nivel={1}>{vacio || lista}</Prescindible>
                        {lineaIA}
                    </div>
                </PilaAjustable>
            </div>
        </Lienzo>
    );
}
