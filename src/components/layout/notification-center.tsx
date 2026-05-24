"use client";

import { useState, useTransition } from "react";
import { Bell, BotMessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notifications as mockNotifications } from "@/lib/data";
import { summarizeNotifications } from "@/ai/flows/summarize-notifications";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "../ui/badge";

export function NotificationCenter() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  const handleSummarize = () => {
    startTransition(async () => {
      setSummary(null); // Reset summary
      const notificationContent = mockNotifications
        .map((n) => `${n.title}: ${n.description}`)
        .join("\n");

      try {
        const result = await summarizeNotifications({
          notifications: notificationContent,
        });
        setSummary(result.summary);
      } catch (error) {
        console.error("No se pudieron resumir las notificaciones:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron resumir las notificaciones.",
        });
      }
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
          </span>
          <span className="sr-only">Alternar notificaciones</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 md:w-96 p-0" align="end">
        <div className="p-4 flex justify-between items-center">
          <h4 className="font-medium font-headline">Notificaciones</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSummarize}
            disabled={isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isPending ? "Resumiendo..." : "Resumir"}
          </Button>
        </div>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b px-4">
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="mentions">Menciones</TabsTrigger>
            <TabsTrigger value="system">Sistema</TabsTrigger>
          </TabsList>
          
          {(isPending || summary) && (
            <div className="p-4 border-b bg-muted/50">
                <h5 className="flex items-center gap-2 text-sm font-semibold mb-2">
                    <BotMessageSquare className="w-5 h-5 text-primary" />
                    Resumen de IA
                </h5>
                {isPending && !summary ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{summary}</p>
                )}
            </div>
          )}

          <TabsContent value="all" className="max-h-80 overflow-y-auto">
            <NotificationList notifications={mockNotifications} />
          </TabsContent>
          <TabsContent value="mentions" className="max-h-80 overflow-y-auto">
            <NotificationList
              notifications={mockNotifications.filter((n) => n.type === "mention")}
            />
          </TabsContent>
          <TabsContent value="system" className="max-h-80 overflow-y-auto">
            <NotificationList
              notifications={mockNotifications.filter((n) => n.type === "system")}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function NotificationList({ notifications }: { notifications: typeof mockNotifications }) {
  if (notifications.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">No hay notificaciones aquí.</p>;
  }
  return (
    <div className="flex flex-col">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="flex items-start gap-3 p-4 border-b last:border-b-0 hover:bg-muted/50"
        >
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
          )}
          <div className={notification.read ? 'pl-4' : ''}>
            <p className="font-semibold">{notification.title}</p>
            <p className="text-sm text-muted-foreground">{notification.description}</p>
            <p className="text-xs text-muted-foreground mt-1">{notification.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
