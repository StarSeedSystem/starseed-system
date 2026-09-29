'use client';

// ════════════════════════════════════════════════════════════════
// CryptoShieldWidget — Escudo Ontológico (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// La postura de seguridad y privacidad REAL de este dispositivo, sin
// consultas a la nube: bloqueo de la neurona (PIN/contraseña/huella),
// bloqueo por inactividad, conexión cifrada, datos locales
// persistentes, secretos a la vista (escaneo local bajo demanda, con
// las mismas reglas que /seguridad) y el tráfico de hoy hacia la nube
// según el guardián de consumo. El escudo se enciende franja a franja
// con lo que está bien; cada comprobación lleva la acción que la
// arregla (Ajustes → Seguridad, /seguridad o una acción directa).
// Estados honestos: cargando (leyendo señales), vacío no aplica (siempre
// hay algo que comprobar) y error (señal ilegible → se dice «sin dato»).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ScanSearch, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { colorSalud } from "@/components/widgets-libres/familias/comun";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, Rot, tinta } from "./_catalogo/piezas";
import {
    RUTA_SEGURIDAD, RUTA_SEGURIDAD_CUENTA, colorCheck, comprobaciones, puntuacion, useConsumoHoy, useEscaneoLocal, useSenalesSeguridad,
    type Comprobacion, type EstadoCheck,
} from "./_catalogo/seguridad";

const ICONO: Record<EstadoCheck, LucideIcon> = { bien: CheckCircle2, atencion: AlertTriangle, mal: XCircle, info: Info };

/** Contorno del escudo en una caja de 100 × 115. */
const ESCUDO = "M50 3 L93 17 V50 C93 79 74 100 50 112 C26 100 7 79 7 50 V17 Z";

function Escudo({ ancho, cs, l, cifra, sub }: { ancho: number; cs: Comprobacion[]; l: EstadoLienzo; cifra: string; sub: string }) {
    const id = useIdSvg("escudo");
    const alto = ancho * 1.15;
    const franjas = cs.length || 1;
    const h = 109 / franjas;
    // Franjas ordenadas: lo que está bien llena el escudo desde abajo; lo que falla, arriba.
    const pesoFranja: Record<EstadoCheck, number> = { mal: 0, atencion: 1, info: 2, bien: 3 };
    const bandas = [...cs].sort((a, b) => pesoFranja[a.estado] - pesoFranja[b.estado]);
    const nivel = puntuacion(cs).nivel;
    const borde = colorSalud(nivel);
    return (
        <svg width={ancho} height={alto} viewBox="0 0 100 115" aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <clipPath id={`${id}-c`}><path d={ESCUDO} /></clipPath>
                <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
                    <stop offset="60%" stopColor={borde} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={borde} stopOpacity={0.25} />
                </linearGradient>
                <radialGradient id={`${id}-n`} cx="50%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#0c0e22" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#0c0e22" stopOpacity={0.75} />
                </radialGradient>
            </defs>
            <g clipPath={`url(#${id}-c)`}>
                <rect x={0} y={0} width={100} height={115} fill={conAlfa(l.acento, 0.08)} />
                {bandas.map((c, i) => (
                    <rect key={c.id} x={0} y={3 + i * h} width={100} height={h - 1.2} fill={colorCheck(c.estado)}
                        opacity={c.estado === "bien" ? 0.42 : c.estado === "info" ? 0.14 : 0.3} />
                ))}
                {/* velo central para que la cifra se lea */}
                <rect x={0} y={0} width={100} height={115} fill={`url(#${id}-n)`} />
                {/* brillo diagonal del metal */}
                <path d="M7 17 L50 3 L60 6 L12 60 L7 50 Z" fill="#fff" opacity={0.07} />
            </g>
            <path d={ESCUDO} fill="none" stroke={`url(#${id}-b)`} strokeWidth={2.2} strokeLinejoin="round"
                style={l.nivel === "pleno" ? { filter: `drop-shadow(0 0 4px ${conAlfa(borde, 0.7)})` } : undefined} />
            <text x={50} y={sub ? 56 : 62} textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ fontSize: 26, fontWeight: 250, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{cifra}</text>
            {sub && <text x={50} y={75} textAnchor="middle" dominantBaseline="middle" fill={tinta(borde, 0.35)} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>{sub}</text>}
        </svg>
    );
}

