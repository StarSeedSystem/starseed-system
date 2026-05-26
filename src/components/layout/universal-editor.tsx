"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pencil, Layout, MoveVertical, Sliders, Code, Sparkles, X,
  LayoutDashboard, FileText, Settings, BookOpen, Type, Image as ImageIcon,
  Component, Box, MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Editor Universal — accesible desde el menú Zenith (AI).
 *
 * Permite editar cualquier sección del programa:
 *  - Diseño (apariencia, tokens, layout)
 *  - Disposición (orden, posición, tamaño de elementos)
 *  - Funcionamiento (props, comportamiento)
 *  - Características personalizables con código o IA
 *  - Biblioteca (importar widgets, plugins, templates)
 *
 * En esta primera versión es un "command center" que enlaza con las páginas/
 * paneles concretos del sistema. La edición real ocurre en su panel
 * específico (Settings → Apariencia, Dashboard edit mode, Trinity Lab, etc.)
 * — el Editor Universal es la puerta única.
 */

type Section =
  | { id: "design"; label: "Apariencia & Estilos"; icon: typeof Type; route: "/settings"; tab: "appearance" }
  | { id: "dashboard"; label: "Dashboard & Widgets"; icon: LayoutDashboard; route: "/dashboard"; tab: "edit" }
  | { id: "layout"; label: "Disposición & Trinity"; icon: Layout; route: "/trinity"; tab: "lab" }
  | { id: "profile"; label: "Perfil & Identidad"; icon: Settings; route: "/settings"; tab: "profile" }
  | { id: "ai"; label: "IA & Modelos"; icon: Sparkles; route: "/settings"; tab: "ai" }
  | { id: "privacy"; label: "Privacidad"; icon: Settings; route: "/settings"; tab: "privacy" }
  | { id: "library"; label: "Biblioteca"; icon: BookOpen; route: "/library"; tab: "" }
  | { id: "publish"; label: "Publicar / Posts"; icon: FileText; route: "/publish"; tab: "" }
  | { id: "components"; label: "Componentes (dev)"; icon: Component; route: "/components-test"; tab: "" };

const SECTIONS: Section[] = [
  { id: "design", label: "Apariencia & Estilos", icon: Type, route: "/settings", tab: "appearance" },
  { id: "dashboard", label: "Dashboard & Widgets", icon: LayoutDashboard, route: "/dashboard", tab: "edit" },
  { id: "layout", label: "Disposición & Trinity", icon: Layout, route: "/trinity", tab: "lab" },
  { id: "profile", label: "Perfil & Identidad", icon: Settings, route: "/settings", tab: "profile" },
  { id: "ai", label: "IA & Modelos", icon: Sparkles, route: "/settings", tab: "ai" },
  { id: "privacy", label: "Privacidad", icon: Settings, route: "/settings", tab: "privacy" },
  { id: "library", label: "Biblioteca", icon: BookOpen, route: "/library", tab: "" },
  { id: "publish", label: "Publicar / Posts", icon: FileText, route: "/publish", tab: "" },
  { id: "components", label: "Componentes (dev)", icon: Component, route: "/components-test", tab: "" },
];

interface UniversalEditorProps {
  open: boolean;
  onClose: () => void;
}

export function UniversalEditor({ open, onClose }: UniversalEditorProps) {
  const [query, setQuery] = useState("");
  const [editMode, setEditMode] = useState<"design" | "code" | "ai" | "library">("design");

  const filtered = SECTIONS.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()));

  function openSection(section: Section) {
    const url = section.tab ? `${section.route}?tab=${section.tab}` : section.route;
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
    toast.success(`Abriendo "${section.label}" en modo edición…`);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed inset-4 md:inset-16 z-[121] rounded-3xl overflow-hidden bg-background/95 backdrop-blur-2xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 md:p-6 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-headline font-light tracking-wide truncate">Editor Universal</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    Edita diseño, disposición, funcionamiento o crea con IA y código.
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Mode toggle */}
            <div className="px-5 md:px-6 pt-4 shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { id: "design" as const, label: "Diseño", icon: Sliders, tint: "violet" },
                  { id: "code" as const, label: "Código", icon: Code, tint: "amber" },
                  { id: "ai" as const, label: "Con IA", icon: Sparkles, tint: "cyan" },
                  { id: "library" as const, label: "Biblioteca", icon: BookOpen, tint: "emerald" },
                ].map((m) => {
                  const isActive = editMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setEditMode(m.id)}
                      className={cn(
                        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition cursor-pointer",
                        isActive
                          ? `bg-${m.tint}-500/10 border-${m.tint}-500/40 text-${m.tint}-300`
                          : "bg-foreground/[0.02] border-border/40 text-muted-foreground hover:bg-foreground/[0.05]"
                      )}
                    >
                      <m.icon className="w-4 h-4" />
                      <span className="font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search */}
            <div className="px-5 md:px-6 py-4 shrink-0">
              <div className="relative">
                <MousePointerClick className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="¿Qué quieres editar? (ej. dashboard, perfil, trinity, IA...)"
                  className="pl-10 bg-background/60 border-white/10 h-12"
                />
              </div>
            </div>

            {/* Body: sections grid */}
            <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((s) => (
                  <Card
                    key={s.id}
                    onClick={() => openSection(s)}
                    className="bg-foreground/[0.02] border-border/40 hover:border-primary/40 hover:bg-foreground/[0.04] cursor-pointer transition group"
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-foreground/[0.06] flex items-center justify-center group-hover:bg-primary/10 transition shrink-0">
                            <s.icon className="w-4 h-4 text-foreground/80 group-hover:text-primary transition" />
                          </div>
                          <span className="truncate">{s.label}</span>
                        </span>
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2 mt-1">
                        {editMode === "design" && "Edita tokens, estilo, disposición visual."}
                        {editMode === "code" && "Abre el archivo correspondiente para editar el código."}
                        {editMode === "ai" && "Pide a la IA que adapte esta sección a tu intención."}
                        {editMode === "library" && "Importa componentes, widgets o presets desde la biblioteca."}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-12">
                  Sin coincidencias para &quot;{query}&quot;.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 md:p-5 border-t border-white/5 text-[11px] text-muted-foreground flex items-center justify-between gap-3 flex-wrap shrink-0">
              <span className="flex items-center gap-2">
                <Box className="w-3 h-3" />
                Personalización ilimitada — manualmente, con IA, o descargando desde la biblioteca.
              </span>
              <Badge variant="outline" className="text-[10px]">⌘E para abrir</Badge>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
