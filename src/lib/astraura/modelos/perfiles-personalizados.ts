export type Alcance = "agente" | "bot" | "neurona" | "capa";

export interface Pesos {
  latencia: number;
  calidad: number;
  privacidad: number;
  ahorro: number;
}

export interface Preferencias {
  proveedores: string[];
  repos: string[];
}

export interface Limites {
  contextoMaxTokens?: number;
}

export interface PerfilPersonalizado {
  id: string;
  alcance: Alcance;
  objetivoId: string;
  preferencias: Preferencias;
  pesos: Pesos;
  limites?: Limites;
  creadoEn: string;
}

const ALCACES_VALIDOS: ReadonlySet<Alcance> = new Set(["agente", "bot", "neurona", "capa"]);
interface ValidacionParcial {
  id?: unknown; alcance?: unknown; objetivoId?: unknown; preferencias?: unknown; pesos?: unknown; creadoEn?: unknown;
}

export function validarPerfil(raw: unknown): asserts raw is PerfilPersonalizado {
  if (typeof raw !== "object" || raw === null) throw new Error("El perfil debe ser un objeto");
  const p = raw as ValidacionParcial;
  if (typeof p.id !== "string" || p.id.trim() === "") throw new Error("El campo 'id' es obligatorio y debe ser una cadena no vacia");
  if (!ALCACES_VALIDOS.has(p.alcance as Alcance)) throw new Error(`El alcance '${p.alcance}' no es valido. Debe ser: agente, bot, neurona o capa`);
  if (typeof p.objetivoId !== "string" || p.objetivoId.trim() === "") throw new Error("El campo 'objetivoId' es obligatorio y debe ser una cadena no vacia");
  if (typeof p.preferencias !== "object" || p.preferencias === null) throw new Error("El campo 'preferencias' es obligatorio");
  const prefObj = p.preferencias as { proveedores?: unknown; repos?: unknown };
  if (!Array.isArray(prefObj.proveedores)) throw new Error("preferencias.proveedores debe ser un array");
  if (!Array.isArray(prefObj.repos)) throw new Error("preferencias.repos debe ser un array");
  if (typeof p.pesos !== "object" || p.pesos === null) throw new Error("El campo 'pesos' es obligatorio");
  const pesosObj = p.pesos as { latencia?: unknown; calidad?: unknown; privacidad?: unknown; ahorro?: unknown };
  const sumaPesos = Number(pesosObj.latencia) + Number(pesosObj.calidad) + Number(pesosObj.privacidad) + Number(pesosObj.ahorro);
  if (sumaPesos > 1) throw new Error("La suma de pesos no puede ser mayor a 1");
  if (typeof p.creadoEn !== "string" || p.creadoEn.trim() === "") throw new Error("El campo 'creadoEn' es obligatorio");
}

export function crearPerfil(input: Omit<PerfilPersonalizado, "creadoEn">): PerfilPersonalizado {
  return { ...input, creadoEn: new Date().toISOString().split("T")[0] };
}

export function exportarPerfil(perfil: PerfilPersonalizado): string { return JSON.stringify(perfil); }

export function importarPerfil(json: string): PerfilPersonalizado {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch (e) { throw new Error("JSON invalido"); }
  validarPerfil(parsed);
  return parsed as PerfilPersonalizado;
}

export function tipoAlcance(id: string, contexto: Alcance): Alcance { return contexto; }

export function pesosValidos(pesos: Pesos): boolean {
  const suma = pesos.latencia + pesos.calidad + pesos.privacidad + pesos.ahorro;
  return suma <= 1 && suma >= 0;
}

export function preferenciasValidas(p: Preferencias): boolean {
  return new Set(p.proveedores).size === p.proveedores.length && new Set(p.repos).size === p.repos.length;
}

export function normalizarPerfiles(perfiles: PerfilPersonalizado[]): PerfilPersonalizado[] {
  const vistos = new Set<string>();
  const resultado: PerfilPersonalizado[] = [];
  for (const p of perfiles) {
    const idNormalizado = p.id.toLowerCase().trim();
    if (!vistos.has(idNormalizado)) { vistos.add(idNormalizado); resultado.push({ ...p, id: idNormalizado }); }
  }
  return resultado;
}

export function filtrarPorAlcance(perfiles: PerfilPersonalizado[], alcance: Alcance): PerfilPersonalizado[] {
  return perfiles.filter((p) => p.alcance === alcance);
}

export function combinarPreferencias(p1: Preferencias, p2: Preferencias): Preferencias {
  return { proveedores: [...new Set([...p1.proveedores, ...p2.proveedores])], repos: [...new Set([...p1.repos, ...p2.repos])] };
}