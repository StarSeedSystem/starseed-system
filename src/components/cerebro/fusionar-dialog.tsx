"use client";

/**
 * «Fusionar» de un cerebro (§4 de architecture/cerebros-fusion-telepatia.md).
 *
 * Mezcla en ESTE cerebro (el destino) las memorias y configuraciones de los
 * cerebros elegidos. No escribe nada hasta que se pulsa «Fusionar» y, antes de
 * escribir, descarga una copia de seguridad en el aparato.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, Merge } from "lucide-react";
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
import { deleteBrain, getBrain, saveBrain, type Brain, type BrainIncludes, type BrainServer } from "@/lib/brains/brains";
import { listMemoryFiles, saveMemoryFile } from "@/lib/cerebro/memory-files";
import { planFusion, type ArchivoMemoria, type PlanFusion, type PrefsCerebro } from "@/lib/cerebros/fusion";
import { pestanaDeCerebro } from "@/lib/cerebros/pestanas";
import { pushPreferences } from "@/lib/settings-sync";

export interface FusionarDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

interface DatosFusion {
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
}

interface ResultadoFusion {
  archivosEscritos: number;
  includes: number;
  servidores: number;
  preferencias: number;
  quitados: number;
  conservados: string[];
  errores: string[];
}

const SINTETICOS = new Set(["includes", "config", "servers", "prefs"]);
const CLAVES_INCLUDES = ["vaults", "backends", "personalities", "runtimes", "tokens", "memories", "connections"] as const;

function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "sin fecha";
  return new Date(t).toLocaleDateString("es", { dateStyle: "medium" });
}

function pesoLegible(bytes: number): string {
  return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
}

/** Lee las preferencias de este aparato que pertenecen a un cerebro. */
function leerPreferencias(brainId: string): PrefsCerebro {
  if (typeof window === "undefined") return {};
  const prefijo = `starseed.brain.${brainId}.`;
  const prefs: PrefsCerebro = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const clave = window.localStorage.key(i);
      if (!clave || !clave.startsWith(prefijo) || clave.length === prefijo.length) continue;
      const crudo = window.localStorage.getItem(clave);
      if (crudo === null) continue;
      try {
        prefs[clave.slice(prefijo.length)] = JSON.parse(crudo) as unknown;
      } catch {
        prefs[clave.slice(prefijo.length)] = crudo;
      }
    }
  } catch {
    return {};
  }
  return prefs;
}

function escribirPreferencias(brainId: string, prefs: PrefsCerebro): boolean {
  if (typeof window === "undefined") return false;
  let ok = true;
  for (const [clave, valor] of Object.entries(prefs)) {
    try {
      window.localStorage.setItem(`starseed.brain.${brainId}.${clave}`, JSON.stringify(valor));
    } catch {
      ok = false;
    }
  }
  return ok;
}

function contarIncludes(includes: BrainIncludes): number {
  let total = 0;
  for (const clave of CLAVES_INCLUDES) total += Array.isArray(includes[clave]) ? includes[clave].length : 0;
  if (Array.isArray(includes.permissions)) total += includes.permissions.length;
  else if (includes.permissions && typeof includes.permissions === "object") total += Object.keys(includes.permissions).length;
  return total;
}

