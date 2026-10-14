export type CapaVersion = "datos" | "interfaz" | "sw" | "servicios" | "modelos" | "nativa";
export type VersionesCapa = Partial<Record<CapaVersion, string>>;

export function sanearVersionesCapa(x: unknown): VersionesCapa {
  const out: VersionesCapa = {};
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return out;
  }
  const VALIDA = /^[0-9A-Za-z._-]+$/;
  for (const capa of ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"] as const) {
    const value = (x as Record<string, unknown>)[capa];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0 && trimmed.length <= 40 && VALIDA.test(trimmed)) {
        out[capa] = trimmed;
      }
    }
  }
  return out;
}

function compararVersiones(a: string, b: string): number {
  const segA = a.split('.').map(s => parseInt(s, 10) || 0);
  const segB = b.split('.').map(s => parseInt(s, 10) || 0);
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const diff = (segA[i] || 0) - (segB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function fusionarVersionesMedios(medios: readonly { versiones?: unknown }[]): VersionesCapa {
  const out: VersionesCapa = {};
  for (const medio of medios) {
    const versiones = sanearVersionesCapa(medio?.versiones);
    for (const capa of Object.keys(versiones) as CapaVersion[]) {
      const version = versiones[capa] as string;
      const current = out[capa];
      if (!current || compararVersiones(version, current) > 0) {
        out[capa] = version;
      }
    }
  }
  return out;
}

export function resumenVersionesTexto(v: VersionesCapa): string {
  const capas: CapaVersion[] = ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"];
  return capas.map(capa => {
    const version = v[capa];
    return `${capa} ${version ?? "sin dato"}`;
  }).join(" · ");
}