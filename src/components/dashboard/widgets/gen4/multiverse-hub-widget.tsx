'use client';

// ════════════════════════════════════════════════════════════════
// MultiverseHubWidget — Multiverso (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Tus mundos REALES: las escenas 3D y las salas de juego que has creado
// (`os_spaces`, lectura ligera compartida con el Estudio Creativo, una vez
// cada 15 min y solo a la vista) orbitando un portal. Cada mundo se abre
// a un toque (y en VR si este dispositivo lo sabe hacer: WebXR real, no
// supuesto). Crear una escena nueva aquí mismo te lleva dentro. Los
// portales de la red son las rutas inmersivas que ya existen en el OS.
// Estados honestos: cargando, vacío (aún no has creado ningún mundo),
// sin sesión y error (la nube no respondió), sin inventar presencias.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Gamepad2, Glasses, Network, Orbit, Plus, Users, X, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, tinta } from "../gen5/_catalogo/piezas";
import { anotarEspacioNuevo, haceTexto, rutaDe, useMisEspacios, type Espacio } from "../gen5/_catalogo/espacios";
import { COLOR_MUNDO, PORTALES, asientos, detectarXR, mundosDe, type ClavePortal, type SoporteXR } from "./multiverse-hub-partes";

const ICONO_PORTAL: Record<ClavePortal, LucideIcon> = { avatares: Users, red3d: Network, xr: Glasses, sala: Box };
const NOMBRE_TIPO = { escena: "Escena 3D", juego: "Sala de juegos" } as const;

// Estrellas fijas (deterministas: nada salta entre renders).
const ESTRELLAS = Array.from({ length: 14 }, (_, i) => ({ x: ((i * 37) % 97) / 97, y: ((i * 61 + 13) % 89) / 89, r: i % 3 === 0 ? 1.1 : 0.7 }));

