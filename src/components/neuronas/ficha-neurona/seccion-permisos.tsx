"use client";

import { Shield, MousePointerClick, FileText, RefreshCw, Wifi, Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { permissionsFor, setPermission, DEFAULT_PERMISSIONS, type NeuronPermissions } from "@/lib/neurons/neurons";

const PERMISOS_DEFS: { key: keyof NeuronPermissions; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: "compute", label: "Control remoto", hint: "Permitir control de esta neurona desde otras", icon: <MousePointerClick className="w-4 h-4" /> },
  { key: "agent", label: "Terminal entre neuronas", hint: "Aceptar órdenes de terminal/agentes", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M9 17h6"/><path d="M12 14v3"/></svg> },
  { key: "storage", label: "Archivos", hint: "Compartir y recibir archivos", icon: <FileText className="w-4 h-4" /> },
  { key: "sync", label: "Sincronía", hint: "Contexto y ajustes en vivo", icon: <RefreshCw className="w-4 h-4" /> },
  { key: "senses", label: "Aceptar sin preguntar", hint: "Permitir sentidos (mic/cámara/pantalla) sin confirmar", icon: <Wifi className="w-4 h-4" /> },
  { key: "wake", label: "Despertar remoto", hint: "Recibir avisos de otras neuronas", icon: <Bell className="w-4 h-4" /> },
];

export interface SeccionPermisosProps {
  neurona: { id: string; isThisDevice?: boolean };
}

export function SeccionPermisos({ neurona }: SeccionPermisosProps) {
  const permisos = permissionsFor(neurona.id);
  const esEsta = neurona.isThisDevice;

  const actualizar = (key: keyof NeuronPermissions, value: boolean) => {
    setPermission(neurona.id, key, value);
  };

  return (
    <div className="space-y-3" data-seccion="permisos">
      <p className="text-xs text-white/50">
        {esEsta
          ? "Estos permisos controlan lo que OTRAS neuronas pueden hacer con ESTA. Cada neurona decide los suyos en su propio aparato."
          : "Estos permisos controlan lo que ESTA neurona puede hacer. La dueña los cambia en su aparato."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PERMISOS_DEFS.map((p) => (
          <div
            key={p.key}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors",
              esEsta ? "border-white/10 bg-black/20" : "border-amber-400/20 bg-amber-500/5"
            )}
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-amber-300/80 mt-0.5 flex-shrink-0">{p.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight text-white/85">{p.label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{p.hint}</p>
              </div>
            </div>
            <Switch
              checked={permisos[p.key] ?? DEFAULT_PERMISSIONS[p.key]}
              onCheckedChange={(v) => actualizar(p.key, v)}
              aria-label={`${p.label} en ${neurona.id}`}
              disabled={!esEsta}
            />
          </div>
        ))}
      </div>
      {!esEsta && (
        <p className="text-[11px] text-amber-300/80">
          Cada permiso lo enciende la persona dueña en SU aparato. Nada se enciende solo.
        </p>
      )}
    </div>
  );
}

export default SeccionPermisos;