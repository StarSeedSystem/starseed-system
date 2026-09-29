"use client";
/**
 * Accesos libres (Ola 383 · WL4, rediseño ola 0929 · F) — cuentas de vidrio con la luz de cada
 * área. Los enlaces son los MISMOS que el widget clásico (`useAccesosRapidos`: curados + el
 * OmniDock real del usuario); encima, lo que lo hace útil cinco veces al día:
 *   · Fijados: los que tú eliges (Editar → fijar/soltar); de fábrica, los seis primeros.
 *   · Recientes: lo último que abriste (desde aquí; y desde cualquier sitio si se monta
 *     `RegistroRecientesAccesos`, ver accesos-registro.tsx).
 *   · Sugeridos: lo que más usas y no has fijado (frecencia: veces × lo reciente).
 * Todo local a esta neurona (`starseed.inicio.accesos.v1`), sin red.
 *   micro → cuatro en cruz alrededor del sigilo · s → cuatro fijados · m → seis fijados
 *   (+ recientes; apaisado: al lado con «hace…») · l/xl → fijados, recientes, sugeridos,
 *   acciones y edición (xl: buscar) · panorámico → una fila · torre → una columna con nombres.
 */
import * as React from "react";
import Link from "next/link";
import { Check, LogIn, Pencil, Pin, PinOff, Search } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { useAccesosRapidos, type Access } from "@/components/dashboard/widgets/quick-access-widget";
import { Rotulo, disenoDe } from "./comun";
import {
    CLAVE_ACCESOS, ESTADO_INICIAL, FIJADOS_DE_FABRICA, alternarFijado, coincide, fijadosDe, recientesDe, registrarUso, sugeridosDe,
    type EstadoAccesos,
} from "./accesos-partes";
import { Accion, escalaTipo, esTactil, haceCuanto, useClaseForzada, useDispositivo, useJSONLocal } from "./inicio-piezas";

const TURQUESA = "#23d5ab";
const VIOLETA = "#7c5cff";

/** Una cuenta de vidrio: el icono en blanco, el color del área como luz interior. */
function Cuenta({ a, tam, conNombre, onAbrir, editando, fijado, onFijar }: {
    a: Access; tam: number; conNombre?: boolean; onAbrir: (a: Access) => void; editando?: boolean; fijado?: boolean; onFijar?: (a: Access) => void;
}) {
    const Icon = a.icon;
    return (
        <div className="group relative flex min-w-0 flex-col items-center gap-1" style={{ width: tam + 22 }}>
            <Link href={a.href} onClick={() => onAbrir(a)} aria-label={a.label} title={a.label}
                className="ss-redondo relative grid cursor-pointer place-items-center rounded-full outline-none transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-teal-300/80 active:scale-95"
                style={{
                    width: tam, height: tam,
                    background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,.2), rgba(255,255,255,.04) 58%), radial-gradient(circle at 50% 115%, ${a.color}66, transparent 72%)`,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,${fijado && editando ? ".5" : ".18"}), inset 0 -${tam * 0.16}px ${tam * 0.42}px ${a.color}30, 0 10px 22px -12px ${a.color}aa`,
                }}>
                <Icon aria-hidden style={{ width: tam * 0.46, height: tam * 0.46, color: "rgba(255,255,255,.92)", strokeWidth: 1.75 }} />
            </Link>
            {conNombre && <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-white/75">{a.label}</span>}
            {editando && onFijar && (
                <button type="button" aria-pressed={!!fijado} aria-label={fijado ? `Soltar ${a.label}` : `Fijar ${a.label}`} onClick={() => onFijar(a)}
                    className="ss-redondo absolute -top-1 right-0 grid size-6 cursor-pointer place-items-center rounded-full outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-teal-300"
                    style={{ background: fijado ? TURQUESA : "rgba(15,18,40,.9)", boxShadow: `inset 0 0 0 1px ${fijado ? TURQUESA : "rgba(255,255,255,.3)"}`, color: fijado ? "#04201a" : "#fff" }}>
                    {fijado ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </button>
            )}
        </div>
    );
}

