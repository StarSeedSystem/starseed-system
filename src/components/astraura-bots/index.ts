/**
 * Punto único del panel del bot: cuerpo, voz propia y pato simulado.
 * Contrato: architecture/astraura-voces-y-robots.md §3 (voz de cada bot) y §4
 * (el Open Duck Mini como cuerpo). Reexporta lo que ya existe para que una sola
 * ruta monte el panel completo, sin duplicar componentes ni lógica.
 */

export { PanelBots, descargarCopia } from "./panel-bots";
export { EditorBot } from "./editor-bot";
export { EditorVozBot } from "./voz-bot-editor";
export { CuerpoBot } from "./cuerpo-bot";
export { BotsEntidad } from "./bots-entidad";
export { PatoSimuladoComponent } from "@/components/robots/pato-simulado";

export type { Bot, Cuerpo, FormaCuerpo, Medio } from "@/lib/astraura-bots/tipos";
export type { VozBot, MotorVoz, OrigenTimbre } from "@/lib/astraura-bots/voz-bot";
