export const VERSION_PROTOCOLO = 1;
export type TareaOla = { id: string; ola: string; depende: string[]; titulo: string; archivos: string[]; prompt: string; ambito_id?: string };
export type EventoMando = { t: number; tipo: string; tarea?: string; texto: string };
export type LatidoMotor = { t: number; estado: "vivo" | "dormido" | "frenado"; agentes: number; en_curso: string[] };
export type MensajeChat = { canal: string; autor: string; rol: string; texto: string };
export type LoteMotor = { version: number; motor_id: string; ambito_id: string; latido?: LatidoMotor; eventos: EventoMando[]; progreso: Record<string, { estado: string; avance?: number }>; medidores?: unknown };
type Resultado<T> = { ok: boolean; errores: string[]; valor?: T };
export function ocultarSecretos(texto: string): string {
  const patrones: RegExp[] = [
    /sk-[A-Za-z0-9_-]{15,}/g,
    /ghp_[A-Za-z0-9_-]{20,}/g,
    /github_pat_[A-Za-z0-9_-]{20,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /xox[abp]-[A-Za-z0-9_-]{10,}/g,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    /-----BEGIN .*?PRIVATE KEY-----[\s\S]*?-----END .*?PRIVATE KEY-----/g,
    /[A-Z_][A-Z0-9_]*_(KEY|TOKEN|SECRET)\s*=\s*[^ \t\r\n;]+/g,
  ];
  let s = texto;
  for (const p of patrones) s = s.replace(p, "[clave oculta]");
  return s;
}
function esString(v: unknown): v is string { return typeof v === "string"; }
export function validarTarea(x: unknown): Resultado<TareaOla> {
  const e: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["tarea debe ser objeto"] };
  const o = x as Record<string, unknown>;
  if (!esString(o.id) || !o.id.trim()) e.push("id inválido");
  if (!esString(o.ola) || !o.ola.trim()) e.push("ola inválida");
  if (!Array.isArray(o.depende) || !o.depende.every(esString)) e.push("depende debe ser lista de strings");
  if (!esString(o.titulo)) e.push("titulo inválido");
  if (!Array.isArray(o.archivos) || !o.archivos.every(esString)) e.push("archivos debe ser lista de strings");
  if (!esString(o.prompt)) e.push("prompt inválido");
  if (o.ambito_id !== undefined && !esString(o.ambito_id)) e.push("ambito_id inválido");
  return { ok: e.length === 0, errores: e, valor: e.length === 0 ? o as TareaOla : undefined };
}
export function sanearEvento(x: unknown): Resultado<EventoMando> {
  const e: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["evento debe ser objeto"] };
  const o = x as Record<string, unknown>;
  if (typeof o.t !== "number") e.push("t inválido");
  if (!esString(o.tipo)) e.push("tipo inválido");
  if (!esString(o.texto)) e.push("texto inválido");
  const texto = esString(o.texto) ? ocultarSecretos(o.texto) : "";
  if (texto.length > 4000) e.push("texto supera 4000 caracteres");
  return { ok: e.length === 0, errores: e, valor: { t: typeof o.t === "number" ? o.t : 0, tipo: esString(o.tipo) ? o.tipo : "", tarea: esString(o.tarea) ? o.tarea : undefined, texto: texto.slice(0, 4000) } };
}
export function sanearMensaje(x: unknown): Resultado<MensajeChat> {
  const e: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["mensaje debe ser objeto"] };
  const o = x as Record<string, unknown>;
  const canal = esString(o.canal) ? o.canal : "";
  const autor = esString(o.autor) ? o.autor : "";
  const rol = esString(o.rol) ? o.rol : "";
  const textoRaw = esString(o.texto) ? o.texto : "";
  if (canal.length > 40) e.push("canal > 40");
  if (autor.length > 40) e.push("autor > 40");
  const texto = ocultarSecretos(textoRaw);
  if (texto.length > 4000) e.push("texto supera 4000 caracteres");
  return { ok: e.length === 0, errores: e, valor: { canal: canal.slice(0, 40), autor: autor.slice(0, 40), rol, texto: texto.slice(0, 4000) } };
}
function contieneClaveProhibida(v: unknown): boolean {
  const PROH = ["accountid","token","clave","key","secret","email"];
  if (typeof v === "string") return v.length > 200;
  if (Array.isArray(v)) return v.some(contieneClaveProhibida);
  if (typeof v === "object" && v !== null) {
    for (const k of Object.keys(v)) {
      if (PROH.includes(k.toLowerCase())) return true;
      if (contieneClaveProhibida((v as Record<string, unknown>)[k])) return true;
    }
  }
  return false;
}
export function validarLote(x: unknown): Resultado<LoteMotor> {
  const e: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["lote debe ser objeto"] };
  const o = x as Record<string, unknown>;
  if (typeof o.version !== "number" || o.version !== VERSION_PROTOCOLO) e.push("version inválida");
  if (!esString(o.motor_id)) e.push("motor_id inválido");
  if (!esString(o.ambito_id)) e.push("ambito_id inválido");
  if (!Array.isArray(o.eventos)) e.push("eventos debe ser lista");
  else if (o.eventos.length > 200) e.push("más de 200 eventos");
  if (typeof o.progreso !== "object" || o.progreso === null) e.push("progreso inválido");
  if (JSON.stringify(o).length > 64 * 1024) e.push("lote > 64 KB");
  if (o.medidores !== undefined && contieneClaveProhibida(o.medidores)) e.push("medidores contiene clave prohibida o texto largo");
  return { ok: e.length === 0, errores: e, valor: e.length === 0 ? o as LoteMotor : undefined };
}