/** `recorte`: solo la franja del sistema (sin el cielo de arriba y abajo) para columnas estrechas. */
function Portal({ D, mundos, l, cifra, recorte }: { D: number; mundos: Espacio[]; l: EstadoLienzo; cifra?: boolean; recorte?: boolean }) {
    const id = useIdSvg("mv");
    const c = D / 2, k = 0.4;
    const R = [D * 0.29, D * 0.45];
    const lista = mundos.slice(0, 16);
    const pos = asientos(lista).map((a, i) => ({
        m: lista[i],
        x: c + Math.cos(a.angulo) * R[a.orbita],
        y: c + Math.sin(a.angulo) * R[a.orbita] * k,
        detras: Math.sin(a.angulo) < 0,
        r: Math.max(2.6, D * (a.orbita ? 0.045 : 0.038) * (i === 0 ? 1.25 : 1)),
    }));
    const planeta = (p: (typeof pos)[number]) => (
        <circle key={p.m.id} cx={p.x} cy={p.y} r={p.r} fill={`url(#${id}-p-${p.m.tipo})`} opacity={p.detras ? 0.55 : 1} />
    );
    return (
        <svg width={D} height={recorte ? D * 0.56 : D} viewBox={recorte ? `0 ${D * 0.22} ${D} ${D * 0.56}` : `0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={conAlfa(l.acento, 0.35)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0)} />
                </radialGradient>
                <radialGradient id={`${id}-nucleo`} cx="50%" cy="42%" r="60%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
                    <stop offset="35%" stopColor={tinta(l.acento, 0.25)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0.2)} />
                </radialGradient>
                {(["escena", "juego"] as const).map((t) => (
                    <radialGradient key={t} id={`${id}-p-${t}`} cx="35%" cy="30%" r="75%">
                        <stop offset="0%" stopColor={tinta(COLOR_MUNDO[t], 0.55)} />
                        <stop offset="100%" stopColor={COLOR_MUNDO[t]} />
                    </radialGradient>
                ))}
            </defs>
            {ESTRELLAS.map((s, i) => <circle key={i} cx={s.x * D} cy={s.y * D} r={s.r} fill="#fff" opacity={0.35} />)}
            <circle cx={c} cy={c} r={D * 0.36} fill={`url(#${id}-halo)`} />
            {R.map((r, i) => <ellipse key={i} cx={c} cy={c} rx={r} ry={r * k} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={1} />)}
            {pos.filter((p) => p.detras).map(planeta)}
            {/* el portal: un túnel de anillos y un aro que gira */}
            {[0.2, 0.155, 0.11].map((f, i) => (
                <ellipse key={f} cx={c} cy={c - i * D * 0.012} rx={D * f} ry={D * f * 0.92} fill="none" stroke={i === 0 ? l.acento : l.acento2} strokeOpacity={0.35 + i * 0.2} strokeWidth={i === 0 ? 1.6 : 1.1} />
            ))}
            <circle cx={c} cy={c} r={D * 0.225} fill="none" stroke={tinta(l.acento, 0.3)} strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray={`${D * 0.02} ${D * 0.035}`}
                className={l.animar ? "ss-girar" : undefined} style={{ ["--ss-dur" as string]: "40s", transformOrigin: `${c}px ${c}px` }} />
            <circle cx={c} cy={c - D * 0.03} r={D * 0.07} fill={`url(#${id}-nucleo)`}
                className={l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
            {pos.filter((p) => !p.detras).map(planeta)}
            {cifra && mundos.length > 0 && (
                <text x={c} y={D * 0.93} textAnchor="middle" fill="#fff" style={{ fontSize: Math.max(10, D * 0.13), fontWeight: 300 }}>{mundos.length}</text>
            )}
        </svg>
    );
}

function FilaMundo({ m, l, vr, detalle = true }: { m: Espacio; l: EstadoLienzo; vr: boolean; detalle?: boolean }) {
    const tipo = m.tipo === "juego" ? "juego" : "escena";
    const hace = haceTexto(m.actualizado);
    return (
        <li className="flex min-w-0 items-center gap-1">
            <Link href={rutaDe(m)} title={`${m.titulo} · ${NOMBRE_TIPO[tipo]}${hace ? ` · editada ${hace}` : ""}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                style={{ minHeight: l.toque + 4 }}>
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: conAlfa(COLOR_MUNDO[tipo], 0.16), color: tinta(COLOR_MUNDO[tipo], 0.3) }}>
                    {tipo === "juego" ? <Gamepad2 className="size-3.5" /> : <Box className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] leading-snug text-white/90 ${detalle ? "truncate" : "line-clamp-2"}`}>{m.titulo}</span>
                    {detalle && <span className="block truncate text-[11px] text-white/50">{NOMBRE_TIPO[tipo]}{hace ? ` · ${hace}` : ""}</span>}
                </span>
            </Link>
            {vr && tipo === "escena" && (
                <Accion color={l.acento2} alto={l.toque} soloIcono icono={Glasses} href={`/sala-xr/${encodeURIComponent(m.id)}?modo=vr`} etiqueta={`Entrar en VR en «${m.titulo}»`}>VR</Accion>
            )}
        </li>
    );
}

export function MultiverseHubWidget() {
    const l = useLienzo("#22d3ee", "#a855f7");
    const router = useRouter();
    const esp = useMisEspacios(l.visible);
    const [xr, setXr] = React.useState<SoporteXR | null>(null);
    const [creando, setCreando] = React.useState(false);
    const [titulo, setTitulo] = React.useState("");
    const [enviando, setEnviando] = React.useState(false);
    const [fallo, setFallo] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        void detectarXR().then((s) => { if (vivo) setXr(s); });
        return () => { vivo = false; };
    }, []);

    const mundos = React.useMemo(() => mundosDe(esp.datos), [esp.datos]);
    const escenas = mundos.filter((m) => m.tipo === "escena").length;
    const juegos = mundos.length - escenas;
    const cargando = !esp.listo || (esp.cargando && !esp.datos && !esp.sinSesion);
    const sinDatos = !esp.datos && !!esp.error;

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        if (enviando) return;
        setEnviando(true);
        setFallo(null);
        try {
            const m = await import("@/lib/vivo/escena3d");
            const nombre = titulo.trim() || "Escena 3D";
            const r = await m.crearVivoEscena3d(nombre);
            await anotarEspacioNuevo({ id: r.refId, titulo: nombre, tipo: "escena" });
            router.push(r.ruta);
        } catch (err) {
            setFallo(err instanceof Error && err.message ? err.message : "No se pudo crear la escena (error de conexión).");
        } finally {
            setEnviando(false);
        }
    };

    const etiqueta = cargando ? "Multiverso: cargando tus mundos"
        : esp.sinSesion ? "Multiverso: sin sesión, inicia sesión para ver tus mundos"
        : sinDatos ? "Multiverso: error, no se pudieron leer tus mundos"
        : `Multiverso: ${mundos.length} mundo${mundos.length === 1 ? "" : "s"} tuyo${mundos.length === 1 ? "" : "s"} (${escenas} escena${escenas === 1 ? "" : "s"} 3D y ${juegos} sala${juegos === 1 ? "" : "s"} de juego)${xr?.vr ? ". Este dispositivo puede entrar en VR" : ""}`;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Multiverso" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Portal D={l.lado - 10} mundos={mundos} l={l} cifra /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Multiverso" etiqueta={etiqueta} sinCabecera>
                <Link href={esp.sinSesion ? "/login" : mundos[0] ? rutaDe(mundos[0]) : "/escena"} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1"
                    aria-label={esp.sinSesion ? "Iniciar sesión para ver tus mundos" : mundos[0] ? `Abrir tu último mundo, «${mundos[0].titulo}»` : "Abrir las escenas 3D"}>
                    <Portal D={Math.max(70, Math.min(l.ancho - 20, l.alto - 44))} mundos={mundos} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">{cargando ? "Cargando…" : esp.sinSesion ? "Inicia sesión" : mundos.length ? `${mundos.length} mundo${mundos.length === 1 ? "" : "s"}` : "Crea tu primer mundo"}</span>
                </Link>
            </Lienzo>
        );
    }

    const cab = 52;
    const hb = Math.max(80, l.alto - cab - 12);
    const vr = !!xr?.vr;

    const formulario = (
        <form onSubmit={crear} className="flex min-w-0 flex-col gap-1.5" aria-label="Crear una escena 3D">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Nombre de la escena" aria-label="Nombre de la escena"
                className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
            <div className="flex gap-1.5">
                <Accion color={l.acento} solida alto={l.toque} type="submit" disabled={enviando} icono={Orbit}>{enviando ? "Creando…" : "Crear y entrar"}</Accion>
                <Accion color="#ffffff" alto={l.toque} soloIcono icono={X} onClick={() => { setCreando(false); setFallo(null); }} etiqueta="Cancelar">Cancelar</Accion>
            </div>
            {fallo && <p role="alert" className="text-[11.5px] text-rose-200/90">{fallo}</p>}
        </form>
    );
    const botonCrear = (texto = "Nueva escena") => (
        <Accion color={l.acento} alto={l.toque} icono={Plus} onClick={() => setCreando(true)} etiqueta="Crear una escena 3D nueva">{texto}</Accion>
    );

    const conPortales = l.horizontal || l.base === "xl";
    const listaMundos = (max: number, detalle = true) => {
        if (cargando) return <CargandoSilueta color={l.acento} filas={Math.min(3, max)} etiqueta="Cargando tus mundos…" />;
        if (esp.sinSesion) return (
            <div role="status" className="min-w-0">
                <p className="text-[13.5px] font-medium text-white/90">Inicia sesión para ver tus mundos</p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">{conPortales ? "Los portales de la red están abiertos igualmente." : "Tus escenas 3D y salas de juego aparecerán aquí."}</p>
            </div>
        );
        if (sinDatos) return <ErrorHonesto error={esp.error} color={l.acento} onReintentar={esp.recargar} compacto />;
        if (!mundos.length) return (
            <div role="status" className="min-w-0">
                <p className="text-[13.5px] font-medium text-white/90">Aún no has creado ningún mundo</p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Constrúyela entre varias personas y visítala en VR o AR.</p>
            </div>
        );
        return (
            <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Tus mundos">
                {mundos.slice(0, max).map((m) => <FilaMundo key={m.id} m={m} l={l} vr={vr} detalle={detalle} />)}
                {mundos.length > max && (
                    <li><Link href="/escena" className="inline-flex cursor-pointer items-center px-2 text-[11.5px] text-white/55 underline-offset-2 transition-colors duration-200 hover:text-white hover:underline" style={{ minHeight: l.tactil ? l.toque : 24 }}>
                        {escenas ? `Todas tus escenas (${escenas})` : "Abrir las escenas 3D"}
                    </Link></li>
                )}
            </ul>
        );
    };

    const portales = (conDetalle: boolean, rejilla = false) => (
        <nav aria-label="Portales de la red" className={rejilla ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1"}>
            {PORTALES.map((p) => {
                const I = ICONO_PORTAL[p.clave];
                return (
                    <Link key={p.clave} href={p.ruta} title={`${p.nombre}: ${p.detalle}`}
                        className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                        style={{ minHeight: l.toque + (conDetalle ? 8 : 0), background: rejilla ? "rgba(255,255,255,0.03)" : undefined }}>
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: conAlfa(p.color, 0.15), color: tinta(p.color, 0.3) }}><I className="size-3.5" /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-white/85">{p.nombre}</span>
                            {conDetalle && <span className="block truncate text-[11px] text-white/50">{p.detalle}</span>}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );

    const lineaXR = xr && (
        <p className="text-[11px] text-white/50">
            {!xr.api ? "Este navegador no ofrece WebXR: los mundos se ven en 3D en pantalla." : `Este dispositivo: VR ${xr.vr ? "sí" : "no"} · AR ${xr.ar ? "sí" : "no"}`}
        </p>
    );

    const columna = (max: number, detalle = true) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">
            {creando ? formulario : <>
                {listaMundos(max, detalle)}
                {!cargando && !sinDatos && !esp.sinSesion && <div className="flex flex-wrap gap-1.5">{botonCrear(mundos.length || l.ancho < 440 ? "Nueva escena" : "Crear una escena 3D")}</div>}
                {esp.sinSesion && <div className="flex flex-wrap gap-1.5"><Accion color={l.acento} alto={l.toque} href="/login" etiqueta="Iniciar sesión">Iniciar sesión</Accion></div>}
            </>}
        </div>
    );

    // Panorámico: portal · tus mundos · portales de la red.
    if (l.horizontal) {
        const D = Math.max(90, Math.min(hb, l.ancho * 0.24));
        return (
            <Lienzo l={l} titulo="Multiverso" icono={Orbit} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Portal D={D} mundos={mundos} l={l} />
                    {columna(Math.max(1, Math.floor((hb - 40) / 44)))}
                    <div className="flex min-w-0 shrink-0 flex-col justify-center" style={{ width: Math.min(230, l.ancho * 0.3) }}>{portales(false)}</div>
                </div>
            </Lienzo>
        );
    }

    // Torre: todo en columna.
    if (l.torre) {
        const D = Math.max(90, Math.min(l.ancho - 16, hb * 0.6));
        return (
            <Lienzo l={l} titulo="Multiverso" icono={Orbit} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-2">
                    <Portal D={D} mundos={mundos} l={l} recorte />
                    <div className="flex w-full min-h-0 flex-1 flex-col">{columna(Math.max(1, Math.floor((hb - D * 0.56 - 60) / 48)), false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const D = Math.max(120, Math.min(l.ancho * 0.36, hb * 0.48));
        return (
            <Lienzo l={l} titulo="Multiverso" subtitulo="Tus mundos y los portales de la red" icono={Orbit} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-4">
                        <Portal D={D} mundos={mundos} l={l} />
                        {columna(Math.max(2, Math.floor((D - 40) / 46)))}
                    </div>
                    <div className="flex min-h-0 flex-col gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Portales de la red</p>
                        {portales(true, true)}
                        {lineaXR}
                    </div>
                </div>
            </Lienzo>
        );
    }

    // M y L: portal y tus mundos; en L, además, el acceso al Hub XR.
    const D = Math.max(90, Math.min(hb - 8, l.ancho * 0.4));
    const max = Math.max(1, Math.min(4, Math.floor((hb - 44) / 46)));
    return (
        <Lienzo l={l} titulo="Multiverso" subtitulo={l.ancho >= 300 ? "Tus mundos y portales" : undefined} icono={Orbit} etiqueta={etiqueta}
            acciones={l.base === "l" ? <Accion color={l.acento2} alto={28} soloIcono icono={Glasses} href="/xr" etiqueta="Abrir el Hub XR">Hub XR</Accion> : undefined}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Portal D={D} mundos={mundos} l={l} />
                {columna(max, l.base === "l")}
            </div>
        </Lienzo>
    );
}
