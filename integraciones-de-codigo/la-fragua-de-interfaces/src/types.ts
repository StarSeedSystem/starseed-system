export interface WidgetOntology {
  title: string;
  description: string;
  themeColor: string;
  htmlCode: string;
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
