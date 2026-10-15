"use client";

import type { Brain } from "@/lib/brains/brains";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, SendHorizontal, Database, Link2 } from "lucide-react";

export interface AjustesSyncProps {
  valor: any;
  onCambio: (valor: any) => void;
  cerebro: Brain;
  onAbrirTelepatia?: () => void;
}

export function AjustesSync({ valor, onCambio, cerebro, onAbrirTelepatia }: AjustesSyncProps) {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4">
        <div className="flex items-start gap-3 mb-3">
          <RefreshCw className="h-4 w-4 text-cyan-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-white">Vinculación y sincronización</h3>
            <p className="text-sm text-white/60">
              Configura cómo se sincroniza este cerebro con otros destinos
            </p>
          </div>
        </div>
        
        {/* Dirección */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-white/80">
            Dirección
            <SendHorizontal className="h-3 w-3 text-white/50" />
          </Label>
          <Select
            defaultValue={valor.sync?.direccion || "ninguna"}
            onValueChange={(value) =>
              onCambio({
                ...valor,
                sync: { ...valor.sync, direccion: value as "enviar" | "recibir" | "ambas" | "ninguna" },
              })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecciona una dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Ninguna</SelectItem>
              <SelectItem value="enviar">Solo enviar</SelectItem>
              <SelectItem value="recibir">Solo recibir</SelectItem>
              <SelectItem value="ambas">Enviar y recibir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Sincronizar solo */}
        <div className="space-y-2">
          <Label
            className="flex items-center gap-2 text-sm font-medium text-white/80"
          >
            Sincronizar solo
            <Database className="h-3 w-3 text-white/50" />
          </Label>
          <Switch
            checked={valor.sync?.auto ?? false}
            onCheckedChange={(checked) =>
              onCambio({
                ...valor,
                sync: { ...valor.sync, auto: checked },
              })
            }
          >
            Activar sincronización automática
          </Switch>
        </div>
        
        {/* Vínculos de Telepatía */}
        <div className="space-y-2">
          <Label className="flex items-start gap-2 text-sm font-medium text-white/80">
            <Link2 className="h-3 w-3 text-white/50" />
            Vínculos de Telepatía
          </Label>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-white/50">
              Este cerebro tiene <strong className="text-white">
                {cerebro.config.telepatia?.length || 0}
              </strong> vínculo(s) configurado(s)
            </p>
            {onAbrirTelepatia && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAbrirTelepatia}
                className="w-full gap-2 whitespace-normal h-auto"
              >
                <Link2 className="h-3 w-3 mr-2" />
                Gestionar vínculos
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}