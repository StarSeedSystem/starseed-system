import type { OfertaNeurona } from "@/lib/recursos/oferta";
import { capacidadPrestable, ofertaVisiblePara } from "@/lib/recursos/oferta";

/** Una oferta de cómputo ya filtrada por privacidad y por lo que el dueño presta de verdad. */
export type Oferta = OfertaNeurona;

/** Tipos de almacén con driver de escritura real (espejo de `REAL_DRIVER_KINDS`, inyectable). */
export const TIPOS_REALES_DEFECTO: readonly string[] = ["starseed", "gcs", "gdrive"];

export interface CerebroMedios {
  id: string;
  cuentaId: string;
  grupos?: string[];
}

/** Servidor enlazado al cerebro (`brain_server_links`); `compartido` = nube de todos, no solo suya. */
export interface ServidorEnlazado {
  id: string;
  kind: string;
  rol: string;
  compartido?: boolean;
  libreMb?: number;
}

export interface AlmacenDeclarado {
  id: string;
  tipo: string;
  libreMb?: number;
  /** Nube compartida con otras cuentas: nunca para lo privado. */
  compartido?: boolean;
}

export interface AlmacenEfectivo {
  id: string;
  tipo: string;
  libreMb?: number;
  /** true = driver con escritura; false = solo declarado. */
  real: boolean;
}

export interface EntradaMedios {
  cerebro: CerebroMedios;
  servidoresEnlazados: ServidorEnlazado[];
  ofertas: Oferta[];
  almacenes: AlmacenDeclarado[];
  vecinos: Oferta[];
  privado: boolean;
  tiposReales?: readonly string[];
}

export interface MediosEfectivos {
  computo: Oferta[];
  almacenamiento: AlmacenEfectivo[];
  motivoPorFuente: Record<string, string>;
}

const ROLES_ALMACEN = ["primary", "replica", "storage", "sync"];

/** Servidor vivo del cerebro: lo que realmente puede usar ahora, con el porqué de cada fuente. */
export function mediosEfectivos(e: EntradaMedios): MediosEfectivos {
  const { cerebro, privado } = e;
  const reales = e.tiposReales ?? TIPOS_REALES_DEFECTO;
  const motivoPorFuente: Record<string, string> = {};
  const computo: Oferta[] = [];
  const ids = new Set(e.servidoresEnlazados.map((s) => s.id));
  const quien = { cuentaId: cerebro.cuentaId, grupos: cerebro.grupos ?? [] };

  const considerar = (o: Oferta, esVecino: boolean) => {
    const id = o.nodoId;
    const propia = o.cuentaId === cerebro.cuentaId || ids.has(id);
    if (privado && !propia) {
      motivoPorFuente[id] = esVecino ? "Cerebro privado: no usa vecinos públicos." : "Cerebro privado: solo la cuenta y sus servidores.";
      return;
    }
    const visible = propia ? o : ofertaVisiblePara(o, quien);
    if (!visible) {
      motivoPorFuente[id] = "No presta a esta cuenta ni a sus grupos.";
      return;
    }
    const p = capacidadPrestable(visible);
    if (p.computo.nucleos <= 0 && p.computo.ramLibreMb <= 0 && p.almacen.prestaMb <= 0) {
      motivoPorFuente[id] = "No tiene nada prestable ahora (batería, uso, horario o topes).";
      return;
    }
    computo.push(p);
    motivoPorFuente[id] = propia ? "Neurona o servidor propio del cerebro." : esVecino ? "Vecino de la malla que presta en público." : "Presta a esta cuenta o a sus grupos.";
  };
  for (const o of e.ofertas) considerar(o, false);
  for (const o of e.vecinos) if (!(o.nodoId in motivoPorFuente)) considerar(o, true);

  const almacenamiento: AlmacenEfectivo[] = [];
  const anadir = (id: string, tipo: string, libreMb: number | undefined, compartido: boolean | undefined, motivo: string) => {
    if (privado && compartido) {
      motivoPorFuente[id] = "Cerebro privado: no usa la nube compartida.";
      return;
    }
    const real = reales.includes(tipo);
    almacenamiento.push({ id, tipo, ...(libreMb === undefined ? {} : { libreMb }), real });
    motivoPorFuente[id] = real ? motivo : `${motivo} Solo declarado: aún sin escritura real.`;
  };
  for (const s of e.servidoresEnlazados) {
    if (ROLES_ALMACEN.includes(s.rol)) anadir(s.id, s.kind, s.libreMb, s.compartido, `Servidor enlazado (${s.rol}).`);
    else if (!(s.id in motivoPorFuente)) motivoPorFuente[s.id] = `Servidor enlazado (${s.rol}): sin papel de almacén.`;
  }
  for (const a of e.almacenes) anadir(a.id, a.tipo, a.libreMb, a.compartido, "Almacén declarado del cerebro.");
  for (const o of computo) if (o.almacen.prestaMb > 0) anadir(`${o.nodoId}:disco`, "neurona", o.almacen.prestaMb, false, "Disco que presta una neurona.");

  return { computo, almacenamiento, motivoPorFuente };
}
