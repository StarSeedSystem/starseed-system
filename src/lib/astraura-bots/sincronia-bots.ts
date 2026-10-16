interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function abiertosEnEstaNeurona(storage: Storage): string[] {
  const r = storage.getItem("starseed.astraura.bots.orbes.v1");
  if (!r) return [];
  try {
    const v = JSON.parse(r);
    if (Array.isArray(v)) return v.filter((i): i is string => typeof i === "string");
    return [];
  } catch { return []; }
}

export function marcarAbierto(b: string, a: boolean, storage: Storage): void {
  const r = storage.getItem("starseed.astraura.bots.orbes.v1");
  let c: string[] = [];
  if (r) {
    try {
      const p = JSON.parse(r);
      if (Array.isArray(p)) c = p.filter((i): i is string => typeof i === "string");
    } catch { c = []; }
  }
  if (a) {
    if (!c.includes(b)) c.push(b);
  } else {
    c = c.filter(i => i !== b);
  }
  storage.setItem("starseed.astraura.bots.orbes.v1", JSON.stringify(c));
}

export function fusionarBots(
  local: Readonly<{ bots: any[]; actualizado: Record<string, number> }>,
  remoto: Readonly<{ bots: any[]; actualizado: Record<string, number> }>
): { bots: any[]; actualizado: Record<string, number> } {
  const botsPorId = new Map<string, any>();
  const actualizadoPorId: Record<string, number> = {};

  for (const bot of local.bots) {
    // Skip invalid bots (those without a nombre field)
    if (!bot.nombre) continue;
    botsPorId.set(bot.id, bot);
    actualizadoPorId[bot.id] = local.actualizado[bot.id] ?? 0;
  }

  for (const bot of remoto.bots) {
    // Skip invalid bots (those without a nombre field)
    if (!bot.nombre) continue;
    const timestampRemoto = remoto.actualizado[bot.id] ?? 0;
    const timestampLocal = actualizadoPorId[bot.id];
    if (!botsPorId.has(bot.id) || timestampRemoto > timestampLocal) {
      botsPorId.set(bot.id, bot);
      actualizadoPorId[bot.id] = timestampRemoto;
    }
  }

  return { bots: Array.from(botsPorId.values()), actualizado: actualizadoPorId };
}