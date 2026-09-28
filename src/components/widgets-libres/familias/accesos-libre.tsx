"use client";
/**
 * Accesos libres (Ola 383 · WL4) — una órbita. Los accesos giran despacio alrededor de un
 * núcleo con el sigilo de StarSeed y se detienen con el cursor o el foco (para poder
 * pulsarlos). micro = cuatro en cruz · s/m = un anillo · l/xl = dos anillos que giran en
 * sentidos opuestos, con nombre, y las acciones de crear debajo. Los enlaces son los MISMOS
 * que el widget clásico (`useAccesosRapidos`: curados + el OmniDock real).
 */
import * as React from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { trazoForma } from "@/lib/widgets/forma/formas";
import { useAccesosRapidos, type Access } from "@/components/dashboard/widgets/quick-access-widget";
import { disenoDe } from "./comun";

function Icono({ a, tam, conNombre }: { a: Access; tam: number; conNombre?: boolean }) {
    const Icon = a.icon;
    return (
        <Link href={a.href} aria-label={a.label} title={a.label}
            className="group flex cursor-pointer flex-col items-center gap-0.5 focus-visible:outline-none">
            <span className="grid place-items-center rounded-full ss-redondo transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110 group-focus-visible:ring-2"
                style={{ width: tam, height: tam, background: `radial-gradient(closest-side, ${a.color}66, ${a.color}14 80%, transparent)`, boxShadow: `0 0 ${tam / 2}px ${a.color}33`, ["--tw-ring-color" as string]: a.color }}>
                <Icon style={{ width: tam * 0.48, height: tam * 0.48, color: "#fff" }} />
            </span>
            {conNombre && <span className="max-w-[5.5rem] truncate text-[9px] font-medium text-white/75">{a.label}</span>}
        </Link>
    );
}

function Anillo({ items, radio, tam, dur, inverso, conNombre }: { items: Access[]; radio: number; tam: number; dur: string; inverso?: boolean; conNombre?: boolean }) {
    return (
        <div className={`${inverso ? "ss-contragirar" : "ss-girar"} absolute inset-0`} style={{ ["--ss-dur" as string]: dur }}>
            {items.map((a, i) => {
                const ang = (i / items.length) * 2 * Math.PI - Math.PI / 2;
                return (
                    <div key={a.href + a.label} className="absolute left-1/2 top-1/2"
                        style={{ transform: `translate(-50%,-50%) translate(${Math.cos(ang) * radio}px, ${Math.sin(ang) * radio}px)` }}>
                        <div className={inverso ? "ss-girar" : "ss-contragirar"} style={{ ["--ss-dur" as string]: dur }}>
                            <Icono a={a} tam={tam} conNombre={conNombre} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function AccesosLibre() {
    const { accesos, acciones, signedIn, ready } = useAccesosRapidos();
    const per = personalidadDe("QUICK_ACCESS");
    const idSigilo = `sigilo-${React.useId().replace(/:/g, "")}`;
    return (
        <WidgetLibre forma={per.forma} acento={per.acento} etiqueta="Accesos rápidos" intensidad={0.35}>
            {({ clase, ancho, alto }) => {
                const { base: b } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                const tam = Math.max(26, Math.min(46, lado * (b === "micro" ? 0.22 : 0.13)));
                const nucleo = lado * (b === "micro" ? 0.22 : 0.18);
                const sigilo = (
                    <svg aria-hidden width={nucleo} height={nucleo} className="ss-respirar" style={{ position: "absolute", left: -nucleo / 2, top: -nucleo / 2 }}>
                        <defs><radialGradient id={idSigilo}><stop offset="0%" stopColor="#fff" /><stop offset="60%" stopColor={per.acento} /><stop offset="100%" stopColor="#23d5ab" stopOpacity={0.4} /></radialGradient></defs>
                        <path d={trazoForma("estrella", nucleo, nucleo)} fill={`url(#${idSigilo})`} />
                    </svg>
                );
                if (b === "micro") {
                    const cruz = accesos.slice(0, 4), r = lado * 0.3;
                    return (
                        <div className="relative h-full w-full">
                            <div className="absolute left-1/2 top-1/2">{sigilo}</div>
                            {cruz.map((a, i) => (
                                <div key={a.href + a.label} className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%,-50%) translate(${[0, r, 0, -r][i]}px, ${[-r, 0, r, 0][i]}px)` }}>
                                    <Icono a={a} tam={tam} />
                                </div>
                            ))}
                        </div>
                    );
                }
                const doble = b === "l" || b === "xl";
                const interior = accesos.slice(0, doble ? 6 : b === "s" ? 6 : 8);
                const exterior = doble ? accesos.slice(6, b === "xl" ? 18 : 14) : [];
                const rInt = lado * (doble && exterior.length ? 0.24 : 0.36);
                return (
                    <div className="ss-pausable relative h-full w-full" aria-label="Accesos: pasa el cursor para detener la órbita">
                        <div className="absolute left-1/2 top-1/2">{sigilo}</div>
                        <Anillo items={interior} radio={rInt} tam={tam} dur="90s" conNombre={doble} />
                        {exterior.length > 0 && <Anillo items={exterior} radio={lado * 0.42} tam={tam * 0.85} dur="140s" inverso conNombre={b === "xl"} />}
                        {doble && (
                            <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-2">
                                {!signedIn && ready && (
                                    <Link href="/login" className="flex cursor-pointer items-center gap-1 rounded-full ss-redondo px-3 py-1 text-[10px] font-semibold text-violet-200" style={{ background: "radial-gradient(closest-side,#7c5cff55,#7c5cff10)" }}>
                                        <LogIn className="size-3" /> Entra para tus accesos
                                    </Link>
                                )}
                                {acciones.map((a) => {
                                    const Icon = a.icon;
                                    return (
                                        <Link key={a.label} href={a.href} className="flex cursor-pointer items-center gap-1 rounded-full ss-redondo px-3 py-1 text-[10px] font-semibold text-white" style={{ background: `radial-gradient(closest-side, ${a.color}55, ${a.color}10)` }}>
                                            <Icon className="size-3" /> {a.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default AccesosLibre;
