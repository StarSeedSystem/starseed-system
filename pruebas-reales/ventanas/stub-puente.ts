export function esAppNativa() { return true; }
export function puenteNativo() { return { llamar: async (c: string) => ({ ok: true, valor: c === "permisos_inicio_estado" ? { plataforma: "android" } : {} }) }; }
