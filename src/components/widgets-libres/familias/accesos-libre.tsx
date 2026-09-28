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
import { useAccesosRapidos, type Access } from "@/components/dashboard/widgets/quick-access-widget";
import { disenoDe } from "./comun";

/** Cuenta de vidrio: el icono en blanco, el color del área solo como brillo interior. Nombre al
 *  pasar el cursor o con el foco. */
function Icono({ a, tam, conNombre }: { a: Access; tam: number; conNombre?: boolean }) {
    const Icon = a.icon;
    return (
        <Link href={a.href} aria-label={a.label}
            className="group relative flex cursor-pointer flex-col items-center gap-1 focus-visible:outline-none">
            <span className="ss-redondo grid place-items-center rounded-full transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110"
                style={{ width: tam, height: tam, background: "rgba(255,255,255,.07)", boxShadow: `inset 0 0 0 1px rgba(255,255,255,.22), inset 0 0 ${tam * 0.45}px ${a.color}40` }}>
                <Icon style={{ width: tam * 0.5, height: tam * 0.5, color: "rgba(255,255,255,.85)", strokeWidth: 1.75 }} />
            </span>
            {conNombre
                ? <span className="max-w-[5.5rem] truncate text-[10px] font-medium text-white/70">{a.label}</span>
                : <span className="ss-redondo pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{a.label}</span>}
        </Link>
    );
}

function Anillo({ items, radio, tam, dur, inverso, conNombre }: { items: Access[]; radio: number; tam: number; dur: string; inverso?: boolean; conNombre?: boolean }) {
    return (
        <div className={`${inverso ? "ss-contragirar" : "ss-girar"} absolute inset-0`} style={{ ["--ss-dur" as string]: dur }}>
            <span aria-hidden className="ss-redondo pointer-events-none absolute left-1/2 top-1/2 rounded-full" style={{ width: radio * 2, height: radio * 2, transform: "translate(-50%,-50%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)" }} />
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
    return (
        <WidgetLibre forma="ninguna" acento="#23d5ab" acento2="#7c5cff" etiqueta="Accesos rápidos" intensidad={0.35}>
            {({ clase, ancho, alto }) => {
                const { base: b } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                const tam = Math.max(32, Math.min(46, lado * (b === "micro" ? 0.24 : 0.18)));
                const nucleo = lado * (b === "micro" ? 0.2 : 0.26);
                const sigilo = (
                    <span aria-hidden className="ss-respirar ss-redondo block rounded-full" style={{ position: "absolute", left: -nucleo / 2, top: -nucleo / 2, width: nucleo, height: nucleo,
                        background: "radial-gradient(circle at 35% 30%, #ffffffcc, #7c5cff 45%, #23d5ab 85%)", boxShadow: "0 0 24px #7c5cff66" }} />
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
