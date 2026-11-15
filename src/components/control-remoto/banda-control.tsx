"use client";

/**
 * Control entre mis neuronas · la banda visible y el permiso de ESTE aparato (ORD1114P · contrato
 * control-remoto-entre-neuronas §2.4 y permisos-y-control-del-dispositivo §5).
 *
 * `BandaControl` (montada en el layout): mientras otra neurona opera esta, una banda fija dice quién y
 * con qué nivel; un toque la termina y apaga el permiso. En la Mac enseña además el modo banco armado.
 * `ControlEntreNeuronasPanel` (en Permisos de antenas): el interruptor, apagado de fábrica, el nivel, los
 * aparatos aceptados y los que piden serlo, con su código para compararlo con el del otro aparato.
 *
 * La banda vive en la web: el indicador y la parada que no dependen de la página son trabajo nativo
 * (Rust/Kotlin) pendiente. Nada aquí pide ni concede permisos del sistema.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PermisoControl, SesionActiva } from "@/lib/control-remoto/sesion";
import type { EstadoApp } from "@/lib/banco-llamadas/actor";
import { pasosQueFaltan } from "@/lib/banco-llamadas/pasos";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useCambios(): number {
    const [n, setN] = useState(0);
    useEffect(() => {
        const f = () => setN((x) => x + 1);
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return; // entornos sin eventos (pruebas)
        window.addEventListener("starseed:control-neuronas-cambio", f);
        const t = setInterval(f, 15_000); // la sesión caduca sola por inactividad
        return () => {
            window.removeEventListener("starseed:control-neuronas-cambio", f);
            clearInterval(t);
        };
    }, []);
    return n;
}

function hhmm(t: number): string {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BandaControl() {
    const router = useRouter();
    const n = useCambios();
    const [sesion, setSesion] = useState<SesionActiva | null>(null);
    const [banco, setBanco] = useState<{ con: string; hasta: number; restantes: number } | null>(null);

    useEffect(() => {
        const t = setTimeout(() => {
            void import("@/lib/control-remoto/canal").then((c) => c.iniciarCanalControl()).catch(() => undefined);
        }, 3000);
        const abrir = (e: Event) => {
            const ruta = (e as CustomEvent<{ ruta?: string }>).detail?.ruta;
            if (typeof ruta === "string" && /^\/[a-z0-9_\-/]{0,120}$/.test(ruta) && !ruta.includes("//") && !ruta.includes("..")) router.push(ruta);
        };
        window.addEventListener("starseed:control-abrir-ruta", abrir);
        return () => {
            clearTimeout(t);
            window.removeEventListener("starseed:control-abrir-ruta", abrir);
        };
    }, [router]);

    useEffect(() => {
        void import("@/lib/control-remoto/canal").then((c) => setSesion(c.puertaControl()?.sesionActiva() ?? null));
        void import("@/lib/banco-llamadas/app").then((b) => setBanco(b.estadoBanco()));
    }, [n]);

    const terminar = useCallback(() => {
        void import("@/lib/control-remoto/canal").then((c) => c.puertaControl()?.revocar("terminado-por-el-dueno"));
    }, []);
    const apagarBanco = useCallback(() => {
        void import("@/lib/banco-llamadas/app").then((b) => b.apagarBanco("apagar"));
    }, []);

    if (!sesion && !banco) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147483000] flex flex-col items-center gap-1 p-2" data-testid="banda-control">
            {sesion && (
                <div role="status" className="pointer-events-auto flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-3 rounded-xl border-2 border-[#DC143C] bg-[#1a0408]/95 px-4 py-2 text-sm text-white shadow-lg">
                    <span className="font-semibold text-[#ff6b81]">Control entre mis neuronas</span>
                    <span>
                        {sesion.nombre} opera esta neurona · nivel {sesion.nivel} · desde las {hhmm(sesion.inicio)}
                    </span>
                    <button onClick={terminar} className="min-h-9 cursor-pointer rounded-lg bg-[#DC143C] px-3 py-1 font-medium transition-colors hover:bg-[#b01030]">
                        Terminar y quitar el permiso
                    </button>
                </div>
            )}
            {banco && (
                <div role="status" className="pointer-events-auto flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-3 rounded-xl border-2 border-[#FFBF00] bg-[#1a1404]/95 px-4 py-2 text-sm text-white shadow-lg">
                    <span className="font-semibold text-[#FFBF00]">Modo banco de llamadas</span>
                    <span>
                        llama a {banco.con.slice(0, 8)} · hasta las {hhmm(banco.hasta)} · quedan {banco.restantes}
                    </span>
                    <button onClick={apagarBanco} className="min-h-9 cursor-pointer rounded-lg bg-[#FFBF00] px-3 py-1 font-medium text-black transition-colors hover:bg-[#d9a200]">
                        Apagar
                    </button>
                </div>
            )}
        </div>
    );
}

export function ControlEntreNeuronasPanel() {
    const n = useCambios();
    const [permiso, setPermiso] = useState<PermisoControl | null>(null);
    const [codigos, setCodigos] = useState<Record<string, string>>({});
    const [miCodigo, setMiCodigo] = useState<string | null>(null);
    const [destino, setDestino] = useState("");
    const [aviso, setAviso] = useState<string | null>(null);
    const [banco, setBanco] = useState<{ con: string; hasta: number; restantes: number } | null>(null);
    // BAN1115D: las neuronas de la cuenta (para elegir sin teclear el id) y lo que la app informa de sí misma
    const [neuronas, setNeuronas] = useState<Array<{ id: string; nombre: string; plataforma: string; online: boolean }>>([]);
    const [informe, setInforme] = useState<EstadoApp | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const nn = await import("@/lib/neurons/neurons");
                const yo = nn.thisDeviceId();
                const lista = await nn.listNeurons();
                setNeuronas(
                    lista
                        .filter((x) => x.id !== yo && !x.isThisDevice)
                        .map((x) => ({ id: x.id, nombre: x.name, plataforma: x.capabilities?.platform || x.kind, online: !!x.online })),
                );
            } catch {
                setNeuronas([]); // sin lista: queda el campo del id
            }
        })();
    }, [n]);

    useEffect(() => {
        void import("@/lib/banco-llamadas/app").then((b) => setInforme(b.ultimoInforme()));
    }, [n]);

    useEffect(() => {
        void (async () => {
            const c = await import("@/lib/control-remoto/canal");
            const p = c.leerPermisoLocal();
            setPermiso(p);
            const f = await import("@/lib/chats-genesis/firma-aparato");
            const yo = await f.aparatoLocal().catch(() => null);
            setMiCodigo(yo?.codigo ?? null);
            const cs: Record<string, string> = {};
            for (const x of [...p.controladores, ...p.pendientes]) cs[x.huella] = await f.codigoDe(x.huella, x.cuenta).catch(() => "?");
            setCodigos(cs);
            const b = await import("@/lib/banco-llamadas/app");
            setBanco(b.estadoBanco());
        })();
    }, [n]);

    const cambiar = useCallback(async (f: (p: PermisoControl) => PermisoControl) => {
        const c = await import("@/lib/control-remoto/canal");
        const nuevo = f(c.leerPermisoLocal());
        c.guardarPermisoLocal(nuevo);
        if (!nuevo.encendido) c.puertaControl()?.revocar("apagado-por-el-dueno");
    }, []);

    const aceptar = useCallback(
        async (huella: string) => {
            const s = await import("@/lib/control-remoto/sesion");
            await cambiar((p) => s.aceptarPendiente(p, huella));
        },
        [cambiar],
    );
    const quitar = useCallback(
        async (huella: string) => {
            const s = await import("@/lib/control-remoto/sesion");
            await cambiar((p) => s.quitarControlador(p, huella));
        },
        [cambiar],
    );

    const elegir = useCallback(async (id: string) => {
        setDestino(id);
        if (RE_UUID.test(id)) void import("@/lib/banco-llamadas/app").then((b) => b.informarBanco(id)); // solo mira si ya te aceptó
    }, []);

    const ofrecer = useCallback(async () => {
        if (!RE_UUID.test(destino.trim())) {
            setAviso("Escribe el id completo de la neurona (lo ves en Mensajes › Neuronas).");
            return;
        }
        const c = await import("@/lib/control-remoto/canal");
        const r = await c.presentarmeA(destino.trim().toLowerCase(), typeof navigator !== "undefined" ? (navigator.platform || "Neurona") : "Neurona");
        if (r.ok) setTimeout(() => void import("@/lib/banco-llamadas/app").then((b) => b.informarBanco(destino.trim())), 6000); // mira si ya te aceptó
        setAviso(
            r.ok
                ? `Pedido enviado. En esa neurona, acepta el aparato con el código ${miCodigo ?? "de este aparato"}.`
                : r.motivo === "sin-aparato"
                  ? "Este aparato no tiene clave propia: créala en Chats de Genesis (emparejar)."
                  : `No se pudo pedir: ${r.motivo}.`,
        );
    }, [destino, miCodigo]);

    const armar = useCallback(async () => {
        const b = await import("@/lib/banco-llamadas/app");
        if (!b.armarBanco(destino.trim(), 4, 40)) setAviso("Escribe el id completo de la tableta.");
    }, [destino]);
    const apagar = useCallback(async () => {
        const b = await import("@/lib/banco-llamadas/app");
        b.apagarBanco("apagar");
    }, []);

    if (!permiso) return null;
    return (
        <div className="mb-6 space-y-3 rounded-xl border border-[#DC143C]/30 bg-[#DC143C]/[0.04] p-4" data-testid="control-entre-neuronas">
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="flex-1 text-sm font-medium text-white/80">Control entre mis neuronas</h3>
                <button
                    role="switch"
                    aria-checked={permiso.encendido}
                    onClick={() => void cambiar((p) => ({ ...p, encendido: !p.encendido }))}
                    className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${permiso.encendido ? "border-[#DC143C] bg-[#DC143C]/30 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                >
                    {permiso.encendido ? "Encendido en este aparato" : "Apagado en este aparato"}
                </button>
            </div>
            <p className="text-[12px] text-white/55">
                Deja que otra neurona de tu cuenta, que tú aceptes aquí, opere la app de este aparato: llamar, contestar, colgar, micrófono y cámara, abrir una sección y leer su estado.
                Nada fuera de la app. Mientras alguien la opera verás una banda roja arriba; un toque la termina y apaga este permiso. Cada orden queda en el registro de llamadas.
            </p>
            <label className="flex items-center gap-2 text-[12px] text-white/70">
                Nivel
                <select
                    value={permiso.nivel}
                    onChange={(e) => void cambiar((p) => ({ ...p, nivel: e.target.value === "ver" ? "ver" : "controlar" }))}
                    className="cursor-pointer rounded-md border border-white/20 bg-black/40 px-2 py-1"
                >
                    <option value="ver">ver (solo leer el estado)</option>
                    <option value="controlar">controlar (órdenes de la app)</option>
                </select>
            </label>
            <p className="text-[12px] text-white/50">Código de este aparato: {miCodigo ?? "sin clave propia (créala en Chats de Genesis)"}</p>
            {permiso.pendientes.map((x) => (
                <div key={x.huella} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 p-2 text-[12px] text-white/80">
                    <span className="flex-1">
                        {x.nombre} pide controlar este aparato · código {codigos[x.huella] ?? "…"} (compáralo con el que enseña ese aparato)
                    </span>
                    <button onClick={() => void aceptar(x.huella)} className="cursor-pointer rounded-md bg-emerald-600/70 px-2 py-1 hover:bg-emerald-600">
                        Aceptar
                    </button>
                    <button onClick={() => void quitar(x.huella)} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
                        Rechazar
                    </button>
                </div>
            ))}
            {permiso.controladores.map((x) => (
                <div key={x.huella} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2 text-[12px] text-white/70">
                    <span className="flex-1">
                        Aceptado: {x.nombre} · código {codigos[x.huella] ?? "…"} · desde {x.desde.slice(0, 10)}
                    </span>
                    <button onClick={() => void quitar(x.huella)} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
                        Quitar
                    </button>
                </div>
            ))}
            {neuronas.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3" role="listbox" aria-label="Neuronas de tu cuenta" data-testid="neuronas-elegir">
                    {neuronas.map((x) => (
                        <button
                            key={x.id}
                            role="option"
                            aria-selected={destino.trim().toLowerCase() === x.id.toLowerCase()}
                            onClick={() => void elegir(x.id)}
                            className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 text-left text-[12px] transition-colors ${destino.trim().toLowerCase() === x.id.toLowerCase() ? "border-[#FFBF00] bg-[#FFBF00]/15 text-white" : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"}`}
                        >
                            <span className="font-medium">{x.nombre}</span> · {x.plataforma} · <span className={x.online ? "text-emerald-300" : "text-white/40"}>{x.online ? "conectada" : "sin conexión"}</span>
                        </button>
                    ))}
                </div>
            )}
            {(destino.trim() !== "" || banco) && (
                <ul className="space-y-1 text-[12px]" data-testid="pasos-banco">
                    {pasosQueFaltan({ informe, destino: destino.trim(), codigo: miCodigo }).map((p) => (
                        <li key={p.clave} className={p.hecho ? "text-emerald-300/80" : "text-amber-200"}>
                            {p.hecho ? "✓ " : "• "}
                            {p.texto}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                <input
                    value={destino}
                    onChange={(e) => void elegir(e.target.value)}
                    placeholder="o escribe el id de la otra neurona"
                    className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[12px] text-white"
                />
                <button onClick={() => void ofrecer()} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-[12px] text-white/80 hover:bg-white/20">
                    Pedir controlarla desde aquí
                </button>
                {banco ? (
                    <button onClick={() => void apagar()} className="cursor-pointer rounded-md bg-[#FFBF00] px-2 py-1 text-[12px] text-black">
                        Apagar el modo banco
                    </button>
                ) : (
                    <button onClick={() => void armar()} className="cursor-pointer rounded-md border border-[#FFBF00]/50 px-2 py-1 text-[12px] text-[#FFBF00] hover:bg-[#FFBF00]/10">
                        Modo banco hacia esa tableta (4 h, 40 llamadas)
                    </button>
                )}
            </div>
            {aviso && <p className="text-[12px] text-sky-300">{aviso}</p>}
        </div>
    );
}

export default BandaControl;
