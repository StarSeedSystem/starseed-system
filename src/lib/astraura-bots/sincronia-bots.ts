/**
 * Compatibilidad del núcleo de sincronía de bots (BOT1011Y).
 * La lógica pura vive en `fusionar-bots.ts`; aquí solo se reexporta para no romper
 * a quien ya importaba de este módulo. Nada de Supabase, React ni DOM.
 */
export { esBotValido, fusionarBots, type BotSync } from "./fusionar-bots";
