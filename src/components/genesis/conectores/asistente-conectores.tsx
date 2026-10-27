"use client";

/**
 * AsistenteConectores — «Conectar Genesis» (Ola 1019G · architecture/genesis-conectores-abiertos.md §3, §4 y §6).
 * Tres pasos: 1) lo local del contexto (neuronas, servidores del cerebro y la capa de Astraura que cabe)
 * con interruptores; 2) lo gratis sugerido, con «Vincular» al enlace oficial en pestaña nueva y un campo de
 * clave que se envía a la API y se borra; 3) resumen por papel con la cadena elegida y su motivo.
 * Red y API inyectables; jamás guarda, registra ni devuelve valores de claves.
 */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { ContenedorOpcion } from "@/lib/genesis/conectores/contenedores";
import type { OfertaContexto } from "@/lib/genesis/conectores/escalera";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import { sugerirParaAmbito, type EntradaSugerir, type Sugerencia, type GrupoSugerencias } from "@/lib/genesis/conectores/sugerir";

/** Lo que la API (tarea L) le entrega al asistente del ámbito. */
export interface DatosConectar {
    ofertas: OfertaContexto[];
    catalogo: OpcionCatalogo[];
    contenedores: ContenedorOpcion[];
    asignaciones: Asignacion<Papel>[];
    /** Ids ya vinculados o activos en el ámbito. */
    vinculadas: string[];
    /** Potencia medida por id (`puntuarPotencia`); lo no medido va detrás. */
    potencia?: Record<string, number>;
}

export interface PropiedadesConectar {
    /** Carga lo que el ámbito tiene. Por defecto, GET /api/genesis/opciones. */
    cargar?: () => Promise<DatosConectar>;
    /** Envía la clave a la bóveda de claves por ámbito (tarea J). Por defecto, POST /api/genesis/conectores. */
    enviarClave?: (opcionId: string, clave: string) => Promise<boolean>;
    /** Al apagar o encender una capacidad local (se persiste por el panel de asignaciones). */
    alCambiarLocal?: (ofertaId: string, activado: boolean) => void;
}

export type Cobertura = "activada" | "vinculado" | "falta-vincular" | "sin-opcion";

export interface Eslabon {
    id: string;
    nombre: string;
}

export interface ResumenPapel {
    papel: Papel;
    cobertura: Cobertura;
    motivo: string;
    cadena: Eslabon[];
}

/** Normaliza los datos de la API (JSON) a la entrada pura del sugeridor. */
export function aEntradaSugerir(d: DatosConectar): EntradaSugerir {
    return {
        asignaciones: d.asignaciones,
        catalogo: d.catalogo,
        ofertas: d.ofertas,
        contenedores: d.contenedores,
        vinculadas: new Set(d.vinculadas),
        potencia: d.potencia ? new Map(Object.entries(d.potencia)) : undefined,
    };
}

const TEXTO_COBERTURA: Record<Cobertura, string> = {
    "activada": "Activada",
    "vinculado": "Vinculado",
    "falta-vincular": "Falta vincular",
    "sin-opcion": "Sin opción",
};

const CLASE_COBERTURA: Record<Cobertura, string> = {
    "activada": "bg-emerald-500/15 text-emerald-100",
    "vinculado": "bg-sky-500/15 text-sky-100",
    "falta-vincular": "bg-amber-500/15 text-amber-100",
    "sin-opcion": "bg-white/5 text-white/60",
};

/** Resumen por papel: la cadena elegida y su motivo, según lo activado y lo vinculado. */
export function resumenPorPapel(d: DatosConectar, activas: Readonly<Record<string, boolean>>): ResumenPapel[] {
    const encendida = (id: string) => activas[id] !== false;
    const grupos: GrupoSugerencias[] = sugerirParaAmbito(aEntradaSugerir(d));
    const gratis = new Map<Papel, Sugerencia>();
    const sinOpcion = new Map<Papel, string>();
    for (const g of grupos) {
        if (g.clave === "gratis-por-vincular") for (const o of g.opciones) for (const p of o.papeles) gratis.set(p, o);
        if (g.clave === "sin-opcion") for (const p of g.papeles) sinOpcion.set(p.papel, p.motivo);
    }
    const nombre = new Map<string, string>(d.catalogo.map((o) => [o.id, o.nombre]));
    for (const o of d.ofertas) if (!nombre.has(o.id)) nombre.set(o.id, o.nombre);
    return d.asignaciones.map((a) => {
        const cadena: Eslabon[] = a.cadena.map((id) => ({ id, nombre: nombre.get(id) ?? id }));
        const resumen = (cobertura: Cobertura, motivo: string): ResumenPapel =>
            ({ papel: a.clave, cobertura, motivo, cadena });
        if (d.ofertas.some((o) => o.papel.includes(a.clave) && encendida(o.id)))
            return resumen("activada", "Capacidad local encendida: tus aparatos o servidores del cerebro cubren este papel.");
        const vinculado = cadena.find((e) => d.vinculadas.includes(e.id));
        if (vinculado) return resumen("vinculado", `«${vinculado.nombre}» ya está vinculado con su enlace oficial.`);
        const falta = gratis.get(a.clave);
        if (falta) return resumen("falta-vincular", falta.motivo);
        return resumen("sin-opcion", sinOpcion.get(a.clave) ?? "Nada cubre este papel todavía.");
    });
}

const cargarPorApi = async (): Promise<DatosConectar> => {
    const r = await fetch("/api/genesis/opciones");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as DatosConectar;
};

const enviarClavePorApi = async (opcionId: string, clave: string): Promise<boolean> => {
    const r = await fetch("/api/genesis/conectores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opcionId, clave }),
    });
    return r.ok;
};

