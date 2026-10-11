import type { AccionBot } from "./acciones";

/**
 * Traduce una acción de bot en un comando para el Open Duck Mini v2.
 * Puro: sin React, sin red, sin `node:*`, sin reloj.
 */
export function robotPatoCommand(action: AccionBot): string {
  switch (action.tipo) {
    case "robot.caminar":
      return `WALK ${action.args.direction} ${action.args.distance}`;
    case "robot.girar":
      return `TURN ${action.args.angle}`;
    case "robot.emocion":
      return `EMOTION ${action.args.emotion}`;
    case "robot.bailar":
      return `DANCE ${action.args.danceType} ${action.args.duration}`;
    case "robot.negarCabeza":
      return `DENY ${action.args.times}`;
    case "robot.alto":
      return "ALTO";
    default:
      throw new Error(`Unknown robot pato action: ${action.tipo}`);
  }
}