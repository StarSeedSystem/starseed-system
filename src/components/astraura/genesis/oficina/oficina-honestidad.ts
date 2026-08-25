/**
 * oficina-honestidad.ts — La regla que manda por encima de cualquier otra:
 * `EstadoOficina.datosReales` decide si la oficina se anima o se calla.
 *
 * Hermes3D resuelve "no tengo un backend real" con un
 * `demo-gateway-adapter.js` que SIMULA actividad para que la oficina nunca se
 * vea vacía — perfecto para enseñar el producto, un despropósito para el
 * nuestro: este proyecto lleva semanas quitando fallos disfrazados de éxito
 * (ver las adendas de honestidad de datos en el proyecto StarSeed) y esta
 * carpeta no va a añadir uno con forma de oficina llena de gente fingiendo
 * trabajar. Por eso esta pieza existe SEPARADA de `oficina-ocupantes.ts`: es
 * la única fuente de verdad de "¿se puede animar esto?", y todo lo demás
 * (posición, actividad visual, parámetros de animación) la consulta a ella
 * en vez de decidir cada uno por su cuenta y arriesgarse a que diverjan.
 */

/** ¿Debe animarse la oficina entera ahora mismo? `datosReales` manda primero
 * y sin excepción — si es falso, ni pestaña visible ni preferencia del
 * usuario lo cambian, porque la razón no es de rendimiento ni de gusto, es
 * que no hay nada real que mostrar en movimiento. Con datos reales, se suman
 * las mismas dos razones que ya usa `genesis/mundo/`: pestaña en segundo
 * plano (nadie lo ve) y `prefers-reduced-motion` (lo pidió el usuario). */
export function debeAnimarOficina(opts: {
  readonly datosReales: boolean;
  readonly documentoVisible: boolean;
  readonly movimientoReducido: boolean;
}): boolean {
  return opts.datosReales && opts.documentoVisible && !opts.movimientoReducido;
}

/**
 * La actividad 0..1 que se MUESTRA para una sala. Cuando `datosReales` es
 * falso, se fuerza a 0 aunque el número que mande el backend sea otro — un
 * backend que apaga `datosReales` puede seguir arrastrando un `actividad`
 * viejo en el mismo payload (p. ej. no se limpió al degradar), y esta función
 * es la barrera para que ese resto nunca se pinte como si fuera real.
 */
export function actividadVisible(actividad: number, datosReales: boolean): number {
  if (!datosReales) return 0;
  return Math.max(0, Math.min(1, actividad));
}

/** El mensaje que se anuncia (aria-live) y se rotula en la barra superior.
 * SIEMPRE no vacío — el estado "todo es real" también merece decirse, no solo
 * el "no lo es"; una oficina que solo habla cuando algo va mal enseña a
 * ignorarla el resto del tiempo. */
export function mensajeHonestidad(datosReales: boolean): string {
  if (!datosReales) {
    return "Datos no verificados: la oficina se muestra en reposo, sin animar actividad inventada.";
  }
  return "Actividad real: lo que se mueve aquí corresponde a procesos imaginativos en curso.";
}
