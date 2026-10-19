// Adaptadores para las familias de variaciones públicas
import { registrarFamilia } from './familias';
import type { AdaptadorFamilia } from './familias';
import { validarVariacion, TipoVariacion, VariacionPublica } from './validar';

// Crea un adaptador para una familia dada
function crearAdaptador(familia: string): AdaptadorFamilia<string | number> {
  return {
    familia,
    nombre: `${familia.charAt(0).toUpperCase() + familia.slice(1)} Adapter`,
    capturar: (clave) => {
      if (clave.startsWith(`${familia}:`)) {
        return clave.split(':')[1] as string | number;
      }
      return null;
    },
    validar: (payload) => {
      // Validate payload is string or number (as before)
      if (typeof payload !== 'string' && typeof payload !== 'number') {
        return { ok: false, motivos: ['Payload must be a string or number'] };
      }
      const payloadStr = typeof payload === 'string' ? payload : String(payload);
      const tamano = new TextEncoder().encode(payloadStr).length;
      const variacion: VariacionPublica = {
        tipo: 'variacion' as TipoVariacion,
        payload: payloadStr,
        tamano,
      };
      const resultado = validarVariacion(variacion);
      if (resultado.esValida) {
        return { ok: true, payload: payload as string | number };
      }
      return { ok: false, motivos: [resultado.error ?? 'Invalid payload'] };
    },
    aplicar: (clave, payload: string | number) => ({
      deshacer: () => {
        // No-op for now
      },
    }),
  };
}

// Familias a registrar
const familias = [
  'widget',
  'tema',
  'fondo',
  'ajuste',
  'app',
  'dock',
  'escritorio',
  'herramienta',
  'atomo',
  'post',
  'mensaje',
  'menu',
  'boton'
];

// Crear y registrar los adaptadores
familias.forEach(familia => {
  const adaptador = crearAdaptador(familia);
  registrarFamilia(adaptador);
});