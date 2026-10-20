'use client';

import { useState } from 'react';
import type { Sentido } from '@/lib/astraura-bots/tipos';
import type { Bot } from '@/lib/astraura-bots/tipos';
import type { TipoSesion } from '@/lib/astraura-bots/tipos';
import { requestDevicePermission, type ResultadoPermiso } from '@/lib/aurora/senses/request-permission';

// Mapping from sentido to device permission type
const SENTIDO_A_PERMISO: Partial<Record<Sentido, keyof typeof requestDevicePermission>> = {
  camara: 'camara',
  microfono: 'microfono',
  ubicacion: 'ubicacion',
  archivos: 'archivos',
  sensores: 'movimiento', // sensores → movimiento
};

// Mapping from sentido to Spanish description
const SENTIDO_DESCRIPCION: Record<Sentido, string> = {
  pantalla: 'lo que pinta el OS (escáner del DOM)',
  'captura-pantalla': 'píxeles de toda la pantalla, también otras apps',
  archivos: 'carpetas del cerebro y de la Biblioteca que el dueño señale',
  red: 'páginas, publicaciones, grupos, mensajes, notificaciones y enlaces del OS e internet',
  correo: 'correos por conectores (Gmail, IMAP…)',
  terminal: 'terminal del aparato (solo app nativa)',
  camara: 'la cámara del aparato',
  microfono: 'el micrófono del aparato',
  sensores: 'movimiento, wearables, salud',
  ubicacion: 'la ubicación geográfica',
  portapapeles: 'el portapapeles',
  aparatos: 'BLE, serie, MIDI, HID, Meshtastic',
};

interface DialogoConsentimientoProps {
  /** Bot que está solicitando el permiso */
  bot: Bot;
  /** Sentido para el cual se solicita permiso */
  sentido: Sentido;
  /** Sesión actual (privada, grupo, pública) */
  sesion: TipoSesion;
  /** Indica si el diálogo está abierto */
  abierto: boolean;
  /** Callback cuando el diálogo se cierra (concedido o denegado) */
  onCerrar: (concedido: boolean) => void;
}

export default function DialogoConsentimiento({
  bot,
  sentido,
  sesion,
  abierto,
  onCerrar,
}: DialogoConsentimientoProps) {
  const [cargando, setCargando] = useState(false);
  const [permisoExpreso, setPermisoExpreso] = useState(false);
  const [duracion, setDuracion] = useState<'esta-sesion' | 'hoy' | 'siempre'>('esta-sesion');

  // Determine if "siempre" option should be shown (not for invitados)
  const esInvitado = bot.origen !== 'astraura';
  const mostrarSiempre = !esInvitado;

  // Handle ESC key to close without granting
  useEffect(() => {
    if (!abierto) return;
    const manejarEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCerrar(false);
      }
    };
    document.addEventListener('keydown', manejarEscape);
    return () => document.removeEventListener('keydown', manejarEscape);
  }, [abierto, onCerrar]);

  // Handle permission request
  const solicitarPermiso = async () => {
    setCargando(true);
    try {
      // Check if this sense requires a real device permission request
      const permisoTipo = SENTIDO_A_PERMISO[sentido];
      let resultado: ResultadoPermiso | null = null;

      if (permisoTipo) {
        // Request real device permission
        resultado = await requestDevicePermission(permisoTipo as any);
      }

      // For now, we'll consider it granted if:
      // 1. No device permission needed, or
      // 2. Device permission was granted
      const concedido = !resultado || resultado.concedido;
      
      // Close dialog with result
      onCerrar(concedido);
    } catch (error) {
      console.error('Error requesting permission:', error);
      onCerrar(false); // Deny on error
    } finally {
      setCargando(false);
    }
  };

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg p-6 space-y-4 bg-white rounded-lg shadow-lg">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Permiso para {bot.nombre}
          </h2>
          <p className="text-sm">
            {bot.nombre} quiere acceder a tu {SENTIDO_DESCRIPCION[sentido]} para mejorar su funcionalidad y ofrecerte una experiencia más personalizada.
          </p>
          
          {/* Duration options */}
          <div className="space-y-2">
            <label className="flex items-start space-x-2">
              <input
                type="radio"
                value="esta-sesion"
                checked={duracion === 'esta-sesion'}
                onChange={(e) => setDuracion(e.target.value as 'esta-sesion')}
                className="h-4 w-4 text-primary-600"
              />
              <span>Esta sesión</span>
            </label>
            
            <label className="flex items-start space-x-2">
              <input
                type="radio"
                value="hoy"
                checked={duracion === 'hoy'}
                onChange={(e) => setDuracion(e.target.value as 'hoy')}
                className="h-4 w-4 text-primary-600"
              />
              <span>Hoy</span>
            </label>
            
            {mostrarSiempre && (
              <label className="flex items-start space-x-2">
                <input
                  type="radio"
                  value="siempre"
                  checked={duracion === 'siempre'}
                  onChange={(e) => setDuracion(e.target.value as 'siempre')}
                  className="h-4 w-4 text-primary-600"
                />
                <span>Hasta que lo quite</span>
              </label>
            )}
          </div>
          
          {/* Explicit consent checkbox (only for public sessions) */}
          {sesion === 'publica' && (
            <div className="flex items-start space-x-2 text-sm">
              <input
                type="checkbox"
                checked={permisoExpreso}
                onChange={(e) => setPermisoExpreso(e.target.checked)}
                className="h-4 w-4 text-primary-600"
              />
              <span>
                Doy mi permiso expreso para este sentido en sesiones públicas (además del permiso normal)
              </span>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
          <button
            onClick={() => onCerrar(false)}
            className="px-4 py-2 bg-muted/20 hover:bg-muted/30 rounded-md text-sm transition-colors"
          >
            No
          </button>
          <button
            onClick={solicitarPermiso}
            disabled={cargando}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-sm transition-colors disabled:opacity-50"
          >
            {cargando ? 'Solicitando...' : 'Permitir'}
          </button>
        </div>
      </div>
    </div>
  );
}