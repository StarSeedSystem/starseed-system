"use client";

/**
 * Dispositivos (neuronas) — qué dispositivos están vinculados a tu cuenta y
 * qué puede hacer cada uno.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reutiliza la capa de neuronas del OS (src/lib/neurons/neurons.ts: registro
 * con RLS por dueño, permisos que viajan con la cuenta) y deja lo avanzado
 * —servidor casero, voz por dispositivo, conectividad, Hermes— en el panel
 * completo de Cerebro → Neuronas, al que se enlaza. Aquí va lo que cualquier
 * persona necesita: nombre, estado, capacidades y permisos claros.
 */

import { useState } from "react";
import Link from "next/link";
import {
    Check,
    Cpu,
    ArrowRight,
    Laptop,
    LogIn,
    Monitor,
    Pencil,
    RefreshCw,
    Server,
    Smartphone,
    Tablet,
    Trash2,
    X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
    removeNeuron,
    setNeuronName,
    setPermission,
    type Neuron,
    type NeuronKind,
    type NeuronPermissions,
} from "@/lib/neurons/neurons";
import {
    capacidadesLegibles,
    ETIQUETA_TIPO,
    fraseResumenNeuronas,
    haceCuanto,
    nombreValido,
    PERMISOS_NEURONA,
    resumenNeuronas,
} from "@/lib/mi-mando/neuronas";
import { cn } from "@/lib/utils";

import { useMiMando } from "./contexto";
import { CabeceraPagina, Cargando, CLASE_ACCION, CLASE_ACCION_PELIGRO, Chip, EstadoVacio } from "./piezas";

const ICONO_TIPO: Record<NeuronKind, typeof Monitor> = {
    desktop: Monitor,
    laptop: Laptop,
    mobile: Smartphone,
    tablet: Tablet,
    server: Server,
    other: Cpu,
};

function NombreEditable({ neurona }: { neurona: Neuron }) {
    const { anunciar } = useMiMando();
    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState(neurona.name);
    const idCampo = `mi-mando-nombre-${neurona.id}`;

    const guardar = () => {
        const limpio = nombreValido(borrador);
        if (!limpio) {
            anunciar("El nombre no puede quedar vacío.");
            return;
        }
        if (limpio !== neurona.name) {
            setNeuronName(neurona.id, limpio);
            anunciar(`Dispositivo renombrado a «${limpio}».`);
        }
        setEditando(false);
    };

    if (!editando) {
        return (
            <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-white">{neurona.name}</h3>
                <button
                    type="button"
                    onClick={() => {
                        setBorrador(neurona.name);
                        setEditando(true);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/55 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    aria-label={`Renombrar ${neurona.name}`}
                >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
        );
    }
    return (
        <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(e) => {
                e.preventDefault();
                guardar();
            }}
        >
            <label htmlFor={idCampo} className="sr-only">Nuevo nombre del dispositivo</label>
            <Input
                id={idCampo}
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setEditando(false);
                }}
                maxLength={60}
                autoFocus
                className="h-9 min-w-0 flex-1 border-white/15 bg-black/30 text-sm"
            />
            <button type="submit" className={CLASE_ACCION} aria-label="Guardar nombre">
                <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => setEditando(false)} className={CLASE_ACCION} aria-label="Cancelar">
                <X className="h-3.5 w-3.5" aria-hidden />
            </button>
        </form>
    );
}

