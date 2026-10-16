"use client";

/**
 * Telepatía del cerebro: vínculos purificados y normalizados.
 * Contrato: architecture/cerebros-fusion-telepatia.md §5.
 * Implementa la interfaz de usuario de los vínculos telepáticos con destino en palabras,
 * alcance resumido, dirección, acceso, estado (y su motivo) y última sincronización.
 * Incluye botones «Sincronizar ahora», «Pausar»/«Reanudar» y «Quitar».
 * «Nuevo vínculo» con los pasos especificados en §5.
 */

import { useState, useMemo, useEffect } from "react";
import type { Brain } from "@/lib/brains/brains";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Loader2, Orbit, Plus, Trash2, RefreshCw, Pause, Play, Check, Copy, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { obtenerVinculos, normalizarVinculos, validarVinculo, destinoEnPalabras, alcanceResumido, estadoConMotivo } from "@/lib/cerebros/telepatia";

export interface TelepatiaDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

export default function TelepatiaDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: TelepatiaDialogProps) {
  const [vinculos, setVinculos] = useState(() => obtenerVinculos(cerebro));
  const [nuevoVinculo, setNuevoVinculo] = useState<Partial<import("@/lib/cerebros/telepatia").VinculoTelepatico> | null>(null);
  const [mostrandoToken, setMostrandoToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [entidadesMap, setEntidadesMap] = useState<Record<string, { tipo: string; nombre: string }>>({});

  // Obtener el mapa de entidades para la UI
  useEffect(() => {
    const cargarEntidades = async () => {
      try {
        const response = await fetch("/api/entidades?scope=group,page,community");
        if (response.ok) {
          const data = await response.json();
          const mapa = {};
          for (const ent of data.entidades || []) {
            mapa[ent.id] = { tipo: ent.tipo, nombre: ent.nombre };
          }
          setEntidadesMap(mapa);
        }
      } catch (error) {
        // Silently handle errors for entity fetching
      }
    };
    cargarEntidades();
  }, []);

  const cerebrosMap = useMemo(() => {
    const mapa: Record<string, Brain> = {};
    for (const c of cerebros) {
      mapa[c.id] = c;
    }
    return mapa;
  }, [cerebros]);

  const eliminarVinculo = async (vinculoId: string) => {
    setIsLoading(true);
    try {
      const updatedVinculos = vinculos.filter((v) => v.id !== vinculoId);
      setVinculos(updatedVinculos);
      // Actualizar cerebro con nuevos vínculos
      const payload = { config: { telepatia: updatedVinculos } };
      const response = await fetch("/api/cerebro/${cerebro.id}", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        // Emitir evento para que otros componentes se actualicen
        window.dispatchEvent(new CustomEvent("vinculos-telepatia-actualizados", {
          detail: { cerebroId: cerebro.id, vinculos: updatedVinculos }
        }));
        onHecho?.();
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      setIsLoading(false);
    }
  };

  const alternarEstadoVinculo = async (vinculo: VinculoTelepatico, nuevoEstado: "activo" | "pausado" | "pendiente") => {
    setIsLoading(true);
    try {
      const vinculosActualizados = vinculos.map((v) =>
        v.id === vinculo.id ? { ...v, estado: nuevoEstado, ultimaSync: nuevoEstado === "activo" ? new Date().toISOString() : v.ultimaSync } : v
      );
      setVinculos(vinculosActualizados);
      const payload = { config: { telepatia: vinculosActualizados } };
      const response = await fetch("/api/cerebro/${cerebro.id}", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        window.dispatchEvent(new CustomEvent("vinculos-telepatia-actualizados", {
          detail: { cerebroId: cerebro.id, vinculos: vinculosActualizados }
        }));
        onHecho?.();
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      setIsLoading(false);
    }
  };

  const sincronizarAhora = async (vinculo: VinculoTelepatico) => {
    setIsLoading(true);
    try {
      const vinculosActualizados = vinculos.map((v) =>
        v.id === vinculo.id ? { ...v, ultimaSync: new Date().toISOString() } : v
      );
      setVinculos(vinculosActualizados);
      const payload = { config: { telepatia: vinculosActualizados } };
      const response = await fetch("/api/cerebro/${cerebro.id}", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        window.dispatchEvent(new CustomEvent("vinculos-telepatia-actualizados", {
          detail: { cerebroId: cerebro.id, vinculos: vinculosActualizados }
        }));
        onHecho?.();
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      setIsLoading(false);
    }
  };

  const guardarNuevoVinculo = async () => {
    if (!nuevoVinculo) return;
    setIsCreating(true);
    try {
      const normalizado = normalizarVinculos([nuevoVinculo]);
      if (normalizado.length === 0) return;
      const err = validarVinculo(normalizado[0], cerebros, Object.values(entidadesMap));
      if (err.length) {
        alert(err.join("\n"));
        return;
      }
      const payload = { config: { telepatia: [...vinculos, ...normalizado] } };
      const response = await fetch("/api/cerebro/${cerebro.id}", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const actualizado = await response.json();
        setVinculos(actualizado.config?.telepatia || []);
        setNuevoVinculo(null);
        setMostrandoToken(null);
        window.dispatchEvent(new CustomEvent("vinculos-telepatia-actualizados", {
          detail: { cerebroId: cerebro.id, vinculos: actualizado.config?.telepatia || [] }
        }));
        onHecho?.();
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      setIsCreating(false);
    }
  };

  const copiarToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setMostrandoToken(token);
    setTimeout(() => setMostrandoToken(null), 3000);
  };\n
  const esExpirado = (expiraEn?: string | null) => expiraEn && new Date(expiraEn) < new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Orbit className="w-5 h-5 text-violet-400" />
            Telepatía · «{cerebro.name}»
          </DialogTitle>
          <DialogDescription>
            Vincula y sincroniza sin mezclar: cada cerebro sigue siendo suyo. Elige qué memorias, carpetas y configuraciones compartir, en qué dirección y con qué acceso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Lista de vínculos existentes */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-violet-400 rounded-full" />
              Vínculos activos ({vinculos.length})
            </h3>
            {vinculos.length === 0 ? (
              <div className="text-center py-8 text-white/45 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm">Aún no hay vínculos telepáticos.</p>
                <p className="text-xs mt-1">Haz clic en "Nuevo vínculo" para empezar.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vinculos.map((vinculo) => {
                  const infoEstado = estadoConMotivo(vinculo);
                  const destinoTexto = destinoEnPalabras(vinculo, cerebrosMap, entidadesMap);
                  const alcanceTexto = alcanceResumido(vinculo.alcance);
                  const esExpiradoFlag = esExpirado(vinculo.expiraEn);
                  return (
                    <div
                      key={vinculo.id}
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        esExpiradoFlag ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/5",
                        vinculo.estado === "pausado" && "opacity-70",
                        vinculo.estado === "pendiente" && "border-amber-500/30 bg-amber-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{destinoTexto}</span>
                            <Badge
                              variant={esExpiradoFlag ? "destructive" : vinculo.estado === "activo" ? "default" : "secondary"}
                              className={cn(
                                "text-xs",
                                esExpiradoFlag && "bg-red-500/20 text-red-200 border-red-500/30"
                              )}
                            >
                              {esExpiradoFlag ? "caducado" : vinculo.estado}
                            </Badge>
                          </div>
                          <div className="text-xs text-white/60 space-y-0.5">
                            <div>
                              <span className="text-white/45">Alcance:</span> {alcanceTexto}
                            </div>
                            <div>
                              <span className="text-white/45">Dirección:</span> {vinculo.direccion} · <span className="text-white/45">Acceso:</span> {vinculo.acceso}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-white/45">Última sync:</span>
                              {vinculo.ultimaSync ? format(new Date(vinculo.ultimaSync), "Pp", { locale: es }) : "Nunca"}
                              {infoEstado.motivo && (
                                <span className="text-amber-300 ml-1">· {infoEstado.motivo}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {vinculo.estado === "activo" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 border-white/15 hover:bg-white/5"
                              onClick={() => alternarEstadoVinculo(vinculo, "pausado")}
                              disabled={isLoading}
                            >
                              <Pause className="w-3 h-3" />
                            </Button>
                          )}
                          {vinculo.estado === "pausado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => alternarEstadoVinculo(vinculo, "activo")}
                              disabled={isLoading}
                            >
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-white/15 hover:bg-white/5"
                            onClick={() => sincronizarAhora(vinculo)}
                            disabled={isLoading}
                          >
                            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-red-500/30 hover:bg-red-500/10"
                            onClick={() => eliminarVinculo(vinculo.id)}
                            disabled={isLoading}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Formulario de nuevo vínculo */}
          <section className="border-t border-white/10 pt-6">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nuevo vínculo
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Destino *</Label>
                  <Select
                    value={nuevoVinculo?.destino?.tipo ? `${nuevoVinculo.destino.tipo}:${nuevoVinculo.destino.id}` : ""}
                    onValueChange={(val) => {
                      const [tipo, id] = val.split(":");
                      setNuevoVinculo({
                        ...nuevoVinculo,
                        destino: { tipo: tipo as any, id } as any,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona destino..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cerebros.map((c) => (
                        <SelectItem key={c.id} value={`cerebro:${c.id}`}>{c.name} (cerebro)</SelectItem>
                      ))}
                      {Object.values(entidadesMap).map((ent) => (
                        <SelectItem key={ent.tipo + ent.id} value={`${ent.tipo}:${ent.id}`}>{ent.nombre} ({ent.tipo})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Alcance</Label>
                  <Select
                    value={nuevoVinculo?.alcance?.completo ? "completo" : "parcial"}
                    onValueChange={(val) => {
                      if (val === "completo") {
                        setNuevoVinculo({
                          ...nuevoVinculo,
                          alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
                        });
                      } else {
                        setNuevoVinculo({
                          ...nuevoVinculo,
                          alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] },
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona alcance..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completo">Cerebro completo</SelectItem>
                      <SelectItem value="parcial">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {nuevoVinculo && !nuevoVinculo.alcance?.completo && (
                <div className="space-y-3 pl-4 border-l-2 border-white/10 ml-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">Memorias (selecciona una o más)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {cerebro.config?.includes?.memories?.map((mem: any) => (
                        <div key={mem.name} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mem-${mem.name}`}
                            checked={nuevoVinculo.alcance?.memorias?.includes(mem.name)}
                            onCheckedChange={(checked) => {
                              const memorias = checked
                                ? [...(nuevoVinculo.alcance?.memorias || []), mem.name]
                                : (nuevoVinculo.alcance?.memorias || []).filter((m) => m !== mem.name);
                              setNuevoVinculo({
                                ...nuevoVinculo,
                                alcance: { ...nuevoVinculo.alcance, memorias },
                              });
                            }}
                          />
                          <Label htmlFor={`mem-${mem.name}`} className="text-xs cursor-pointer">
                            {mem.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">Carpetas (selecciona una o más)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center space-x-2">
                          <Checkbox
                            id={`folder-${i}`}
                            checked={nuevoVinculo.alcance?.carpetas?.includes(`carpeta-${i}`)}
                            onCheckedChange={(checked) => {
                              const carpetas = checked
                                ? [...(nuevoVinculo.alcance?.carpetas || []), `carpeta-${i}`]
                                : (nuevoVinculo.alcance?.carpetas || []).filter((c) => c !== `carpeta-${i}`);
                              setNuevoVinculo({
                                ...nuevoVinculo,
                                alcance: { ...nuevoVinculo.alcance, carpetas },
                              });
                            }}
                          />
                          <Label htmlFor={`folder-${i}`} className="text-xs cursor-pointer">
                            Carpeta {i + 1}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">Configuraciones (selecciona una o más)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {["servers", "runtimes", "skills", "storage"].map((cfg) => (
                        <div key={cfg} className="flex items-center space-x-2">
                          <Checkbox
                            id={`cfg-${cfg}`}
                            checked={nuevoVinculo.alcance?.configuraciones?.includes(cfg)}
                            onCheckedChange={(checked) => {
                              const configuraciones = checked
                                ? [...(nuevoVinculo.alcance?.configuraciones || []), cfg]
                                : (nuevoVinculo.alcance?.configuraciones || []).filter((c) => c !== cfg);
                              setNuevoVinculo({
                                ...nuevoVinculo,
                                alcance: { ...nuevoVinculo.alcance, configuraciones },
                              });
                            }}
                          />
                          <Label htmlFor={`cfg-${cfg}`} className="text-xs cursor-pointer capitalize">
                            {cfg}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Dirección</Label>
                  <Select
                    value={nuevoVinculo?.direccion}
                    onValueChange={(val) => setNuevoVinculo({ ...nuevoVinculo, direccion: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dirección" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enviar">Enviar</SelectItem>
                      <SelectItem value="recibir">Recibir</SelectItem>
                      <SelectItem value="ambas">Ambas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Acceso</Label>
                  <Select
                    value={nuevoVinculo?.acceso}
                    onValueChange={(val) => setNuevoVinculo({ ...nuevoVinculo, acceso: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Acceso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leer">Leer</SelectItem>
                      <SelectItem value="escribir">Escribir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Auto</Label>
                  <Select
                    value={nuevoVinculo?.auto?.toString()}
                    onValueChange={(val) => setNuevoVinculo({ ...nuevoVinculo, auto: val === "true" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Expira en (opcional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal border-white/15 hover:bg-white/5"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {nuevoVinculo?.expiraEn ? format(new Date(nuevoVinculo.expiraEn), "PPP", { locale: es }) : "Selecciona fecha..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={nuevoVinculo?.expiraEn ? new Date(nuevoVinculo.expiraEn) : undefined}
                        onSelect={(date) => setNuevoVinculo({ ...nuevoVinculo, expiraEn: date?.toISOString() })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60">Sincronizar solo (opcional)</Label>
                  <Select
                    value={nuevoVinculo?.auto?.toString()}
                    onValueChange={(val) => setNuevoVinculo({ ...nuevoVinculo, auto: val === "true" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sí/No" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>
        </div>

        {mostrandoToken && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-xs text-green-200 mb-2">¡Token generado! Cópialo antes de que se muestre esto de nuevo.</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-black/30 px-2 py-1 rounded flex-1 font-mono">{mostrandoToken}</code>
              <Button size="sm" variant="outline" className="h-7 px-2 border-white/15" onClick={() => copiarToken(mostrandoToken)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="mt-6 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={() => setNuevoVinculo(null)}
            disabled={isCreating}
            className="border-white/15 hover:bg-white/5"
          >
            Cancelar
          </Button>
          <Button
            onClick={guardarNuevoVinculo}
            disabled={isCreating || !nuevoVinculo?.destino?.id || !nuevoVinculo?.destino?.tipo}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Guardar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
