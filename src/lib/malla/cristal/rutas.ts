// Malla cristalina SiO₂ amorfa: rutas óptimas sobre los puentes (Dijkstra y Yen)
// Módulo puro: sin node:*, sin Supabase, sin window

import type { Cristal, Reticula, Dato, Medio } from './tipos';
import { viabilidad } from './viabilidad';

export interface Ruta {
  saltos: string[];
  medios: Medio[];
  coste: number;
  motivo: string;
}

/**
 * Calcula las k mejores rutas para un dato sobre el cristal y la retícula dados.
 * Grafo = puentes del cristal; coste de un salto = 1 - viabilidad(dato, señal del puente).
 * Se excluyen enlaces no aptos. Usa Dijkstra y Yen para k rutas sin bucles.
 * Orden por coste y desempate por saltos. Si destino es null (difusión), devuelve
 * el árbol de caminos mínimos a todas como rutas de un salto cada una desde el origen hacia sus vecinos directos.
 */
export function mejoresRutas(
  cristal: Cristal,
  r: Reticula,
  dato: Dato,
  ctx: { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean },
  k = 3
): Ruta[] {
  // Si destino es null (difusión), devolvemos el árbol de caminos mínimos a todas como rutas de un salto cada una
  if (dato.destino === null) {
    return arbolDifusion(cristal, r, dato, ctx);
  }

  const origen = dato.origen;
  const destino = dato.destino;

  if (origen === destino) {
    return [{
      saltos: [origen],
      medios: [],
      coste: 0,
      motivo: 'destino alcanzado en origen'
    }];
  }

  // Construir grafo de adyacencia ponderado basado en viabilidad sobre los puentes del cristal
  const grafo = construirGrafo(cristal, r, dato, ctx);

  // Si no hay nodos o el origen/destino no están en el grafo
  if (!grafo.has(origen) || !grafo.has(destino)) {
    return [];
  }

  // Algoritmo de Yen para k rutas más cortas sin bucles
  const rutas: Ruta[] = [];
  const primeraRuta = dijkstra(grafo, origen, destino);
  
  if (!primeraRuta) {
    return [];
  }

  rutas.push(primeraRuta);

  const candidatos: Ruta[] = [];

  for (let i = 1; i < k; i++) {
    const rutaAnterior = rutas[i - 1];
    
    for (let j = 0; j < rutaAnterior.saltos.length - 1; j++) {
      const nodoEspolon = rutaAnterior.saltos[j];
      const caminoEspolon = rutaAnterior.saltos.slice(0, j + 1);
      const mediosEspolon = rutaAnterior.medios.slice(0, j);

      // Copiar grafo pero bloquear aristas/nodos según Yen
      const grafoModificado = clonarGrafo(grafo);

      // Bloquear aristas ya usadas en el mismo espolón por otras rutas previas
      for (const rPrev of rutas) {
        if (rPrev.saltos.length > j + 1 && sonIguales(rPrev.saltos.slice(0, j + 1), caminoEspolon)) {
          const u = rPrev.saltos[j];
          const v = rPrev.saltos[j + 1];
          // Eliminar arista (u, v)
          grafoModificado.get(u)?.delete(v);
          grafoModificado.get(v)?.delete(u);
        }
      }

      // Bloquear nodos del caminoEspolon (excepto el espolón en sí) para evitar bucles
      for (let m = 0; m < caminoEspolon.length - 1; m++) {
        const nodoBloqueado = caminoEspolon[m];
        grafoModificado.delete(nodoBloqueado);
      }

      const rutaRestante = dijkstra(grafoModificado, nodoEspolon, destino);
      
      if (rutaRestante) {
        const saltosCompleto = [...caminoEspolon.slice(0, -1), ...rutaRestante.saltos];
        const mediosCompleto = [...mediosEspolon, ...rutaRestante.medios];
        const costeCompleto = calcularCosteRuta(saltosCompleto, mediosCompleto, grafo);

        const nuevaRuta: Ruta = {
          saltos: saltosCompleto,
          medios: mediosCompleto,
          coste: costeCompleto,
          motivo: 'ruta Yen'
        };

        // Evitar duplicados
        if (!candidatos.some(c => sonIguales(c.saltos, nuevaRuta.saltos))) {
          candidatos.push(nuevaRuta);
        }
      }
    }

    if (candidatos.length === 0) {
      break;
    }

    // Ordenar candidatos por coste y desempate por saltos (longitud y luego alfabético)
    candidatos.sort((a, b) => {
      if (Math.abs(a.coste - b.coste) > 1e-6) {
        return a.coste - b.coste;
      }
      if (a.saltos.length !== b.saltos.length) {
        return a.saltos.length - b.saltos.length;
      }
      return a.saltos.join('|').localeCompare(b.saltos.join('|'));
    });

    rutas.push(candidatos.shift()!);
  }

  // Ordenar resultado final por coste y desempate por saltos
  rutas.sort((a, b) => {
    if (Math.abs(a.coste - b.coste) > 1e-6) {
      return a.coste - b.coste;
    }
    if (a.saltos.length !== b.saltos.length) {
      return a.saltos.length - b.saltos.length;
    }
    return a.saltos.join('|').localeCompare(b.saltos.join('|'));
  });

  return rutas;
}

interface AristaInfo {
  destino: string;
  medio: Medio;
  coste: number;
}

type GrafoAdyacencia = Map<string, Map<string, AristaInfo>>;

