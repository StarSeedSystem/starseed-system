/**
 * StarSeed OS — Plan de radios por enlace de la malla Wi-Fi.
 * Módulo PURO. Ola 1012Q · §8 «Bandas por enlace».
 */
import { PERFILES_WIFI } from "../../../ai/astraura/mesh/camr/regulacion";

export interface RadioRouter { id: string; banda: "2g" | "5g" | "6g"; anchosMhz: number[]; }
export interface RouterMalla { id: string; radios: RadioRouter[]; }
export interface TroncalPlan { a: string; b: string; banda: "5g" | "6g" | "2g"; canal: number; anchoMhz: number; pireDbm: number; }
export interface ClientePlan { router: string; banda: "2g"; canal: number; }

export function planRadios(e: {
  region: string; routers: RouterMalla[]; troncales: Array<[string, string]>; ocupacion?: Record<number, number>;
}): { troncales: TroncalPlan[]; clientes: ClientePlan[]; avisos: string[] } {
  const avisos: string[] = [];
  const perfil = PERFILES_WIFI[e.region];
  if (!perfil) avisos.push(`región desconocida (${e.region}), se usa perfil EU`);
  const p = perfil ?? PERFILES_WIFI["EU"];
  const ocup = e.ocupacion ?? {};

  const radiosPorRouter = new Map<string, RadioRouter[]>();
  for (const r of e.routers) radiosPorRouter.set(r.id, r.radios);

  const tiene = (rid: string, b: "2g" | "5g" | "6g") =>
    (radiosPorRouter.get(rid) ?? []).some((ra) => ra.banda === b);

  const elegirBanda = (a: string, b: string): "6g" | "5g" | "2g" => {
    if (tiene(a, "6g") && tiene(b, "6g")) return "6g";
    if (tiene(a, "5g") && tiene(b, "5g")) return "5g";
    return "2g";
  };

  const canalesDe = (banda: "2g" | "5g" | "6g") =>
    (banda === "2g" ? p.g24 : banda === "5g" ? p.g5 : p.g6).map((c) => c.canal);

  const pireCanal = (banda: "2g" | "5g" | "6g", canal: number) => {
    const lista = banda === "2g" ? p.g24 : banda === "5g" ? p.g5 : p.g6;
    const c = lista.find((x) => x.canal === canal);
    return c?.pireDbm ?? 23;
  };

  // Grafo de interferencia: troncales comparten router.
  const n = e.troncales.length;
  const vecinos = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [a1, b1] = e.troncales[i];
      const [a2, b2] = e.troncales[j];
      const comparten = a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2;
      if (comparten) { vecinos[i].add(j); vecinos[j].add(i); }
    }
  }

  const asignaciones = new Map<number, { canal: number; ancho: number }>();
  const orden = Array.from({ length: n }, (_, i) => i).sort((i, j) => vecinos[j].size - vecinos[i].size || i - j);

  for (const idx of orden) {
    const [ra, rb] = e.troncales[idx];
    const banda = elegirBanda(ra, rb);
    if (banda === "2g") avisos.push(`troncal ${ra}↔${rb} usa 2g (sin 5g/6g común)`);

    const canalesLegales = canalesDe(banda);
    const anchos = [...new Set(
      ([...radiosPorRouter.get(ra)!, ...radiosPorRouter.get(rb)!]
        .filter((ra2) => ra2.banda === banda)
        .flatMap((ra2) => ra2.anchosMhz)
      )
    )].sort((a, b) => b - a);

    // Ancho: mayor que quepa según bloques libres aproximados.
    let anchoElegido = 20;
    for (const an of anchos) {
      const bloques = an >= 80 ? 4 : an >= 40 ? 2 : 1;
      const ocupados = new Set([...asignaciones.values()].map((info) => info.canal));
      let libres = 0;
      for (let k = 0; k <= canalesLegales.length - bloques; k++) {
        const bloque = canalesLegales.slice(k, k + bloques);
        if (!bloque.some((ch) => ocupados.has(ch))) libres++;
      }
      if (libres >= bloques) { anchoElegido = an; break; }
    }

    // Coloreado: elegir canal no usado por vecinos asignados; desempate por menor ocupación.
    const canalesAsig: (number | undefined)[] = new Array(n);
    for (const [i2, info] of asignaciones) canalesAsig[i2] = info.canal;
    const canalesVecinosUsados = new Set<number>();
    for (const v of vecinos[idx]) {
      const c = canalesAsig[v];
      if (c !== undefined) canalesVecinosUsados.add(c);
    }
    const candidatos = [...canalesLegales].filter((c) => !canalesVecinosUsados.has(c)).sort((c1, c2) => {
      const o1 = ocup[c1] ?? 0, o2 = ocup[c2] ?? 0;
      if (o1 !== o2) return o1 - o2;
      return c2 - c1; // mayor canal como desempate estable
    });
    const canal = candidatos[0] ?? canalesLegales[0] ?? 1;
    asignaciones.set(idx, { canal, ancho: anchoElegido });
  }

  const troncalesResult: TroncalPlan[] = [];
  for (let i = 0; i < n; i++) {
    const [ra, rb] = e.troncales[i];
    const banda = elegirBanda(ra, rb);
    const info = asignaciones.get(i)!;
    troncalesResult.push({ a: ra, b: rb, banda, canal: info.canal, anchoMhz: info.ancho, pireDbm: pireCanal(banda, info.canal) });
  }

  const clientesResult: ClientePlan[] = [];
  const clientesSet = new Set<string>();
  for (const [a, b] of e.troncales) { clientesSet.add(a); clientesSet.add(b); }
  const ordenClientes = [...clientesSet].sort();
  const clientesCanales = [1, 6, 11];
  for (let i = 0; i < ordenClientes.length; i++) {
    clientesResult.push({ router: ordenClientes[i], banda: "2g", canal: clientesCanales[i % clientesCanales.length] });
  }

  return { troncales: troncalesResult, clientes: clientesResult, avisos };
}
