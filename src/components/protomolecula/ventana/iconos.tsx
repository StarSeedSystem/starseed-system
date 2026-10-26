/**
 * Ventana de la Protomolécula · iconos (Lucide, nunca emojis) y colores Trinity compartidos por las pestañas.
 */
import {
  Box, ClipboardCheck, FileCog, FileText, Gavel, Globe, ImagePlus, Landmark, LayoutDashboard, Lock, MessageSquare,
  Orbit, Palette, Presentation, Sparkles, SquareStack, Users, User, Vote, Wallpaper, Glasses, GitBranch, WandSparkles,
  Atom, ExternalLink, MousePointerClick, Pencil,
  type LucideIcon,
} from "lucide-react";
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { TipoEntidadProto } from "@/lib/protomolecula/peticion/contrato";
import type { IconoHerramienta } from "./tipos";
import type { PasoLegible } from "./pasos";

export const ICONO_HERRAMIENTA: Record<IconoHerramienta, LucideIcon> = {
  objeto3d: Box, imagen: ImagePlus, fondo: Wallpaper, pizarra: Presentation, xr: Glasses, lienzo: Atom, rama: GitBranch,
  molecula: Orbit, propuesta: Vote, gobierno: Landmark, convertir: FileCog, mensaje: MessageSquare, diseno: Palette,
  orden: WandSparkles, seleccion: MousePointerClick,
};

export const ICONO_PASO: Record<PasoLegible["icono"], LucideIcon> = {
  objeto3d: Box, imagen: ImagePlus, editar: Pencil, insertar: SquareStack, abrir: ExternalLink, fondo: Wallpaper, orden: WandSparkles, metagenesis: Sparkles,
};

export const ICONO_AMBITO: Record<Ambito, LucideIcon> = { personal: Lock, perfil: User, grupo: Users, publica: Globe };

export const ICONO_ENTIDAD: Record<TipoEntidadProto, LucideIcon> = {
  perfil: User, grupo: Users, comunidad: Users, pagina: FileText, publicacion: FileText, mensaje: MessageSquare, archivo: FileCog,
  pizarra: Presentation, escritorio: LayoutDashboard, widget: LayoutDashboard, molecula: Orbit,
};

export const ICONO_GOBIERNO = { aplicar: ClipboardCheck, proponer: Gavel, votar: Vote, denegar: Lock } as const;

/** Acentos Trinity por decisión del gobierno: Horizon (aplicar), Logic (proponer), Zenith (votar), Anchor (denegar). */
export const TONO_DECISION = {
  aplicar: { borde: "border-[#10B981]/40", fondo: "bg-[#10B981]/10", texto: "text-[#10B981]", punto: "bg-[#10B981]" },
  proponer: { borde: "border-[#FFBF00]/40", fondo: "bg-[#FFBF00]/10", texto: "text-[#FFBF00]", punto: "bg-[#FFBF00]" },
  votar: { borde: "border-[#007FFF]/50", fondo: "bg-[#007FFF]/10", texto: "text-[#5CA8FF]", punto: "bg-[#007FFF]" },
  denegar: { borde: "border-[#DC143C]/50", fondo: "bg-[#DC143C]/10", texto: "text-[#FF6B85]", punto: "bg-[#DC143C]" },
} as const;