function FilaCheck({ c, l, onHacer, conDetalle, apilar }: { c: Comprobacion; l: EstadoLienzo; onHacer: (h: "persistir" | "escanear") => void; conDetalle: boolean; apilar: boolean }) {
    const Icono = ICONO[c.estado];
    const color = colorCheck(c.estado);
    const accion = c.accion && (c.accion.href
        ? <Accion color={color} alto={Math.min(l.toque, 30)} href={c.accion.href} etiqueta={`${c.accion.texto}: ${c.titulo}`}>{c.accion.texto}</Accion>
        : <Accion color={color} alto={Math.min(l.toque, 30)} onClick={() => onHacer(c.accion!.hacer!)} icono={c.accion.hacer === "escanear" ? ScanSearch : undefined} etiqueta={`${c.accion.texto}: ${c.titulo}`}>{c.accion.texto}</Accion>);
    return (
        <li className="flex min-w-0 items-start gap-2">
            <Icono aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color: tinta(color, 0.15) }} />
            <div className="min-w-0 flex-1">
                <p className={`text-[12.5px] font-medium leading-snug text-white/90 ${apilar ? "line-clamp-2" : "truncate"}`} title={c.titulo}>
                    <span className="sr-only">{c.estado === "bien" ? "Bien: " : c.estado === "mal" ? "Falla: " : c.estado === "atencion" ? "Atención: " : "Sugerencia: "}</span>{c.titulo}
                </p>
                {conDetalle && <p className="line-clamp-2 text-[11.5px] leading-snug text-white/55" title={c.detalle}>{c.detalle}</p>}
                {apilar && accion && <div className="mt-1">{accion}</div>}
            </div>
            {!apilar && accion}
        </li>
    );
}

