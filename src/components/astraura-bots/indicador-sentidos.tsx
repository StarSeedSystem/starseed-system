'use client';

import { useEffect } from 'react';
import type { Sentido } from '@/lib/astraura-bots/tipos';
import { indicadorVisible } from '@/lib/astraura-bots/bucle';

// Mapping of senses to Lucide icon names
const SENTIDO_ICONO: Record<Sentido, string> = {
  pantalla: 'MonitorUp',
  'captura-pantalla': 'ScanEye',
  archivos: 'FolderOpen',
  red: 'Globe',
  correo: 'Mail',
  terminal: 'TerminalSquare',
  camara: 'Camera',
  microfono: 'Mic',
  sensores: 'Activity',
  ubicacion: 'MapPin',
  portapapeles: 'Clipboard',
  aparatos: 'Usb',
};

// Mapping of sense names to Spanish for aria-live
const SENTIDO_NOMBRE: Record<Sentido, string> = {
  pantalla: 'pantalla',
  'captura-pantalla': 'captura de pantalla',
  archivos: 'archivos',
  red: 'red',
  correo: 'correo',
  terminal: 'terminal',
  camara: 'cámara',
  microfono: 'micrófono',
  sensores: 'sensores',
  ubicacion: 'ubicación',
  portapapeles: 'portapapeles',
  aparatos: 'aparatos',
};

interface IndicadorSentidosProps {
  /** ID del bot para identificar sus sentidos activos */
  botId: string;
  /** Estado actual del bucle del bot */
  estadoBucle: ReturnType<typeof indicadorVisible> extends infer Visible ? 
    { sentidosActivos: Sentido[]; fase: string } : 
    { sentidosActivos: Sentido[]; fase: string };
  /** Callback para apagar un sentido cuando se toca su icono */
  onApagarSentido: (sentido: Sentido) => void;
  /** Callback para pausar el bot */
  onPausarBot: () => void;
}

export default function IndicadorSentidos({
  botId,
  estadoBucle,
  onApagarSentido,
  onPausarBot,
}: IndicadorSentidosProps) {
  const { sentidosActivos, fase } = estadoBucle;
  const visible = indicadorVisible({ botId, fase, sentidosActivos, registro: [] as any });

  // Generate aria-live text
  const textoEstado = sentidosActivos.length > 0
    ? `Astraura está usando: ${sentidosActivos.map(s => SENTIDO_NOMBRE[s]).join(', ')}`
    : 'Astraura no está usando ningún sentido';

  return (
    <div 
      role="status" 
      aria-live="polite"
      className="absolute -z-10 inset-0 pointer-events-none"
    >
      {visible && (
        <>
          {/* Ring of active sense icons */}
          <div className="flex items-center justify-center h-full w-full">
            <div className="relative flex space-x-2">
              {sentidosActivos.map((sentido) => (
                <button
                  key={sentido}
                  onClick={() => onApagarSentido(sentido)}
                  className="p-1 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                  aria-label={`Apagar sentido: ${SENTIDO_NOMBRE[sentido]}`}
                >
                  {/* Dynamically import Lucide icon */}
                  {/* Note: In a real implementation, we'd use next/dynamic or similar for proper icon loading */}
                  {/* For now, we'll use a placeholder approach */}
                  <span className="h-4 w-4">
                    {/* This would be replaced with actual Lucide icon import */}
                    {/* Example: <LucideIcon name={SENTIDO_ICONO[sentido]} /> */}
                    {/* Since we can't dynamically import icons in this context, we'll use a simple indicator */}
                    {/* In practice, you'd use: import { MonitorUp } from 'lucide-react' etc. */}
                    {/* But for the skeleton, we'll show the sense name */}
                    {/* TODO: Replace with proper Lucide icons */}
                    {/* For now, showing first letter as placeholder */}
                    {SENTIDO_ICONO[sentido].charAt(0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Pause button */}
          <div className="absolute bottom-2 right-2">
            <button
              onClick={onPausarBot}
              className="px-3 py-1 bg-muted/80 hover:bg-muted/60 rounded-md text-sm transition-colors disabled:opacity-50"
              aria-label="Pausar el bot"
            >
              Pausar el bot
            </button>
          </div>
        </>
      )}
    </div>
  );
}