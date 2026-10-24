// Cupo de Cloudroom por contexto: reparte el cupo de la CUENTA entre sus contextos
// (personal, grupos, páginas) con ritmo diario. Módulo puro: sin red, disco ni reloj;
// la fecha se inyecta como «ahora». SOP: architecture/cloudroom-servidor-agentes.md §4.2.

export const DIAS_CICLO = 30;
export const CUPO_GRATIS_CICLO = 100;

const MS_DIA = 24 * 60 * 60 * 1000;

export type PlanPagoCloudroom = 'pro' | 'super' | 'ultra';

// El cupo de los planes de pago lo DECLARA la persona (cupoCiclo): nunca se inventa.
// cupoCiclo en null = plan de pago todavía sin cifra declarada, no se lanza nada.
export type PlanCloudroom =
  | { tipo: 'gratis' }
  | { tipo: PlanPagoCloudroom; cupoCiclo: number | null };

export interface Consumo {
  contextoId: string;
  t: number;
  n: number;
}

export interface ContextoCloudroom {
  id: string;
  peso: number;
  reservado?: number;
}

export function cupoTotal(plan: PlanCloudroom): number | null {
  return plan.tipo === 'gratis' ? CUPO_GRATIS_CICLO : plan.cupoCiclo;
}

// Ciclo vigente: el de 30 días que contiene «ahora» a partir de inicioCiclo.
export function cicloActual(inicioCiclo: number, ahora: number): { inicio: number; fin: number } {
  const tramo = ahora > inicioCiclo ? Math.floor((ahora - inicioCiclo) / (DIAS_CICLO * MS_DIA)) : 0;
  const inicio = inicioCiclo + tramo * DIAS_CICLO * MS_DIA;
  return { inicio, fin: inicio + DIAS_CICLO * MS_DIA };
}

export function usadoDe(
  consumos: Consumo[],
  contextoId: string,
  desde: number,
  hasta: number,
): number {
  return consumos
    .filter((c) => c.contextoId === contextoId && c.t >= desde && c.t <= hasta)
    .reduce((s, c) => s + Math.max(0, c.n), 0);
}

// Cupo de la cuENta que queda en el ciclo vigente. En un plan de pago sin cifra
// declarada devuelve null: no se inventa, hay que declararla para lanzar.
export function cupoRestante(
  plan: PlanCloudroom,
  consumos: Consumo[],
  inicioCiclo: number,
  ahora: number,
): number | null {
  const total = cupoTotal(plan);
  if (total === null) return null;
  const { inicio } = cicloActual(inicioCiclo, ahora);
  const usado = consumos
    .filter((c) => c.t >= inicio && c.t <= ahora)
    .reduce((s, c) => s + Math.max(0, c.n), 0);
  return Math.max(0, total - usado);
}

// Ritmo de lanzamientos por día: nunca agota el cupo antes del reinicio del ciclo,
// redondelda hacia abajo y mínimo 0 (lo que falta se deja para las franjas siguientes).
export function ritmoDiario(restante: number, diasQueQuedan: number): number {
  if (restante <= 0) return 0;
  const dias = Math.max(1, diasQueQuedan);
  return Math.floor(restante / dias);
}

// Reservas primero (en orden de declaración, sin pasarse del disponible) y el resto
// por peso, todo en enteros: la sobra del redondeo va al de más peso (empates por orden).
export function repartir(restante: number, contextos: ContextoCloudroom[]): Record<string, number> {
  const reparto: Record<string, number> = {};
  for (const c of contextos) reparto[c.id] = 0;
  if (restante <= 0 || contextos.length === 0) return reparto;
  let resto = restante;
  for (const c of contextos) {
    const reserva = Math.min(Math.max(0, c.reservado ?? 0), resto);
    reparto[c.id] += reserva;
    resto -= reserva;
  }
  if (resto <= 0) return reparto;
  const pesos = contextos.map((c) => (c.peso > 0 ? c.peso : 1));
  const suma = pesos.reduce((a, b) => a + b, 0);
  const bases = pesos.map((p) => Math.floor((resto * p) / suma));
  let sobra = resto - bases.reduce((a, b) => a + b, 0);
  const orden = pesos.map((peso, i) => ({ peso, i })).sort((x, y) => y.peso - x.peso || x.i - y.i);
  let k = 0;
  while (sobra > 0) {
    reparto[contextos[orden[k % orden.length].i].id] += 1;
    sobra -= 1;
    k += 1;
  }
  contextos.forEach((c, i) => {
    reparto[c.id] += bases[i];
  });
  return reparto;
}

export function puedeLanzar(
  contextoId: string,
  plan: PlanCloudroom,
  consumos: Consumo[],
  inicioCiclo: number,
  ahora: number,
  opciones?: { asignado?: number; diasQueQuedan?: number },
): { ok: boolean; motivo: string } {
  const total = cupoTotal(plan);
  if (total === null) {
    return {
      ok: false,
      motivo: `Plan de Cloudroom «${plan.tipo}» sin cifra declarada: la persona debe declarar el cupo de su ciclo antes de lanzar (no se inventa).`,
    };
  }
  const { inicio, fin } = cicloActual(inicioCiclo, ahora);
  const usadoCiclo = usadoDe(consumos, contextoId, inicio, ahora);
  const techo = opciones?.asignado ?? total;
  if (usadoCiclo >= techo) {
    return {
      ok: false,
      motivo: `Cupo de Cloudroom agotado para «${contextoId}»: ${usadoCiclo} de ${techo} usados en este ciclo. Se renueva al acabar el ciclo.`,
    };
  }
  const restanteContexto = techo - usadoCiclo;
  const diasQueQuedan = opciones?.diasQueQuedan ?? Math.max(1, Math.ceil((fin - ahora) / MS_DIA));
  const ritmo = ritmoDiario(restanteContexto, diasQueQuedan);
  if (ritmo <= 0) {
    return {
      ok: false,
      motivo: `El ritmo diario es 0 pese a quedar ${restanteContexto}: se guarda el cupo para los días siguientes del ciclo y no se agota antes del reinicio.`,
    };
  }
  const usadoHoy = usadoDe(consumos, contextoId, Math.max(inicio, ahora - MS_DIA), ahora);
  if (usadoHoy >= ritmo) {
    return {
      ok: false,
      motivo: `Ritmo diario de Cloudroom alcanzado para «${contextoId}»: ${usadoHoy} de ${ritmo} hoy. Toca esperar a la franja siguiente del ciclo.`,
    };
  }
  const restanteCuenta = cupoRestante(plan, consumos, inicioCiclo, ahora);
  return {
    ok: true,
    motivo: `Puede lanzar «${contextoId}»: quedan ${restanteContexto} del contexto y ${restanteCuenta} de la cuenta, ritmo de ${ritmo} por día.`,
  };
}
