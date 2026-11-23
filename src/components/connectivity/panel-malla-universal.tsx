"use client";

/**
 * PanelMallaUniversal — Ajustes personalizables de transmisión P2P multiantena,
 * protocolos mesh (Reticulum/LXMF, Meshtastic, MeshCore, Wi-Fi Direct, Titanio) y
 * almacenamiento público triangulado sin mezclar capas privadas.
 */

import { useEffect, useMemo, useState } from "react";
import { Antenna, CheckCircle2, Layers, Network, Plus, RotateCcw, Shield, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  EVENTO_PROTOCOLOS_UNIVERSALES,
  configUniversalPorDefecto,
  guardarConfigUniversal,
  leerConfigUniversal,
  type AjustesMallaUniversal,
  type ConfigProtocoloMalla,
  type RolTransmisionProtocolo,
} from "@/lib/malla/conectores/protocolos-universales";
import { planificarTriangulacionContenido, type CapaRed } from "@/lib/malla/conectores/triangulacion-contenido";

const ETIQUETA_ROL: Record<RolTransmisionProtocolo, string> = {
  "control-bajo-consumo": "Control y largo alcance",
  hibrido: "Híbrido (control + datos)",
  "datos-alta-velocidad": "Datos y vídeo HD en paralelo",
  "almacen-publico": "Réplica de capa pública",
};

