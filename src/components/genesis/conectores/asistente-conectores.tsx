"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Cpu, Link, Loader2, Check, X, ExternalLink, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CatalogSource } from "@/ai/astraura/free-catalog";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { useAppearance } from "@/context/appearance-context";

export type AmbitoConector = "cuenta" | "grupo" | "pagina";

export interface ConectorOpcion {
  id: string;
  nombre: string;
  tipo: "modelo" | "proveedor" | "contenedor" | "herramienta" | "habilidad" | "conector";
  papeles: string[];
  limiteGratis: {
    peticionesPorMinuto?: number;
    tokensPorDia?: number;
    horasPorMes?: number;
    almacenamiento?: string;
  } | null;
  verificado: boolean | null;
  pideCuenta: boolean;
  enlaceAlta: string | null;
  enlaceClave: string | null;
  variablesEntorno: string[];
  privacidad: "local" | "nube-con-retencion" | "nube-sin-retencion";
  licencia: string | null;
  fechaVerificacion: string | null;
}

export interface ContextoLocal {
  neuronas: NeuronaInfo[];
  servidoresCerebro: ServidorCerebro[];
  capaAstraura: CapaAstrauraInfo;
}

export interface NeuronaInfo {
  id: string;
  nombre: string;
  online: boolean;
  capacidades: string[];
  puedeServirAstraura: boolean;
  latenciaMs?: number;
}

export interface ServidorCerebro {
  id: string;
  nombre: string;
  endpoint: string;
  capacidades: string[];
  online: boolean;
}

export interface CapaAstrauraInfo {
  disponible: boolean;
  modo: "local" | "nube" | "malla" | "apagado";
  personalidades: string[];
}

export interface PasoResumen {
  papel: string;
  cadena: string[];
  motivo: string;
}

const CATALOGO_A_CONECTORES = (): ConectorOpcion[] => {
  const resultado: ConectorOpcion[] = [];
  for (const fuente of FREE_CATALOG) {
    if (fuente.tier === "paid") continue;
    for (const modelo of fuente.models) {
      resultado.push({
        id: `${fuente.id}/${modelo.id}`,
        nombre: `${fuente.label} · ${modelo.label}`,
        tipo: "modelo",
        papeles: modelo.strengths as string[],
        limiteGratis: {
          peticionesPorMinuto: undefined,
          tokensPorDia: undefined,
          horasPorMes: undefined,
          almacenamiento: undefined,
        },
        verificado: fuente.fechaVerificacion ? true : null,
        pideCuenta: fuente.requiresKey || fuente.keyOptional === true,
        enlaceAlta: fuente.getKeyUrl ?? null,
        enlaceClave: fuente.getKeyUrl ?? null,
        variablesEntorno: [],
        privacidad: fuente.privacy === "local" ? "local" : fuente.privacy === "browser" ? "nube-sin-retencion" : "nube-con-retencion",
        licencia: null,
        fechaVerificacion: null,
      });
    }
  }
  return resultado;
};

function PasoIndicador({ actual, total, titulo }: { actual: number; total: number; titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i < actual ? "bg-emerald-400" : i === actual ? "bg-white/60" : "bg-white/15"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-white/60">{titulo}</span>
    </div>
  );
}

