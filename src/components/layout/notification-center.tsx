"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Bell, BellOff, Sparkles, Check, CheckCheck, Archive, Trash2, Clock,
  Bot, Users, Palette, BookOpen, MessageSquare, Award, Settings, Globe,
  X, Filter,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification, type NotificationCategory } from "@/context/notifications-context";

const CATEGORY_META: Record<NotificationCategory, { label: string; icon: typeof Bell; color: string }> = {
  system: { label: "Sistema", icon: Settings, color: "text-slate-300" },
  ai: { label: "IA", icon: Bot, color: "text-cyan-300" },
  mention: { label: "Menciones", icon: MessageSquare, color: "text-blue-300" },
  governance: { label: "Gobernanza", icon: Users, color: "text-amber-300" },
  culture: { label: "Cultura", icon: Palette, color: "text-violet-300" },
  education: { label: "Educación", icon: BookOpen, color: "text-emerald-300" },
  community: { label: "Comunidad", icon: Globe, color: "text-rose-300" },
  achievement: { label: "Logros", icon: Award, color: "text-yellow-300" },
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-foreground/30",
  normal: "bg-primary",
  high: "bg-amber-400",
  critical: "bg-rose-500 animate-pulse",
};

export function NotificationCenter() {
  const {
    inbox, unread, unreadCount, all, byCategory,
    markRead, markAllRead, archive, snooze, remove,
  } = useNotifications();
  const [tab, setTab] = useState<"all" | NotificationCategory | "archived">("all");

  const visible = useMemo<AppNotification[]>(() => {
    if (tab === "all") return inbox;
    if (tab === "archived") return all.filter(n => n.archived);
    return byCategory(tab);
  }, [tab, inbox, all, byCategory]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center text-[9px] font-semibold rounded-full bg-primary text-primary-foreground shadow-lg">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary/60 animate-ping" />
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[min(420px,90vw)] p-0 backdrop-blur-xl bg-background/95 border-white/10"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="p-3 flex items-center justify-between gap-2 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-primary shrink-0" />
            <h4 className="font-medium font-headline text-sm truncate">Notificaciones</h4>
            {unreadCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                {unreadCount} sin leer
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="h-7 px-2 text-[11px] gap-1"
              title="Marcar todas como leídas"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Leer todo</span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <ScrollArea className="border-b">
            <TabsList className="bg-transparent rounded-none w-max min-w-full justify-start px-2 py-1.5 gap-0.5 h-auto">
              <TabsTrigger value="all" className="h-7 text-[11px] data-[state=active]:bg-primary/15 data-[state=active]:text-primary px-3 rounded-md">
                <Filter className="w-3 h-3 mr-1.5" /> Todas
              </TabsTrigger>
              {(Object.entries(CATEGORY_META) as [NotificationCategory, typeof CATEGORY_META.system][]).map(([key, meta]) => {
                const count = byCategory(key).filter(n => !n.read).length;
                const Icon = meta.icon;
                return (
                  <TabsTrigger key={key} value={key} className="h-7 text-[11px] data-[state=active]:bg-primary/15 data-[state=active]:text-primary px-2.5 rounded-md">
                    <Icon className={cn("w-3 h-3 mr-1", meta.color)} />
                    {meta.label}
                    {count > 0 && <span className="ml-1.5 text-[9px] bg-primary/20 text-primary px-1 rounded-full">{count}</span>}
                  </TabsTrigger>
                );
              })}
              <TabsTrigger value="archived" className="h-7 text-[11px] data-[state=active]:bg-primary/15 data-[state=active]:text-primary px-2.5 rounded-md">
                <Archive className="w-3 h-3 mr-1" />
                Archivadas
              </TabsTrigger>
            </TabsList>
          </ScrollArea>

          <TabsContent value={tab} className="m-0">
            {visible.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <ScrollArea className="max-h-[460px]">
                <div className="divide-y divide-white/5">
                  {visible.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onRead={() => markRead(n.id, true)}
                      onUnread={() => markRead(n.id, false)}
                      onArchive={() => archive(n.id)}
                      onRemove={() => remove(n.id)}
                      onSnooze={() => snooze(n.id, new Date(Date.now() + 60 * 60 * 1000).toISOString())}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="p-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            Privacidad local · cifrado por usuario
          </span>
          <Link href="/settings?tab=privacy" className="hover:text-foreground/80 transition-colors">
            Ajustes →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="py-12 px-6 text-center">
      <BellOff className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">
        {tab === "archived" ? "No tienes notificaciones archivadas." : "Sin notificaciones nuevas."}
      </p>
      <p className="text-[11px] text-muted-foreground/60 mt-1.5">
        Las notificaciones del sistema, IA, gobernanza y red aparecerán aquí.
      </p>
    </div>
  );
}

interface NotificationRowProps {
  n: AppNotification;
  onRead: () => void;
  onUnread: () => void;
  onArchive: () => void;
  onRemove: () => void;
  onSnooze: () => void;
}

function NotificationRow({ n, onRead, onArchive, onRemove, onSnooze }: NotificationRowProps) {
  const meta = CATEGORY_META[n.category];
  const Icon = meta.icon;
  const created = useMemo(() => {
    try {
      return formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true, locale: es });
    } catch {
      return "";
    }
  }, [n.createdAt]);

  return (
    <div
      className={cn(
        "group p-3 hover:bg-foreground/[0.03] transition cursor-pointer flex gap-3",
        !n.read && "bg-primary/[0.04]"
      )}
      onClick={onRead}
    >
      {/* Priority dot */}
      <div className={cn("w-1.5 self-stretch rounded-full shrink-0", PRIORITY_DOT[n.priority])} />

      {/* Icon */}
      <div className="w-8 h-8 shrink-0 rounded-lg bg-foreground/[0.04] border border-border/30 flex items-center justify-center">
        <Icon className={cn("w-4 h-4", meta.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className={cn("text-sm truncate", !n.read ? "font-semibold" : "font-medium")}>
            {n.title}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0">{created}</span>
        </div>
        {n.body && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-1.5">
            {n.body}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {n.action && (
            n.action.href ? (
              <Link
                href={n.action.href}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {n.action.label} →
              </Link>
            ) : (
              <span className="text-[11px] text-primary font-medium">{n.action.label} →</span>
            )
          )}
          {n.source?.node && (
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {n.source.node}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onSnooze(); }}
          className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground/80"
          title="Posponer 1h"
        >
          <Clock className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground/80"
          title="Archivar"
        >
          <Archive className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded hover:bg-rose-500/15 text-muted-foreground hover:text-rose-400"
          title="Eliminar"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
