"use client";

// StarSeed · Ontocracia — Selector de entidades "AFECTADAS" por una propuesta
// política. Alimenta `params.political.affects`: el motor de notificaciones
// (sendAffectedNotifications) avisa a los miembros de estas entidades aunque
// NO sean miembros del ámbito directo de la propuesta (kind 'affected', ya
// soportado por el Centro de Notificaciones). Validación de formato only — no
// consulta la red para autocompletar (mantiene el composer simple/honesto).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { entityKindMeta } from "@/lib/entity-kinds";
import type { AffectedEntity } from "@/lib/governance/political";

const KIND_OPTIONS: { id: string; label: string }[] = [
  { id: "comunidad", label: "Comunidad" },
  { id: "ef", label: "Entidad Federativa" },
  { id: "partido", label: "Partido" },
  { id: "asamblea", label: "Asamblea" },
  { id: "grupo", label: "Grupo" },
  { id: "pagina", label: "Página" },
];

export function AffectedEntitiesPicker({
  value,
  onChange,
}: {
  value: AffectedEntity[];
  onChange: (next: AffectedEntity[]) => void;
}) {
  const [kind, setKind] = useState("comunidad");
  const [slug, setSlug] = useState("");

  function add() {
    const clean = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) return;
    if (value.some((v) => v.kind === kind && v.slug === clean)) return;
    onChange([...value, { kind, slug: clean }]);
    setSlug("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="slug de la entidad (ej. comunidad-verde)"
          className="h-8 flex-1 bg-white/5 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Añadir
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v, i) => {
            const meta = entityKindMeta(v.kind);
            const Icon = meta.icon;
            return (
              <Badge key={`${v.kind}:${v.slug}`} variant="outline" className="gap-1 text-[10px]" style={{ borderColor: `${meta.accent}55`, color: meta.accent }}>
                <Icon className="h-2.5 w-2.5" />
                {v.label || v.slug}
                <button type="button" onClick={() => remove(i)} className="ml-0.5 cursor-pointer text-white/40 hover:text-red-300">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-white/35">
        Las personas de estas entidades recibirán una notificación "Te afecta", aunque no participen directamente en
        este ámbito.
      </p>
    </div>
  );
}

export default AffectedEntitiesPicker;
