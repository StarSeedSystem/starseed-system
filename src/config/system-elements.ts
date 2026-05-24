import {
    Home, Bot, MessageSquare, Users, Network, PenSquare,
    Library, Settings, User, Search, Bell, Menu,
    MoreHorizontal, ArrowRight, Check, X,
    FileText, Image as ImageIcon, Video, Music,
    Shield, Activity, Zap, Cpu, Database,
    Github, Twitter, Globe,
    LayoutDashboard, Folder, Star, Heart, Share2
} from "lucide-react";

export type SystemElementCategory = "navigation" | "action" | "system" | "content" | "social";

export interface SystemElement {
    id: string;
    label: string;
    icon: any; // Lucide Icon component
    category: SystemElementCategory;
    description?: string;
}

export const MASTER_SYSTEM_ELEMENTS: SystemElement[] = [
    // --- MAIN NAVIGATION (From navigation-bar.tsx) ---
    { id: "nav-dashboard", label: "Dashboard", icon: Home, category: "navigation" },
    { id: "nav-network", label: "Red", icon: Network, category: "navigation" },
    { id: "nav-agent", label: "Agente", icon: Bot, category: "navigation" },
    { id: "nav-hub", label: "Hub", icon: Users, category: "navigation" },
    { id: "nav-library", label: "Biblioteca", icon: Library, category: "navigation" },
    { id: "nav-profile", label: "Perfil", icon: User, category: "navigation" },

    // --- QUICK ACTIONS ---
    { id: "action-publish", label: "Publicar", icon: PenSquare, category: "action" },
    { id: "action-messages", label: "Mensajes", icon: MessageSquare, category: "action" },
    { id: "action-search", label: "Buscar", icon: Search, category: "action" },
    { id: "action-settings", label: "Ajustes", icon: Settings, category: "action" },
    { id: "action-notifications", label: "Notificaciones", icon: Bell, category: "action" },
    { id: "action-menu", label: "Menu", icon: Menu, category: "action" },
    { id: "action-more", label: "Más", icon: MoreHorizontal, category: "action" },
    { id: "action-share", label: "Compartir", icon: Share2, category: "action" },

    // --- SYSTEM & STATUS ---
    { id: "sys-cpu", label: "Procesamiento", icon: Cpu, category: "system" },
    { id: "sys-memory", label: "Memoria", icon: Database, category: "system" },
    { id: "sys-network", label: "Señal", icon: Activity, category: "system" },
    { id: "sys-security", label: "Seguridad", icon: Shield, category: "system" },
    { id: "sys-power", label: "Energía", icon: Zap, category: "system" },

    // --- CONTENT TYPES ---
    { id: "content-text", label: "Texto", icon: FileText, category: "content" },
    { id: "content-image", label: "Imagen", icon: ImageIcon, category: "content" },
    { id: "content-video", label: "Video", icon: Video, category: "content" },
    { id: "content-audio", label: "Audio", icon: Music, category: "content" },
    { id: "content-folder", label: "Carpeta", icon: Folder, category: "content" },
    { id: "content-favorite", label: "Favorito", icon: Star, category: "content" },
    { id: "content-liked", label: "Me Gusta", icon: Heart, category: "content" },

    // --- UTILITY ---
    { id: "util-check", label: "Confirmar", icon: Check, category: "action" },
    { id: "util-close", label: "Cerrar", icon: X, category: "action" },
    { id: "util-arrow", label: "Flecha", icon: ArrowRight, category: "action" },
];

export const getElementsByCategory = (category: SystemElementCategory) =>
    MASTER_SYSTEM_ELEMENTS.filter(el => el.category === category);
