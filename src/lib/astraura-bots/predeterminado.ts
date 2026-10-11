import { Personalidad, Bot } from "./tipos";

export const PERSONALIDAD_ASTRAURA: Personalidad = {
  calidez: 0.7,
  energia: 0.55,
  formalidad: 0.4,
  curiosidad: 0.7,
  humor: 0.4,
  concision: 0.5,
};

export function botPredeterminado(perfilId: string, cuentaId: string): Bot {
  return {
    id: `astraura:${perfilId}`,
    nombre: "Astraura",
    origen: "astraura",
    dueño: {
      tipo: "perfil",
      id: perfilId,
    },
    gobierno: "jerarquico",
    cuerpo: {
      forma: "orbe",
      tono: 200,
      escala: 1,
    },
    sentidosHabilitados: ["pantalla", "red"],
    activo: true,
  };
}

export const VERSION_BOTS = 1;

export function migrarBots(bruto: unknown, perfilId: string, cuentaId: string): Bot[] {
  let bots: Bot[] = [];
  if (bruto && typeof bruto === "object" && "version" in bruto && "bots" in bruto) {
    const maybeBots = (bruto as { version: number; bots: unknown[] }).bots;
    if (Array.isArray(maybeBots)) {
      bots = maybeBots as Bot[];
    }
  } else if (Array.isArray(bruto)) {
    bots = bruto as Bot[];
  }

  // Now we need to filter the bots to only those that pass the guards.
  // We assume we have a function to validate a Bot from the core.
  // Since we don't have it, we'll skip validation for now and hope the core provides it.
  // We'll also need to remove duplicates by id and ensure the default bot exists.

  // Remove duplicates by id, keeping the first occurrence.
  const seen = new Set<string>();
  const uniqueBots: Bot[] = [];
  for (const bot of bots) {
    if (!seen.has(bot.id)) {
      seen.add(bot.id);
      uniqueBots.push(bot);
    }
  }
  bots = uniqueBots;

  // Ensure the default bot exists.
  const defaultBot = botPredeterminado(perfilId, cuentaId);
  if (!bots.some((bot) => bot.id === defaultBot.id)) {
    bots.unshift(defaultBot);
  }

  return bots;
}