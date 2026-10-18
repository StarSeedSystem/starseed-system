/**
 * Protomolécula · ADAPTADOR GAMEPAD (F6, contrato §4.4). Convierte el estado del mando
 * en { fuente, bruto }, que es lo que recibe `vinculos-control.ts#procesar`.
 *
 * El acceso del navegador se INYECTA: este módulo nunca toca `navigator` por su cuenta.
 * La interfaz llama a `pedirAccesoGamepad(navigator)` SOLO cuando la persona pulsa
 * «Conectar mandos» (es ahí cuando el navegador pide el permiso) y, si no hay Gamepad API,
 * enseña el motivo: no se finge ningún mando.
 * 
 * Lee ejes y botones con zona de captura a ≤ 60 Hz (usando requestAnimationFrame),
 * solo emite cambios superiores al umbral (medio paso o 0.1% del rango).
 */

export type FuenteGamepad = Extract<
  { tipo: "gamepad"; control: "eje" | "boton"; numero: number; indice?: number },
  { tipo: "gamepad" }
>;
export interface MensajeGamepad { fuente: FuenteGamepad; bruto: number };
export interface EventoMensajeGamepad { gamepads: Gamepad[] };
/** Lo mínimo de `navigator` que se usa (el real del navegador encaja). */
export interface NavegadorGamepad {
  getGamepads?: () => Gamepad[];
}
export type ResultadoAcceso = { ok: true; acceso: NavegadorGamepad } | { ok: false; motivo: string };

export const SIN_GAMEPAD = "Este navegador no ofrece Gamepad API";
export const SIN_PERMISO = "No hay permiso para usar Gamepad en este sitio";

/** Saber si hay Gamepad API sin pedir permiso (para pintar el botón o el motivo). */
export const hayGamepad = (nav?: NavegadorGamepad | null): boolean =>
  typeof nav?.getGamepads === "function";

/** Solo al pulsar «Conectar mandos». */
export async function pedirAccesoGamepad(nav?: NavegadorGamepad | null): Promise<ResultadoAcceso> {
  const pedir = nav?.getGamepads;
  if (typeof pedir !== "function") return { ok: false, motivo: SIN_GAMEPAD };
  try {
    // Llamar a getGamepads para verificar que funciona y pedir permiso si es necesario
    const gamepads = pedir.call(nav);
    return { ok: true, acceso: { getGamepads: pedir } };
  } catch (e) {
    const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    if (nombre === "NotAllowedError" || nombre === "SecurityError") {
      return { ok: false, motivo: SIN_PERMISO };
    }
    return { ok: false, motivo: `El navegador no pudo acceder al Gamepad${nombre ? ` (${nombre})` : ""}` };
  }
}

/** Nombre con el que se guarda el aparato en el vínculo (el id si el navegador no da nombre). */
export const nombreGamepad = (gp: Gamepad | null): string =>
  (gp && gp.id && gp.id.trim()) || gp?.index.toString() || "desconocido";

/**
 * Escanea el estado del gamepad y llama al callback con los cambios detectados.
 * Se limita a ≤ 60 Hz usando requestAnimationFrame y solo notifica cambios significativos.
 */
export function conectarGamepad(
  acceso: NavegadorGamepad,
  alCambio: (m: MensajeGamepad) => void,
  umbral?: number, // 0-1, porcentaje mínimo de cambio para notificar (por defecto: 0.01 = 1%)
): () => void {
  if (!acceso.getGamepads) return () => {};

  const umbralMinimo = umbral ?? 0.01; // 1% de cambio mínimo
  let activo = true;
  let ultimaAnimacionFrame: number = 0;
  
  // Estado anterior para detectar cambios
  const estadoAnterior: Record<string, number> = {};
  
  const escanear = () => {
    if (!activo) return;
    
    try {
      const gamepads = acceso.getGamepads?.call(navigator) ?? [];
      
      gamepads.forEach((gp, indice) => {
        if (!gp) return;
        
        const prefijoBase = `gamepad:${indice}:`;
        
        // Ejes
        gp.axes.forEach((valor, indiceEje) => {
          const clave = `${prefijoBase}eje:${indiceEje}`;
          const valorAnterior = estadoAnterior[clave] ?? 0;
          
          // Solo notificar si el cambio supera el umbral
          if (Math.abs(valor - valorAnterior) >= umbralMinimo) {
            estadoAnterior[clave] = valor;
            alCambio({
              fuente: {
                tipo: "gamepad",
                control: "eje",
                numero: indiceEje,
                indice,
              },
              bruto: valor, // Ya está en el rango [-1, 1] que espera vinculos-control
            });
          }
        });
        
        // Botones
        gp.buttons.forEach((boton, indiceBoton) => {
          const valor = typeof boton === "object" && "value" in boton 
            ? boton.value 
            : (boton as number);
          const clave = `${prefijoBase}boton:${indiceBoton}`;
          const valorAnterior = estadoAnterior[clave] ?? 0;
          
          // Solo notificar si el cambio supera el umbral
          if (Math.abs(valor - valorAnterior) >= umbralMinimo) {
            estadoAnterior[clave] = valor;
            alCambio({
              fuente: {
                tipo: "gamepad",
                control: "boton",
                numero: indiceBoton,
                indice,
              },
              bruto: valor, // Ya está en el rango [0, 1] que espera vinculos-control
            });
          }
        });
      });
    } catch (e) {
      // Error silencioso para no spammear la consola
      console.warn("Error leyendo gamepad:", e);
    }
    
    // Programar próxima escaneo a ≤ 60 Hz
    if (activo) {
      ultimaAnimacionFrame = requestAnimationFrame(escanear);
    }
  };

  // Iniciar el bucle de escaneo
  ultimaAnimacionFrame = requestAnimationFrame(escanear);
  
  // Devolver función para detener el escaneo
  return () => {
    activo = false;
    if (ultimaAnimacionFrame) {
      cancelAnimationFrame(ultimaAnimacionFrame);
    }
  };
}