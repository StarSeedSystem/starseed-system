"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupGovernance } from "@/components/group/group-governance";
import {
  Brain,
  Plus,
  Trash2,
  Check,
  Loader2,
  FileText,
  Vote,
  Info,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Memory = {
  id: string;
  owner: string;
  name: string;
  scope: string;
  scope_ref: string | null;
  kinds: string[];
  format: string;
  storage: string[];
  sync: boolean;
  config: Record<string, unknown> | null;
  content: string | null;
  created_at: string;
};

// Subconjunto compacto de tipos, reutilizando el vocabulario de Memory Hub.
const KINDS: [string, string][] = [
  ["soul", "🪷 Alma"],
  ["memory", "🧠 Memoria"],
  ["dream", "🌙 Sueños"],
  ["md", "📝 Markdown"],
  ["skills", "✨ Skills"],
  ["apis", "🔌 APIs"],
  ["mcp", "🧩 MCP"],
  ["plugins", "🧱 Plugins"],
];

function kindLabel(k: string): string {
  return (KINDS.find((x) => x[0] === k) ?? [k, k])[1];
}

export function GroupAIStudio({ groupId, groupName }: { groupId: string; groupName?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  // creación compacta
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kinds, setKinds] = useState<string[]>(["memory"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);

      const { data } = await supabase
        .from("memories")
        .select("*")
        .eq("scope", "group")
        .eq("scope_ref", groupId)
        .order("created_at", { ascending: false });
      setItems((data as Memory[]) ?? []);
    } catch {
      /* sin sesión / error transitorio */
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleKind(v: string) {
    setKinds((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  }

  async function createMemory() {
    if (!userId) {
      setError("Inicia sesión para crear memorias del grupo.");
      return;
    }
    if (!name.trim() || kinds.length === 0) {
      setError("Pon un nombre y al menos un tipo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("memories").insert({
        owner: userId,
        name: name.trim(),
        scope: "group",
        scope_ref: groupId,
        kinds,
        format: "markdown",
        storage: ["account"],
        sync: true,
        content: "",
        config: {},
      });
      if (err) {
        setError(err.message);
      } else {
        setCreating(false);
        setName("");
        setKinds(["memory"]);
        await load();
      }
    } catch {
      setError("No se pudo crear la memoria.");
    }
    setSaving(false);
  }

  async function removeMemory(id: string) {
    setError(null);
    try {
      const supabase = createClient();
      // RLS: solo el owner puede borrar la suya.
      const { error: err } = await supabase.from("memories").delete().eq("id", id);
      if (err) setError(err.message);
      await load();
    } catch {
      setError("No se pudo borrar la memoria.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Nota de cabecera */}
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-cyan-300 mt-0.5 shrink-0" />
        <div className="text-xs text-white/70 leading-relaxed">
          <span className="text-cyan-200 font-medium">AI Studio del grupo</span> — configuración gestionada
          democráticamente por sus miembros mediante propuestas y votos.
          <span className="block text-[11px] text-amber-300/70 mt-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> En esta v1 la pertenencia al grupo es abierta a cualquier usuario
            autenticado; aún no hay control de membresía.
          </span>
        </div>
      </div>

      <Tabs defaultValue="memories" className="space-y-4">
        <TabsList className="w-full justify-start bg-black/20 border border-white/5 p-1 flex-wrap">
          <TabsTrigger value="memories" className="gap-2">
            <Brain className="w-4 h-4" /> Memorias del grupo
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <Vote className="w-4 h-4" /> Gobernanza
          </TabsTrigger>
        </TabsList>

        {/* TAB: Memorias del grupo */}
        <TabsContent value="memories" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-fuchsia-300" />
              <span className="text-sm font-semibold text-white">
                Memorias compartidas{groupName ? ` · ${groupName}` : ""}
              </span>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus className="w-3.5 h-3.5" /> Nueva memoria
            </Button>
          </div>

          {creating && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
              <label className="block text-[11px] text-white/50">
                Nombre
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Memoria compartida del grupo"
                  className="mt-1 bg-white/5 text-sm h-9"
                />
              </label>
              <div>
                <div className="text-[11px] text-white/50 mb-1">Tipos</div>
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleKind(v)}
                      className={cn(
                        "text-[11px] rounded-full px-2.5 py-1 border transition",
                        kinds.includes(v)
                          ? "bg-fuchsia-600/25 border-fuchsia-400/50 text-white"
                          : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-white/40">
                Se crea con scope <code className="text-fuchsia-300/80">group</code> y se asocia a este grupo.
                El editor de contenido y la sincronización avanzada viven en el Memory Hub personal.
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500"
                  disabled={saving || !name.trim() || kinds.length === 0}
                  onClick={createMemory}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Crear
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-[11px] rounded px-2 py-1.5 bg-red-900/30 text-red-200 border border-red-500/30 break-words">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-white/40 px-1 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando memorias…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
              <Brain className="w-6 h-6 text-fuchsia-300/50 mx-auto mb-2" />
              <div className="text-sm text-white/50">
                Este grupo aún no tiene memorias. Crea la primera para construir el contexto compartido.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((m) => {
                const mine = !!userId && m.owner === userId;
                return (
                  <div
                    key={m.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-fuchsia-300/70" /> {m.name}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.kinds.map((k) => (
                          <Badge
                            key={k}
                            variant="outline"
                            className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/80"
                          >
                            {kindLabel(k)}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-[10px] text-white/40 mt-1">
                        {m.format} · {new Date(m.created_at).toLocaleDateString()}
                        {!mine && <span className="text-white/30"> · de otro miembro</span>}
                      </div>
                    </div>
                    {mine && (
                      <button
                        onClick={() => removeMemory(m.id)}
                        className="text-white/30 hover:text-red-400 mt-0.5"
                        title="Borrar memoria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB: Gobernanza */}
        <TabsContent value="governance" className="space-y-4">
          <GroupGovernance groupId={groupId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GroupAIStudio;
