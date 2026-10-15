"use client";

import type { Brain } from "@/lib/brains/brains";
import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ShieldCheck, Users, Lock } from "lucide-react";

export interface AjustesSeguridadProps {
  valor: any; // This will be replaced with proper type from ajustes.ts
  onCambio: (valor: any) => void;
  nivel: string; // 'cerebro' | 'memoria' | 'carpeta'
}

export function AjustesSeguridad({ valor, onCambio, nivel }: AjustesSeguridadProps) {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4">
        <div className="flex items-start gap-3 mb-3">
          <ShieldCheck className="h-4 w-4 text-cyan-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-white">Seguridad y privacidad</h3>
            <p className="text-sm text-white/60">
              Configura quién puede acceder a este cerebro y cómo se protege su información.
            </p>
          </div>
        </div>
        
        {/* Privacidad */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-white/80">
            Privacidad
            <Users className="h-3 w-3 text-white/50" />
          </Label>
          <Select
            defaultValue={valor.privacidad || "privado"}
            onValueChange={(value) => onCambio({ ...valor, privacidad: value })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecciona un nivel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="privado">Privado (solo tú)</SelectItem>
              <SelectItem value="perfil">Perfil (visible en tu perfil)</SelectItem>
              <SelectItem value="grupo">Grupo (compartido con tu grupo)</SelectItem>
              <SelectItem value="publico">Público (visible para todos)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-white/50 mt-1">
            Cambiar a grupo/público lo mueve a la pestaña Públicos y lo hace el scope
          </p>
        </div>
        
        {/* Cifrado local */}
        <div className="space-y-2">
          <Label
            className="flex items-center gap-2 text-sm font-medium text-white/80"
          >
            Cifrado local
            <Lock className="h-3 w-3 text-white/50" />
          </Label>
          <Switch
            checked={valor.cifradoLocal ?? false}
            onCheckedChange={(checked) =>
              onCambio({ ...valor, cifradoLocal: checked })
            }
          >
            <span className="text-sm text-white/70">
              Solo se guarda por ahora
            </span>
          </Switch>
        </div>
        
        {/* Lista de acceso */}
        <div className="space-y-2">
          <Label className="flex items-start gap-3 mb-2">
            <Users className="h-4 w-4 text-cyan-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-white">Lista de acceso</h4>
              <p className="text-sm text-white/60">
                Quién puede leer o escribir en este cerebro
              </p>
            </div>
          </Label>
          <div className="space-y-2 text-sm text-white/60">
            <p>
              <strong>Nota:</strong> Con Compartir o Telepatía lo leen quienes tengan
              permiso; escribir sigue siendo solo tuyo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}