/** El sigilo del centro (micro). */
function Sigilo({ tam }: { tam: number }) {
    return (
        <span aria-hidden className="ss-respirar ss-redondo absolute left-1/2 top-1/2 block rounded-full" style={{
            width: tam, height: tam, marginLeft: -tam / 2, marginTop: -tam / 2,
            background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${VIOLETA} 45%, ${TURQUESA} 85%)`, boxShadow: `0 0 24px ${VIOLETA}66`,
        }} />
    );
}

export function AccesosLibre() {
    const { accesos, acciones, signedIn, ready } = useAccesosRapidos();
    const [estado, setEstado] = useJSONLocal<EstadoAccesos>(CLAVE_ACCESOS, ESTADO_INICIAL);
    const [editando, setEditando] = React.useState(false);
    const [consulta, setConsulta] = React.useState("");
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [estado]);

    const fijados = fijadosDe(accesos, estado);
    const recientes = recientesDe(accesos, estado, 4);
    const sugeridos = ahora ? sugeridosDe(accesos, estado, ahora, 4) : [];
    const abrir = (a: Access) => setEstado((e) => ({ ...e, uso: registrarUso(e.uso ?? {}, a.href, Date.now()) }));
    const fijar = (a: Access) => setEstado((e) => ({ ...e, fijados: alternarFijado(e.fijados, accesos.slice(0, FIJADOS_DE_FABRICA).map((x) => x.href), a.href) }));
    const hrefsFijados = new Set(fijados.map((a) => a.href));
    const cuenta = (a: Access, tam: number, conNombre = true) => (
        <Cuenta key={a.href + a.label} a={a} tam={tam} conNombre={conNombre} onAbrir={abrir} editando={editando} fijado={hrefsFijados.has(a.href)} onFijar={fijar} />
    );
    const entrar = !signedIn && ready ? (
        <Accion icono={LogIn} color={VIOLETA} href="/login" grande={tactil}>Entra para tus accesos</Accion>
    ) : null;
    const accionesCrear = acciones.map((a) => <Accion key={a.label} icono={a.icon} color={a.color} href={a.href} grande={tactil} onClick={() => abrir(a)}>{a.label}</Accion>);
    const listaRecientes = (max: number, conCuando = true) => recientes.length === 0 ? (
        <p className="text-[12px] leading-snug text-white/50">Lo que abras aparecerá aquí.</p>
    ) : (
        <ul className="flex min-w-0 flex-col gap-1">
            {recientes.slice(0, max).map(({ acceso: a, cuando }) => {
                const Icon = a.icon;
                return (
                    <li key={a.href}>
                        <Link href={a.href} onClick={() => abrir(a)} title={`${a.label} · ${haceCuanto(cuando, ahora || Date.now())}`} className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg py-0.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70">
                            <span aria-hidden className="ss-redondo grid size-6 shrink-0 place-items-center rounded-full" style={{ background: `${a.color}26`, boxShadow: `inset 0 0 0 1px ${a.color}55` }}><Icon className="size-3.5 text-white" /></span>
                            <span className="min-w-0 flex-1 truncate text-white/85 group-hover:text-white">{a.label}</span>
                            {conCuando && <span className="shrink-0 text-[11px] tabular-nums text-white/45">{haceCuanto(cuando, ahora || Date.now())}</span>}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <WidgetLibre forma="ninguna" acento={TURQUESA} acento2={VIOLETA} etiqueta={`Accesos rápidos: ${fijados.map((a) => a.label).join(", ")}`} intensidad={0.35}>
            {({ clase: medida, ancho, alto }) => {
                const clase = forzada ?? medida;
                const { base: b, horizontal } = disenoDe(clase);
                const lado = Math.min(ancho, alto);

                // ── micro: cuatro en cruz ──
                if (b === "micro") {
                    const cruz = fijados.slice(0, 4), r = lado * 0.31, tam = Math.max(28, lado * 0.26);
                    return (
                        <div className="relative h-full w-full" data-diseno="micro">
                            <Sigilo tam={lado * 0.2} />
                            {cruz.map((a, i) => (
                                <div key={a.href + a.label} className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%,-50%) translate(${[0, r, 0, -r][i]}px, ${[-r, 0, r, 0][i]}px)` }}>
                                    <Cuenta a={a} tam={tam} onAbrir={abrir} />
                                </div>
                            ))}
                        </div>
                    );
                }

                // ── s: cuatro fijados ──
                if (b === "s") {
                    const conNombre = lado >= 150;
                    const tam = Math.min(52, (lado - (conNombre ? 40 : 24)) / 2) * k;
                    return (
                        <div className="grid h-full w-full grid-cols-2 place-content-center place-items-center gap-x-1 gap-y-1.5" data-diseno="s">
                            {fijados.slice(0, 4).map((a) => cuenta(a, tam, conNombre))}
                        </div>
                    );
                }

                // ── panorámico: una fila ──
                if (clase === "panoramico" && horizontal) {
                    const tam = Math.min(alto * 0.46, 52) * k;
                    const caben = Math.max(3, Math.floor((ancho - 48) / (tam + 30)));
                    const nRec = recientes.length ? Math.min(3, Math.max(0, caben - fijados.length)) : 0;
                    return (
                        <div className="flex h-full w-full items-center justify-center gap-2 px-3" data-diseno="panoramico">
                            {fijados.slice(0, caben - nRec).map((a) => cuenta(a, tam))}
                            {nRec > 0 && <span aria-hidden className="mx-1 h-10 w-px bg-white/15" />}
                            {recientes.slice(0, nRec).map(({ acceso }) => cuenta(acceso, tam * 0.8))}
                        </div>
                    );
                }

                // ── torre: una columna con nombres ──
                if (clase === "torre") {
                    const filas = Math.max(3, Math.floor((alto - 60) / (tactil ? 48 : 40)));
                    const sobra = alto - 60 - Math.min(filas, fijados.length) * (tactil ? 48 : 40);
                    return (
                        <div className="flex h-full w-full flex-col gap-1 px-2 py-3" data-diseno="torre">
                            <Rotulo className="px-1">Fijados</Rotulo>
                            <ul className="flex min-w-0 flex-col gap-0.5">
                                {fijados.slice(0, filas).map((a) => {
                                    const Icon = a.icon;
                                    return (
                                        <li key={a.href + a.label}>
                                            <Link href={a.href} onClick={() => abrir(a)} className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-1 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-teal-300/70 ${tactil ? "min-h-11" : "py-1"}`}>
                                                <span aria-hidden className="ss-redondo grid size-8 shrink-0 place-items-center rounded-full" style={{ background: `radial-gradient(circle at 50% 115%, ${a.color}66, rgba(255,255,255,.06) 70%)`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }}><Icon className="size-4 text-white" /></span>
                                                <span className="min-w-0 truncate text-[13px] text-white/85">{a.label}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                            {recientes.length > 0 && sobra >= 110 && <div className="mt-2 flex flex-col gap-1.5 px-1"><Rotulo>Recientes</Rotulo>{listaRecientes(Math.min(3, Math.floor((sobra - 30) / 28)), false)}</div>}
                        </div>
                    );
                }

                // ── m ──
                if (b === "m") {
                    const apaisado = ancho >= alto * 1.3;
                    if (apaisado) {
                        const izq = Math.min(ancho * 0.54, alto * 1.2);
                        const tam = Math.min(50, (izq - 3 * 22) / 3, (alto - 60) / 2 - 16) * k;
                        return (
                            <div className="flex h-full w-full items-center gap-3 px-3" data-diseno="m-fila">
                                <div className="grid shrink-0 grid-cols-3 place-items-center gap-x-1 gap-y-2" style={{ width: izq }}>
                                    {fijados.slice(0, 6).map((a) => cuenta(a, tam))}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <Rotulo>Recientes</Rotulo>
                                    {listaRecientes(3, ancho - izq - 36 >= 170)}
                                    {entrar ?? <div className="flex flex-wrap gap-1.5">{accionesCrear.slice(0, 1)}</div>}
                                </div>
                            </div>
                        );
                    }
                    const conRec = recientes.length > 0 && alto >= 250;
                    const tam = Math.min(52, (ancho - 3 * 22 - 16) / 3, (alto - (conRec ? 90 : 40)) / 2 - 18) * k;
                    return (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2" data-diseno="m">
                            <div className="grid grid-cols-3 place-items-center gap-x-1 gap-y-2">{fijados.slice(0, 6).map((a) => cuenta(a, tam))}</div>
                            {conRec && (
                                <div className="flex items-center gap-2">
                                    <Rotulo>Recientes</Rotulo>
                                    {recientes.slice(0, 3).map(({ acceso }) => cuenta(acceso, 28, false))}
                                </div>
                            )}
                        </div>
                    );
                }

                // ── l / xl ──
                const buscar = b === "xl" || editando;
                const universo = consulta ? accesos.filter((a) => coincide(a.label, consulta)) : editando ? accesos : fijados;
                const cols = Math.max(3, Math.min(b === "xl" ? 7 : 6, Math.floor((ancho - 24) / 80)));
                const tam = Math.min(54, (ancho - 24) / cols - 30) * k;
                const filasRejilla = Math.max(1, Math.floor((alto - 150) / (tam + 34)));
                return (
                    <div className="flex h-full w-full flex-col gap-3 px-4 py-3" data-diseno={`${b}-${editando ? "editar" : "normal"}`}>
                        <div className="flex items-center justify-between gap-2">
                            <Rotulo>{editando ? "Elige tus fijados" : consulta ? `Resultados: ${universo.length}` : "Fijados"}</Rotulo>
                            <div className="flex items-center gap-2">
                                {buscar && (
                                    <label className="ss-redondo flex items-center gap-1.5 rounded-full px-2.5" style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }}>
                                        <Search aria-hidden className="size-3.5 text-white/50" />
                                        <input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar app…" aria-label="Buscar entre los accesos"
                                            onKeyDown={(e) => { if (e.key === "Escape") setConsulta(""); }}
                                            className={`w-28 bg-transparent text-white placeholder:text-white/40 focus:outline-none ${tactil ? "py-2.5 text-[14px]" : "py-1 text-[12px]"}`} />
                                    </label>
                                )}
                                <Accion icono={editando ? Check : Pencil} color={TURQUESA} grande={tactil} principal={editando} onClick={() => { setEditando((x) => !x); setConsulta(""); }}
                                    aria-label={editando ? "Terminar de elegir fijados" : "Elegir qué accesos se fijan"}>
                                    {editando ? "Listo" : "Editar"}
                                </Accion>
                            </div>
                        </div>
                        <div className="grid place-items-center gap-x-1 gap-y-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                            {universo.slice(0, editando || consulta ? cols * (filasRejilla + 1) : cols * filasRejilla).map((a) => cuenta(a, tam))}
                        </div>
                        {!editando && !consulta && b === "xl" && alto - (tam + 34) * filasRejilla - 260 >= tam && (
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Rotulo>Más apps</Rotulo>
                                <div className="grid place-items-center gap-x-1" style={{ gridTemplateColumns: `repeat(${cols + 1}, minmax(0, 1fr))` }}>
                                    {accesos.filter((a) => !hrefsFijados.has(a.href)).slice(0, cols + 1).map((a) => cuenta(a, tam * 0.78))}
                                </div>
                            </div>
                        )}
                        {!editando && !consulta && (
                            <div className="grid min-h-0 grid-cols-2 gap-4">
                                <div className="flex min-w-0 flex-col gap-1.5"><Rotulo>Recientes</Rotulo>{listaRecientes(b === "xl" ? 4 : 3)}</div>
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Rotulo>{sugeridos.length ? "Sueles abrir" : "Crear"}</Rotulo>
                                    <div className="flex flex-wrap gap-1.5">
                                        {sugeridos.length
                                            ? sugeridos.map((a) => <Accion key={a.href} icono={a.icon} color={a.color} href={a.href} grande={tactil} onClick={() => abrir(a)}>{a.label}</Accion>)
                                            : accionesCrear}
                                    </div>
                                </div>
                            </div>
                        )}
                        {!editando && (entrar || (sugeridos.length > 0 && accionesCrear.length > 0)) && (
                            <div className="mt-auto flex flex-wrap items-center gap-2">{entrar}{sugeridos.length > 0 && accionesCrear}</div>
                        )}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default AccesosLibre;
