// Tipo para representar una clave canónica de elemento
// Formato: <familia>:<id>[#<parte>]
export type ClaveElemento = string;

// Crea una clave canónica a partir de familia, id y parte opcional
export function crearClave(familia: string, id: string, parte?: string): ClaveElemento {
  if (parte) {
    return `${familia}:${id}#${parte}` as ClaveElemento;
  }
  return `${familia}:${id}` as ClaveElemento;
}

// Lee y valida una clave canónica desde un string
export function leerClave(clave: string): ClaveElemento | null {
  // Validar formato: <familia>:<id>[#<parte>]
  // Familia e id deben ser kebab-case o con puntos, sin espacios
  const regex = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):([a-z0-9]+(?:[.-][a-z0-9]+)*)(?:#([a-z0-9]+(?:[.-][a-z0-9]+)*))?$/;
  
  if (!regex.test(clave)) {
    return null;
  }
  
  return clave as ClaveElemento;
}

// Extrae la clave de un elemento del DOM buscando atributos específicos
export function claveDesdeElemento(
  el: Element | null,
  registros: Record<string, string> = {}
): ClaveElemento | null {
  if (!el) {
    return null;
  }

  // Primero buscar data-ss-elemento
  const ssElemento = el.getAttribute('data-ss-elemento');
  if (ssElemento) {
    const clave = leerClave(ssElemento);
    if (clave) {
      return clave;
    }
  }

  // Luego intentar deducir de otros atributos
  // data-widget-fn
  const widgetFn = el.getAttribute('data-widget-fn');
  if (widgetFn) {
    // Convertir a formato kebab-case si es necesario
    const familia = 'widget';
    const id = widgetFn;
    return crearClave(familia, id);
  }

  // data-widget-e
  const widgetE = el.getAttribute('data-widget-e');
  if (widgetE) {
    const familia = 'widget';
    const id = widgetE;
    return crearClave(familia, id);
  }

  // data-ss-background
  const ssBackground = el.getAttribute('data-ss-background');
  if (ssBackground) {
    const familia = 'fondo';
    const id = ssBackground;
    return crearClave(familia, id);
  }

  // data-ss-material
  const ssMaterial = el.getAttribute('data-ss-material');
  if (ssMaterial) {
    const familia = 'ajuste';
    const id = ssMaterial;
    return crearClave(familia, id);
  }

  // data-elemento
  const elemento = el.getAttribute('data-elemento');
  if (elemento) {
    // Asumir que es un widget por defecto si no se especifica otra cosa
    const familia = 'widget';
    const id = elemento;
    return crearClave(familia, id);
  }

  // Si no se encontró nada, subir al padre y intentar de nuevo
  return claveDesdeElemento(el.parentElement, registros);
}