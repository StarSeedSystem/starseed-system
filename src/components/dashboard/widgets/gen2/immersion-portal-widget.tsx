'use client';

// ════════════════════════════════════════════════════════════════
// Portales de inmersión — las puertas REALES del OS al espacio 3D, VR y AR (Ola 0929).
// ----------------------------------------------------------------
// Antes: cuatro «mundos» inventados con gente conectada de mentira. Ahora, los espacios
// que EXISTEN en el OS (mismas rutas que el catálogo de apps): Espacio inmersivo
// (/immersive), Hub 3D de tu red (/xr), Salas XR compartidas (/sala-xr), Escenas 3D
// colaborativas (/escena) y el Mundo de los avatares (/mundo-avatares). Y lo que de
// verdad puede ESTE dispositivo: WebXR VR/AR, WebGL2 y WebGPU, comprobado en el navegador
// sin red. El último portal que abriste queda primero (preferencia de este dispositivo).
// Ciberdelia (§3): tecnología para expandir la conciencia, nunca para vigilar.
//
//   micro      → la puerta de tu último portal.
//   s          → esa puerta en grande con lo que tu visor permite.
//   m          → tres portales con su puerta y para qué sirven.
//   panorámico → todas las puertas en fila.   torre → en columna.
//   l          → cuadrícula de portales con descripción y capacidades del dispositivo.
//   xl         → el portal destacado, el resto en lista y la ficha de capacidades.
// Estados: cargando (comprobando el visor), error del visor dicho como «sin dato»; no hay
// estado vacío posible porque los portales son rutas del propio OS.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import Link from "next/link";
import { Orbit, Glasses, Network, Box, Smile, Check, Minus, type LucideIcon } from "lucide-react";
import { WidgetShell, useMarcoUnificado, type ElementSize } from "../../kit";
import { cn } from "@/lib/utils";
import { RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#d946ef", acento2: "#23d5ab" };
const CLAVE_ULTIMO = "starseed.portales.ultimo.v1";

export interface Portal { id: string; nombre: string; ruta: string; para: string; icono: LucideIcon; color: string; xr?: boolean }

export const PORTALES: Portal[] = [
    { id: "immersive", nombre: "Espacio inmersivo", ruta: "/immersive", para: "VR y AR con geometría sagrada y portales a las apps.", icono: Orbit, color: "#a855f7", xr: true },
    { id: "xr", nombre: "Hub 3D", ruta: "/xr", para: "Tu red real en 3D: cerebros, memorias, páginas y grupos.", icono: Network, color: "#22d3ee", xr: true },
    { id: "sala-xr", nombre: "Salas XR", ruta: "/sala-xr", para: "Realidad virtual o aumentada compartida; sin visor, en 3D.", icono: Glasses, color: "#f43f5e", xr: true },
    { id: "escena", nombre: "Escenas 3D", ruta: "/escena", para: "Objetos, luces y avatares que todos editan a la vez.", icono: Box, color: "#f97316" },
    { id: "mundo-avatares", nombre: "Mundo de los avatares", ruta: "/mundo-avatares", para: "La red viva: cada avatar con su gesto y su personalidad.", icono: Smile, color: "#ec4899" },
];

export interface Capacidades { vr: boolean | null; ar: boolean | null; webgl2: boolean; webgpu: boolean }

let capacidadesEnVuelo: Promise<Capacidades> | null = null;
/** Lo que este navegador permite (una sola comprobación por página, sin red). */
export function comprobarCapacidades(): Promise<Capacidades> {
    if (capacidadesEnVuelo) return capacidadesEnVuelo;
    capacidadesEnVuelo = (async () => {
        const nav = navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> }; gpu?: unknown };
        let webgl2 = false;
        try { webgl2 = !!document.createElement("canvas").getContext("webgl2"); } catch { /* sin WebGL */ }
        const soporta = async (modo: string): Promise<boolean | null> => {
            try { return nav.xr?.isSessionSupported ? await nav.xr.isSessionSupported(modo) : false; } catch { return null; }
        };
        const [vr, ar] = await Promise.all([soporta("immersive-vr"), soporta("immersive-ar")]);
        return { vr, ar, webgl2, webgpu: !!nav.gpu };
    })();
    return capacidadesEnVuelo;
}

/** Qué puede hacer un portal en este dispositivo, en palabras. PURO. */
export function modoPortal(p: Pick<Portal, "xr">, c: Capacidades | null): string {
    if (!c) return "comprobando el visor…";
    if (p.xr && c.vr) return "listo para VR";
    if (p.xr && c.ar) return "listo para AR";
    return c.webgl2 ? "en 3D en la pantalla" : "en 2D (sin WebGL2)";
}