function TarjetaConector({
  opcion,
  seleccionada,
  onToggle,
  onVincular,
  claveGuardada,
}: {
  opcion: ConectorOpcion;
  seleccionada: boolean;
  onToggle: (id: string) => void;
  onVincular: (id: string) => void;
  claveGuardada?: boolean;
}) {
  const puedeVincular = opcion.pideCuenta && opcion.enlaceAlta;
  return (
    <div
      className={`relative rounded-xl border p-3 transition-all cursor-pointer ${
        seleccionada
          ? "border-emerald-400/50 bg-emerald-500/10"
          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"
      }`}
      onClick={() => onToggle(opcion.id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <input
            type="checkbox"
            checked={seleccionada}
            onChange={() => onToggle(opcion.id)}
            className="h-4 w-4 cursor-pointer accent-emerald-400 rounded border-white/20 bg-black/30"
            aria-label={`Seleccionar ${opcion.nombre}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white truncate">{opcion.nombre}</span>
            <Badge variant="outline" className="text-[10px]">{opcion.tipo}</Badge>
            {opcion.verificado === true && <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-400/30">Verificado</Badge>}
            {opcion.verificado === null && <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-400/30">Sin verificar</Badge>}
            {opcion.verificado === false && <Badge variant="outline" className="text-[10px] text-rose-300 border-rose-400/30">No verificado</Badge>}
            {claveGuardada && <Badge variant="outline" className="text-[10px] text-sky-300 border-sky-400/30">Clave guardada</Badge>}
          </div>
          <p className="mt-1 text-[11px] text-white/50">Papeles: {opcion.papeles.join(", ")}</p>
          <p className="text-[11px] text-white/40">
            Privacidad: {opcion.privacidad === "local" ? "Local" : opcion.privacidad === "nube-sin-retencion" ? "Nube sin retención" : "Nube con retención"}
          </p>
          {opcion.limiteGratis && (
            <p className="mt-1 text-[11px] text-white/40">
              Límite gratis: {Object.entries(opcion.limiteGratis).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No especificado"}
            </p>
          )}
        </div>
        {puedeVincular && !claveGuardada && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 cursor-pointer gap-1 whitespace-nowrap"
            onClick={(e) => { e.stopPropagation(); onVincular(opcion.id); }}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Vincular
          </Button>
        )}
      </div>
    </div>
  );
}

function CampoClave({
  opcion,
  valor,
  onCambio,
  onEnviar,
  onCancelar,
  enviando,
}: {
  opcion: ConectorOpcion;
  valor: string;
  onCambio: (v: string) => void;
  onEnviar: () => void;
  onCancelar: () => void;
  enviando: boolean;
}) {
  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 space-y-2" data-testid={`campo-clave-${opcion.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-sky-300" aria-hidden />
          <span className="text-sm font-medium text-sky-200">Enviar clave para {opcion.nombre}</span>
        </div>
        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={onCancelar}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <p className="text-[11px] text-white/60">
        La clave se envía a la API del OS y se borra de este campo. Nunca se guarda en el navegador ni en logs.
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={`Pega tu ${opcion.variablesEntorno[0] || "clave API"} aquí`}
          className="flex-1"
          disabled={enviando}
          data-testid="input-clave"
        />
        <Button
          size="sm"
          className="cursor-pointer"
          onClick={onEnviar}
          disabled={enviando || !valor.trim()}
          data-testid="btn-enviar-clave"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          {enviando ? "Enviando…" : "Enviar y borrar"}
        </Button>
      </div>
    </div>
  );
}

export function AsistenteConectores({
  ambito,
  onCerrar,
}: {
  ambito: AmbitoConector;
  onCerrar?: () => void;
}) {
  const { bgScopeMode } = useAppearance();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [contextoLocal, setContextoLocal] = useState<ContextoLocal | null>(null);
  const [cargandoContexto, setCargandoContexto] = useState(true);
  const [interruptores, setInterruptores] = useState<Record<string, boolean>>({
    neuronas: true,
    servidoresCerebro: true,
    capaAstraura: true,
  });
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [clavesPendientes, setClavesPendientes] = useState<Record<string, string>>({});
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const [enviandoClave, setEnviandoClave] = useState<string | null>(null);
  const [clavesGuardadas, setClavesGuardadas] = useState<Set<string>>(new Set());
  const [resumen, setResumen] = useState<PasoResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const conectores = useMemo(() => CATALOGO_A_CONECTORES(), []);

  const cargarContexto = useCallback(async () => {
    setCargandoContexto(true);
    try {
      const r = await fetch("/api/genesis/conectores/contexto", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setContextoLocal(data);
      }
    } catch {
      setContextoLocal({
        neuronas: [],
        servidoresCerebro: [],
        capaAstraura: { disponible: false, modo: "apagado", personalidades: [] },
      });
    } finally {
      setCargandoContexto(false);
    }
  }, []);

  useEffect(() => {
    cargarContexto();
  }, [cargarContexto]);

  const toggleInterruptor = (clave: string) => {
    setInterruptores((prev) => ({ ...prev, [clave]: !prev[clave] }));
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const manejarVincular = (id: string) => {
    const opcion = conectores.find((c) => c.id === id);
    if (opcion?.enlaceAlta) {
      window.open(opcion.enlaceAlta, "_blank", "noopener,noreferrer");
      setVinculandoId(id);
      setClavesPendientes((prev) => ({ ...prev, [id]: "" }));
    }
  };

  const manejarCancelarVincular = (id: string) => {
    setVinculandoId(null);
    setClavesPendientes((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const manejarEnviarClave = async (id: string) => {
    const clave = clavesPendientes[id];
    if (!clave?.trim()) return;
    setEnviandoClave(id);
    setError(null);
    try {
      const r = await fetch("/api/genesis/conectores/clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambito, conectorId: id, clave }),
      });
      if (!r.ok) throw new Error("No se pudo guardar la clave");
      setClavesGuardadas((prev) => new Set([...prev, id]));
      setClavesPendientes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setVinculandoId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar la clave");
    } finally {
      setEnviandoClave(null);
    }
  };

  const generarResumen = useCallback(() => {
    const papeles = ["escritor", "revisor", "director", "chat", "vision", "voz", "imagen", "codigo"] as const;
    const nuevoResumen: PasoResumen[] = [];
    for (const papel of papeles) {
      const cadena = conectores
        .filter((c) => seleccionadas.has(c.id) && c.papeles.includes(papel))
        .sort((a, b) => {
          const ordenPrivacidad = { local: 0, "nube-sin-retencion": 1, "nube-con-retencion": 2 };
          return (ordenPrivacidad[a.privacidad] || 3) - (ordenPrivacidad[b.privacidad] || 3);
        })
        .map((c) => c.nombre);
      if (cadena.length > 0) {
        nuevoResumen.push({
          papel,
          cadena,
          motivo: "Ordenado por privacidad: local primero, luego nube sin retención, luego nube con retención. Gratis primero siempre.",
        });
      }
    }
    setResumen(nuevoResumen);
  }, [conectores, seleccionadas]);

  const siguiente = () => {
    if (paso === 1) {
      generarResumen();
      setPaso(2);
    } else if (paso === 2) {
      setPaso(3);
    }
  };

  const anterior = () => {
    if (paso === 2) setPaso(1);
    else if (paso === 3) setPaso(2);
  };

  const tituloAmbito = ambito === "cuenta" ? "tu cuenta" : ambito === "grupo" ? "tu grupo" : "tu página";

  return (
    <div className="flex flex-col h-full max-h-[90vh] gap-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link className="h-5 w-5 text-violet-300" aria-hidden />
          <span className="text-base font-semibold text-white">Conectar Genesis · {tituloAmbito}</span>
        </div>
        <PasoIndicador actual={paso} total={3} titulo={`Paso ${paso} de 3`} />
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="cursor-pointer rounded-md p-1 text-white/50 hover:text-white/80" aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </header>

      {paso === 1 && (
        <section className="flex-1 overflow-hidden space-y-3" aria-label="Contexto local">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Cpu className="h-3.5 w-3.5" aria-hidden />
            <span>Lo que ya tienes en {tituloAmbito}: neuronas, servidores del cerebro y capa de Astraura.</span>
          </div>

          {cargandoContexto ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-hidden />
            </div>
          ) : contextoLocal ? (
            <ScrollArea className="flex-1 space-y-3 pr-1">
              <Card className="border-white/10 bg-black/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Brain className="h-4 w-4 text-emerald-300" aria-hidden />
                    Neuronas de la cuenta ({contextoLocal.neuronas.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {contextoLocal.neuronas.length === 0 ? (
                    <p className="text-xs text-white/50">No hay neuronas registradas en esta cuenta.</p>
                  ) : (
                    contextoLocal.neuronas.map((n) => (
                      <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full ${n.online ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                          <div>
                            <p className="text-sm font-medium text-white truncate">{n.nombre}</p>
                            <p className="text-[11px] text-white/50">{n.capacidades.join(", ") || "Sin capacidades declaradas"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={interruptores.neuronas}
                            onCheckedChange={() => toggleInterruptor("neuronas")}
                            disabled={!n.online}
                            aria-label={`Usar neurona ${n.nombre}`}
                            data-testid={`switch-neurona-${n.id}`}
                          />
                          {n.puedeServirAstraura && (
                            <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-400/30">
                              Sirve Astraura {n.latenciaMs ? `· ${n.latenciaMs}ms` : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-black/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-violet-300" aria-hidden />
                    Servidores del cerebro ({contextoLocal.servidoresCerebro.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {contextoLocal.servidoresCerebro.length === 0 ? (
                    <p className="text-xs text-white/50">No hay servidores de cerebro vinculados.</p>
                  ) : (
                    contextoLocal.servidoresCerebro.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full ${s.online ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                          <div>
                            <p className="text-sm font-medium text-white truncate">{s.nombre}</p>
                            <p className="text-[11px] text-white/50 font-mono">{s.endpoint}</p>
                            <p className="text-[11px] text-white/40">{s.capacidades.join(", ") || "Sin capacidades"}</p>
                          </div>
                        </div>
                        <Switch
                          checked={interruptores.servidoresCerebro}
                          onCheckedChange={() => toggleInterruptor("servidoresCerebro")}
                          disabled={!s.online}
                          aria-label={`Usar servidor ${s.nombre}`}
                          data-testid={`switch-servidor-${s.id}`}
                        />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-black/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-cyan-300" aria-hidden />
                    Capa de Astraura 1.58-bit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${contextoLocal.capaAstraura.disponible ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-white">Sistema primario</p>
                        <p className="text-[11px] text-white/50">
                          Modo: {contextoLocal.capaAstraura.modo === "local" ? "Local (esta neurona)" : contextoLocal.capaAstraura.modo === "nube" ? "Nube StarSeed" : contextoLocal.capaAstraura.modo === "malla" ? "Malla P2P" : "Apagado"}
                        </p>
                        <p className="text-[11px] text-white/40">Personalidades: {contextoLocal.capaAstraura.personalidades.join(", ") || "Ninguna"}</p>
                      </div>
                    </div>
                    <Switch
                      checked={interruptores.capaAstraura}
                      onCheckedChange={() => toggleInterruptor("capaAstraura")}
                      disabled={!contextoLocal.capaAstraura.disponible}
                      aria-label="Usar capa Astraura 1.58-bit"
                      data-testid="switch-astraura"
                    />
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" className="cursor-pointer" onClick={siguiente} data-testid="btn-siguiente-1">
              Siguiente <span aria-hidden>→</span>
            </Button>
          </div>
        </section>
      )}

      {paso === 2 && (
        <section className="flex-1 overflow-hidden space-y-3" aria-label="Opciones gratuitas sugeridas">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>Opciones gratuitas sugeridas para {tituloAmbito}. Vincula las que necesites.</span>
          </div>

          <ScrollArea className="flex-1 space-y-2 pr-1">
            {conectores
              .filter((c) => {
                const papelesRelevantes = ["escritor", "revisor", "director", "chat", "vision", "voz", "imagen", "codigo"];
                return c.papeles.some((p) => papelesRelevantes.includes(p));
              })
              .map((opcion) => (
                <TarjetaConector
                  key={opcion.id}
                  opcion={opcion}
                  seleccionada={seleccionadas.has(opcion.id)}
                  onToggle={toggleSeleccion}
                  onVincular={manejarVincular}
                  claveGuardada={clavesGuardadas.has(opcion.id)}
                />
              ))}

            {vinculandoId && clavesPendientes[vinculandoId] !== undefined && (
              <CampoClave
                key={vinculandoId}
                opcion={conectores.find((c) => c.id === vinculandoId)!}
                valor={clavesPendientes[vinculandoId]}
                onCambio={(v) => setClavesPendientes((p) => ({ ...p, [vinculandoId!]: v }))}
                onEnviar={() => manejarEnviarClave(vinculandoId!)}
                onCancelar={() => manejarCancelarVincular(vinculandoId!)}
                enviando={enviandoClave === vinculandoId}
              />
            )}
          </ScrollArea>

          {error && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t border-white/10">
            <Button variant="ghost" className="cursor-pointer" onClick={anterior} data-testid="btn-anterior-2">
              <span aria-hidden>←</span> Anterior
            </Button>
            <Button className="cursor-pointer" onClick={siguiente} disabled={seleccionadas.size === 0 && Object.keys(clavesPendientes).length === 0} data-testid="btn-siguiente-2">
              Siguiente <span aria-hidden>→</span>
            </Button>
          </div>
        </section>
      )}

      {paso === 3 && (
        <section className="flex-1 overflow-hidden space-y-3" aria-label="Resumen por papel">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
            <span>Cadena elegida por papel para {tituloAmbito}. Local más potente primero, gratis siempre.</span>
          </div>

          <ScrollArea className="flex-1 space-y-3 pr-1">
            {resumen.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center">
                <p className="text-white/50">No hay opciones seleccionadas para ningún papel.</p>
                <p className="text-xs text-white/40 mt-1">Vuelve al paso 2 y elige al menos una opción.</p>
              </div>
            ) : (
              resumen.map((r) => (
                <Card key={r.papel} className="border-white/10 bg-black/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">{r.papel}</Badge>
                      <span className="text-white/60">{r.cadena.length} opción(es)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-[11px] text-white/50">{r.motivo}</p>
                    <div className="space-y-1">
                      {r.cadena.map((nombre, i) => (
                        <div key={`${r.papel}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                          <span className="flex-shrink-0 text-emerald-300 font-mono text-[11px]">{i + 1}.</span>
                          <span className="text-sm text-white truncate">{nombre}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </ScrollArea>

          <div className="flex justify-between gap-2 pt-2 border-t border-white/10">
            <Button variant="ghost" className="cursor-pointer" onClick={anterior} data-testid="btn-anterior-3">
              <span aria-hidden>←</span> Anterior
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={onCerrar} data-testid="btn-cerrar">
              Cerrar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}