/** Unión de servidores por id y, si no tiene id, por endpoint: el mismo servidor no se cuenta dos veces. */
function unirServidores(destino: Brain, origenes: Brain[]): BrainServer[] {
  const vistos = new Set<string>();
  const lista: BrainServer[] = [];
  for (const cerebro of [destino, ...origenes]) {
    for (const servidor of cerebro.servers ?? []) {
      const clave = servidor.endpoint ? `endpoint:${servidor.endpoint}` : `id:${servidor.id}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(servidor);
    }
  }
  return lista;
}

/**
 * Lee lo que hace falta para planificar: los archivos reales de cada cerebro y
 * sus preferencias locales. Añade archivos sintéticos con las mismas claves que
 * consulta `planFusion` para includes, config y prefs. No escribe nada.
 */
async function leerParaFusion(destino: Brain, origenes: Brain[]): Promise<DatosFusion> {
  const archivos: ArchivoMemoria[] = [];
  const prefs: Record<string, PrefsCerebro> = {};
  for (const cerebro of [destino, ...origenes]) {
    const reales = await listMemoryFiles(cerebro.id);
    for (const archivo of reales) {
      archivos.push({
        id: archivo.id,
        brain_id: cerebro.id,
        name: archivo.name,
        content: archivo.content,
        updated_at: archivo.updated_at ?? null,
        meta: archivo.meta ?? null,
      });
    }
    prefs[cerebro.id] = leerPreferencias(cerebro.id);
    const includes: BrainIncludes = {
      vaults: cerebro.includes?.vaults ?? [],
      backends: cerebro.includes?.backends ?? [],
      personalities: cerebro.includes?.personalities ?? [],
      runtimes: cerebro.includes?.runtimes ?? [],
      tokens: cerebro.includes?.tokens ?? [],
      memories: cerebro.includes?.memories ?? [],
      connections: cerebro.includes?.connections ?? [],
      bindScope: cerebro.includes?.bindScope ?? false,
      permissions: cerebro.includes?.permissions ?? [],
      aiProvider: cerebro.includes?.aiProvider,
    };
    archivos.push({ brain_id: cerebro.id, name: "includes", content: JSON.stringify(includes) });
    archivos.push({ brain_id: cerebro.id, name: "config", content: JSON.stringify(cerebro.config ?? {}) });
    archivos.push({ brain_id: cerebro.id, name: "prefs", content: JSON.stringify(prefs[cerebro.id]) });
  }
  return { archivos, prefs };
}

interface CopiaSeguridad {
  version: number;
  fecha: string;
  destino: Brain;
  origenes: Brain[];
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
}

function copiaDeSeguridad(datos: DatosFusion, destino: Brain, origenes: Brain[], fecha: string): CopiaSeguridad {
  return {
    version: 1,
    fecha,
    destino,
    origenes,
    archivos: datos.archivos.filter((a) => !SINTETICOS.has(a.name)),
    prefs: datos.prefs,
  };
}

/** Descarga la copia en el aparato. Devuelve si se pudo lanzar la descarga. */
function descargarCopia(copia: CopiaSeguridad): boolean {
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `cerebros-fusion-${copia.fecha}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

/** Secciones nuevas de verdad: las que el archivo destino no tenía antes. */
function seccionesQueEntran(archivo: PlanFusion["archivos"][number], datos: DatosFusion, destinoId: string): number {
  if (archivo.accion !== "anexar") return 0;
  const patron = /^## Fusionado de /gm;
  const destino = datos.archivos.find((a) => a.brain_id === destinoId && a.name === archivo.name);
  const antes = destino ? (destino.content.match(patron) ?? []).length : 0;
  const despues = (archivo.contenido.match(patron) ?? []).length;
  return Math.max(0, despues - antes);
}

function accionEnPalabras(archivo: PlanFusion["archivos"][number], datos: DatosFusion, destinoId: string): string {
  if (archivo.accion === "copiar") return "copiar";
  if (archivo.accion === "omitir") return "ya estaba";
  const n = seccionesQueEntran(archivo, datos, destinoId);
  return n === 1 ? "añadir 1 sección" : `añadir ${n} secciones`;
}

/** Escribe el plan ya calculado. Los orígenes solo se quitan si se pidió y se puede. */
async function aplicarFusion(
  plan: PlanFusion,
  datos: DatosFusion,
  destino: Brain,
  origenes: Brain[],
  quitar: boolean,
): Promise<ResultadoFusion> {
  const errores: string[] = [];
  let archivosEscritos = 0;
  for (const archivo of plan.archivos) {
    if (SINTETICOS.has(archivo.name) || archivo.accion === "omitir") continue;
    const previo = datos.archivos.find((a) => a.brain_id === destino.id && a.name === archivo.name);
    const guardado = await saveMemoryFile({
      id: previo?.id,
      brain_id: destino.id,
      name: archivo.name,
      content: archivo.contenido,
    });
    if (guardado) archivosEscritos += 1;
    else errores.push(`No se pudo escribir «${archivo.name}».`);
  }

  const servidores = unirServidores(destino, origenes);
  const config: Record<string, unknown> = { ...plan.config };
  for (const origen of origenes) {
    for (const [clave, valor] of Object.entries(origen.config ?? {})) {
      if (!(clave in config)) config[clave] = valor;
    }
  }
  const cerebroGuardado = await saveBrain({ ...destino, includes: plan.includes, servers: servidores, config });
  if (!cerebroGuardado) errores.push("No se pudo guardar la configuración del cerebro destino.");

  const preferencias = Object.keys(plan.prefs).length;
  if (preferencias > 0) {
    if (!escribirPreferencias(destino.id, plan.prefs)) errores.push("No se pudieron guardar las preferencias en este aparato.");
    const sincronizadas = await pushPreferences();
    if (!sincronizadas.ok) errores.push("Las preferencias quedaron en el aparato; la sincronización con la cuenta falló.");
  }

  const conservados: string[] = [];
  let quitados = 0;
  if (!quitar) {
    for (const origen of origenes) conservados.push(`«${origen.name}»: no marcaste quitarlo.`);
  } else {
    for (const origen of origenes) {
      if (origen.owner && destino.owner && origen.owner !== destino.owner) {
        conservados.push(`«${origen.name}»: es de otra cuenta y solo se puede leer.`);
        continue;
      }
      const borrado = await deleteBrain(origen.id);
      if (!borrado) conservados.push(`«${origen.name}»: el borrado falló.`);
      else if (await getBrain(origen.id)) conservados.push(`«${origen.name}»: sigue en la cuenta tras el intento de quitarlo.`);
      else quitados += 1;
    }
  }

  return {
    archivosEscritos,
    includes: contarIncludes(plan.includes),
    servidores: servidores.length,
    preferencias,
    quitados,
    conservados,
    errores,
  };
}

export default function FusionarDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: FusionarDialogProps) {
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanFusion | null>(null);
  const [datos, setDatos] = useState<DatosFusion | null>(null);
  const [quitar, setQuitar] = useState(true);
  const [ocupado, setOcupado] = useState<"previa" | "fusion" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinCopia, setSinCopia] = useState(false);

  const otros = useMemo(() => cerebros.filter((c) => c.id !== cerebro.id), [cerebros, cerebro.id]);
  const origenes = useMemo(() => otros.filter((c) => seleccion.includes(c.id)), [otros, seleccion]);
  const archivos = useMemo(() => (plan ? plan.archivos.filter((a) => !SINTETICOS.has(a.name)) : []), [plan]);

  useEffect(() => {
    if (!open) return;
    setSeleccion([]);
    setPlan(null);
    setDatos(null);
    setQuitar(true);
    setOcupado(null);
    setError(null);
    setSinCopia(false);
  }, [open, cerebro.id]);

  function alternar(id: string) {
    setSeleccion((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
    setPlan(null);
    setDatos(null);
    setError(null);
    setSinCopia(false);
  }

  async function verPrevia() {
    if (origenes.length === 0) {
      setError("Elige al menos un cerebro para fusionar.");
      return;
    }
    setOcupado("previa");
    setError(null);
    setSinCopia(false);
    try {
      const leidos = await leerParaFusion(cerebro, origenes);
      const calculado = planFusion({
        destino: cerebro,
        origenes,
        archivos: leidos.archivos,
        prefs: leidos.prefs,
        fecha: new Date().toISOString().slice(0, 10),
      });
      setDatos(leidos);
      setPlan(calculado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar la vista previa.");
    } finally {
      setOcupado(null);
    }
  }

  async function fusionar() {
    if (!plan || !datos) {
      setError("Mira la vista previa antes de fusionar.");
      return;
    }
    if (origenes.length === 0) {
      setError("Elige al menos un cerebro para fusionar.");
      return;
    }
    const fecha = new Date().toISOString().slice(0, 10);
    if (!sinCopia) {
      const copia = copiaDeSeguridad(datos, cerebro, origenes, fecha);
      if (!descargarCopia(copia)) {
        setSinCopia(true);
        setError("No se pudo descargar la copia de seguridad en este aparato. Pulsa «Seguir sin copia descargada» solo si aceptas fusionar sin ella.");
        return;
      }
    }
    setOcupado("fusion");
    setError(null);
    try {
      const resultado = await aplicarFusion(plan, datos, cerebro, origenes, quitar);
      const resumen = archivos.filter((a) => a.accion !== "omitir").length;
      const detalle = [
        `${resultado.archivosEscritos} archivos escritos de ${resumen} previstos.`,
        `Includes: ${resultado.includes} · Servidores: ${resultado.servidores} · Preferencias: ${resultado.preferencias}.`,
        resultado.errores.length > 0 ? `Errores: ${resultado.errores.join(" ")}` : "",
        resultado.quitados > 0 ? `Orígenes quitados: ${resultado.quitados}.` : "",
        resultado.conservados.length > 0 ? `Orígenes conservados: ${resultado.conservados.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (resultado.errores.length > 0) toast.error("La fusión terminó con avisos", { description: detalle });
      else toast.success("Fusión terminada", { description: detalle });
      onHecho?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar la fusión.");
    } finally {
      setOcupado(null);
    }
  }

  const totalBytes = archivos.reduce((suma, a) => suma + a.bytesQueEntran, 0);
  const servidoresPlan = unirServidores(cerebro, origenes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-emerald-400" aria-hidden />
            <span className="break-words">Fusionar · «{cerebro.name}»</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            Se mezclarán en «{cerebro.name}» todas sus memorias y configuraciones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-white">
          {error && (
            <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
              {error}
            </p>
          )}

          <section aria-labelledby="fusion-origenes" className="space-y-2">
            <h3 id="fusion-origenes" className="text-sm font-semibold">
              Cerebros que se fusionan ({origenes.length} de {otros.length})
            </h3>
            {otros.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-white/60">
                No hay otros cerebros en esta cuenta. Fusionar necesita al menos uno del que traer memorias.
              </p>
            ) : (
              <ul className="space-y-2">
                {otros.map((otro) => (
                  <li key={otro.id}>
                    <label
                      htmlFor={`fusion-${otro.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 hover:border-white/20"
                    >
                      <input
                        id={`fusion-${otro.id}`}
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                        checked={seleccion.includes(otro.id)}
                        onChange={() => alternar(otro.id)}
                        disabled={ocupado !== null}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">{otro.name}</span>
                        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-white/60">
                          <span className="rounded-full border border-white/15 px-2 py-0.5">
                            {pestanaDeCerebro(otro) === "publicos" ? "Público" : "Privado"}
                          </span>
                          <span>Creado el {fechaLegible(otro.created_at)}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <label htmlFor="fusion-quitar" className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed">
            <input
              id="fusion-quitar"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
              checked={quitar}
              onChange={(e) => setQuitar(e.target.checked)}
              disabled={ocupado !== null}
            />
            <span>
              Quitar los cerebros fusionados después.
              <span className="mt-1 block text-white/60">
                Si se pueden borrar, sus archivos desaparecen con ellos. Los que no se puedan borrar se conservan y se te dice por qué.
              </span>
            </span>
          </label>

          <Button
            type="button"
            variant="outline"
            className="h-auto cursor-pointer whitespace-normal border-white/15 py-2"
            disabled={ocupado !== null || origenes.length === 0}
            onClick={() => void verPrevia()}
          >
            {ocupado === "previa" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Ver vista previa
          </Button>

          {plan && datos && (
            <section aria-labelledby="fusion-previa" className="space-y-2 border-t border-white/10 pt-3">
              <h3 id="fusion-previa" className="text-sm font-semibold">
                Vista previa · {archivos.length} archivos
              </h3>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[26rem] text-left text-xs">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="px-3 py-2 font-medium">Archivo</th>
                      <th className="px-3 py-2 font-medium">Qué pasa</th>
                      <th className="px-3 py-2 font-medium">Entran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivos.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 leading-relaxed text-white/60">
                          No hay archivos de memoria legibles ahora mismo; solo se mezclan configuraciones.
                        </td>
                      </tr>
                    ) : (
                      archivos.map((archivo) => (
                        <tr key={archivo.name} className="border-t border-white/10">
                          <td className="break-all px-3 py-2">{archivo.name}</td>
                          <td className="px-3 py-2">{accionEnPalabras(archivo, datos, cerebro.id)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{pesoLegible(archivo.bytesQueEntran)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="break-words text-xs leading-relaxed text-white/60">
                Includes: {contarIncludes(plan.includes)} · Servidores: {servidoresPlan.length} · Preferencias: {Object.keys(plan.prefs).length} · Entran: {pesoLegible(totalBytes)}.
              </p>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-white/50">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Nada se escribe hasta que pulses «Fusionar». Antes se descargará una copia de seguridad en este aparato.
              </p>
            </section>
          )}
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto cursor-pointer whitespace-normal border-white/15 py-2"
            disabled={ocupado !== null}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-auto cursor-pointer whitespace-normal bg-emerald-600 py-2 text-white hover:bg-emerald-700"
            disabled={ocupado !== null || !plan}
            onClick={() => void fusionar()}
          >
            {ocupado === "fusion" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {sinCopia ? "Seguir sin copia descargada" : "Fusionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
