"use client";

/**
 * OrganosPanel — Organización estética e intuitiva de neuronas, aparatos y nodos en Órganos (2026-11-27).
 * ========================================================================================================
 * Permite agrupar neuronas de la cuenta, nodos privados y nodos públicos en órganos con categoría,
 * color, visibilidad (privado/comunidad/público), cualidades configurables y formato 2D/3D/4D.
 */

import { useState } from "react";
import { Boxes, Globe, Layers, Lock, Plus, Sliders, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PALETA_COLOR_PUBLICO } from "@/lib/neurons/color-publico";
import {
  CATEGORIAS_ORGANO,
  actualizarOrgano,
  alternarNeuronaEnOrgano,
  crearOrgano,
  eliminarOrgano,
  type CategoriaOrgano,
  type FormatoVisualOrgano,
  type OrganoCerebro,
  type VisibilidadOrgano,
} from "@/lib/cerebros/organos";
import type { Neuron } from "@/lib/neurons/neurons";
import type { Brain } from "@/lib/brains/brains";

export interface OrganosPanelProps {
  organos: OrganoCerebro[];
  onChange: (next: OrganoCerebro[]) => void;
  neuronas: readonly Neuron[];
  cerebros: readonly Brain[];
}

const VIS_ICON: Record<VisibilidadOrgano, typeof Lock> = {
  privado: Lock,
  comunidad: Users,
  publico: Globe,
};

