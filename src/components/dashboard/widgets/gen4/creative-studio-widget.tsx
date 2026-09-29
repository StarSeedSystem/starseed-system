'use client';

// ════════════════════════════════════════════════════════════════
// CreativeStudioWidget — Estudio Creativo (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Tus obras REALES: documentos, presentaciones, tablas, pizarras y
// programas que has creado en el OS (`os_spaces`, la misma lectura ligera
// que el Multiverso: una vez cada 15 min y solo a la vista). La paleta
// tiene un pocillo de pintura por tipo, lleno según lo que has creado;
// la lista abre cada obra en su app y «Crear» hace un documento, una
// presentación o una tabla de verdad y te lleva dentro (la pizarra y los
// programas, en su página). Estados honestos: cargando, vacío (aún no
// has creado nada), sin sesión y error, sin proyectos inventados.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppWindow, ChevronLeft, FileText, Palette, PencilRuler, Plus, Presentation, Table2, X, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, tinta } from "../gen5/_catalogo/piezas";
import { anotarEspacioNuevo, haceTexto, rutaDe, useMisEspacios, type Espacio } from "../gen5/_catalogo/espacios";
import { META_OBRA, OBRAS, conteoPorTipo, crearObra, obrasDe, resumenConteo, type TipoCreable, type TipoObra } from "./creative-studio-partes";

const ICONO: Record<TipoObra, LucideIcon> = { documento: FileText, presentacion: Presentation, tabla: Table2, pizarra: PencilRuler, programa: AppWindow };

// La paleta, en coordenadas 100×80: contorno con la muesca del pulgar y cinco pocillos.
const CONTORNO = "M50 4C77 4 97 17 97 36C97 47 90 52 81 51C73 50 67 54 68 61C69 70 62 77 49 77C23 77 3 61 3 40C3 19 23 4 50 4Z";
const POCILLOS: Record<TipoObra, [number, number]> = { documento: [19, 38], presentacion: [30, 19], tabla: [50, 13], pizarra: [70, 17], programa: [33, 58] };

