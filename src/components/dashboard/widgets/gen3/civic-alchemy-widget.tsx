'use client';

// ════════════════════════════════════════════════════════════════
// Alquimia cívica — de lo que te preocupa a una propuesta del Ágora (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: iniciativas y firmas inventadas y una «redacción IA» que era una plantilla. Ahora,
// todo lo que se ve es real y se dice lo que es: escribes lo que te preocupa, el widget
// arma un BORRADOR (plantilla, no IA) y lo abre ya relleno en Decisiones (/decisiones con
// `nueva=1`, el deep-link del motor) para que lo completes y lo envíes; y mientras escribes
// busca en las propuestas REALES del Ágora (misma lectura compartida, sin peticiones propias)
// las que se parecen, para sumarte en vez de duplicar. Invariante (§3): soberanía directa.
//
//   micro      → el matraz: abrir una propuesta nueva.
//   s          → una línea para escribir y «Convertir».
//   m          → + ámbito y cuántas parecidas hay.
//   panorámico → escribir a la izquierda, parecidas a la derecha.   torre → en columna.
//   l          → + el borrador a la vista y las parecidas con su estado.
//   xl         → escritura, borrador y parecidas completas, con cómo sigue el proceso.
// Estados honestos: cargando el Ágora, error del Ágora (se puede proponer igual) y vacío
// (sin parecidas: «nadie lo ha propuesto aún»).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FlaskConical, Send, Users, Vote } from "lucide-react";
import { WidgetShell, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { buildProposalLink } from "@/lib/governance/links";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { cargarAgora, colorEstado, etiquetaEstado, tiempoDe, type DatosAgora, type PropuestaViva } from "../gen2/_paquete-b/datos-civicos";
import { parecidas, redactar } from "../gen2/_paquete-b/alquimia";
import { AccionB, PestanasB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };
type Ambito = "global" | "community";

export function enlacePropuesta(queja: string, ambito: Ambito): string {
    const { titulo, descripcion } = redactar(queja);
    return buildProposalLink("", { scope: ambito, title: titulo, description: descripcion });
}

export function CivicAlchemyWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const cargar = useCallback(() => cargarAgora(uid), [uid]);
    const agora = useDatoCompartido<DatosAgora>(ready ? `agora.v1.${uid ?? "anon"}` : null, cargar);
    return (
        <WidgetShell title="Alquimia cívica" subtitle="De la queja a la propuesta" icon={FlaskConical} bare={marco?.base === "micro"}>
            {(size) => <Cuerpo size={size} agora={agora} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, agora }: { size: ElementSize; agora: ResultadoDato<DatosAgora> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const [queja, setQueja] = useState("");
    const [ambito, setAmbito] = useState<Ambito>("global");
    const lista = useMemo(() => (queja.trim().length >= 4 && agora.dato ? parecidas(queja, agora.dato.propuestas, 4) : []), [queja, agora.dato]);
    const id = useId().replace(/:/g, "");
    const b = lienzo.base;
    const listo = queja.trim().length >= 8;
    const href = listo ? enlacePropuesta(queja, ambito) : "/decisiones?nueva=1";

    let contenido: ReactNode;
    if (b === "micro") {
        contenido = (
            <Link href="/decisiones?nueva=1" aria-label="Abrir una propuesta nueva en Decisiones" className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <Matraz lado={64} lienzo={lienzo} />
            </Link>
        );
    } else {
        const campo = (filas: number) => (
            <label htmlFor={`${id}-q`} className="flex min-h-0 flex-col gap-1">
                <RotuloB>¿Qué te preocupa?</RotuloB>
                <textarea id={`${id}-q`} value={queja} onChange={(e) => setQueja(e.target.value)} rows={filas} maxLength={600}
                    placeholder="Por ejemplo: la plaza no tiene sombra en verano y los mayores no pueden estar"
                    className={cn(estilosB.foco, "w-full resize-none rounded-[14px] bg-white/[0.06] px-3 py-2 text-[13px] leading-snug text-white outline-none placeholder:text-white/35")} />
            </label>
        );
        const ambitos = (
            <PestanasB etiqueta="Ámbito" valor={ambito} onCambio={setAmbito} color={lienzo.acento} tactil={lienzo.tactil}
                opciones={[{ id: "global", etiqueta: "Toda la red" }, { id: "community", etiqueta: "Mi comunidad" }]} />
        );
        const convertir = (
            <AccionB href={href} icono={Send} color={lienzo.acento} tono="llena" tactil={lienzo.tactil} disabled={!listo}
                titulo={listo ? "Se abre en Decisiones, ya rellena, para que la completes y la envíes" : "Escribe al menos una frase"}>
                {listo ? "Convertir en propuesta" : "Escribe tu preocupación"}
            </AccionB>
        );
        const estadoAgora = !agora.dato
            ? agora.estado === "error"
                ? <p className="text-[11px] text-amber-200/80" role="status">No se pudo mirar el Ágora ahora; puedes proponer igual.</p>
                : <p className="text-[11px] text-white/45" role="status">Mirando el Ágora…</p>
            : null;
        const parecidasNodo = (max: number) => estadoAgora ?? (
            queja.trim().length < 4 ? <p className="text-[11px] text-white/50">Mientras escribes, busco propuestas parecidas en el Ágora.</p>
                : lista.length === 0 ? <p className="text-[11px] text-white/60" role="status">Nadie lo ha propuesto aún: puede ser la primera.</p>
                    : (
                        <div className="flex min-h-0 flex-col gap-1">
                            <RotuloB>Parecidas en el Ágora · súmate</RotuloB>
                            <ul className="flex flex-col gap-0.5" aria-label="Propuestas parecidas">
                                {lista.slice(0, max).map(({ p, comunes }) => <Parecida key={p.id} p={p} comunes={comunes} lienzo={lienzo} />)}
                            </ul>
                        </div>
                    )
        );
        const borrador = listo && (() => {
            const r = redactar(queja);
            return (
                <div className="flex flex-col gap-0.5 border-l-2 pl-2.5" style={{ borderColor: lienzo.acento }}>
                    <RotuloB>Borrador (plantilla, lo completas tú)</RotuloB>
                    <p className="text-[13px] font-semibold leading-snug text-white line-clamp-2" title={r.titulo}>{r.titulo}</p>
                </div>
            );
        })();
        if (b === "s") {
            contenido = <div className="flex h-full min-h-0 flex-col gap-2">{campo(2)}<div className="mt-auto">{convertir}</div></div>;
        } else if (lienzo.clase === "panoramico") {
            contenido = (
                <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
                    <div className="flex min-h-0 flex-col gap-2">{campo(2)}{convertir}</div>
                    <div className="min-h-0 border-l border-white/[0.08] pl-4">{parecidasNodo(2)}</div>
                </div>
            );
        } else if (b === "m" && lienzo.clase !== "torre") {
            contenido = (
                <div className="flex h-full min-h-0 flex-col gap-2">
                    {campo(2)}
                    {ambitos}
                    <p className="text-[11px] text-white/55" role="status">{estadoAgora ? (agora.estado === "error" ? "Ágora no disponible" : "Mirando el Ágora…") : queja.trim().length < 4 ? "" : lista.length ? `${lista.length} parecidas en el Ágora` : "Nadie lo ha propuesto aún"}</p>
                    <div className="mt-auto">{convertir}</div>
                </div>
            );
        } else if (lienzo.clase === "torre" || b === "l") {
            contenido = (
                <div className="flex h-full min-h-0 flex-col gap-2.5">
                    {campo(3)}
                    {ambitos}
                    {borrador}
                    {parecidasNodo(3)}
                    <div className="mt-auto">{convertir}</div>
                </div>
            );
        } else {
            contenido = (
                <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)" }}>
                    <div className="flex min-h-0 flex-col gap-2.5">
                        {campo(5)}
                        {ambitos}
                        {borrador}
                        <div className="mt-auto">{convertir}</div>
                    </div>
                    <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                        {parecidasNodo(4)}
                        <ol className="flex flex-col gap-1 text-[11px] text-white/60" aria-label="Cómo sigue">
                            <li className="flex gap-2"><Send className="mt-0.5 size-3.5 shrink-0" aria-hidden />La completas y la envías en Decisiones.</li>
                            <li className="flex gap-2"><Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />Quienes forman el ámbito reciben el aviso.</li>
                            <li className="flex gap-2"><Vote className="mt-0.5 size-3.5 shrink-0" aria-hidden />Se vota con quórum y umbral; si se aprueba, pasa al Ejecutivo.</li>
                        </ol>
                    </div>
                </div>
            );
        }
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Parecida({ p, comunes, lienzo }: { p: PropuestaViva; comunes: string[]; lienzo: LienzoB }) {
    const color = colorEstado(p.estado);
    const t = tiempoDe(p, Date.now());
    return (
        <li>
            <Link href="/network/politics" className={cn(estilosB.foco, estilosB.fila, "flex items-center gap-2 rounded-[10px] px-1.5 py-1", lienzo.tactil && "min-h-11")}
                aria-label={`${p.titulo}. ${etiquetaEstado(p.estado)}. Coincide en: ${comunes.join(", ")}`}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-white/85 line-clamp-1" title={p.titulo}>{p.titulo}</span>
                    <span className="block text-[10px]" style={{ color: tintaB(color, 0.3) }}>{p.estado === "open" ? `en votación · quedan ${t.texto}` : etiquetaEstado(p.estado)} · {comunes.slice(0, 3).join(", ")}</span>
                </span>
            </Link>
        </li>
    );
}

/** El matraz de la alquimia: la queja se vuelve propuesta. */
function Matraz({ lado, lienzo }: { lado: number; lienzo: LienzoB }) {
    const id = useId().replace(/:/g, "");
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg width={lado} height={lado} viewBox="0 0 60 60" aria-hidden className="overflow-visible">
            <defs>
                <linearGradient id={`l${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lienzo.acento2} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={lienzo.acento} />
                </linearGradient>
            </defs>
            <path d="M24 8h12M26 8v14L13 46a5 5 0 0 0 4.4 7.4h25.2A5 5 0 0 0 47 46L34 22V8" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.6} strokeLinejoin="round" />
            <path d="M18.5 38h23l5 8.8a3.6 3.6 0 0 1-3.2 5.2H16.7a3.6 3.6 0 0 1-3.2-5.2Z" fill={`url(#l${id})`} opacity={0.9} />
            {[0, 1, 2].map((i) => (
                <circle key={i} cx={24 + i * 6} cy={44 - i * 3} r={1.6 + (i % 2)} fill="#fff" opacity={0.7} className={vivo ? estilosB.latido : undefined} style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
            <circle cx={30} cy={30} r={28} fill="none" stroke={lienzo.acento} strokeOpacity={0.15} />
        </svg>
    );
}
