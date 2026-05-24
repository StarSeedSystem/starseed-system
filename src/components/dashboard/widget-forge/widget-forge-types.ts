// ─── Widget Forge Types ──────────────────────────────────────────
// Types for La Fragua de Interfaces — 3-Phase AI Widget Creator

export type ForgeStep =
    | 'idle'
    | 'phase1_structure'
    | 'phase2_loading'
    | 'phase2_visuals'
    | 'phase3_loading'
    | 'phase3_metamorphosis';

export type ForgeMetaTab = 'aspecto' | 'espacial' | 'conexiones' | 'inteligencia' | 'codigo';

export interface WidgetOntology {
    title: string;
    description: string;
    themeColor: string;
    htmlCode: string;
}

export interface VisualVariation {
    title: string;
    description: string;
    themeColor: string;
    imageUrl: string;
}

export interface WidgetConfig {
    opacity: number;
    blur: number;
    borderRadius: number;
    size: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    animationStiffness: number;
    animationDamping: number;
    dataSource: 'akashic' | 'ipfs' | 'local' | 'rest_api' | 'mcp';
    aiSkill: 'none' | 'predictive' | 'translation' | 'socratic';
    scale: number;
    rotateX: number;
    rotateY: number;
    glowIntensity: number;
}

export interface StructureConfig {
    density: number;
    symmetry: number;
    tension: number;
}

export interface ForgeLayout {
    id: string;
    icon: string; // Lucide icon name
    desc: string;
}

export const FORGE_LAYOUTS: ForgeLayout[] = [
    { id: 'Fluido Radial', icon: 'CircleDashed', desc: 'Ciclos y biometría' },
    { id: 'Cuadrícula Modular', icon: 'LayoutGrid', desc: 'Alta densidad de datos' },
    { id: 'Flujo Vertical', icon: 'AlignCenter', desc: 'Narrativas y feeds' },
    { id: 'Panal Hexagonal', icon: 'Hexagon', desc: 'Estructuras orgánicas' },
    { id: 'Órbita Concéntrica', icon: 'Radio', desc: 'Sistemas jerárquicos' },
    { id: 'Grafo Asimétrico', icon: 'Network', desc: 'Relaciones complejas' },
];

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
    opacity: 0.4,
    blur: 16,
    borderRadius: 32,
    size: 'md',
    animationStiffness: 100,
    animationDamping: 20,
    dataSource: 'akashic',
    aiSkill: 'none',
    scale: 1,
    rotateX: 0,
    rotateY: 0,
    glowIntensity: 20,
};

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
    density: 50,
    symmetry: 80,
    tension: 30,
};
