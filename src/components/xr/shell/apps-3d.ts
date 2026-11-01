import { DockItemConfig } from "@/components/layout/dock-config";
import { POSTURA } from "@/lib/xr/tipos";

type Postura = typeof POSTURA[number];

export type App3DResolution = 
  | { tipo: 'nativa-3d'; id: string }
  | { tipo: 'uispec'; ruta: string }
  | { tipo: 'solo-2d'; ruta: string; motivo: string };

// Esta tabla define qué tiene vista 3D nativa hoy
const APPS_3D: Record<string, string> = {
  '/xr': 'nativa-3d',
  '/escena': 'nativa-3d',
  '/sala-xr': 'nativa-3d',
  '/astraura': 'nativa-3d',
  '/ajustes': 'nativa-3d',
};

export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockItemConfig[] {
  const enabled = config.filter((item) => item.enabled);
  const limite = postura === 'una-mano' ? 5 : 7;

  if (enabled.length <= limite) return enabled;

  const result = enabled.slice(0, limite - 1);
  result.push({
    id: 'mas',
    label: 'Más',
    iconKey: 'more-horizontal',
    path: '/hub',
    color: 'gray',
    enabled: true,
    origin: 'preset',
  });
  return result;
}

export function resolverApp(item: DockItemConfig): App3DResolution {
  if (APPS_3D[item.path]) {
    return { tipo: 'nativa-3d', id: item.id };
  }
  
  if (item.path.startsWith('/')) {
    return { 
      tipo: 'solo-2d', 
      ruta: item.path, 
      motivo: 'Esta app todavía no tiene vista 3D' 
    };
  }

  return { 
    tipo: 'solo-2d', 
    ruta: '/dashboard', 
    motivo: 'App desconocida o no soportada' 
  };
}
