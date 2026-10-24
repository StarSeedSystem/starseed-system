/** Reparto puro del cupo mensual de Cloudroom. Las fechas y el libro llegan del llamador. */
export type PlanCloudroom = { tipo: "gratis" } | { tipo: "pro" | "super" | "ultra"; cupoDeclarado?: number };
export interface Consumo { contextoId: string; t: string | number; n: number }
export interface ContextoCupo { id: string; peso: number; reservado?: number }
const CICLO = 30 * 24 * 60 * 60 * 1000;
const fecha = (t: string | number) => typeof t === "number" ? t : Date.parse(t);
const capacidad = (p: PlanCloudroom): number | null => p.tipo === "gratis" ? 100
  : Number.isFinite(p.cupoDeclarado) && (p.cupoDeclarado ?? -1) >= 0 ? Math.floor(p.cupoDeclarado!) : null;

export function cupoRestante(plan: PlanCloudroom, consumos: Consumo[], inicioCiclo: string | number, ahora: string | number): number | null {
  const total = capacidad(plan), inicio = fecha(inicioCiclo), hoy = fecha(ahora);
  if (total === null || !Number.isFinite(inicio) || !Number.isFinite(hoy)) return null;
  const ciclo = inicio + Math.max(0, Math.floor((hoy - inicio) / CICLO)) * CICLO;
  const usado = consumos.reduce((s, c) => { const t = fecha(c.t); return t >= ciclo && t <= hoy && Number.isFinite(c.n) ? s + Math.max(0, c.n) : s; }, 0);
  return Math.max(0, total - usado);
}

export function ritmoDiario(restante: number, diasQueQuedan: number): number {
  return Number.isFinite(restante) && Number.isFinite(diasQueQuedan) && restante > 0 && diasQueQuedan > 0
    ? Math.floor(restante / diasQueQuedan) : 0;
}

/** Reserva primero; reparte el resto por peso entero. Los restos van al contexto de mayor peso. */
export function repartir(restante: number, contextos: ContextoCupo[]): Record<string, number> {
  const salida: Record<string, number> = Object.fromEntries(contextos.map((c) => [c.id, 0]));
  let libre = Math.max(0, Math.floor(Number.isFinite(restante) ? restante : 0));
  const reservas = contextos.map((c) => Math.max(0, Math.floor(c.reservado ?? 0)));
  const suma = reservas.reduce((a, b) => a + b, 0);
  if (suma > libre && suma > 0) {
    const maxPeso = Math.max(...contextos.map((c) => Math.max(0, c.peso)), 0);
    contextos.forEach((c, i) => { salida[c.id] = Math.floor(libre * reservas[i] / suma); });
    let sobra = libre - Object.values(salida).reduce((a, b) => a + b, 0);
    const ganador = contextos.find((c) => c.peso === maxPeso);
    if (ganador) salida[ganador.id] += sobra;
    return salida;
  }
  contextos.forEach((c, i) => { salida[c.id] = reservas[i]; });
  libre -= suma;
  const pesos = contextos.map((c) => Math.max(0, Number.isFinite(c.peso) ? c.peso : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  if (!total || !libre) return salida;
  contextos.forEach((c, i) => { salida[c.id] += Math.floor(libre * pesos[i] / total); });
  let sobra = libre - contextos.reduce((a, c) => a + salida[c.id] - reservas[contextos.indexOf(c)], 0);
  const mayor = Math.max(...pesos);
  const ganador = contextos.find((c) => c.peso === mayor && mayor > 0);
  if (ganador) salida[ganador.id] += sobra;
  return salida;
}

export interface PermisoLanzamiento {
  plan: PlanCloudroom; consumos: Consumo[]; inicioCiclo: string | number; ahora: string | number;
  contextos: ContextoCupo[]; diasQueQuedan: number;
}
export function puedeLanzar(contextoId: string, datos: PermisoLanzamiento): { ok: boolean; motivo: string } {
  const restante = cupoRestante(datos.plan, datos.consumos, datos.inicioCiclo, datos.ahora);
  if (restante === null) return { ok: false, motivo: "Declara el cupo de tu plan Cloudroom antes de lanzar agentes." };
  if (!datos.contextos.some((c) => c.id === contextoId)) return { ok: false, motivo: "Este contexto no tiene una parte asignada del cupo Cloudroom." };
  if (!restante) return { ok: false, motivo: "El cupo Cloudroom está agotado hasta el próximo ciclo de 30 días." };
  const parte = repartir(restante, datos.contextos)[contextoId] ?? 0;
  const hoy = fecha(datos.ahora), dia = Math.floor(hoy / 86400000) * 86400000;
  const usoHoy = datos.consumos.filter((c) => c.contextoId === contextoId && fecha(c.t) >= dia && fecha(c.t) <= hoy)
    .reduce((s, c) => s + Math.max(0, c.n), 0);
  if (ritmoDiario(parte, datos.diasQueQuedan) <= usoHoy) return { ok: false, motivo: "El ritmo diario de este contexto ya se alcanzó; espera al próximo día o al reinicio del ciclo." };
  return { ok: true, motivo: "Este contexto tiene cupo disponible para lanzar un agente Cloudroom." };
}