export function PanelMallaUniversal({ compact = false }: { compact?: boolean }) {
  const [cfg, setCfg] = useState<AjustesMallaUniversal>(() => leerConfigUniversal());
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [capaVista, setCapaVista] = useState<CapaRed>("publica");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEndpoint, setNuevoEndpoint] = useState("");

  useEffect(() => {
    setCfg(leerConfigUniversal());
    const onCambio = (e: Event) => {
      const det = (e as CustomEvent<AjustesMallaUniversal>).detail;
      if (det) setCfg(det);
    };
    window.addEventListener(EVENTO_PROTOCOLOS_UNIVERSALES, onCambio);
    return () => window.removeEventListener(EVENTO_PROTOCOLOS_UNIVERSALES, onCambio);
  }, []);

  const actualizar = (fn: (prev: AjustesMallaUniversal) => AjustesMallaUniversal) => {
    setCfg((prev) => guardarConfigUniversal(fn(prev)));
  };

  const cambiarProto = (id: string, par: Partial<ConfigProtocoloMalla>) => {
    actualizar((prev) => ({
      ...prev,
      protocolos: {
        ...prev.protocolos,
        [id]: { ...prev.protocolos[id], ...par },
      },
    }));
  };

  const agregarProtocolo = () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    const id = `custom-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "red"}`;
    actualizar((prev) => ({
      ...prev,
      protocolos: {
        ...prev.protocolos,
        [id]: {
          id,
          nombre,
          familia: "personalizado",
          habilitado: true,
          rol: "hibrido",
          prioridad: 65,
          endpoint: nuevoEndpoint.trim() || "custom://auto",
          mtuBytes: 4096,
          permiteCapaPublica: true,
          permiteCapaPrivada: true,
          formatosAdmitidos: ["binario-libre", "json", "cbor"],
        },
      },
    }));
    setNuevoNombre("");
    setNuevoEndpoint("");
  };

  const protocolos = useMemo(
    () => Object.values(cfg.protocolos).sort((a, b) => b.prioridad - a.prioridad),
    [cfg.protocolos],
  );

  const simulacion = useMemo(
    () =>
      planificarTriangulacionContenido(
        {
          contenidoId: "vista-previa",
          capa: capaVista,
          destino: capaVista === "privada" ? "archivo" : "canal-directo",
          tipo: "video",
          formato: "binario-libre",
          bytesTotal: 256_000,
          requiereEnVivo: true,
        },
        cfg,
        [],
      ),
    [cfg, capaVista],
  );

  return (
    <section
      data-testid="panel-malla-universal"
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-emerald-300" />
          <div>
            <h3 className="text-[13px] font-semibold">Malla universal P2P y protocolos abiertos</h3>
            <p className="text-[11px] text-white/55">
              Reticulum (RNS/LXMF), Meshtastic, MeshCore, Wi‑Fi Direct y Titanio en paralelo por capa.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCfg(guardarConfigUniversal(configUniversalPorDefecto()))}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 transition hover:border-white/30 hover:text-white"
        >
          <RotateCcw className="h-3 w-3" /> Restablecer
        </button>
      </div>

      {/* Interruptores de enrutamiento global */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <span className="text-[11px] text-white/85">Multiantena simultánea (control + datos)</span>
          <Switch
            checked={cfg.modoMultiAntenaSimultanea}
            onCheckedChange={(v) => actualizar((p) => ({ ...p, modoMultiAntenaSimultanea: v }))}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <span className="text-[11px] text-white/85">Routers autoenrutables y autoreparables</span>
          <Switch
            checked={cfg.autoEnrutamientoInteligente}
            onCheckedChange={(v) => actualizar((p) => ({ ...p, autoEnrutamientoInteligente: v, routersAutoEnrutables: v }))}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2 sm:col-span-2">
          <div>
            <span className="text-[11px] font-medium text-white/90">Neurona pública con almacenamiento triangulado</span>
            <p className="text-[10px] text-white/50">
              Solo replica contenido de capa pública/comunidad (cuota {cfg.cuotaPublicaMb} MB). La capa privada nunca sale de tus propias neuronas.
            </p>
          </div>
          <Switch
            checked={cfg.compartirAlmacenamientoPublico}
            onCheckedChange={(v) => actualizar((p) => ({ ...p, compartirAlmacenamientoPublico: v }))}
          />
        </label>
      </div>

      {cfg.compartirAlmacenamientoPublico && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px]">
          <span className="text-white/75">Cuota pública máxima (MB):</span>
          <input
            type="range"
            min={64}
            max={10240}
            step={64}
            value={cfg.cuotaPublicaMb}
            onChange={(e) => actualizar((p) => ({ ...p, cuotaPublicaMb: Number(e.target.value) }))}
            className="flex-1 cursor-pointer accent-emerald-400"
          />
          <span className="w-16 text-right font-mono text-emerald-200">{cfg.cuotaPublicaMb} MB</span>
        </div>
      )}

      {/* Plan vivo de triangulación por capa */}
      <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium text-white/85">
            <Layers className="h-3.5 w-3.5 text-sky-300" /> Triangulación activa por capa
          </span>
          <div className="flex gap-1">
            {(["publica", "comunidad", "privada"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCapaVista(c)}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-0.5 text-[10px] capitalize transition",
                  capaVista === c
                    ? "border-sky-400/50 bg-sky-500/20 text-sky-100"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white",
                )}
              >
                {c === "publica" ? "Pública" : c === "comunidad" ? "Comunidad" : "Privada"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/65">
          <span>
            Control: <strong className="text-white/90">{simulacion.viaControl?.nombre ?? "ninguno"}</strong>
          </span>
          <span>
            Datos en paralelo:{" "}
            <strong className="text-emerald-200">
              {simulacion.viasDatos.map((v) => v.id).join(" + ") || "ninguno"}
            </strong>
          </span>
          <span className="flex items-center gap-1 text-sky-200">
            <CheckCircle2 className="h-3 w-3" /> {simulacion.estrategia}
          </span>
        </div>
      </div>

      {/* Lista de protocolos configurables */}
      <div className="mt-3 space-y-1.5">
        {protocolos.map((proto) => {
          const abierto = abiertoId === proto.id;
          return (
            <div key={proto.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAbiertoId(abierto ? null : proto.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <Antenna className={cn("h-3.5 w-3.5 shrink-0", proto.habilitado ? "text-emerald-300" : "text-white/30")} />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-white/90">{proto.nombre}</div>
                    <div className="truncate text-[10px] text-white/45">
                      {ETIQUETA_ROL[proto.rol]} · Prioridad {proto.prioridad} · MTU {proto.mtuBytes} B
                      {proto.region ? ` · ${proto.region}` : ""}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Ajustar ${proto.nombre}`}
                    onClick={() => setAbiertoId(abierto ? null : proto.id)}
                    className="cursor-pointer rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                  </button>
                  <Switch
                    checked={proto.habilitado}
                    onCheckedChange={(v) => cambiarProto(proto.id, { habilitado: v })}
                  />
                </div>
              </div>

              {abierto && (
                <div className="mt-2.5 grid gap-2 border-t border-white/10 pt-2.5 text-[11px] sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/55">Endpoint / nodo / daemon</span>
                    <input
                      type="text"
                      value={proto.endpoint}
                      onChange={(e) => cambiarProto(proto.id, { endpoint: e.target.value })}
                      className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white outline-none focus:border-sky-400/50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/55">Rol en la malla</span>
                    <select
                      value={proto.rol}
                      onChange={(e) => cambiarProto(proto.id, { rol: e.target.value as RolTransmisionProtocolo })}
                      className="w-full cursor-pointer rounded-md border border-white/15 bg-black/60 px-2 py-1 text-[11px] text-white outline-none focus:border-sky-400/50"
                    >
                      {Object.entries(ETIQUETA_ROL).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/55">Prioridad (1–100): {proto.prioridad}</span>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={proto.prioridad}
                      onChange={(e) => cambiarProto(proto.id, { prioridad: Number(e.target.value) })}
                      className="w-full cursor-pointer accent-sky-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/55">Región / frecuencia MHz</span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="US / EU_868"
                        value={proto.region ?? ""}
                        onChange={(e) => cambiarProto(proto.id, { region: e.target.value })}
                        className="w-1/2 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white outline-none"
                      />
                      <input
                        type="number"
                        placeholder="MHz"
                        value={proto.frecuenciaMHz ?? ""}
                        onChange={(e) =>
                          cambiarProto(proto.id, {
                            frecuenciaMHz: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-1/2 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white outline-none"
                      />
                    </div>
                  </label>
                  <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/80">
                      <Switch
                        checked={proto.permiteCapaPublica}
                        onCheckedChange={(v) => cambiarProto(proto.id, { permiteCapaPublica: v })}
                      />
                      Capa pública / comunidad
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/80">
                      <Switch
                        checked={proto.permiteCapaPrivada}
                        onCheckedChange={(v) => cambiarProto(proto.id, { permiteCapaPrivada: v })}
                      />
                      <Shield className="h-3 w-3 text-amber-300" /> Capa privada de la cuenta
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Añadir protocolo / adaptador libre */}
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/20 p-2.5">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nuevo protocolo o radio (p. ej. Yggdrasil, RNode VHF)"
            className="min-w-[180px] flex-1 rounded-md border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] text-white outline-none focus:border-emerald-400/50"
          />
          <input
            type="text"
            value={nuevoEndpoint}
            onChange={(e) => setNuevoEndpoint(e.target.value)}
            placeholder="Endpoint / interfaz (tcp://...)"
            className="min-w-[160px] flex-1 rounded-md border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] text-white outline-none focus:border-emerald-400/50"
          />
          <button
            type="button"
            onClick={agregarProtocolo}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/30"
          >
            <Plus className="h-3.5 w-3.5" /> Añadir vía
          </button>
        </div>
      )}
    </section>
  );
}
