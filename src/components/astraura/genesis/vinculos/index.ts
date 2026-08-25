/**
 * index.ts — barril de `genesis/vinculos/`. Reexporta la lógica pura y el
 * panel para que quien integre esta pantalla (p. ej. una pestaña "Vínculos"
 * en `genesis-section.tsx`, fuera de mi alcance en este cierre de deudas)
 * pueda importar desde una única ruta.
 */
export * from "./vinculos-logic";
export { VinculosPanel, type VinculosPanelProps } from "./vinculos-panel";