export function CryptoShieldWidget() {
    const l = useLienzo("#94a3b8", "#23d5ab");
    const s = useSenalesSeguridad();
    const consumo = useConsumoHoy();
    const { escaneo, escanear } = useEscaneoLocal();
    const [error, setError] = React.useState<string | null>(null);

    const cs = React.useMemo(() => comprobaciones(s, consumo, escaneo), [s, consumo, escaneo]);
    const p = puntuacion(cs);
    const hacer = (h: "persistir" | "escanear") => {
        setError(null);
        try {
            if (h === "escanear") escanear();
            else void s.persistir();
        } catch {
            setError("No se pudo completar la acción en este navegador.");
        }
    };
    const pendientes = cs.filter((c) => c.estado === "mal" || c.estado === "atencion");
    const orden: Record<EstadoCheck, number> = { mal: 0, atencion: 1, info: 2, bien: 3 };
    const ordenadas = [...cs].sort((a, b) => orden[a.estado] - orden[b.estado]);
    const resumen = p.nivel === "bien" ? "protegido" : p.nivel === "mal" ? "expuesto" : "mejorable";
    const etiqueta = s.listo
        ? `Escudo de este dispositivo: ${p.bien} de ${p.total} comprobaciones bien, ${resumen}. ${pendientes.map((c) => c.titulo).join(". ")}`
        : "Escudo de este dispositivo: cargando las señales";

    if (!s.listo) {
        return (
            <Lienzo l={l} titulo="Escudo Ontológico" icono={ShieldCheck} etiqueta={etiqueta}>
                <div role="status" className="grid h-full place-items-center text-[12px] text-white/60">Cargando las señales de este dispositivo…</div>
            </Lienzo>
        );
    }

    const cifra = `${p.bien}/${p.total}`;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Escudo Ontológico" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Escudo ancho={(l.lado - 12) / 1.15} cs={cs} l={l} cifra={cifra} sub="" /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        const principal = pendientes[0];
        return (
            <Lienzo l={l} titulo="Escudo Ontológico" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <Escudo ancho={Math.min(l.ancho - 30, (l.alto - l.toque - 18) / 1.15)} cs={cs} l={l} cifra={cifra} sub={resumen} />
                    {principal?.accion?.href
                        ? <Accion color={colorCheck(principal.estado)} alto={l.toque} href={principal.accion.href} etiqueta={`${principal.accion.texto}: ${principal.titulo}`}>{principal.accion.texto}</Accion>
                        : principal?.accion?.hacer
                            ? <Accion color={colorCheck(principal.estado)} alto={l.toque} onClick={() => hacer(principal.accion!.hacer!)} etiqueta={`${principal.accion.texto}: ${principal.titulo}`}>{principal.accion.texto}</Accion>
                            : <span className="text-[11px] text-white/60">Todo en orden</span>}
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.05;
    const cab = 52;
    const anchoEscudo = fila
        ? Math.max(70, Math.min((l.alto - cab - 20) / 1.15, l.ancho * (l.horizontal ? 0.18 : 0.34)))
        : Math.max(70, Math.min(l.ancho * (l.torre ? 0.62 : 0.42), (l.alto - cab) * 0.36 / 1.15));
    // Ancho que le queda a la lista: por debajo de ~300 px la acción va bajo el título.
    const anchoLista = fila ? l.ancho - anchoEscudo - 48 : l.ancho - 32;
    const apilar = anchoLista < 300;
    const cuantas = l.base === "xl" ? 7 : l.horizontal ? 4 : apilar ? (grande ? 3 : 2) : grande ? 5 : 3;
    const visibles = (grande || l.horizontal ? ordenadas : pendientes.length ? pendientes : ordenadas).slice(0, cuantas);
    const conDetalle = l.base === "xl" || (l.horizontal && l.alto >= 220);

    const lista = (
        <ul className={`flex min-h-0 min-w-0 flex-col ${conDetalle ? "gap-2" : "gap-1.5"}`} aria-label="Comprobaciones de seguridad de este dispositivo">
            {visibles.map((c) => <FilaCheck key={c.id} c={c} l={l} onHacer={hacer} conDetalle={conDetalle} apilar={apilar} />)}
        </ul>
    );
    const pie = (
        <div className="flex flex-wrap items-center gap-1.5">
            <Accion color={l.acento2} alto={l.toque} href={RUTA_SEGURIDAD_CUENTA} etiqueta="Abrir Ajustes de seguridad de la cuenta">Ajustes</Accion>
            <Accion color={l.acento2} alto={l.toque} href={RUTA_SEGURIDAD} etiqueta="Abrir el centro de Seguridad (DNS, VPN, escáner)">Seguridad</Accion>
        </div>
    );

    return (
        <Lienzo l={l} titulo="Escudo Ontológico" subtitulo={`Este dispositivo · ${resumen}`} icono={ShieldCheck} etiqueta={etiqueta}>
            <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col items-center justify-center"}`}>
                <div className="flex shrink-0 flex-col items-center gap-1">
                    <Escudo ancho={anchoEscudo} cs={cs} l={l} cifra={cifra} sub={resumen} />
                </div>
                <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2.5 ${fila ? "" : "w-full"}`}>
                    {!grande && !l.horizontal && pendientes.length === 0 && <Rot color={tinta(colorSalud("bien"))}>Todo en orden</Rot>}
                    {lista}
                    {error && <p role="alert" className="text-[11px] text-amber-200">{error}</p>}
                    {grande && pie}
                </div>
            </div>
        </Lienzo>
    );
}