function TarjetaNeurona({ neurona }: { neurona: Neuron }) {
    const { anunciar, neuronas } = useMiMando();
    const confirmar = useConfirm();
    // Cambio optimista: el interruptor responde al instante; la lista real llega después.
    const [permisos, setPermisos] = useState<Partial<NeuronPermissions>>({});
    const [quitando, setQuitando] = useState(false);
    const Icono = ICONO_TIPO[neurona.kind] ?? Cpu;
    const capacidades = capacidadesLegibles(neurona.capabilities);

    const alternar = (clave: keyof NeuronPermissions, valor: boolean, etiqueta: string) => {
        setPermisos((p) => ({ ...p, [clave]: valor }));
        setPermission(neurona.id, clave, valor);
        anunciar(`${etiqueta} ${valor ? "activado" : "desactivado"} en «${neurona.name}».`);
    };

    const quitar = async () => {
        const ok = await confirmar({
            title: "Quitar de la cuenta",
            description: `«${neurona.name}» dejará de aparecer entre tus dispositivos y de recibir sincronizaciones. No se borra nada en ese dispositivo; si vuelve a abrir StarSeed con tu sesión, se registrará de nuevo.`,
            confirmText: "Quitar",
            cancelText: "Cancelar",
            destructive: true,
        });
        if (!ok) return;
        setQuitando(true);
        const hecho = await removeNeuron(neurona.id);
        setQuitando(false);
        if (hecho) {
            anunciar(`«${neurona.name}» ya no está vinculado a tu cuenta.`);
            void neuronas.refrescar();
        } else {
            anunciar(`No se pudo quitar «${neurona.name}». Revisa tu conexión y vuelve a intentarlo.`);
        }
    };

    return (
        <li
            className={cn(
                "rounded-2xl border bg-black/25 p-4 text-white shadow-lg backdrop-blur-md",
                neurona.isThisDevice ? "border-cyan-400/30" : "border-white/10",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                    <Icono className="h-4 w-4 text-cyan-200" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <NombreEditable neurona={neurona} />
                    <p className="text-xs text-white/55">
                        {ETIQUETA_TIPO[neurona.kind] ?? "Dispositivo"} ·{" "}
                        {neurona.online ? "en línea" : `última vez ${haceCuanto(neurona.last_seen_at)}`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {neurona.isThisDevice && <Chip tono="info">Este dispositivo</Chip>}
                    <Chip tono={neurona.online ? "bien" : "neutro"}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", neurona.online ? "bg-emerald-400" : "bg-white/40")} aria-hidden />
                        {neurona.online ? "En línea" : "Desconectado"}
                    </Chip>
                </div>
            </div>

            {capacidades.length > 0 && (
                <div className="mt-3">
                    <p className="sr-only">Capacidades</p>
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Capacidades de ${neurona.name}`}>
                        {capacidades.map((c) => (
                            <li key={c}><Chip>{c}</Chip></li>
                        ))}
                    </ul>
                </div>
            )}

            <fieldset className="mt-4">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Qué permites a este dispositivo</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {PERMISOS_NEURONA.map((p) => {
                        const idEtiqueta = `perm-${neurona.id}-${p.clave}`;
                        const activo = permisos[p.clave] ?? neurona.permissions?.[p.clave] ?? true;
                        return (
                            <div key={p.clave} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="min-w-0">
                                    <p id={idEtiqueta} className="text-xs font-semibold text-white">{p.etiqueta}</p>
                                    <p id={`${idEtiqueta}-d`} className="mt-0.5 text-[11px] leading-snug text-white/55">{p.explicacion}</p>
                                </div>
                                <Switch
                                    checked={activo}
                                    onCheckedChange={(v) => alternar(p.clave, v, p.etiqueta)}
                                    aria-labelledby={idEtiqueta}
                                    aria-describedby={`${idEtiqueta}-d`}
                                />
                            </div>
                        );
                    })}
                </div>
            </fieldset>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {neurona.isThisDevice ? (
                    <p className="text-[11px] text-white/45">Para quitar este dispositivo, cierra sesión en él.</p>
                ) : (
                    <button type="button" onClick={() => void quitar()} disabled={quitando} className={CLASE_ACCION_PELIGRO}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {quitando ? "Quitando…" : "Quitar de la cuenta"}
                    </button>
                )}
            </div>
        </li>
    );
}

export default function PaginaNeuronas() {
    const { neuronas, sesion } = useMiMando();
    const r = resumenNeuronas(neuronas.lista);
    return (
        <div>
            <CabeceraPagina
                titulo="Dispositivos"
                texto={`Cada dispositivo donde abres StarSeed con tu cuenta es una «neurona» de tu sistema. ${fraseResumenNeuronas(r)}.`}
                accion={
                    <button type="button" onClick={() => void neuronas.refrescar()} className={CLASE_ACCION}>
                        <RefreshCw className={cn("h-3.5 w-3.5", neuronas.cargando && "animate-spin")} aria-hidden />
                        Actualizar
                    </button>
                }
            />

            {!sesion.cargando && !sesion.activa && (
                <p className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                    <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">Sin sesión solo ves este dispositivo. Inicia sesión para vincular y ver todos los tuyos.</span>
                    <Link href="/login" className={CLASE_ACCION}>Iniciar sesión</Link>
                </p>
            )}

            {neuronas.cargando && neuronas.lista.length === 0 ? (
                <Cargando texto="Detectando este dispositivo (capacidades, IA local, espacio)…" />
            ) : neuronas.lista.length === 0 ? (
                <EstadoVacio
                    icono={Cpu}
                    titulo="Ningún dispositivo registrado"
                    texto="Este navegador no permite guardar su identidad (modo privado o almacenamiento bloqueado). Ábrelo en una ventana normal para registrarlo."
                />
            ) : (
                <ul className="space-y-3">
                    {neuronas.lista.map((n) => (
                        <TarjetaNeurona key={n.id} neurona={n} />
                    ))}
                </ul>
            )}

            <p className="mt-4 text-xs text-white/55">
                ¿Necesitas más? El servidor casero, la voz de cada dispositivo y la conectividad se ajustan en{" "}
                <Link href="/cerebro?tab=neuronas" className="inline-flex items-center gap-1 text-cyan-200 underline-offset-2 hover:underline">
                    Cerebro → Neuronas
                    <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
                .
            </p>
        </div>
    );
}
