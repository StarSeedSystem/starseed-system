import { type DockItemConfig } from "@/components/layout/dock-config";
import { type Postura } from "@/lib/xr/tipos";

export type App3DTipo = "nativa-3d" | "uispec" | "solo-2d";

export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockItemConfig[] {
    const enabled = config.filter((i) => i.enabled);
    const limite = postura === "una-mano" ? 5 : 7;
    return enabled.slice(0, limite);
}

export function resolverApp(item: DockItemConfig): { tipo: App3DTipo; id?: string; ruta?: string; motivo?: string } {
    if (item.path === "/xr" || item.path.startsWith("/escena/") || item.path.startsWith("/sala-xr/")) {
        return { tipo: "nativa-3d", id: item.id };
    }
    return { 
        tipo: "solo-2d", 
        ruta: item.path, 
        motivo: "Esta app todavía no tiene vista 3D" 
    };
}
