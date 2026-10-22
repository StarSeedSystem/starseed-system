"use client";

/**
 * Telepatía de un cerebro (§5): vincula y sincroniza sin mezclar.
 * Lista los vínculos, permite sincronizar, pausar, reanudar y quitar, y crea
 * vínculos nuevos en tres pasos: destino → alcance → dirección y acceso.
 */

import { useEffect, useState } from "react";
import { Copy, Loader2, Orbit, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { misEntidades, type EntidadGestionable } from "@/lib/genesis/entidades";
import {
  CONFIGURACIONES_TELEPATIA,
  accesoEnPalabras,
  alcanceResumido,
  conVinculo,
  destinoEnPalabras,
  direccionEnPalabras,
  estadoConMotivo,
  etiquetaConfiguracion,
  normalizarVinculos,
  carpetasTelepatia,
  sinVinculo,
  validarVinculo,
  type DestinoTelepatia,
  type VinculoTelepatico,
} from "@/lib/cerebros/telepatia";
import { aplicarVinculoTelepatia, type EntidadVinculo } from "@/lib/cerebros/telepatia-aplicar";

export interface TelepatiaDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

interface Formulario {
  destino: string;
  nombreCuenta: string;
  completo: boolean;
  memorias: string[];
  carpetas: string[];
  configuraciones: string[];
  direccion: VinculoTelepatico["direccion"];
  acceso: VinculoTelepatico["acceso"];
  auto: boolean;
  expira: string;
}

const FORMULARIO: Formulario = {
  destino: "",
  nombreCuenta: "",
  completo: true,
  memorias: [],
  carpetas: [],
  configuraciones: [],
  direccion: "ambas",
  acceso: "leer",
  auto: true,
  expira: "",
};

const SELECT = "h-9 w-full cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";

/** Nombre legible de cada tipo de entidad que devuelve `misEntidades()`. */
const TIPO_ENTIDAD: Record<string, string> = { grupo: "Grupo", comunidad: "Comunidad", pagina: "Página" };

/**
 * Vesica piscis: dos dominios que se solapan y una zona común.
 * Aquí son los dos cerebros y el vínculo: solo se comparte lo que ambos tocan.
 * Capa decorativa, sin eventos y con poco peso visual.
 */
function MarcaVesica({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden focusable="false">
      <circle cx="46" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="74" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "sin medida";
  return new Date(t).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Lee las carpetas de memoria de este aparato y las pasa por la función pura
 * de `telepatia.ts` (misma clave que `brains-panel.tsx` y `memory-sync`).
 */
function leerCarpetas(brainId: string): Array<{ id: string; nombre: string }> {
  if (typeof window === "undefined") return [];
  try {
    const idsGuardados = JSON.parse(
      window.localStorage.getItem(`starseed.brain.${brainId}.memoryRoots`) ?? "[]",
    ) as unknown;
    const raices = JSON.parse(window.localStorage.getItem("starseed.memory.roots.v1") ?? "[]") as unknown;
    return carpetasTelepatia(raices, idsGuardados);
  } catch {
    return [];
  }
}

function destinoDelFormulario(form: Formulario): DestinoTelepatia | null {
  if (form.destino === "cuenta") {
    const nombre = form.nombreCuenta.trim();
    return nombre ? { tipo: "cuenta", id: nombre } : null;
  }
  const partes = form.destino.split(":");
  const tipo = partes[0];
  const id = partes.slice(1).join(":");
  if (!id) return null;
  if (tipo === "cerebro" || tipo === "grupo" || tipo === "comunidad" || tipo === "pagina") return { tipo, id };
  return null;
}

export default function TelepatiaDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: TelepatiaDialogProps) {
  const [vinculos, setVinculos] = useState<VinculoTelepatico[]>(() => normalizarVinculos(cerebro.config));
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<Array<{ id: string; nombre: string }>>([]);
  const [entidades, setEntidades] = useState<EntidadVinculo[]>([]);
  const [form, setForm] = useState<Formulario>(FORMULARIO);
  const [paso, setPaso] = useState(1);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVinculos(normalizarVinculos(cerebro.config));
    setForm(FORMULARIO);
    setPaso(1);
    setError(null);
    setAvisos([]);
    setToken(null);
    setCopiado(false);
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void (async () => {
      const [archivos, resultado] = await Promise.all([listMemoryFiles(cerebro.id), misEntidades()]);
      if (!vivo) return;
      setMemorias(archivos.map((a) => a.name));
      if (resultado.ok) {
        setEntidades(resultado.lista.map((e: EntidadGestionable) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre, slug: e.slug })));
      } else {
        setError(`No se pudieron leer tus grupos y páginas: ${resultado.motivo}`);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [open, cerebro.id]);

  const cambiar = (parcial: Partial<Formulario>) => setForm((f) => ({ ...f, ...parcial }));
  const alternar = (clave: "memorias" | "carpetas" | "configuraciones", valor: string) =>
    setForm((f) => ({
      ...f,
      [clave]: f[clave].includes(valor) ? f[clave].filter((x) => x !== valor) : [...f[clave], valor],
    }));

  async function guardarLista(lista: VinculoTelepatico[]): Promise<boolean> {
    const guardado = await saveBrain({ ...cerebro, config: { ...cerebro.config, telepatia: lista } });
    if (!guardado) {
      setError("No se pudo guardar la lista de vínculos en este cerebro.");
      return false;
    }
    setVinculos(lista);
    onHecho?.();
    return true;
  }

  async function cambiarEstado(v: VinculoTelepatico, estado: "activo" | "pausado") {
    setOcupado(v.id);
    setError(null);
    const lista = vinculos.map((x) => (x.id === v.id ? { ...x, estado } : x));
    await guardarLista(lista);
    setOcupado(null);
  }

  async function quitar(v: VinculoTelepatico) {
    setOcupado(v.id);
    setError(null);
    const guardado = await guardarLista(vinculos.filter((x) => x.id !== v.id));
    if (guardado) {
      setAvisos([
        "Vínculo quitado de este cerebro. Lo que ya se copió en la otra parte se conserva.",
        ...(v.destino.tipo === "cuenta"
          ? ["El token de la cuenta externa sigue vivo: revócalo en Cuenta → Externos y APIs."]
          : []),
      ]);
    }
    setOcupado(null);
  }

  async function sincronizar(v: VinculoTelepatico) {
    setOcupado(v.id);
    setError(null);
    setAvisos([]);
    try {
      // La lista viva manda: así una sincronización no borra un vínculo recién creado.
      const cerebroConLista = { ...cerebro, config: { ...cerebro.config, telepatia: vinculos } };
      const resultado = await aplicarVinculoTelepatia(v, cerebroConLista, { cerebros, entidades });
      if (resultado.errores.length) setError(resultado.errores.join(" "));
      if (resultado.avisos.length) setAvisos(resultado.avisos);
      if (resultado.token) setToken(resultado.token);
      if (resultado.ok) {
        const ahora = new Date().toISOString();
        setVinculos((lista) => lista.map((x) => (x.id === v.id ? { ...x, ultimaSync: ahora } : x)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sincronizar este vínculo.");
    } finally {
      setOcupado(null);
    }
    onHecho?.();
  }

  async function crear() {
    const destino = destinoDelFormulario(form);
    if (!destino) {
      setError("Elige un destino: otro cerebro, un grupo, una comunidad, una página o una cuenta externa.");
      return;
    }
    const expiraEn = form.expira ? new Date(`${form.expira}T23:59:59`).toISOString() : null;
    const vinculo: VinculoTelepatico = {
      id: nuevoId(),
      destino,
      alcance: {
        completo: form.completo,
        memorias: form.completo ? [] : form.memorias,
        carpetas: form.completo ? [] : form.carpetas,
        configuraciones: form.completo ? [] : form.configuraciones,
      },
      direccion: form.direccion,
      acceso: form.acceso,
      auto: form.auto,
      estado: "activo",
      creadoEn: new Date().toISOString(),
      expiraEn,
      ultimaSync: null,
    };
    const revision = validarVinculo(vinculo);
    if (!revision.ok) {
      setError(revision.motivo);
      return;
    }

    setOcupado("nuevo");
    setError(null);
    setAvisos([]);
    const config = conVinculo({ ...cerebro.config, telepatia: vinculos }, vinculo);
    const cerebroConVinculo = { ...cerebro, config };
    try {
      const guardado = await saveBrain(cerebroConVinculo);
      if (!guardado) {
        setError("No se pudo guardar el vínculo en este cerebro.");
        return;
      }
      const listaConVinculo = normalizarVinculos(config);
      setVinculos(listaConVinculo);

      const resultado = await aplicarVinculoTelepatia(vinculo, cerebroConVinculo, { cerebros, entidades });
      if (resultado.token) {
        setCopiado(false);
        setToken(resultado.token);
      }
      if (resultado.errores.length) setError(resultado.errores.join(" "));
      if (resultado.avisos.length) setAvisos(resultado.avisos);
      if (destino.tipo === "cuenta" && !resultado.ok) {
        const revertido = await saveBrain({ ...cerebro, config: sinVinculo(config, vinculo.id) });
        if (revertido) setVinculos(normalizarVinculos(sinVinculo(config, vinculo.id)));
      } else if (resultado.ok) {
        const ahora = new Date().toISOString();
        setVinculos(listaConVinculo.map((x) => (x.id === vinculo.id ? { ...x, ultimaSync: ahora } : x)));
        setForm(FORMULARIO);
        setPaso(1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el vínculo.");
    } finally {
      setOcupado(null);
    }
    onHecho?.();
  }

  const tipoDestino = form.destino === "cuenta" ? "cuenta" : form.destino.split(":")[0] ?? "";
  const idDestino = form.destino.includes(":") ? form.destino.slice(form.destino.indexOf(":") + 1) : "";
  const destinoListo = tipoDestino === "cuenta" ? form.nombreCuenta.trim().length > 0 : Boolean(idDestino);
  const alcanceListo = form.completo || form.memorias.length + form.carpetas.length + form.configuraciones.length > 0;
  const nombreDestino = (() => {
    if (tipoDestino === "cuenta") return form.nombreCuenta.trim() || "Una cuenta externa";
    if (tipoDestino === "cerebro") return cerebros.find((c) => c.id === idDestino)?.name ?? "Cerebro no encontrado";
    const entidad = entidades.find((e) => e.id === idDestino && e.tipo === tipoDestino);
    return entidad?.nombre ?? "Entidad no encontrada";
  })();
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="relative">
          <div className="pointer-events-none absolute right-0 top-0 hidden w-28 text-violet-300 opacity-20 sm:block" aria-hidden>
            <MarcaVesica className="h-auto w-full" />
          </div>
          <DialogTitle className="flex items-center gap-2">
            <Orbit className="h-5 w-5 text-violet-400" aria-hidden />
            <span className="break-words">Telepatía · «{cerebro.name}»</span>
          </DialogTitle>
          <DialogDescription>
            Telepatía vincula y sincroniza sin mezclar: cada cerebro sigue siendo suyo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-white">
          {error && (
            <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs leading-relaxed text-red-100">
              {error}
            </p>
          )}
          {avisos.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
              {avisos.map((aviso) => <li key={aviso} className="break-words">{aviso}</li>)}
            </ul>
          )}
          {token && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3">
              <p className="text-xs text-emerald-100">Token del vínculo externo. No se volverá a mostrar.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-black/40 p-2 text-xs">{token}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto cursor-pointer whitespace-normal border-emerald-300/40 py-1.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(token).then(() => setCopiado(true)).catch(() => setError("No se pudo copiar el token; selecciónalo a mano."));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          )}

          <section aria-labelledby="vinculos-actuales" className="space-y-3">
            <h3 id="vinculos-actuales" className="text-sm font-semibold">
              Vínculos de este cerebro ({vinculos.length})
            </h3>
            {vinculos.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-white/60">
                Todavía no hay vínculos. Cada cerebro sigue siendo suyo: solo se comparte lo que diga el vínculo.
              </p>
            ) : (
              <ul className="space-y-2">
                {vinculos.map((v) => {
                  const info = estadoConMotivo(v);
                  const trabajando = ocupado === v.id;
                  return (
                    <li key={v.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="break-words text-sm font-medium">{destinoEnPalabras(v, cerebros, entidades)}</p>
                          <p className="break-words text-xs text-white/60">
                            {alcanceResumido(v.alcance)} · {direccionEnPalabras(v.direccion)} · {accesoEnPalabras(v.acceso)}
                          </p>
                          <p className="break-words text-xs text-white/60">
                            Estado: <span className={info.estado === "activo" ? "text-emerald-200" : "text-amber-200"}>{info.estado}</span> · {info.motivo}
                          </p>
                          <p className="break-words text-xs text-white/60">Última sincronización: {fechaLegible(v.ultimaSync)}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-auto cursor-pointer whitespace-normal border-white/15 py-1.5"
                            disabled={ocupado !== null}
                            onClick={() => void sincronizar(v)}
                          >
                            <RefreshCw className={trabajando ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
                            Sincronizar ahora
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-auto cursor-pointer whitespace-normal border-white/15 py-1.5"
                            disabled={ocupado !== null}
                            onClick={() => void cambiarEstado(v, v.estado === "pausado" ? "activo" : "pausado")}
                          >
                            {v.estado === "pausado" ? "Reanudar" : "Pausar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-auto cursor-pointer whitespace-normal py-1.5 text-red-200"
                            disabled={ocupado !== null}
                            onClick={() => void quitar(v)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Quitar
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="nuevo-vinculo" className="space-y-3 border-t border-white/10 pt-4">
            <h3 id="nuevo-vinculo" className="text-sm font-semibold">
              Nuevo vínculo · paso {paso} de 3
            </h3>

            {paso === 1 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="telepatia-destino" className="text-xs text-white/60">Destino</Label>
                  <select
                    id="telepatia-destino"
                    className={SELECT}
                    value={form.destino}
                    onChange={(e) => cambiar({ destino: e.target.value })}
                  >
                    <option value="" disabled>Elige otro cerebro, una entidad o una cuenta externa</option>
                    <optgroup label="Otros cerebros míos">
                      {cerebros.filter((c) => c.id !== cerebro.id).map((c) => (
                        <option key={c.id} value={`cerebro:${c.id}`}>{c.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Mis grupos, comunidades y páginas">
                      {entidades.map((e) => (
                        <option key={`${e.tipo}:${e.id}`} value={`${e.tipo}:${e.id}`}>
                          {TIPO_ENTIDAD[e.tipo] ?? "Grupo o comunidad"} · {e.nombre}
                        </option>
                      ))}
                    </optgroup>
                    <option value="cuenta">Una cuenta externa (con nombre)</option>
                  </select>
                </div>
                {form.destino === "cuenta" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="telepatia-cuenta" className="text-xs text-white/60">Nombre de la cuenta externa</Label>
                    <Input
                      id="telepatia-cuenta"
                      className="border-white/15 bg-black/40"
                      placeholder="Quién recibe el token"
                      value={form.nombreCuenta}
                      onChange={(e) => cambiar({ nombreCuenta: e.target.value })}
                    />
                    <p className="text-xs text-white/50">El token se enseña una sola vez al guardar. No se volverá a mostrar.</p>
                  </div>
                )}
              </div>
            )}

            {paso === 2 && (
              <div className="space-y-3">
                <label htmlFor="telepatia-completo" className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    id="telepatia-completo"
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-violet-500"
                    checked={form.completo}
                    onChange={(e) => cambiar({ completo: e.target.checked })}
                  />
                  Cerebro completo
                </label>

                {!form.completo && (
                  <div className="space-y-3">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-white/60">Memorias de «{cerebro.name}»</legend>
                      {memorias.length === 0 ? (
                        <p className="text-xs text-white/50">Este cerebro no tiene archivos de memoria legibles ahora mismo.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {memorias.map((nombre, i) => (
                            <label key={nombre} htmlFor={`tel-mem-${i}`} className="flex cursor-pointer items-center gap-2 break-all text-xs">
                              <input id={`tel-mem-${i}`} type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-violet-500" checked={form.memorias.includes(nombre)} onChange={() => alternar("memorias", nombre)} />
                              {nombre}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-white/60">Carpetas de memoria de este aparato</legend>
                      {carpetas.length === 0 ? (
                        <p className="text-xs text-white/50">No hay carpetas vinculadas a este cerebro en este aparato.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {carpetas.map((carpeta, i) => (
                            <label key={carpeta.id} htmlFor={`tel-carp-${i}`} className="flex cursor-pointer items-center gap-2 break-all text-xs">
                              <input id={`tel-carp-${i}`} type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-violet-500" checked={form.carpetas.includes(carpeta.id)} onChange={() => alternar("carpetas", carpeta.id)} />
                              {carpeta.nombre}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-white/60">Configuraciones</legend>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {CONFIGURACIONES_TELEPATIA.map((clave, i) => (
                          <label key={clave} htmlFor={`tel-cfg-${i}`} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input id={`tel-cfg-${i}`} type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-violet-500" checked={form.configuraciones.includes(clave)} onChange={() => alternar("configuraciones", clave)} />
                            {etiquetaConfiguracion(clave)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}
              </div>
            )}

            {paso === 3 && (
              <div className="space-y-3">
                <p className="break-words text-xs leading-relaxed text-white/60">
                  Se vinculará <span className="text-white">{nombreDestino}</span> con alcance «{form.completo ? "Cerebro completo" : alcanceResumido({ completo: false, memorias: form.memorias, carpetas: form.carpetas, configuraciones: form.configuraciones })}». Nunca se borra nada en la otra parte.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="telepatia-direccion" className="text-xs text-white/60">Dirección</Label>
                    <select id="telepatia-direccion" className={SELECT} value={form.direccion} onChange={(e) => cambiar({ direccion: e.target.value as Formulario["direccion"] })}>
                      <option value="enviar">Enviar desde este cerebro</option>
                      <option value="recibir">Recibir en este cerebro</option>
                      <option value="ambas">En ambas direcciones</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telepatia-acceso" className="text-xs text-white/60">Acceso</Label>
                    <select id="telepatia-acceso" className={SELECT} value={form.acceso} onChange={(e) => cambiar({ acceso: e.target.value as Formulario["acceso"] })}>
                      <option value="leer">Solo lectura</option>
                      <option value="escribir">Lectura y escritura</option>
                    </select>
                  </div>
                  <label htmlFor="telepatia-auto" className="flex cursor-pointer items-center gap-2 text-sm">
                    <input id="telepatia-auto" type="checkbox" className="h-4 w-4 cursor-pointer accent-violet-500" checked={!form.auto} onChange={(e) => cambiar({ auto: !e.target.checked })} />
                    Sincronizar solo
                  </label>
                  <p className="text-xs leading-relaxed text-white/50">
                    {form.auto
                      ? "La sincronización automática queda guardada, pero hoy solo se sincroniza al pulsar «Sincronizar ahora»."
                      : "Mientras esté marcado, no se copia nada entre los cerebros hasta que pulses «Sincronizar ahora»."}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="telepatia-expira" className="text-xs text-white/60">Caducidad (opcional)</Label>
                    <Input id="telepatia-expira" type="date" min={hoy} className="border-white/15 bg-black/40" value={form.expira} onChange={(e) => cambiar({ expira: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {paso > 1 && (
                <Button type="button" size="sm" variant="outline" className="h-auto cursor-pointer whitespace-normal border-white/15 py-1.5" disabled={ocupado !== null} onClick={() => setPaso((p) => p - 1)}>
                  Atrás
                </Button>
              )}
              {paso < 3 ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-auto cursor-pointer whitespace-normal bg-violet-600 py-1.5 text-white hover:bg-violet-700"
                  disabled={paso === 1 ? !destinoListo : !alcanceListo}
                  onClick={() => setPaso((p) => p + 1)}
                >
                  Siguiente
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-auto cursor-pointer whitespace-normal bg-violet-600 py-1.5 text-white hover:bg-violet-700"
                  disabled={ocupado !== null}
                  onClick={() => void crear()}
                >
                  {ocupado === "nuevo" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Guardar vínculo
                </Button>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-auto cursor-pointer whitespace-normal border-white/15 py-1.5" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
