/**
 * index.ts — barril de `genesis/herramientas/` (OLA 2: internet, herramientas,
 * cerebros propios, bots predeterminados). Reexporta cada pieza pública para
 * que quien integre esta ola en `ser-ficha.tsx`/`genesis-section.tsx` pueda
 * importar desde una única ruta en vez de conocer cada fichero interno.
 */
export * from "./herramientas-logic";
export { InternetPanel, type InternetPanelProps } from "./internet-panel";
export { HerramientasLista, type HerramientasListaProps } from "./herramientas-lista";
export { CerebrosPanel, type CerebrosPanelProps } from "./cerebros-panel";
export { BotsPredeterminadosPanel, type BotsPredeterminadosPanelProps } from "./bots-predeterminados-panel";
export { HerramientasSeccion, type HerramientasSeccionProps } from "./herramientas-seccion";