function construirGrafo(
  cristal: Cristal,
  r: Reticula,
  dato: Dato,
  ctx: { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }
): GrafoAdyacencia {
  const grafo: GrafoAdyacencia = new Map();

  // Recopilar todas las señales de la retícula para buscar la medida correspondiente al puente
  const mapaSenales = new Map<string, import('./tipos').SenalMedida>();
  for (const tesela of Object.values(r.teselas)) {
    for (const senal of tesela.senales) {
      const a = senal.de < senal.a ? senal.de : senal.a;
      const b = senal.de < senal.a ? senal.a : senal.de;
      const key = `${a}|${b}|${senal.medio}`;
      mapaSenales.set(key, senal);
    }
  }

  for (const puente of cristal.puentes) {
    // Buscar señal correspondiente al puente
    const a = puente.a < puente.b ? puente.a : puente.b;
    const b = puente.a < puente.b ? puente.b : puente.a;
    const key = `${a}|${b}|${puente.medio}`;
    let senal = mapaSenales.get(key);

    if (!senal) {
      // Si no hay señal exacta, construir una señal sintética basada en el puente
      senal = {
        de: puente.a,
        a: puente.b,
        medio: puente.medio,
        rssiDbm: -50,
        snrDb: 20,
        rttMs: 10,
        anchoBandaKbps: 10000,
        perdidaPct: 0,
        vistaEn: Date.now()
      };
    }

    // Evaluar viabilidad
    const viab = viabilidad(dato, senal, ctx);
    if (!viab.apto) {
      continue; // Enlace no apto, se excluye
    }

    const costeSalto = Math.max(0, 1 - viab.valor);

    if (!grafo.has(puente.a)) grafo.set(puente.a, new Map());
    if (!grafo.has(puente.b)) grafo.set(puente.b, new Map());

    // Si ya existe una arista, conservar la de menor coste
    const vecA = grafo.get(puente.a)!;
    const actualA = vecA.get(puente.b);
    if (!actualA || costeSalto < actualA.coste) {
      vecA.set(puente.b, { destino: puente.b, medio: puente.medio, coste: costeSalto });
    }

    const vecB = grafo.get(puente.b)!;
    const actualB = vecB.get(puente.a);
    if (!actualB || costeSalto < actualB.coste) {
      vecB.set(puente.a, { destino: puente.a, medio: puente.medio, coste: costeSalto });
    }
  }

  return grafo;
}

function dijkstra(grafo: GrafoAdyacencia, origen: string, destino: string): Ruta | null {
  const distancias = new Map<string, number>();
  const previos = new Map<string, { nodo: string; medio: Medio; coste: number }>();
  const noVisitados = new Set<string>();

  for (const nodo of grafo.keys()) {
    distancias.set(nodo, Infinity);
    noVisitados.add(nodo);
  }

  distancias.set(origen, 0);

  while (noVisitados.size > 0) {
    let actual: string | null = null;
    let minDist = Infinity;

    for (const nodo of noVisitados) {
      const d = distancias.get(nodo) ?? Infinity;
      if (d < minDist) {
        minDist = d;
        actual = nodo;
      }
    }

    if (actual === null || minDist === Infinity) {
      break;
    }

    if (actual === destino) {
      break;
    }

    noVisitados.delete(actual);

    const vecinos = grafo.get(actual);
    if (!vecinos) continue;

    for (const [vecinoId, arista] of vecinos.entries()) {
      if (!noVisitados.has(vecinoId)) continue;

      const nuevaDist = distancias.get(actual)! + arista.coste;
      if (nuevaDist < (distancias.get(vecinoId) ?? Infinity)) {
        distancias.set(vecinoId, nuevaDist);
        previos.set(vecinoId, { nodo: actual, medio: arista.medio, coste: arista.coste });
      }
    }
  }

  if ((distancias.get(destino) ?? Infinity) === Infinity) {
    return null;
  }

  // Reconstruir ruta
  const saltos: string[] = [destino];
  const medios: Medio[] = [];
  let actual = destino;
  let costeTotal = distancias.get(destino)!;

  while (previos.has(actual)) {
    const prev = previos.get(actual)!;
    saltos.unshift(prev.nodo);
    medios.unshift(prev.medio);
    actual = prev.nodo;
  }

  return {
    saltos,
    medios,
    coste: costeTotal,
    motivo: 'dijkstra óptimo'
  };
}

function clonarGrafo(grafo: GrafoAdyacencia): GrafoAdyacencia {
  const clon: GrafoAdyacencia = new Map();
  for (const [k, v] of grafo.entries()) {
    const innerClon = new Map<string, AristaInfo>();
    for (const [ik, iv] of v.entries()) {
      innerClon.set(ik, { ...iv });
    }
    clon.set(k, innerClon);
  }
  return clon;
}

function sonIguales(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function calcularCosteRuta(saltos: string[], medios: Medio[], grafo: GrafoAdyacencia): number {
  let coste = 0;
  for (let i = 0; i < saltos.length - 1; i++) {
    const u = saltos[i];
    const v = saltos[i + 1];
    const arista = grafo.get(u)?.get(v);
    if (arista) {
      coste += arista.coste;
    }
  }
  return coste;
}

function arbolDifusion(
  cristal: Cristal,
  r: Reticula,
  dato: Dato,
  ctx: { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }
): Ruta[] {
  const origen = dato.origen;
  const grafo = construirGrafo(cristal, r, dato, ctx);
  const vecinos = grafo.get(origen);

  if (!vecinos || vecinos.size === 0) {
    return [];
  }

  const rutas: Ruta[] = [];
  for (const [vecinoId, arista] of vecinos.entries()) {
    rutas.push({
      saltos: [origen, vecinoId],
      medios: [arista.medio],
      coste: arista.coste,
      motivo: 'difusión un salto'
    });
  }

  // Ordenar por coste y desempate por saltos
  rutas.sort((a, b) => {
    if (Math.abs(a.coste - b.coste) > 1e-6) {
      return a.coste - b.coste;
    }
    return a.saltos[1].localeCompare(b.saltos[1]);
  });

  return rutas;
}