function useUltimo(): [string | null, (id: string) => void] {
    const [u, setU] = useState<string | null>(null);
    useEffect(() => { try { setU(localStorage.getItem(CLAVE_ULTIMO)); } catch { /* */ } }, []);
    const marcar = useCallback((id: string) => { setU(id); try { localStorage.setItem(CLAVE_ULTIMO, id); } catch { /* */ } }, []);
    return [u, marcar];
}

export function ImmersionPortalWidget() {
    const marco = useMarcoUnificado();
    const [capacidades, setCapacidades] = useState<Capacidades | null>(null);
    useEffect(() => {
        let vivo = true;
        comprobarCapacidades().then((c) => { if (vivo) setCapacidades(c); }).catch(() => { if (vivo) setCapacidades({ vr: null, ar: null, webgl2: false, webgpu: false }); });
        return () => { vivo = false; };
    }, []);
    const [ultimo, marcar] = useUltimo();
    return (
        <WidgetShell title="Portales de inmersión" subtitle="3D · VR · AR del OS" icon={Orbit} bare={marco?.base === "micro"}>
            {(size) => <Cuerpo size={size} c={capacidades} ultimo={ultimo} marcar={marcar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, c, ultimo, marcar }: { size: ElementSize; c: Capacidades | null; ultimo: string | null; marcar: (id: string) => void }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const orden = [...PORTALES].sort((a, b) => Number(b.id === ultimo) - Number(a.id === ultimo));
    const primero = orden[0];
    const b = lienzo.base;

    const puerta = (p: Portal, lado: number, conTexto: "nada" | "nombre" | "todo", clase?: string) => (
        <Link key={p.id} href={p.ruta} onClick={() => marcar(p.id)} title={p.para}
            aria-label={`${p.nombre}: ${p.para} Se abre ${modoPortal(p, c)}.`}
            className={cn(estilosB.foco, estilosB.fila, "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[16px] p-1", clase)}>
            <Puerta p={p} lado={lado} lienzo={lienzo} />
            {conTexto !== "nada" && (
                <span className="min-w-0 flex-1">
                    <span className={cn("block font-semibold leading-snug text-white/90 line-clamp-1", lienzo.tv ? "text-[16px]" : "text-[13px]")}>{p.nombre}</span>
                    {conTexto === "todo" && <span className="block text-[11px] leading-snug text-white/55 line-clamp-2">{p.para}</span>}
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: tintaB(p.color, 0.35) }} title={modoPortal(p, c)}>{modoPortal(p, c)}</span>
                </span>
            )}
        </Link>
    );

    let contenido;
    if (b === "micro") {
        contenido = (
            <Link href={primero.ruta} onClick={() => marcar(primero.id)} aria-label={`Abrir ${primero.nombre}`} title={primero.nombre} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <Puerta p={primero} lado={72} lienzo={lienzo} />
            </Link>
        );
    } else if (b === "s") {
        contenido = (
            <Link href={primero.ruta} onClick={() => marcar(primero.id)} aria-label={`${primero.nombre}: ${primero.para}`} className={cn(estilosB.foco, "flex h-full flex-col items-center justify-center gap-1.5 rounded-[16px] text-center")}>
                <Puerta p={primero} lado={Math.max(44, Math.min(84, (size.height || 160) - (size.height >= 150 ? 64 : 40)))} lienzo={lienzo} />
                <span className="line-clamp-1 text-[13px] font-semibold text-white">{primero.nombre}</span>
                {size.height >= 150 && <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: tintaB(primero.color, 0.35) }}>{modoPortal(primero, c)}</span>}
            </Link>
        );
    } else if (lienzo.clase === "panoramico") {
        const n = Math.max(3, Math.min(5, Math.floor(size.width / 130)));
        const lado = Math.max(44, Math.min(84, size.height - 90));
        contenido = (
            <div className="grid h-full items-center gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                {orden.slice(0, n).map((p) => (
                    <Link key={p.id} href={p.ruta} onClick={() => marcar(p.id)} aria-label={`${p.nombre}: ${p.para}`} title={p.para}
                        className={cn(estilosB.foco, estilosB.fila, "flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-[16px] p-1 text-center")}>
                        <Puerta p={p} lado={lado} lienzo={lienzo} />
                        <span className="text-[12px] font-semibold leading-snug text-white/90 line-clamp-2">{p.nombre}</span>
                    </Link>
                ))}
            </div>
        );
    } else if (b === "m" && lienzo.clase !== "torre") {
        contenido = <div className="flex h-full min-h-0 flex-col gap-1">{orden.slice(0, 3).map((p) => puerta(p, 40, "nombre"))}</div>;
    } else if (lienzo.clase === "torre") {
        contenido = <PilaAjustable niveles={PORTALES.length} className="gap-1">{orden.map((p, i) => i === 0 ? puerta(p, 44, "todo") : <Prescindible key={p.id} nivel={orden.length - i}>{puerta(p, 44, "todo")}</Prescindible>)}</PilaAjustable>;
    } else if (b === "l") {
        contenido = (
            // Dos columnas con descripción solo si hay ancho; lo que no cabe se retira (la ficha del
            // dispositivo, luego los últimos portales) en vez de montarse sobre «Este dispositivo».
            <PilaAjustable niveles={3} className="gap-2">
                <div className={cn("grid shrink-0 gap-1", size.width >= 440 ? "grid-cols-2" : "grid-cols-1")}>
                    {orden.slice(0, 4).map((p, i) => i < 2 ? puerta(p, 46, size.width >= 440 ? "todo" : "nombre") : <Prescindible key={p.id} nivel={i === 3 ? 2 : 3}>{puerta(p, 46, size.width >= 440 ? "todo" : "nombre")}</Prescindible>)}
                </div>
                <Prescindible nivel={1}><div className="mt-auto shrink-0"><FichaCapacidades c={c} /></div></Prescindible>
            </PilaAjustable>
        );
    } else {
        contenido = (
            <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>
                <Link href={primero.ruta} onClick={() => marcar(primero.id)} aria-label={`${primero.nombre}: ${primero.para}`}
                    className={cn(estilosB.foco, "flex min-h-0 flex-col items-center justify-center gap-2 rounded-[20px] text-center")}>
                    <Puerta p={primero} lado={lienzo.tv ? 190 : 150} lienzo={lienzo} />
                    <RotuloB>{ultimo ? "Volver a" : "Empieza por"}</RotuloB>
                    <span className="text-[18px] font-semibold text-white">{primero.nombre}</span>
                    <span className="max-w-[26ch] text-[12px] text-white/60">{primero.para}</span>
                </Link>
                <PilaAjustable niveles={4} className="gap-2 border-l border-white/[0.08] pl-4">
                    <div className="flex shrink-0 flex-col gap-0.5">{orden.slice(1).map((p, i, arr) => i === 0 ? puerta(p, 40, "todo") : <Prescindible key={p.id} nivel={arr.length - i + 1}>{puerta(p, 40, "todo")}</Prescindible>)}</div>
                    <Prescindible nivel={1}><div className="mt-auto shrink-0"><FichaCapacidades c={c} /></div></Prescindible>
                </PilaAjustable>
            </div>
        );
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function FichaCapacidades({ c }: { c: Capacidades | null }) {
    const filas: [string, boolean | null][] = c
        ? [["VR", c.vr], ["AR", c.ar], ["WebGL2", c.webgl2], ["WebGPU", c.webgpu]]
        : [];
    return (
        <div className="flex flex-col gap-1">
            <RotuloB>Este dispositivo</RotuloB>
            {!c ? <p className="text-[11px] text-white/50">Comprobando el visor…</p> : (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-label="Capacidades de este dispositivo">
                    {filas.map(([k, v]) => (
                        <li key={k} className="inline-flex items-center gap-1" title={v === null ? "sin dato" : v ? "disponible" : "no disponible"}>
                            {v ? <Check className="size-3.5 text-emerald-300" aria-hidden /> : <Minus className="size-3.5 text-white/35" aria-hidden />}
                            <span className={v ? "text-white/85" : "text-white/45"}>{k}{v === null ? " (sin dato)" : ""}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** La puerta: un anillo de luz con su remolino interior y el símbolo del espacio. */
function Puerta({ p, lado, lienzo }: { p: Portal; lado: number; lienzo: LienzoB }) {
    const id = useId().replace(/:/g, "");
    const Icono = p.icono;
    const vivo = lienzo.nivel !== "ligero";
    return (
        <span className="relative grid shrink-0 place-items-center" style={{ width: lado, height: lado }} aria-hidden>
            <svg width={lado} height={lado} viewBox="0 0 100 100" className="absolute inset-0 overflow-visible">
                <defs>
                    <radialGradient id={`f${id}`} cx="50%" cy="45%" r="55%">
                        <stop offset="0%" stopColor="#0b1020" />
                        <stop offset="55%" stopColor={p.color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={p.color} stopOpacity={0.9} />
                    </radialGradient>
                    <linearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={tintaB(p.color, 0.6)} />
                        <stop offset="100%" stopColor={lienzo.acento2} />
                    </linearGradient>
                </defs>
                <ellipse cx={50} cy={52} rx={38} ry={44} fill={`url(#f${id})`} />
                <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: "24s" }}>
                    <ellipse cx={50} cy={52} rx={30} ry={35} fill="none" stroke={tintaB(p.color, 0.4)} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="3 7" />
                </g>
                <ellipse cx={50} cy={52} rx={40} ry={46} fill="none" stroke={`url(#a${id})`} strokeWidth={3} />
                <ellipse cx={37} cy={24} rx={9} ry={3} fill="#fff" fillOpacity={0.25} transform="rotate(-25 37 24)" />
            </svg>
            <Icono className="relative" style={{ width: lado * 0.3, height: lado * 0.3, color: tintaB(p.color, 0.6) }} />
        </span>
    );
}
