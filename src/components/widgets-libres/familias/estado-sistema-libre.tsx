"use client";
/**
 * Estado del sistema libre (Ola 383 · WL5) — ondas que se llenan. El nivel del líquido es un
 * dato REAL de esta neurona: batería, memoria de la pestaña y red (lo que el navegador deja
 * medir; lo que no, dice «sin dato»), más la sincronización de la cuenta y las neuronas en
 * línea (las mismas fuentes que el widget clásico). No usa la telemetría de ejemplo
 * `system.node`. micro = el dato principal en una gota · m = tres ondas · l/xl = + su estela.
 * Color según la salud: verde Horizon, ámbar Logic, carmesí Anchor.
 */
import * as React from "react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { trazoForma } from "@/lib/widgets/forma/formas";
import { getRealtimeSyncStatus, onRealtimeSyncStatus, type RealtimeSyncStatus } from "@/lib/sync/realtime-sync";
import { listNeurons } from "@/lib/neurons/neurons";
import { Rotulo, colorSalud, disenoDe } from "./comun";

export interface Metrica { clave: "bateria" | "memoria" | "red"; nombre: string; nivel: number | null; detalle: string }

const SYNC: Record<string, string> = { connected: "sincronizada", connecting: "conectando", idle: "en espera", error: "error de sincronía", disabled: "sincronía apagada", "no-session": "sin sesión" };

export function saludDe(sync: RealtimeSyncStatus["state"] | undefined, bateria: number | null): "bien" | "atencion" | "mal" {
    if (sync === "error" || (bateria !== null && bateria < 0.15)) return "mal";
    if (sync === "connecting" || (bateria !== null && bateria < 0.3)) return "atencion";
    return "bien";
}

function useSenales() {
    const [m, setM] = React.useState<Metrica[]>([]);
    const [sync, setSync] = React.useState<RealtimeSyncStatus | null>(null);
    const [neuronas, setNeuronas] = React.useState<{ en: number; total: number } | null>(null);
    const [estela, setEstela] = React.useState<number[]>([]);
    React.useEffect(() => {
        let vivo = true, bat: { level: number; charging: boolean } | null = null;
        const nav = navigator as Navigator & { getBattery?: () => Promise<any>; connection?: { downlink?: number; effectiveType?: string } };
        nav.getBattery?.().then((b) => { bat = b; medir(); }).catch(() => { /* sin API */ });
        const medir = () => {
            if (!vivo) return;
            const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
            const down = nav.connection?.downlink;
            const lista: Metrica[] = [
                { clave: "bateria", nombre: "Batería", nivel: bat ? bat.level : null, detalle: bat ? `${Math.round(bat.level * 100)} %${bat.charging ? " · cargando" : ""}` : "sin dato" },
                { clave: "memoria", nombre: "Memoria", nivel: mem ? mem.usedJSHeapSize / mem.jsHeapSizeLimit : null, detalle: mem ? `${Math.round(mem.usedJSHeapSize / 1048576)} MB de la pestaña` : "sin dato" },
                { clave: "red", nombre: "Red", nivel: !navigator.onLine ? 0 : typeof down === "number" ? Math.min(1, down / 10) : null, detalle: !navigator.onLine ? "sin conexión" : typeof down === "number" ? `${down} Mbps · ${nav.connection?.effectiveType ?? ""}` : "en línea" },
            ];
            setM(lista);
            const principal = lista.find((x) => x.nivel !== null)?.nivel;
            if (typeof principal === "number") setEstela((e) => [...e.slice(-23), principal]);
        };
        medir();
        const id = window.setInterval(medir, 5000);
        setSync(getRealtimeSyncStatus());
        const off = onRealtimeSyncStatus(setSync);
        const leerNeuronas = () => listNeurons().then((ns) => vivo && setNeuronas({ en: ns.filter((n) => n.online).length, total: ns.length })).catch(() => vivo && setNeuronas(null));
        leerNeuronas();
        const idN = window.setInterval(leerNeuronas, 30_000);
        return () => { vivo = false; window.clearInterval(id); window.clearInterval(idN); off(); };
    }, []);
    return { m, sync, neuronas, estela };
}

function Liquido({ met, color, tam, forma }: { met: Metrica; color: string; tam: number; forma?: "gota" }) {
    const nivel = met.nivel ?? 0;
    const clip = forma ? `path("${trazoForma("gota", tam, tam)}")` : undefined;
    return (
        <div className="flex flex-col items-center gap-1" role="meter" aria-label={`${met.nombre}: ${met.detalle}`} aria-valuenow={met.nivel === null ? undefined : Math.round(nivel * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`relative overflow-hidden ${forma ? "" : "rounded-full"}`} style={{ width: tam, height: tam, clipPath: clip, background: `radial-gradient(closest-side, ${color}14, transparent)` }}>
                <div className="absolute left-0 w-[200%] transition-[top] duration-700" style={{ top: `${(1 - nivel) * 100}%`, height: "110%" }}>
                    <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="ss-ola h-3 w-full" style={{ ["--ss-dur" as string]: "6s" }}>
                        <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z" fill={color} fillOpacity={0.55} />
                    </svg>
                    <div className="h-full w-full" style={{ background: `linear-gradient(${color}88, ${color}33)` }} />
                </div>
                <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-white">{met.nivel === null ? "—" : `${Math.round(nivel * 100)}%`}</span>
            </div>
            <Rotulo>{met.nombre}</Rotulo>
        </div>
    );
}

export function EstadoSistemaLibre() {
    const { m, sync, neuronas, estela } = useSenales();
    const per = personalidadDe("SYSTEM_STATUS");
    const bat = m.find((x) => x.clave === "bateria")?.nivel ?? null;
    const color = colorSalud(saludDe(sync?.state, bat));
    const principal = m.find((x) => x.nivel !== null) ?? m[0];
    return (
        <WidgetLibre forma={per.forma} acento={color} etiqueta="Estado del sistema" intensidad={0.4}>
            {({ clase, ancho, alto }) => {
                const { base: b, horizontal } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                if (!principal) return null;
                if (b === "micro") return <div className="flex h-full items-center justify-center"><Liquido met={principal} color={color} tam={lado * 0.7} forma="gota" /></div>;
                const linea = (
                    <span className="text-[10px] text-white/70">
                        {SYNC[sync?.state ?? "idle"] ?? "sin dato"} · {neuronas ? `${neuronas.en}/${neuronas.total} neuronas en línea` : "neuronas: sin dato"}
                    </span>
                );
                if (b === "s") return <div className="flex h-full flex-col items-center justify-center gap-1"><Liquido met={principal} color={color} tam={lado * 0.55} />{linea}</div>;
                const tam = Math.max(44, Math.min(96, (horizontal ? ancho / 4 : lado / 3.2)));
                return (
                    <div className="flex h-full flex-col items-center justify-center gap-2">
                        <div className="flex items-end gap-4">{m.map((x) => <Liquido key={x.clave} met={x} color={x.nivel === null ? "#64748b" : color} tam={tam} />)}</div>
                        {linea}
                        {(b === "l" || b === "xl") && estela.length > 1 && (
                            <svg aria-label={`Estela de ${principal.nombre.toLowerCase()}`} viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-3/4">
                                <polyline fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.8}
                                    points={estela.map((v, i) => `${(i / (estela.length - 1)) * 100},${20 - v * 18 - 1}`).join(" ")} />
                            </svg>
                        )}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default EstadoSistemaLibre;
