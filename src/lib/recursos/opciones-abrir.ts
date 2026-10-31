// Menú «Abrir en…»: qué opciones hay para abrir una app en la red y por qué
// (contrato architecture/apps-en-la-malla.md §5 y §12 · Ola 1017A, tarea O).
// Puro: sin node:*, sin red, sin disco y sin reloj exterior (los topes de horario
// los valida la bolsa en/oferta.ts con su `t` inyectado).

import { capacidadPrestable, type OfertaNeurona } from "./oferta";

/** Los cinco modos del contrato §5. */
export type ModoAbrir = "local" | "por-bandas" | "montada" | "transmitida" | "ramificada";

/** Lo que el catálogo (o quien llame) cuenta de la app; campos medidos, nada inventado. */
export interface AppAbrir {
  id: string;
  nombre: string;
  /** .app/.exe/AppImage: vive en un volumen y se monta (§7), nunca se copia al disco. */
  nativa?: boolean;
  /** WASM/web grande de la Biblioteca: solo se baja lo que se abre (§5 por-bandas). */
  pesada?: boolean;
  /** Mínimos medidos para correrla aquí; con «undefined», cualquier neurona basta. */
  minNucleos?: number;
  minRamMb?: number;
}

/** Datos de la neurona donde vive quien pregunta. */
export interface NeuronaPropia {
  nodoId: string;
  nucleos: number;
  ramLibreMb: number;
}

/** Una opción del menú: adonde, cómo y por qué (§12: «Abrir en…» con el motivo). */
export interface OpcionAbrir {
  etiqueta: string;
  modo: ModoAbrir;
  destino: string;
  motivo: string;
  disponible: boolean;
}

/** Lo que a esta neurona le falta para la app, en texto legible («X núcleos, Y MB de RAM»). */
function faltan(app: AppAbrir, recursos: { nucleos: number; ramLibreMb: number }): string[] {
  const salida: string[] = [];
  const nucleos = Math.max(0, (app.minNucleos ?? 0) - recursos.nucleos);
  if (nucleos > 0) salida.push(`${nucleos} núcleos`);
  const ram = Math.max(0, (app.minRamMb ?? 0) - recursos.ramLibreMb);
  if (ram > 0) salida.push(`${ram} MB de RAM`);
  return salida;
}

/**
 * Forma ligera de `comoAbrir` del contrato §5: modo con motivo para la neurona propia
 * (la planificación completa de vecinos vive en la bolsa). Regla 7 de §4: nunca «nada».
 */
export function comoAbrir(
  app: AppAbrir,
  recursos: { nucleos: number; ramLibreMb: number },
  conVecinos: boolean
): { modo: ModoAbrir; motivo: string } {
  const faltas = faltan(app, recursos);
  const textoFaltas = `falta aquí: ${faltas.join(", ")}`;
  if (app.nativa) {
    const motivo =
      conVecinos && faltas.length > 0
        ? `Se monta como disco del sistema; las bandas llegan de la malla (${textoFaltas})`
        : "Se monta como disco del sistema: la app conserva sus permisos y su firma";
    return { modo: "montada", motivo };
  }
  if (app.pesada) {
    return { modo: "por-bandas", motivo: "Solo se baja lo que se abre; cada banda llega verificada por la malla" };
  }
  if (faltas.length === 0) {
    return { modo: "local", motivo: "Esta neurona cumple lo que la app pide" };
  }
  if (conVecinos) {
    return { modo: "ramificada", motivo: `${textoFaltas}: el cálculo se reparte entre neuronas que prestan` };
  }
  return { modo: "local", motivo: `Se abre lo que se pueda aquí: ${textoFaltas.replace("falta aquí", "falta")}` };
}

/** La oferta presta capacidad de verdad (tras topes, batería y uso del dueño). */
function prestaCapacidad(oferta: OfertaNeurona): boolean {
  const prestable = capacidadPrestable(oferta);
  return prestable.computo.nucleos > 0 || prestable.computo.motores.length > 0;
}

/** Por qué esta oferta no puede servir la app ahora (motivo legible para el menú). */
function razonDeNoPrestar(oferta: OfertaNeurona): string {
  if (oferta.presta.topes.soloCargando && !oferta.energia.cargando) return "solo presta cargando y ahora no carga";
  if (oferta.energia.enUso) return "su dueño está usando la neurona";
  const { bateriaPct, cargando } = oferta.energia;
  if (bateriaPct !== undefined && bateriaPct < 20 && !cargando) return "la batería está baja y sin cargador";
  if (oferta.presta.topes.horas) return "está fuera del horario prestado";
  return "no presta cómputo en este momento";
}

/** Orden determinista: los servidores del grupo primero, luego neuronas por id. */
function ordenOfertas(a: OfertaNeurona, b: OfertaNeurona): number {
  const rango = (o: OfertaNeurona): number => (o.medio === "servidor" ? 0 : 1);
  return rango(a) - rango(b) || a.nodoId.localeCompare(b.nodoId);
}

/** Opciones del menú «Abrir en…» (§12): primero «Aquí» (regla del suelo), luego la red. */
export function opcionesAbrir(
  app: AppAbrir,
  ofertasVisibles: OfertaNeurona[],
  neuronaPropia: NeuronaPropia
): OpcionAbrir[] {
  const recursos = { nucleos: neuronaPropia.nucleos, ramLibreMb: neuronaPropia.ramLibreMb };
  const conVecinos = ofertasVisibles.some((o) => o.apps.some((a) => a.id === app.id) && prestaCapacidad(o));
  const aqui = comoAbrir(app, recursos, conVecinos);
  const opciones: OpcionAbrir[] = [
    { etiqueta: "Aquí", modo: aqui.modo, destino: neuronaPropia.nodoId, motivo: aqui.motivo, disponible: true },
  ];
  const conLaApp = ofertasVisibles.filter((o) => o.apps.some((a) => a.id === app.id)).sort(ordenOfertas);
  for (const oferta of conLaApp) {
    const disponible = prestaCapacidad(oferta);
    const nucleos = capacidadPrestable(oferta).computo.nucleos;
    opciones.push({
      etiqueta: oferta.medio === "servidor" ? "En el servidor del grupo" : `Transmitida desde ${oferta.nodoId}`,
      modo: "transmitida",
      destino: oferta.nodoId,
      motivo: disponible
        ? `${oferta.nodoId} tiene la app y presta ${nucleos} núcleos: la ventana llega por la malla`
        : `${oferta.nodoId} no presta ahora: ${razonDeNoPrestar(oferta)}`,
      disponible,
    });
  }
  return opciones;
}