/** Asistente de conexión del ámbito: los tres pasos de Genesis abierto. */
export function AsistenteConectores({
    cargar = cargarPorApi,
    enviarClave = enviarClavePorApi,
    alCambiarLocal,
}: PropiedadesConectar) {
    const [datos, setDatos] = useState<DatosConectar | null>(null);
    const [cargando, setCargando] = useState(true);
    const [activas, setActivas] = useState<Record<string, boolean>>({});
    const [claves, setClaves] = useState<Record<string, string>>({});
    const [guardando, setGuardando] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        cargar()
            .then((d) => vivo && setDatos(d))
            .catch(() => vivo && setDatos({ ofertas: [], catalogo: [], contenedores: [], asignaciones: [], vinculadas: [] }))
            .finally(() => vivo && setCargando(false));
        return () => { vivo = false; };
    }, [cargar]);

    const grupos = useMemo(() => (datos ? sugerirParaAmbito(aEntradaSugerir(datos)) : []), [datos]);
    const gratis = useMemo(() => {
        const g = grupos.find((x) => x.clave === "gratis-por-vincular");
        return g?.clave === "gratis-por-vincular" ? g : null;
    }, [grupos]);

    const guardar = async (id: string) => {
        const clave = (claves[id] ?? "").trim();
        if (!clave) return;
        setGuardando(id);
        const ok = await enviarClave(id, clave);
        setGuardando(null);
        setClaves((c) => ({ ...c, [id]: "" })); // la clave se borra del campo al enviarla
        if (ok) toast.success("Clave enviada a la bóveda de este ámbito.");
        else toast.error("La API no aceptó la clave. Revisa el enlace oficial y vuelve a intentarlo.");
    };

    if (cargando || !datos) {
        return <p className="text-xs text-white/50" aria-live="polite">Cargando las opciones de este ámbito…</p>;
    }
    const resumen = resumenPorPapel(datos, activas);
    return (
        <div className="space-y-3" aria-label="Asistente Conectar Genesis">
            <section className="rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Local del contexto">
                <h3 className="mb-2 text-sm font-semibold text-white/85">1 · Local del contexto</h3>
                {datos.ofertas.length === 0 ? (
                    <p className="text-xs text-white/50">Ninguna neurona ni servidor del cerebro ofrece capacidad ahora mismo.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {datos.ofertas.map((o) => (
                            <li key={o.id} className="flex items-center justify-between gap-2 rounded-full border border-white/10 px-3 py-1 text-xs">
                                <span className="truncate text-white/80">{o.nombre}</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={activas[o.id] !== false}
                                    aria-label={`Interruptor de ${o.nombre}`}
                                    onClick={() => {
                                        const activado = !!(activas[o.id] === false);
                                        setActivas((a) => ({ ...a, [o.id]: activado }));
                                        alCambiarLocal?.(o.id, activado);
                                    }}
                                    className={`cursor-pointer rounded-full border px-2 py-0.5 transition-colors duration-150 ${activas[o.id] !== false ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-100" : "border-white/20 bg-black/30 text-white/60"}`}
                                >
                                    {activas[o.id] === false ? "Apagado" : "Encendido"}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <section className="rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Gratis por vincular">
                <h3 className="mb-2 text-sm font-semibold text-white/85">2 · Gratis por vincular</h3>
                {gratis && gratis.opciones.length > 0 ? (
                    <ul className="space-y-2">
                        {gratis.opciones.map((s) => (
                            <li key={s.id} className="rounded-xl border border-white/10 p-2 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/85">{s.nombre}</span>
                                    <span className="text-white/40">{s.papeles.join(" · ")}</span>
                                    <a
                                        href={(s.enlaceAlta ?? s.enlaceClave) as string}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="cursor-pointer inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                                    >
                                        Vincular <ExternalLink className="h-3 w-3" aria-hidden />
                                    </a>
                                </div>
                                <form
                                    className="mt-1.5 flex items-center gap-1.5"
                                    onSubmit={(ev) => { ev.preventDefault(); void guardar(s.id); }}
                                >
                                    <input
                                        type="password"
                                        value={claves[s.id] ?? ""}
                                        placeholder="Pega aquí tu clave"
                                        aria-label={`Clave de ${s.nombre}`}
                                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1"
                                        onChange={(ev) => setClaves((c) => ({ ...c, [s.id]: ev.target.value }))}
                                    />
                                    <button
                                        type="submit"
                                        disabled={guardando === s.id || !(claves[s.id] ?? "").trim()}
                                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-2 py-1 text-emerald-100 disabled:cursor-default disabled:opacity-40"
                                    >
                                        {guardando === s.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <KeyRound className="h-3 w-3" aria-hidden />}
                                        Guardar
                                    </button>
                                </form>
                                <p className="mt-1 text-white/40">{s.motivo}</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-white/50">Nada gratis pendiente de vincular.</p>
                )}
            </section>
            <section className="rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Resumen por papel">
                <h3 className="mb-2 text-sm font-semibold text-white/85">3 · Resumen por papel</h3>
                {resumen.length === 0 ? (
                    <p className="text-xs text-white/50">Este ámbito aún no tiene papeles asignados.</p>
                ) : (
                    <ul className="space-y-1.5 text-xs">
                        {resumen.map((r) => (
                            <li key={r.papel} className="rounded-xl border border-white/10 p-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/85">{r.papel}</span>
                                    <span className={`rounded-full px-2 py-0.5 ${CLASE_COBERTURA[r.cobertura]}`}>{TEXTO_COBERTURA[r.cobertura]}</span>
                                </div>
                                <p className="mt-1 text-white/70">Cadena: {r.cadena.length > 0 ? r.cadena.map((e) => e.nombre).join(" → ") : "sin asignar"}</p>
                                <p className="text-white/40">{r.motivo}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
