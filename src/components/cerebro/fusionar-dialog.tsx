"use client";

/**
 * «Fusionar» de cada cerebro (§4 de architecture/cerebros-fusion-telepatia.md).
 *
 * Mezcla en ESTE cerebro (el destino) las memorias y configuraciones de los
 * cerebros elegidos. Nada se escribe hasta pulsar «Fusionar»: primero se ve la
 * vista previa y se descarga una copia de seguridad en el aparato; después se
 * aplica y, si se marcó, se quitan los orígenes. Cada número que se enseña sale
 * de una lectura real; si no se pudo medir, se dice «sin medida».
 */

import { useEffect, useState } from "react";
import { CalendarDays, Download, Eye, GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    deleteBrain,
    saveBrain,
    type Brain,
    type BrainIncludes,
    type BrainPermission,
    type BrainServer,
} from "@/lib/brains/brains";
import { listMemoryFiles, saveMemoryFile, type MemoryFile } from "@/lib/cerebro/memory-files";
import { createClient } from "@/utils/supabase/client";
import { pushPreferences } from "@/lib/settings-sync";
import { pestanaDeCerebro } from "@/lib/cerebros/pestanas";
import { planFusion, type ArchivoMemoria, type PlanFusion, type PrefsCerebro } from "@/lib/cerebros/fusion";

export interface FusionarDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

interface DatosFusion {
    archivos: ArchivoMemoria[];
    completos: MemoryFile[];
    prefs: Record<string, PrefsCerebro>;
}

interface CopiaFusion {
    version: 1;
    fecha: string;
    cerebros: Brain[];
    archivos: MemoryFile[];
    prefs: Record<string, PrefsCerebro>;
}

interface ResultadoFusion {
    ok: boolean;
    archivos: number;
    bytes: number;
    includes: number;
    servidores: number;
    preferencias: number;
    quitados: string[];
    conservados: Array<{ nombre: string; motivo: string }>;
    errores: string[];
    avisos: string[];
}

interface VistaPrevia {
    plan: PlanFusion;
    fecha: string;
    datos: DatosFusion;
    includes: number;
    servidores: number;
    preferencias: number;
    archivosLeidos: number;
}

/** Vesica piscis triple: tres dominios que se funden en uno. Capa decorativa, sin eventos. */
function MarcaFusion({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 120 60" className={className} aria-hidden focusable="false">
            <circle cx="40" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="60" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="80" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
    );
}

function fechaLegible(iso?: string | null): string {
    if (!iso) return "sin medida";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "sin medida";
    return new Date(t).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

function formatearKb(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "sin medida";
    const kb = Math.round((bytes / 1024) * 10) / 10;
    return `${String(kb).replace(".", ",")} KB`;
}

function clavePref(brainId: string, clave: string): string {
    return `starseed.brain.${brainId}.${clave}`;
}

/** Preferencias de ESTE aparato para un cerebro. Lo que no está guardado no se inventa. */
function leerPrefsDe(brainId: string): PrefsCerebro {
    if (typeof window === "undefined") return {};
    const prefs: PrefsCerebro = {};
    const prefijo = clavePref(brainId, "");
    try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const clave = window.localStorage.key(i);
            if (!clave || !clave.startsWith(prefijo)) continue;
            const nombre = clave.slice(prefijo.length);
            if (!nombre) continue;
            const bruto = window.localStorage.getItem(clave);
            if (bruto === null) continue;
            try {
                prefs[nombre] = JSON.parse(bruto) as unknown;
            } catch {
                prefs[nombre] = bruto;
            }
        }
    } catch {
        /* sin almacenamiento legible: se devuelve lo que sí se pudo leer */
    }
    return prefs;
}

function contarFusionados(texto: string, fecha: string): number {
    const sufijo = ` · ${fecha}`;
    return texto.split("\n").filter((linea) => linea.startsWith("## Fusionado de «") && linea.endsWith(sufijo)).length;
}

/** Secciones que de verdad entran: las del plan menos las que el destino ya tenía de hoy. */
function seccionesNuevas(
    archivo: PlanFusion["archivos"][number],
    fecha: string,
    datos: DatosFusion,
    destinoId: string,
): number {
    if (archivo.accion !== "anexar") return 0;
    const previo = datos.archivos.find((a) => a.brain_id === destinoId && a.name === archivo.name);
    const antes = previo ? contarFusionados(previo.content, fecha) : 0;
    return Math.max(0, contarFusionados(archivo.contenido, fecha) - antes);
}

