"use client";

/*
 * Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md).
 * Tres pasos por ámbito (cuenta, grupo o página): 1) lo local del contexto (neuronas, servidores
 * del cerebro y la capa de Astraura que cabe) con interruptores; 2) lo gratis sugerido, con el
 * botón «Vincular» al enlace oficial en pestaña nueva y un campo para pegar la clave, que se
 * envía a la API y se borra del campo a continuación; 3) resumen por papel con la cadena elegida
 * y su motivo. Los cargadores (`cargar`/`vincular`) van inyectados: las pruebas no tienen red y
 * los valores de claves jamás quedan registrados ni devueltos, solo nombres de variables.
 */
import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

export interface PropsAsistente {
    ambito: string;
    /** Quien carga la vista del ámbito: la API real, o una simulada en pruebas. */
    cargar?: (ambito: string) => Promise<VistaOpciones>;
    /** Envía la clave a la bóveda; devuelve "ok" o "error" (nunca el valor). */
    vincular?: (ambito: string, proveedor: string, valor: string) => Promise<"ok" | "error">;
}

/** Vista real del ámbito: la API de conectores (`GET /api/genesis/conectores?ambito=`). */
export async function cargarVistaConectores(ambito: string): Promise<VistaOpciones> {
    const res = await fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`);
    if (!res.ok) throw new Error("No se pudo cargar el catálogo del ámbito.");
    return (await res.json()) as VistaOpciones;
}

/** Envío real del vínculo: `POST` con `accion: "vincular"`; la clave no queda aquí. */
export async function enviarVinculo(ambito: string, proveedor: string, valor: string): Promise<"ok" | "error"> {
    const res = await fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "vincular", proveedor, valor }),
    });
    return res.ok ? "ok" : "error";
}

/** Resumen de un papel: la cadena elegida (más sus respaldos) y el motivo de cada eslabón. */
export interface ResumenPapel {
    papel: Papel;
    cadena: string[];
    respaldo: string[];
    motivos: ReadonlyMap<string, string>;
}

/** Deriva el resumen: los locales sin interruptor activo no aparecen en la cadena. */
export function resumenPorPapel(vista: VistaOpciones, activos: ReadonlySet<string>): ResumenPapel[] {
    const grupoLocal = vista.sugerencias.find((g) => g.clave === "local-por-activar");
    const locales = grupoLocal && grupoLocal.clave !== "sin-opcion" ? new Set(grupoLocal.opciones.map((s) => s.id)) : new Set<string>();
    const motivos = new Map<string, string>();
    for (const g of vista.sugerencias) {
        if (g.clave !== "sin-opcion") for (const s of g.opciones) motivos.set(s.id, s.motivo);
    }
    return (vista.asignaciones as Asignacion<Papel>[]).map((a) => ({
        papel: a.clave,
        cadena: a.cadena.filter((id) => !locales.has(id) || activos.has(id)),
        respaldo: [...a.respaldo],
        motivos,
    }));
}

const PASOS = [
    { id: "local", titulo: "Lo local del contexto" },
    { id: "gratis", titulo: "Lo gratis sugerido" },
    { id: "resumen", titulo: "Resumen por papel" },
] as const;
type Paso = (typeof PASOS)[number]["id"];

/** Chip de grupas: función para devolver el grupo deseado. */
function grupoDe(grupos: VistaOpciones["sugerencias"], clave: "local-por-activar" | "gratis-por-vincular"): Sugerencia[] {
    const g = grupos.find((x) => x.clave === clave);
    return g && g.clave !== "sin-opcion" ? g.opciones : [];
}

export function AsistenteConectores({ ambito, cargar, vincular }: PropsAsistente) {
    const leerVista = cargar ?? cargarVistaConectores;
    const enviar = vincular ?? enviarVinculo;
    const [vista, setVista] = useState<VistaOpciones | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [paso, setPaso] = useState<Paso>("local");
    const [activos, setActivos] = useState<ReadonlySet<string>>(new Set());
    const [claves, setClaves] = useState<Record<string, string>>({});
    const [avisos, setAvisos] = useState<Record<string, "ok" | "error">>({});

    useEffect(() => {
        let vivo = true;
        setVista(null);
        setError(null);
        leerVista(ambito)
            .then((v) => {
                if (vivo) {
                    setVista(v);
                    setError(null);
                }
            })
            .catch((e: unknown) => {
                if (vivo) setError(e instanceof Error ? e.message : "Error al abrir el asistente.");
            });
        return () => {
            vivo = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ambito]);

    const girar = (id: string) =>
        setActivos((set) => {
            const nuevo = new Set(set);
            if (nuevo.has(id)) nuevo.delete(id);
            else nuevo.add(id);
            return nuevo;
        });

    /** Envía la clave y la borra del campo a continuación: nunca queda en el cliente. */
    const guardar = async (s: Sugerencia) => {
        const valor = (claves[s.id] ?? "").trim();
        if (!valor) return;
        const resultado = await enviar(ambito, s.id, valor);
        setClaves((c) => ({ ...c, [s.id]: "" }));
        setAvisos((a) => ({ ...a, [s.id]: resultado }));
    };

    if (!vista) {
        return (
            <p className="flex items-center gap-2 text-sm text-white/60" role="status">
                {error ? <span role="alert">{error}</span> : (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Abriendo el asistente…</>)}
            </p>
        );
    }
    const locales = grupoDe(vista.sugerencias, "local-por-activar");
    const gratis = grupoDe(vista.sugerencias, "gratis-por-vincular");

    return (
        <section className="space-y-4" data-testid="asistente-conectores">
            <h2 className="text-lg font-semibold">Conectar Genesis · {ambito}</h2>
            <div role="tablist" aria-label="Pasos del asistente" className="flex flex-wrap gap-2">
                {PASOS.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={paso === p.id}
                        data-testid={`paso-${p.id}`}
                        onClick={() => setPaso(p.id)}
                        className={cn(
                            "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors duration-200",
                            paso === p.id ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/65 hover:border-white/30 hover:text-white",
                        )}
                    >
                        {p.titulo}
                    </button>
                ))}
            </div>

            {paso === "local" ? (
                <div className="space-y-2" data-testid="grupo-local">
                    <p className="text-xs text-white/50">
                        Neuronas, servidores de tu cerebro y la capa de Astraura que cabe, según `capas-autoadaptables.md`. Local primero.
                    </p>
                    {locales.length === 0 ? <p className="text-sm text-white/50">El contexto no ofrece capacidad local detectada.</p> : null}
                    {locales.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
                            <div className="min-w-0">
                                <span className="text-sm">{s.nombre}</span>
                                <p className="truncate text-xs text-white/50">{s.motivo}</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={activos.has(s.id)}
                                aria-label={`Activar ${s.nombre}`}
                                data-testid={`interruptor-${s.id}`}
                                onClick={() => girar(s.id)}
                                className="cursor-pointer rounded-full border border-white/20 px-3 py-1 text-xs transition-colors duration-200 hover:border-emerald-300/50"
                            >
                                {activos.has(s.id) ? "Activa" : "Inactiva"}
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {paso === "gratis" ? (
                <div className="space-y-2" data-testid="grupo-gratis">
                    {gratis.length === 0 ? <p className="text-sm text-white/50">Nada gratis por vincular con este ámbito.</p> : null}
                    {gratis.map((s) => (
                        <div key={s.id} className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium">{s.nombre}</span>
                                {s.limite ? <span className="text-xs text-white/50">{s.limite.nota}</span> : null}
                            </div>
                            <p className="text-xs text-white/50">{s.motivo}</p>
                            {s.enlaceAlta || s.enlaceClave ? (
                                <button
                                    type="button"
                                    data-testid={`vincular-${s.id}`}
                                    onClick={() => window.open(s.enlaceAlta ?? s.enlaceClave ?? undefined, "_blank", "noopener")}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs transition-colors duration-200 hover:border-emerald-300/50"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Vincular
                                </button>
                            ) : null}
                            <div className="flex items-center gap-2">
                                <input
                                    type="password"
                                    aria-label={`Clave de ${s.nombre}`}
                                    data-testid={`clave-${s.id}`}
                                    value={claves[s.id] ?? ""}
                                    onChange={(e) => setClaves((c) => ({ ...c, [s.id]: e.target.value }))}
                                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-emerald-300/50"
                                />
                                <button
                                    type="button"
                                    data-testid={`guardar-${s.id}`}
                                    disabled={!(claves[s.id] ?? "").trim()}
                                    onClick={() => void guardar(s)}
                                    className="cursor-pointer rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs text-white transition-colors duration-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Guardar clave
                                </button>
                            </div>
                            {avisos[s.id] ? (
                                <p className="text-xs text-white/60" data-testid={`aviso-${s.id}`}>
                                    {avisos[s.id] === "ok" ? "Clave enviada a la bóveda y borrada del campo." : "No se pudo guardar la clave."}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}

            {paso === "resumen" ? (
                <ul className="space-y-2" data-testid="grupo-resumen">
                    {resumenPorPapel(vista, activos).length === 0 ? (
                        <li className="text-sm text-white/50">Todavía no hay cadenas asignadas en este ámbito.</li>
                    ) : null}
                    {resumenPorPapel(vista, activos).map((r) => (
                        <li key={r.papel} className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                            <span className="text-sm font-medium capitalize">{r.papel}</span>
                            <p data-testid={`cadena-${r.papel}`} className="text-xs text-white/70">
                                {[...r.cadena, ...r.respaldo].join(" → ") || "sin cadena"}
                            </p>
                            {([...r.cadena, ...r.respaldo].length > 0 && r.motivos.size > 0) ? (
                                <ul className="space-y-0.5">
                                    {[...new Set([...r.cadena, ...r.respaldo])].map((id) => (
                                        <li key={id} className="text-xs text-white/45">
                                            {r.motivos.get(id) ?? `${id}: sin motivo registrado.`}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