export function OrganosPanel({ organos, onChange, neuronas, cerebros }: OrganosPanelProps) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<CategoriaOrgano>("computo");
  const [visibilidad, setVisibilidad] = useState<VisibilidadOrgano>("privado");
  const [formatoVista, setFormatoVista] = useState<FormatoVisualOrgano>("4d");
  const [color, setColor] = useState("#38bdf8");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const publicos = cerebros.filter((b) => b.scope !== "account");

  const handleCrear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    const nuevo = crearOrgano({
      nombre,
      categoria,
      visibilidad,
      formatoVista,
      color,
    });
    onChange([...organos, nuevo]);
    setNombre("");
    setCreando(false);
    setAbiertoId(nuevo.id);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4" aria-label="Órganos del cerebro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Boxes className="h-4 w-4 text-violet-300" aria-hidden />
            Órganos y nodos administrativos
          </h4>
          <p className="text-xs text-white/55">
            Agrupa neuronas de tu cuenta, nodos privados y nodos o cerebros públicos como órganos configurables en 2D, 3D y 4D.
          </p>
        </div>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => setCreando((v) => !v)}>
          <Plus className="h-4 w-4" aria-hidden />
          {creando ? "Cancelar" : "Nuevo órgano"}
        </Button>
      </div>

      {creando && (
        <form onSubmit={handleCrear} className="space-y-3 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.05] p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="nuevo-organo-nombre" className="mb-1 block text-xs text-white/75">Nombre del órgano</label>
              <Input
                id="nuevo-organo-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="p. ej. Núcleo sensorial móvil o Clúster público"
                maxLength={60}
                className="h-9 bg-black/40 border-white/15"
              />
            </div>
            <div>
              <label htmlFor="nuevo-organo-cat" className="mb-1 block text-xs text-white/75">Categoría</label>
              <select
                id="nuevo-organo-cat"
                value={categoria}
                onChange={(e) => {
                  const c = e.target.value as CategoriaOrgano;
                  setCategoria(c);
                  const m = CATEGORIAS_ORGANO.find((x) => x.id === c);
                  if (m) setColor(m.colorPorDefecto);
                }}
                className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2.5 text-xs text-white"
              >
                {CATEGORIAS_ORGANO.map((c) => (
                  <option key={c.id} value={c.id}>{c.etiqueta}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nuevo-organo-vis" className="mb-1 block text-xs text-white/75">Alcance</label>
              <select
                id="nuevo-organo-vis"
                value={visibilidad}
                onChange={(e) => setVisibilidad(e.target.value as VisibilidadOrgano)}
                className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2.5 text-xs text-white"
              >
                <option value="privado">Privado (solo tu cuenta)</option>
                <option value="comunidad">Comunidad / grupo administrado</option>
                <option value="publico">Público (malla comunitaria)</option>
              </select>
            </div>
            <div>
              <label htmlFor="nuevo-organo-fmt" className="mb-1 block text-xs text-white/75">Formato por defecto</label>
              <select
                id="nuevo-organo-fmt"
                value={formatoVista}
                onChange={(e) => setFormatoVista(e.target.value as FormatoVisualOrgano)}
                className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2.5 text-xs text-white"
              >
                <option value="2d">2D plano</option>
                <option value="3d">3D espacial</option>
                <option value="4d">4D vivo (temporal)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Color del órgano">
              <span className="text-xs text-white/60">Color:</span>
              {PALETA_COLOR_PUBLICO.slice(0, 8).map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => setColor(c.color)}
                  aria-pressed={color === c.color}
                  title={c.nombre}
                  className={cn(
                    "h-5 w-5 cursor-pointer rounded-full border",
                    color === c.color ? "border-white ring-2 ring-white/50" : "border-white/25",
                  )}
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            <Button type="submit" size="sm" className="cursor-pointer" disabled={!nombre.trim()}>
              Crear órgano
            </Button>
          </div>
        </form>
      )}

      {organos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-5 text-center space-y-2">
          <p className="text-xs text-white/60">
            Todavía no has creado órganos personalizados. Puedes crear un órgano nuevo arriba para agrupar neuronas, nodos privados o públicos y configurar sus cualidades.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CATEGORIAS_ORGANO.slice(0, 3).map((cat) => (
              <Button
                key={cat.id}
                size="sm"
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => {
                  const nuevo = crearOrgano({
                    nombre: `Órgano de ${cat.etiqueta}`,
                    categoria: cat.id,
                    color: cat.colorPorDefecto,
                    neuronasIds: neuronas.slice(0, 2).map((n) => n.id),
                  });
                  onChange([...organos, nuevo]);
                  setAbiertoId(nuevo.id);
                }}
              >
                + {cat.etiqueta}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {organos.map((org) => {
            const VisIc = VIS_ICON[org.visibilidad];
            const abierto = abiertoId === org.id;
            return (
              <article
                key={org.id}
                className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2.5"
                style={{ borderLeftWidth: 3, borderLeftColor: org.color }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h5 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: org.color }} aria-hidden />
                      {org.nombre}
                    </h5>
                    <p className="mt-0.5 text-[11px] text-white/55">{org.descripcion}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <VisIc className="h-3 w-3" aria-hidden /> {org.visibilidad}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">{org.formatoVista}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/65">
                  <span>{org.neuronasIds.length} neuronas vinculadas</span>
                  <span>·</span>
                  <span>Auto-enrutar: {org.cualidades.autoEnrutar ? "sí" : "no"}</span>
                  <span>·</span>
                  <span>Sync P2P: {org.cualidades.sincroniaP2P ? "activa" : "pausa"}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer h-8 gap-1 text-xs"
                    onClick={() => setAbiertoId(abierto ? null : org.id)}
                  >
                    <Sliders className="h-3.5 w-3.5" aria-hidden />
                    {abierto ? "Cerrar configuración" : "Configurar órgano y neuronas"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer h-8 gap-1 text-xs text-rose-300 hover:text-rose-200 ml-auto"
                    onClick={() => onChange(eliminarOrgano(organos, org.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar
                  </Button>
                </div>

                {abierto && (
                  <div className="space-y-3 border-t border-white/10 pt-2.5 text-xs">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
                        <span className="text-white/80">Auto-enrutar señales</span>
                        <Switch
                          checked={org.cualidades.autoEnrutar === true}
                          onCheckedChange={(v) =>
                            onChange(actualizarOrgano(organos, org.id, { cualidades: { autoEnrutar: v } }))
                          }
                          aria-label={`Auto-enrutar en ${org.nombre}`}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
                        <span className="text-white/80">Sincronía P2P continua</span>
                        <Switch
                          checked={org.cualidades.sincroniaP2P === true}
                          onCheckedChange={(v) =>
                            onChange(actualizarOrgano(organos, org.id, { cualidades: { sincroniaP2P: v } }))
                          }
                          aria-label={`Sincronía P2P en ${org.nombre}`}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 flex items-center gap-1 font-medium text-white/80">
                        <Layers className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                        Neuronas asignadas a este órgano
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {neuronas.map((n) => {
                          const asignada = org.neuronasIds.includes(n.id);
                          return (
                            <button
                              key={n.id}
                              type="button"
                              aria-pressed={asignada}
                              onClick={() => onChange(alternarNeuronaEnOrgano(organos, org.id, n.id))}
                              className={cn(
                                "cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors",
                                asignada
                                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                                  : "border-white/10 bg-black/20 text-white/60 hover:text-white",
                              )}
                            >
                              {asignada ? "✓ " : "+ "}{n.name}
                            </button>
                          );
                        })}
                        {neuronas.length === 0 && (
                          <span className="text-white/45">No hay neuronas cargadas todavía.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Resumen de cerebros/nodos públicos administrados o vinculados */}
      {publicos.length > 0 && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-100">
            <Globe className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
            Neuronas y cerebros públicos administrados o vinculados ({publicos.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {publicos.map((b) => (
              <Badge key={b.id} variant="outline" className="border-emerald-400/30 bg-black/30 text-xs text-emerald-100">
                {b.name} · {b.scope}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default OrganosPanel;