function accionEnPalabras(
    archivo: PlanFusion["archivos"][number],
    fecha: string,
    datos: DatosFusion,
    destinoId: string,
): string {
    if (archivo.accion === "copiar") return "copiar";
    if (archivo.accion === "omitir") return "ya estaba";
    return `añadir ${seccionesNuevas(archivo, fecha, datos, destinoId)} secciones`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function sumarUnicos(destino: string[], fuente: unknown): void {
    if (!Array.isArray(fuente)) return;
    for (const valor of fuente) {
        if (typeof valor === "string" && !destino.includes(valor)) destino.push(valor);
    }
}

function permisosDe(inc: BrainIncludes): BrainPermission[] {
    const bruto: unknown[] = Array.isArray(inc.permissions)
        ? inc.permissions
        : esObjeto(inc.permissions)
          ? Object.entries(inc.permissions).map(([who, level]) => ({ who, level }))
          : [];
    const salida: BrainPermission[] = [];
    for (const permiso of bruto) {
        const fila = permiso as unknown as Record<string, unknown>;
        const who = typeof fila.who === "string" ? fila.who.trim() : "";
        if (!who || salida.some((p) => p.who === who)) continue;
        salida.push({ who, level: typeof fila.level === "string" ? fila.level : "lectura" });
    }
    return salida;
}

function unirIncludes(destino: Brain, origenes: Brain[]): BrainIncludes {
    const salida: BrainIncludes = {
        vaults: [],
        backends: [],
        personalities: [],
        runtimes: [],
        tokens: [],
        memories: [],
        connections: [],
        bindScope: false,
        permissions: [],
        aiProvider: undefined,
    };
    const permisos: BrainPermission[] = [];
    for (const cerebro of [destino, ...origenes]) {
        const inc = cerebro.includes;
        sumarUnicos(salida.vaults, inc.vaults);
        sumarUnicos(salida.backends, inc.backends);
        sumarUnicos(salida.personalities, inc.personalities);
        sumarUnicos(salida.runtimes, inc.runtimes);
        sumarUnicos(salida.tokens, inc.tokens);
        sumarUnicos(salida.memories, inc.memories);
        sumarUnicos(salida.connections, inc.connections);
        salida.bindScope = salida.bindScope || Boolean(inc.bindScope);
        for (const permiso of permisosDe(inc)) {
            if (!permisos.some((p) => p.who === permiso.who)) permisos.push(permiso);
        }
        if (!salida.aiProvider && inc.aiProvider) salida.aiProvider = inc.aiProvider;
    }
    salida.permissions = permisos;
    return salida;
}

function contarIncludes(inc: BrainIncludes): number {
    const listas = [inc.vaults, inc.backends, inc.personalities, inc.runtimes, inc.tokens, inc.memories, inc.connections];
    const total = listas.reduce((suma, lista) => suma + (Array.isArray(lista) ? lista.length : 0), 0);
    return total + (Array.isArray(inc.permissions) ? inc.permissions.length : Object.keys(inc.permissions ?? {}).length);
}

function unirServidores(destino: Brain, origenes: Brain[]): BrainServer[] {
    const salida: BrainServer[] = [];
    const ids = new Set<string>();
    const endpoints = new Set<string>();
    for (const cerebro of [destino, ...origenes]) {
        for (const servidor of cerebro.servers ?? []) {
            const endpoint = typeof servidor.endpoint === "string" ? servidor.endpoint.trim() : "";
            if (ids.has(servidor.id) || (endpoint !== "" && endpoints.has(endpoint))) continue;
            ids.add(servidor.id);
            if (endpoint !== "") endpoints.add(endpoint);
            salida.push(servidor);
        }
    }
    return salida;
}

function unirConfig(destino: Brain, origenes: Brain[], fecha: string): Record<string, unknown> {
    const config: Record<string, unknown> = { ...(destino.config ?? {}) };
    for (const origen of origenes) {
        for (const [clave, valor] of Object.entries(origen.config ?? {})) {
            if (!(clave in config)) config[clave] = valor;
        }
    }
    const previos = Array.isArray(config.fusionados)
        ? config.fusionados.filter((id): id is string => typeof id === "string")
        : [];
    const nuevos = origenes.map((o) => o.id).filter((id) => !previos.includes(id));
    config.fusionados = [...previos, ...nuevos];
    config.fusionadoEn = fecha;
    return config;
}

function unirListas(a: unknown[], b: unknown[]): unknown[] {
    const salida: unknown[] = [...a];
    const ids = new Set<string>();
    const valores = new Set<string>();
    for (const item of salida) {
        if (esObjeto(item) && typeof item.id === "string") ids.add(item.id);
        else valores.add(JSON.stringify(item));
    }
    for (const item of b) {
        const id = esObjeto(item) && typeof item.id === "string" ? item.id : null;
        const huella = JSON.stringify(item);
        if (id ? ids.has(id) : valores.has(huella)) continue;
        if (id) ids.add(id);
        else valores.add(huella);
        salida.push(item);
    }
    return salida;
}

function unirPrefs(destinoId: string, origenes: Brain[], prefs: Record<string, PrefsCerebro>): PrefsCerebro {
    const salida: PrefsCerebro = { ...(prefs[destinoId] ?? {}) };
    for (const origen of origenes) {
        const suyas = prefs[origen.id] ?? {};
        for (const clave of Object.keys(suyas)) {
            if (!(clave in salida)) {
                salida[clave] = suyas[clave];
                continue;
            }
            const destino = salida[clave];
            const fuente = suyas[clave];
            if (Array.isArray(destino) && Array.isArray(fuente)) salida[clave] = unirListas(destino, fuente);
            else if (esObjeto(destino) && esObjeto(fuente)) {
                const mezcla: Record<string, unknown> = { ...destino };
                for (const k of Object.keys(fuente)) if (!(k in mezcla)) mezcla[k] = fuente[k];
                salida[clave] = mezcla;
            }
        }
    }
    return salida;
}

function copiaDeSeguridad(cerebros: Brain[], datos: DatosFusion, fecha: string): CopiaFusion {
    return { version: 1, fecha, cerebros, archivos: datos.completos, prefs: datos.prefs };
}

/** Descarga la copia en el aparato. Devuelve false si el navegador no deja. */
function descargarCopia(copia: CopiaFusion): boolean {
    if (typeof window === "undefined") return false;
    try {
        const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `cerebros-fusion-${copia.fecha}.json`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch {
        return false;
    }
}

/** Lee memorias y preferencias de todos los cerebros implicados. No escribe nada. */
async function leerParaFusion(destino: Brain, origenes: Brain[]): Promise<DatosFusion> {
    const archivos: ArchivoMemoria[] = [];
    const completos: MemoryFile[] = [];
    const prefs: Record<string, PrefsCerebro> = {};
    for (const cerebro of [destino, ...origenes]) {
        const lista = await listMemoryFiles(cerebro.id);
        for (const archivo of lista) {
            completos.push(archivo);
            archivos.push({
                id: archivo.id,
                brain_id: cerebro.id,
                name: archivo.name,
                content: archivo.content,
                updated_at: archivo.updated_at ?? null,
                meta: archivo.meta ?? null,
            });
        }
        prefs[cerebro.id] = leerPrefsDe(cerebro.id);
    }
    return { archivos, completos, prefs };
}

function claveArchivo(brainId: string, nombre: string): string {
    return `${brainId}\u0000${nombre}`;
}

/** Mueve al destino las selecciones que apuntaban a un origen (contrato §4 y §9 b). */
async function moverSelecciones(origen: Brain, destinoId: string): Promise<boolean> {
    try {
        const sb = createClient();
        const { error } = await sb
            .from("brain_selections")
            .update({ brain_id: destinoId })
            .eq("brain_id", origen.id)
            .eq("owner", origen.owner ?? "");
        return !error;
    } catch {
        return false;
    }
}

/** Escribe el plan ya calculado. Los orígenes solo se quitan si todo se escribió bien. */
async function aplicarFusion(
    destino: Brain,
    origenes: Brain[],
    plan: PlanFusion,
    datos: DatosFusion,
    quitar: boolean,
    fecha: string,
): Promise<ResultadoFusion> {
    const resultado: ResultadoFusion = {
        ok: false,
        archivos: 0,
        bytes: 0,
        includes: 0,
        servidores: 0,
        preferencias: 0,
        quitados: [],
        conservados: [],
        errores: [],
        avisos: [],
    };
    const completos = new Map<string, MemoryFile>();
    for (const archivo of datos.completos) completos.set(claveArchivo(String(archivo.brain_id ?? ""), archivo.name), archivo);

    for (const archivo of plan.archivos) {
        if (archivo.accion === "omitir") continue;
        const previo = completos.get(claveArchivo(destino.id, archivo.name));
        const origenDe = archivo.accion === "copiar" ? archivo.desde[0] : undefined;
        const base = previo ?? (origenDe ? completos.get(claveArchivo(origenDe, archivo.name)) : undefined);
        const guardado = await saveMemoryFile({
            ...(previo ? { id: previo.id } : {}),
            brain_id: destino.id,
            name: archivo.name,
            content: archivo.contenido,
            ...(base ? { source: base.source, server_config: base.server_config, meta: base.meta, sync: base.sync } : {}),
        });
        if (guardado) {
            resultado.archivos += 1;
            resultado.bytes += archivo.bytesQueEntran;
        } else {
            resultado.errores.push(`No se pudo guardar la memoria «${archivo.name}».`);
        }
    }

    const includes = unirIncludes(destino, origenes);
    const servidores = unirServidores(destino, origenes);
    const config = unirConfig(destino, origenes, fecha);
    const prefs = unirPrefs(destino.id, origenes, datos.prefs);
    resultado.includes = contarIncludes(includes);
    resultado.servidores = servidores.length;
    resultado.preferencias = Object.keys(prefs).length;

    if (resultado.errores.length > 0) {
        resultado.avisos.push("No se quitó ningún origen porque hubo errores al escribir.");
        for (const origen of origenes) resultado.conservados.push({ nombre: origen.name, motivo: "hubo errores al escribir" });
        return resultado;
    }
    const guardado = await saveBrain({ ...destino, includes, servers: servidores, config });
    if (!guardado) {
        resultado.errores.push("No se pudo guardar el cerebro fusionado; no se quitó ningún origen.");
        for (const origen of origenes) resultado.conservados.push({ nombre: origen.name, motivo: "no se pudo guardar el destino" });
        return resultado;
    }
    if (Object.keys(prefs).length > 0 && typeof window !== "undefined") {
        for (const [clave, valor] of Object.entries(prefs)) {
            try {
                window.localStorage.setItem(clavePref(destino.id, clave), JSON.stringify(valor));
            } catch {
                resultado.errores.push(`No se pudo guardar la preferencia «${clave}» en este aparato.`);
            }
        }
        if (resultado.errores.length === 0) {
            const subida = await pushPreferences();
            if (!subida.ok) resultado.avisos.push("Las preferencias quedaron en este aparato, pero no se pudieron subir a tu cuenta.");
        }
    }
    if (resultado.errores.length > 0) {
        resultado.avisos.push("No se quitó ningún origen porque hubo errores al escribir.");
        for (const origen of origenes) resultado.conservados.push({ nombre: origen.name, motivo: "hubo errores al escribir" });
        return resultado;
    }
    if (!quitar) {
        for (const origen of origenes) resultado.conservados.push({ nombre: origen.name, motivo: "no marcaste quitarlos" });
    } else {
        for (const origen of origenes) {
            if (origen.owner && destino.owner && origen.owner !== destino.owner) {
                resultado.conservados.push({ nombre: origen.name, motivo: "es de otra cuenta y solo se puede leer" });
                continue;
            }
            if (!(await moverSelecciones(origen, destino.id))) {
                resultado.conservados.push({ nombre: origen.name, motivo: "no se pudieron mover sus selecciones" });
                continue;
            }
            const borrado = await deleteBrain(origen.id);
            if (borrado) resultado.quitados.push(origen.name);
            else resultado.conservados.push({ nombre: origen.name, motivo: "no se pudo quitar" });
        }
    }
    resultado.ok = resultado.errores.length === 0;
    return resultado;
}

export default function FusionarDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: FusionarDialogProps) {
    const [seleccionados, setSeleccionados] = useState<string[]>([]);
    const [vista, setVista] = useState<VistaPrevia | null>(null);
    const [quitar, setQuitar] = useState(true);
    const [cargando, setCargando] = useState(false);
    const [fusionando, setFusionando] = useState(false);
    const [copiaFallida, setCopiaFallida] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const otros = cerebros.filter((b) => b.id !== cerebro.id);
    const origenes = otros.filter((b) => seleccionados.includes(b.id));

    useEffect(() => {
        if (!open) return;
        setSeleccionados([]);
        setVista(null);
        setQuitar(true);
        setCargando(false);
        setFusionando(false);
        setCopiaFallida(false);
        setError(null);
        setAviso(null);
    }, [open, cerebro.id]);

    function alternar(id: string) {
        setSeleccionados((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
        setVista(null);
        setCopiaFallida(false);
        setError(null);
        setAviso(null);
    }

    async function preparar(): Promise<{ plan: PlanFusion; datos: DatosFusion; fecha: string } | null> {
        if (origenes.length === 0) {
            setError("Elige al menos un cerebro para fusionar.");
            return null;
        }
        setCargando(true);
        setError(null);
        setAviso(null);
        try {
            const datos = await leerParaFusion(cerebro, origenes);
            const fecha = new Date().toISOString().slice(0, 10);
            const plan = planFusion({ destino: cerebro, origenes, archivos: datos.archivos, prefs: datos.prefs, fecha });
            return { plan, datos, fecha };
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo preparar la fusión.");
            return null;
        } finally {
            setCargando(false);
        }
    }

    async function verVistaPrevia() {
        const preparado = await preparar();
        if (!preparado) return;
        setVista({
            plan: preparado.plan,
            fecha: preparado.fecha,
            datos: preparado.datos,
            includes: contarIncludes(unirIncludes(cerebro, origenes)),
            servidores: unirServidores(cerebro, origenes).length,
            preferencias: Object.keys(unirPrefs(cerebro.id, origenes, preparado.datos.prefs)).length,
            archivosLeidos: preparado.datos.archivos.length,
        });
    }

    async function fusionar() {
        if (fusionando) return;
        setFusionando(true);
        setError(null);
        setAviso(null);
        try {
            const preparado = await preparar();
            if (!preparado) return;
            if (!copiaFallida) {
                const copia = copiaDeSeguridad([cerebro, ...origenes], preparado.datos, preparado.fecha);
                if (!descargarCopia(copia)) {
                    setCopiaFallida(true);
                    setAviso("No se pudo descargar la copia de seguridad. Pulsa «Seguir sin copia descargada» si quieres fusionar igualmente.");
                    return;
                }
            }
            const resultado = await aplicarFusion(cerebro, origenes, preparado.plan, preparado.datos, quitar, preparado.fecha);
            if (resultado.errores.length > 0) {
                setError(resultado.errores.join(" "));
                toast.error(`La fusión no terminó: ${resultado.errores.join(" ")}`);
                return;
            }
            const partes = [
                `«${cerebro.name}»: ${resultado.archivos} archivo(s), ${formatearKb(resultado.bytes)}, ${resultado.includes} includes, ${resultado.servidores} servidor(es), ${resultado.preferencias} preferencia(s).`,
            ];
            if (resultado.quitados.length > 0) partes.push(`Quitados: ${resultado.quitados.join(", ")}.`);
            if (resultado.conservados.length > 0) {
                partes.push(`Conservados: ${resultado.conservados.map((c) => `${c.nombre} (${c.motivo})`).join(", ")}.`);
            }
            if (resultado.avisos.length > 0) partes.push(resultado.avisos.join(" "));
            toast.success(partes.join(" "));
            onHecho?.();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo fusionar.");
        } finally {
            setFusionando(false);
        }
    }

    const ocupado = cargando || fusionando;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader className="relative">
                    <div className="pointer-events-none absolute right-0 top-0 hidden w-28 text-cyan-300 opacity-20 sm:block" aria-hidden>
                        <MarcaFusion className="h-auto w-full" />
                    </div>
                    <DialogTitle className="flex items-center gap-2">
                        <GitMerge className="h-5 w-5 text-cyan-400" aria-hidden />
                        <span className="break-words">Fusionar · «{cerebro.name}»</span>
                    </DialogTitle>
                    <DialogDescription>
                        Se mezclarán en «{cerebro.name}» todas sus memorias y configuraciones.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2 text-white">
                    {error && (
                        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs leading-relaxed text-red-100">
                            {error}
                        </p>
                    )}
                    {aviso && (
                        <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
                            {aviso}
                        </p>
                    )}

                    {otros.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/60">
                            No hay otros cerebros en tu cuenta. Crea uno antes de fusionar.
                        </p>
                    ) : (
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium text-white/85">Cerebros que se integran</legend>
                            <ul className="space-y-2">
                                {otros.map((b) => {
                                    const marcado = seleccionados.includes(b.id);
                                    return (
                                        <li key={b.id}>
                                            <label
                                                className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-xl border p-3 transition ${
                                                    marcado
                                                        ? "border-cyan-400/50 bg-cyan-500/[0.08]"
                                                        : "border-white/10 bg-white/[0.03] hover:border-white/25"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={marcado}
                                                    onChange={() => alternar(b.id)}
                                                    disabled={ocupado}
                                                    className="h-4 w-4 cursor-pointer accent-cyan-400"
                                                />
                                                <span className="min-w-0 flex-1 break-words text-sm font-medium">{b.name}</span>
                                                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
                                                    {pestanaDeCerebro(b) === "publicos" ? "Público" : "Privado"}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] text-white/55">
                                                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                                                    {b.created_at ? `Creado el ${fechaLegible(b.created_at)}` : "Fecha de creación sin medida"}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </fieldset>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-auto cursor-pointer whitespace-normal border-white/15 py-1.5"
                            disabled={ocupado || seleccionados.length === 0}
                            onClick={() => void verVistaPrevia()}
                        >
                            {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                            Ver vista previa
                        </Button>
                        <span className="text-xs text-white/50">
                            {seleccionados.length} de {otros.length} seleccionados
                        </span>
                    </div>

                    {vista && (
                        <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="text-sm font-medium text-white/85">Vista previa</h3>
                                <p className="text-[11px] text-white/50">
                                    {vista.plan.archivos.length} archivo(s) en el plan · {vista.archivosLeidos} leído(s)
                                </p>
                            </div>
                            {vista.plan.archivos.length === 0 ? (
                                <p className="text-xs leading-relaxed text-white/60">
                                    No hay archivos de memoria que entren: solo se mezclarán configuraciones y preferencias.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="text-white/50">
                                            <tr>
                                                <th className="py-1 pr-3 font-medium">Archivo</th>
                                                <th className="py-1 pr-3 font-medium">Qué pasa</th>
                                                <th className="py-1 font-medium">Entran</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vista.plan.archivos.map((archivo) => (
                                                <tr key={archivo.name} className="border-t border-white/10">
                                                    <td className="break-words py-1.5 pr-3">{archivo.name}</td>
                                                    <td className="py-1.5 pr-3">{accionEnPalabras(archivo, vista.fecha, vista.datos, cerebro.id)}</td>
                                                    <td className="py-1.5">{formatearKb(archivo.bytesQueEntran)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                                <div>
                                    <dt className="text-white/50">Archivos nuevos</dt>
                                    <dd>{vista.plan.resumen.archivosNuevos}</dd>
                                </div>
                                <div>
                                    <dt className="text-white/50">Anexados</dt>
                                    <dd>{vista.plan.resumen.archivosAnexados}</dd>
                                </div>
                                <div>
                                    <dt className="text-white/50">Ya estaban</dt>
                                    <dd>{vista.plan.resumen.archivosOmitidos}</dd>
                                </div>
                                <div>
                                    <dt className="text-white/50">Includes · servidores · preferencias</dt>
                                    <dd>
                                        {vista.includes} · {vista.servidores} · {vista.preferencias}
                                    </dd>
                                </div>
                            </dl>
                            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/50">
                                <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                Nada se escribe hasta que pulses «Fusionar». Antes se descargará una copia de seguridad en este aparato.
                            </p>
                        </section>
                    )}

                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <input
                            type="checkbox"
                            checked={quitar}
                            onChange={(e) => setQuitar(e.target.checked)}
                            disabled={ocupado}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-cyan-400"
                        />
                        <span className="text-sm leading-relaxed text-white/80">
                            Quitar los cerebros fusionados después
                            <span className="mt-1 block text-[11px] leading-relaxed text-white/50">
                                Si no se pueden borrar, se conservan y el aviso final dice el motivo. Sus archivos solo desaparecen con ellos.
                            </span>
                        </span>
                    </label>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row">
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-auto cursor-pointer whitespace-normal py-1.5"
                        onClick={() => onOpenChange(false)}
                        disabled={fusionando}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="h-auto cursor-pointer whitespace-normal bg-cyan-600 py-2 text-white hover:bg-cyan-700"
                        disabled={ocupado || seleccionados.length === 0}
                        onClick={() => void fusionar()}
                    >
                        {fusionando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : copiaFallida ? <Download className="h-4 w-4" aria-hidden /> : <GitMerge className="h-4 w-4" aria-hidden />}
                        {copiaFallida ? "Seguir sin copia descargada" : "Fusionar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
