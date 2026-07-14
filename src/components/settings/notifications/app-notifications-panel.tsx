"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — CONTROL POR-APP DE NOTIFICACIONES Y POPUPS (Adenda 69 · J-1)
 * ---------------------------------------------------------------------------
 * Ajustes → Notificaciones. Lista las apps instaladas desde la Biblioteca y, por
 * cada una, dos interruptores (ambos ON por defecto):
 *   · «Notificaciones» → puede escribir en el Centro de Notificaciones del OS.
 *   · «Popups»         → puede mostrar toasts y ventanas emergentes.
 *
 * Persiste en `starseed.apps.notify-prefs.v1` (⚠️ reportar a SYNCED_KEYS) vía
 * setAppNotifyPref. Incluye un botón «Probar» que dispara una notificación real
 * desde esa app (para verlo en /notifications al instante). SSR-safe y defensivo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import * as Lucide from "lucide-react";
import { Bell, BellOff, MessageSquareDot, Package as PackageIcon, Play } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getInstalledMap, findPackage, type PackageKind } from "@/lib/library/packages";
import {
  getAppNotifyPref,
  setAppNotifyPref,
  subscribeAppNotifyPrefs,
  notifyFromApp,
  type AppNotifyPref,
} from "@/lib/notifications/app-notify";
import { openAppPopup } from "@/lib/notifications/app-popups";

/** Tipos de paquete que pueden actuar como «app» que notifica. */
const APP_LIKE: PackageKind[] = ["app", "widget", "page", "board", "research", "project", "publication", "agent", "function"];

interface Row {
  id: string;
  name: string;
  icon: string;
  kind: PackageKind;
}

function iconFor(name: string): React.ComponentType<{ className?: string }> {
  const dict = Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return dict[name] ?? PackageIcon;
}

export function AppNotificationsPanel() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [prefs, setPrefs] = React.useState<Record<string, AppNotifyPref>>({});

  const load = React.useCallback(() => {
    try {
      const map = getInstalledMap();
      const list: Row[] = [];
      const nextPrefs: Record<string, AppNotifyPref> = {};
      for (const [id, entry] of Object.entries(map)) {
        if (!APP_LIKE.includes(entry.kind)) continue;
        const pkg = findPackage(id);
        list.push({ id, name: pkg?.name ?? id, icon: pkg?.icon ?? "Package", kind: entry.kind });
        nextPrefs[id] = getAppNotifyPref(id);
      }
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setRows(list);
      setPrefs(nextPrefs);
    } catch {
      setRows([]);
    }
  }, []);

  React.useEffect(() => {
    load();
    const unsub = subscribeAppNotifyPrefs(load);
    const onLib = () => load();
    window.addEventListener("starseed:library", onLib);
    return () => {
      unsub();
      window.removeEventListener("starseed:library", onLib);
    };
  }, [load]);

  const update = React.useCallback((id: string, patch: Partial<AppNotifyPref>) => {
    setAppNotifyPref(id, patch);
    setPrefs((p) => ({ ...p, [id]: { ...getAppNotifyPref(id), ...patch } }));
  }, []);

  const test = React.useCallback((row: Row) => {
    const res = notifyFromApp({
      appId: row.id,
      title: `Prueba de ${row.name}`,
      body: "Notificación de prueba emitida por la app. Míralas en /notifications → Locales.",
      icon: row.icon,
      level: "info",
      actions: [{ label: "Abrir notificaciones", href: "/notifications" }],
    });
    if (res.ok) {
      if (!res.toPopup && res.toCenter) toast.message("Enviada al centro (los popups de esta app están apagados).");
    } else if (res.reason === "muted") {
      toast.error("Esta app está silenciada: activa notificaciones o popups.");
    }
  }, []);

  const testPopup = React.useCallback((row: Row) => {
    const id = openAppPopup({
      appId: row.id,
      title: `Ventana de ${row.name}`,
      text: `Esta es una ventana emergente de prueba de «${row.name}».\n\nEs movible (arrástrala por la cabecera), apilable y cerrable (× o Esc).`,
      size: "sm",
      icon: row.icon,
    });
    if (!id) toast.error("Los popups de esta app están apagados.");
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 backdrop-blur-xl">
      <div className="flex items-start gap-2 mb-3">
        <span className="p-2 rounded-xl border border-sky-400/20 bg-sky-400/10 shrink-0">
          <Bell className="w-4 h-4 text-sky-300" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90">Notificaciones de las apps</h3>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Decide qué apps instaladas pueden avisarte y mostrar ventanas emergentes. Todo está permitido por
            defecto; apaga lo que no quieras. Cada app solo puede notificar lo suyo.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-6 text-center text-[12px] text-muted-foreground">
          Aún no tienes apps instaladas que puedan notificar. Instala algo desde la{" "}
          <a href="/library" className="text-sky-300 hover:underline">Biblioteca</a>.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const Icon = iconFor(row.icon);
            const pref = prefs[row.id] ?? { notifications: true, popups: true };
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <span className="h-8 w-8 rounded-lg grid place-items-center border border-white/10 bg-white/[0.03] text-white/80 shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-white/90 truncate leading-tight">{row.name}</p>
                  <p className="text-[10px] text-white/40 leading-tight">{row.kind}</p>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Notificaciones al centro">
                    {pref.notifications ? <Bell className="w-3.5 h-3.5 text-sky-300" /> : <BellOff className="w-3.5 h-3.5 text-white/30" />}
                    <span className="text-[10px] text-white/50 hidden sm:inline">Avisos</span>
                    <Switch
                      checked={pref.notifications}
                      onCheckedChange={(v) => update(row.id, { notifications: v })}
                      aria-label={`Notificaciones de ${row.name}`}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Popups y ventanas emergentes">
                    <MessageSquareDot className={pref.popups ? "w-3.5 h-3.5 text-emerald-300" : "w-3.5 h-3.5 text-white/30"} />
                    <span className="text-[10px] text-white/50 hidden sm:inline">Popups</span>
                    <Switch
                      checked={pref.popups}
                      onCheckedChange={(v) => update(row.id, { popups: v })}
                      aria-label={`Popups de ${row.name}`}
                    />
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => test(row)}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px] gap-1 text-white/60 hover:text-white cursor-pointer"
                      title="Disparar una notificación de prueba"
                    >
                      <Play className="w-3 h-3" /> Probar
                    </Button>
                    <Button
                      onClick={() => testPopup(row)}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px] text-white/60 hover:text-white cursor-pointer hidden sm:inline-flex"
                      title="Abrir una ventana emergente de prueba"
                    >
                      Popup
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AppNotificationsPanel;