function Paleta({ W, conteo, reciente, l, cifras }: { W: number; conteo: Record<TipoObra, number>; reciente: TipoObra | null; l: EstadoLienzo; cifras?: boolean }) {
    const id = useIdSvg("pal");
    const H = W * 0.8, s = W / 100;
    const maximo = Math.max(1, ...Object.values(conteo));
    return (
        <svg width={W} height={H} viewBox="0 0 100 80" aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <linearGradient id={`${id}-madera`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={conAlfa(l.acento, 0.22)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0.08)} />
                </linearGradient>
                <radialGradient id={`${id}-brillo`} cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
                    <stop offset="60%" stopColor="#fff" stopOpacity={0} />
                </radialGradient>
            </defs>
            <path d={CONTORNO} fill={`url(#${id}-madera)`} stroke={tinta(l.acento, 0.2)} strokeOpacity={0.55} strokeWidth={0.9} />
            {/* agujero del pulgar */}
            <ellipse cx={78} cy={36} rx={6.5} ry={5.5} fill="rgba(5,6,15,0.85)" stroke={tinta(l.acento, 0.2)} strokeOpacity={0.4} strokeWidth={0.7} />
            {OBRAS.map((o) => {
                const [x, y] = POCILLOS[o.tipo];
                const n = conteo[o.tipo];
                const r = 5.2 + (n / maximo) * 2.6;
                const lleno = n > 0;
                return (
                    <g key={o.tipo}>
                        <circle cx={x} cy={y} r={8.6} fill="rgba(5,6,15,0.35)" />
                        {lleno ? (
                            <g className={reciente === o.tipo && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center" }}>
                                <circle cx={x} cy={y} r={r} fill={o.color} />
                                <circle cx={x} cy={y} r={r} fill={`url(#${id}-brillo)`} />
                            </g>
                        ) : (
                            <circle cx={x} cy={y} r={5.2} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={0.7} strokeDasharray="1.6 1.4" />
                        )}
                        {cifras && lleno && W >= 150 && (
                            <text x={x} y={y + 2.1} textAnchor="middle" fill="#0b0d18" style={{ fontSize: Math.max(5.4, 11 / s), fontWeight: 700 }}>{n}</text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

function FilaObra({ o, l, detalle = true }: { o: Espacio & { tipo: TipoObra }; l: EstadoLienzo; detalle?: boolean }) {
    const meta = META_OBRA[o.tipo];
    const I = ICONO[o.tipo];
    const hace = haceTexto(o.actualizado);
    return (
        <li>
            <Link href={rutaDe(o)} title={`${o.titulo} · ${meta.nombre}${hace ? ` · editado ${hace}` : ""}`}
                className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                style={{ minHeight: l.toque + 4 }}>
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: conAlfa(meta.color, 0.16), color: tinta(meta.color, 0.3) }}><I className="size-3.5" /></span>
                <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] leading-snug text-white/90 ${detalle ? "truncate" : "line-clamp-2"}`}>{o.titulo}</span>
                    {detalle && <span className="block truncate text-[11px] text-white/50">{meta.nombre}{hace ? ` · ${hace}` : ""}</span>}
                </span>
            </Link>
        </li>
    );
}

type Modo = null | "menu" | TipoCreable;

export function CreativeStudioWidget() {
    const l = useLienzo("#ec4899", "#fbbf24");
    const router = useRouter();
    const esp = useMisEspacios(l.visible);
    const [modo, setModo] = React.useState<Modo>(null);
    const [titulo, setTitulo] = React.useState("");
    const [enviando, setEnviando] = React.useState(false);
    const [fallo, setFallo] = React.useState<string | null>(null);

    const obras = React.useMemo(() => obrasDe(esp.datos), [esp.datos]);
    const conteo = React.useMemo(() => conteoPorTipo(obras), [obras]);
    const reciente = obras[0]?.tipo ?? null;
    const cargando = !esp.listo || (esp.cargando && !esp.datos && !esp.sinSesion);
    const sinDatos = !esp.datos && !!esp.error;

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modo || modo === "menu" || enviando) return;
        setEnviando(true);
        setFallo(null);
        try {
            const nombre = titulo.trim();
            const r = await crearObra(modo, nombre);
            await anotarEspacioNuevo({ id: r.refId, titulo: nombre || `${META_OBRA[modo].nombre} sin título`, tipo: modo });
            router.push(r.ruta);
        } catch (err) {
            setFallo(err instanceof Error && err.message ? err.message : "No se pudo crear (error de conexión).");
        } finally {
            setEnviando(false);
        }
    };

    const etiqueta = cargando ? "Estudio Creativo: cargando tus obras"
        : esp.sinSesion ? "Estudio Creativo: sin sesión, inicia sesión para ver tus obras"
        : sinDatos ? "Estudio Creativo: error, no se pudieron leer tus obras"
        : obras.length ? `Estudio Creativo: ${obras.length} obra${obras.length === 1 ? "" : "s"} (${resumenConteo(conteo)}). La última: «${obras[0].titulo}»`
        : "Estudio Creativo: aún no has creado ninguna obra";

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Estudio Creativo" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Paleta W={l.ancho - 12} conteo={conteo} reciente={reciente} l={l} /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        const destino = esp.sinSesion ? "/login" : obras[0] ? rutaDe(obras[0]) : "/crear";
        return (
            <Lienzo l={l} titulo="Estudio Creativo" etiqueta={etiqueta} sinCabecera>
                <Link href={destino} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5"
                    aria-label={esp.sinSesion ? "Iniciar sesión para ver tus obras" : obras[0] ? `Seguir con «${obras[0].titulo}»` : "Abrir el Centro de Creación"}>
                    <Paleta W={Math.max(70, Math.min(l.ancho - 24, (l.alto - 58) / 0.8))} conteo={conteo} reciente={reciente} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">{cargando ? "Cargando…" : esp.sinSesion ? "Inicia sesión" : obras.length ? `${obras.length} obra${obras.length === 1 ? "" : "s"}` : "Crea tu primera obra"}</span>
                </Link>
            </Lienzo>
        );
    }

    const cab = 52;
    const hb = Math.max(80, l.alto - cab - 12);
    const estrecho = l.ancho < 240;
    const holgado = l.ancho >= 440;

    const menuTipos = (conAyuda: boolean, rejilla = false) => (
        <nav aria-label="Qué quieres crear" className={rejilla ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1"}>
            {OBRAS.filter((o) => o.tipo !== "programa").map((o) => {
                const I = ICONO[o.tipo];
                const dentro = (
                    <>
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: conAlfa(o.color, 0.16), color: tinta(o.color, 0.3) }}><I className="size-3.5" /></span>
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-[12.5px] text-white/85">{o.nombre}</span>
                            {conAyuda && <span className="block truncate text-[11px] text-white/50">{o.ayuda}</span>}
                        </span>
                    </>
                );
                const clase = "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40";
                const estilo = { minHeight: l.toque + (conAyuda ? 8 : 0), background: rejilla ? "rgba(255,255,255,0.03)" : undefined };
                return o.crearEn
                    ? <Link key={o.tipo} href={o.crearEn} title={`${o.nombre}: ${o.ayuda}`} className={clase} style={estilo}>{dentro}</Link>
                    : <button key={o.tipo} type="button" title={`${o.nombre}: ${o.ayuda}`} onClick={() => { setFallo(null); setModo(o.tipo as TipoCreable); }} className={clase} style={estilo}>{dentro}</button>;
            })}
        </nav>
    );

    const formulario = modo && modo !== "menu" && (
        <form onSubmit={crear} className="flex min-w-0 flex-col gap-1.5" aria-label={`Crear ${META_OBRA[modo].nombre.toLowerCase()}`}>
            <p className="flex items-center gap-1.5 text-[12px] text-white/70">
                <button type="button" onClick={() => setModo("menu")} aria-label="Elegir otro tipo" className="ss-redondo grid cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10"
                    style={{ width: l.tactil ? l.toque : 24, height: l.tactil ? l.toque : 24 }}><ChevronLeft className="size-4" /></button>
                Nuevo: <span style={{ color: tinta(META_OBRA[modo].color, 0.3) }}>{META_OBRA[modo].nombre}</span>
            </p>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Título" aria-label="Título"
                className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
            <div className="flex gap-1.5">
                <Accion color={META_OBRA[modo].color} solida alto={l.toque} type="submit" disabled={enviando} icono={ICONO[modo]}>{enviando ? "Creando…" : estrecho ? "Crear" : "Crear y abrir"}</Accion>
                <Accion color="#ffffff" alto={l.toque} soloIcono icono={X} onClick={() => { setModo(null); setFallo(null); }} etiqueta="Cancelar">Cancelar</Accion>
            </div>
            {fallo && <p role="alert" className="text-[11.5px] text-rose-200/90">{fallo}</p>}
        </form>
    );

    const listaObras = (max: number, detalle = true) => {
        if (cargando) return <CargandoSilueta color={l.acento} filas={Math.min(3, max)} etiqueta="Cargando tus obras…" />;
        if (esp.sinSesion) return (
            <div role="status" className="min-w-0">
                <p className="text-[13.5px] font-medium text-white/90">Inicia sesión para ver tus obras</p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Tus documentos, presentaciones y tablas aparecerán aquí.</p>
            </div>
        );
        if (sinDatos) return <ErrorHonesto error={esp.error} color={l.acento} onReintentar={esp.recargar} compacto />;
        if (!obras.length) return (
            <div role="status" className="min-w-0">
                <p className="text-[13.5px] font-medium text-white/90">Aún no has creado ninguna obra</p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Todo se escribe entre varias personas y guarda su historial.</p>
            </div>
        );
        return (
            <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Tus obras">
                {obras.slice(0, max).map((o) => <FilaObra key={o.id} o={o} l={l} detalle={detalle} />)}
            </ul>
        );
    };

    const pie = !cargando && !sinDatos && (
        <div className="flex flex-wrap gap-1.5">
            {esp.sinSesion
                ? <Accion color={l.acento} alto={l.toque} href="/login" etiqueta="Iniciar sesión">Iniciar sesión</Accion>
                : <Accion color={l.acento} alto={l.toque} icono={Plus} onClick={() => { setFallo(null); setModo("menu"); }} etiqueta="Crear una obra nueva">{obras.length || !holgado ? "Crear" : "Crear tu primera obra"}</Accion>}
        </div>
    );

    const columna = (max: number, detalle = true) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto" style={{ justifyContent: "safe center" }}>
            {modo === "menu" ? <>{menuTipos(false)}<div><Accion color="#ffffff" alto={l.toque} icono={X} onClick={() => setModo(null)} etiqueta="Cerrar el menú de crear">Cerrar</Accion></div></>
                : modo ? formulario
                : <>{listaObras(max, detalle)}{pie}</>}
        </div>
    );

    const resumen = obras.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label="Lo que has creado, por tipo">
            {OBRAS.filter((o) => conteo[o.tipo] > 0).map((o) => (
                <li key={o.tipo} className="flex items-center gap-2 text-[11.5px] text-white/60">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />
                    <span className="min-w-0 flex-1 truncate">{conteo[o.tipo] === 1 ? o.nombre : o.plural[0].toUpperCase() + o.plural.slice(1)}</span>
                    <span className="tabular-nums text-white/85">{conteo[o.tipo]}</span>
                </li>
            ))}
        </ul>
    );

    // Panorámico: paleta · tus obras · crear.
    if (l.horizontal) {
        const W = Math.max(100, Math.min(hb / 0.8, l.ancho * 0.26));
        return (
            <Lienzo l={l} titulo="Estudio Creativo" icono={Palette} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Paleta W={W} conteo={conteo} reciente={reciente} l={l} cifras />
                    {modo ? columna(3) : <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">{listaObras(Math.max(1, Math.floor((hb - 10) / 46)))}{esp.sinSesion && pie}</div>}
                    {!modo && !esp.sinSesion && !sinDatos && <div className="flex min-w-0 shrink-0 flex-col justify-center" style={{ width: Math.min(220, l.ancho * 0.28) }}>{menuTipos(false)}</div>}
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const W = Math.max(90, l.ancho - 28);
        return (
            <Lienzo l={l} titulo={l.ancho < 230 ? "Estudio" : "Estudio Creativo"} icono={Palette} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3">
                    <Paleta W={W} conteo={conteo} reciente={reciente} l={l} />
                    <div className="flex w-full min-h-0 flex-1 flex-col">{columna(Math.max(1, Math.floor((hb - W * 0.8 - 60) / 48)), false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const W = Math.max(130, Math.min(l.ancho * 0.4, (hb * 0.5) / 0.8));
        return (
            <Lienzo l={l} titulo="Estudio Creativo" subtitulo="Tus obras vivas y lo que puedes crear" icono={Palette} etiqueta={etiqueta}
                acciones={<Accion color={l.acento2} alto={28} soloIcono icono={PencilRuler} href="/crear" etiqueta="Abrir el Centro de Creación">Centro de Creación</Accion>}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-4">
                        <div className="flex shrink-0 flex-col gap-2" style={{ width: W }}>
                            <Paleta W={W} conteo={conteo} reciente={reciente} l={l} cifras />
                        </div>
                        {modo ? columna(4) : <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">{listaObras(Math.max(2, Math.floor((W * 0.8) / 46)))}{esp.sinSesion && pie}</div>}
                    </div>
                    {!modo && !esp.sinSesion && !sinDatos && !cargando && (
                        <div className="flex min-h-0 flex-col gap-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Crear</p>
                            {menuTipos(true, true)}
                        </div>
                    )}
                    {!modo && resumen}
                </div>
            </Lienzo>
        );
    }

    // M y L: paleta y tus obras; en L, el Centro de Creación en la cabecera.
    const W = Math.max(96, Math.min(l.ancho * 0.4, (hb - 8) / 0.8));
    const max = Math.max(1, Math.min(4, Math.floor((hb - 44) / 46)));
    return (
        <Lienzo l={l} titulo="Estudio Creativo" subtitulo={l.ancho >= 300 ? "Tus obras vivas" : undefined} icono={Palette} etiqueta={etiqueta}
            acciones={l.base === "l" ? <Accion color={l.acento2} alto={28} soloIcono icono={PencilRuler} href="/crear" etiqueta="Abrir el Centro de Creación">Centro de Creación</Accion> : undefined}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Paleta W={W} conteo={conteo} reciente={reciente} l={l} cifras={l.base === "l"} />
                {columna(max, l.base === "l")}
            </div>
        </Lienzo>
    );
}
