/**
 * Motor de gestos unificado de StarSeed OS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica pura (sin DOM ni React) para arrastrar paneles con ratón, dedo o
 * lápiz con la MISMA API: umbral de intención, velocidad y latigazo, goma
 * elástica, decisión al soltar, rueda/trackpad y sesiones que abren una
 * cortina desde el borde siguiendo al puntero. El hook `useArrastrePanel`
 * (src/hooks/use-arrastre-panel.ts) lo conecta con Pointer Events y
 * framer-motion.
 */

export * from "./tipos";
export * from "./geometria";
export * from "./intencion";
export * from "./fisica";
export * from "./rueda";
export * from "./dispositivo";
export * from "./sesion-borde";
