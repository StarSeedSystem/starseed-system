'use client';

import { useState, useEffect } from 'react';
import { inventarioPorMedio } from '../cristal/permisos-antenas';
import type { PerfilAntena } from '../cristal/permisos-antenas';

export default function PermisosAntenas() {
  const [perfil, setPerfil] = useState({
    plataforma: navigator.userAgent.includes('Chrome') || navigator.userAgent.includes('Chromium') || navigator.userAgent.includes('Edge')
      ? 'web-chromium'
      : navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')
        ? 'web-safari'
        : navigator.userAgent.includes('Firefox')
          ? 'web-firefox'
          : 'android-chromium',
    tieneBluetooth: 'bluetooth' in navigator,
    tieneSerial: 'serial' in navigator,
    tieneNfc: 'NDEFReader' in window,
    tieneGeo: 'geolocation' in navigator,
  } as const);

  const [permisos, setPermisos] = useState<PerfilAntena[]>([]);
  const [permisosConcedidos, setPermisosConcedidos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const carga = () => {
      const almacenados = localStorage.getItem('antenas-permisos');
      setPermisosConcedidos(almacenados ? JSON.parse(almacenados) : {});
    };
    carga();

    const listener = () => carga();
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);

  useEffect(() => {
    setPermisos(inventarioPorMedio(perfil));
  }, [perfil]);

  const solicitarPermiso = async (antena: string, api: string) => {
    try {
      switch (antena) {
        case 'geo':
          await new Promise<{ coords: { latitude: number; longitude: number }; timestamp: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          break;
        case 'bluetooth':
          await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
          break;
        case 'serial':
          await navigator.serial.requestPort();
          break;
        case 'nfc':
          await new NDEFReader().scan();
          break;
        default:
          return;
      }

      const nuevos = { ...permisosConcedidos, [antena]: true };
      setPermisosConcedidos(nuevos);
      localStorage.setItem('antenas-permisos', JSON.stringify(nuevos));
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error(`Error solicitando ${antena}:`, error);
    }
  };

  const puedePedir = (antena: PerfilAntena) => {
    if (antena.disponible) return false;
    return !!permisosConcedidos[antena.antena] || false;
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Permisos de antenas</h2>
      <div className="space-y-2">
        {permisos.map(p => (
          <div key={p.antena} className="flex items-center justify-between p-2 border rounded">
            <span className="font-medium">{p.antena}</span>
            <div className="flex items-center gap-2">
              {p.disponible ? (
                <span className="text-sm text-green-600">✓ Disponible</span>
              ) : (
                <span className="text-sm text-amber-600">
                  {p.motivo || 'No disponible'}
                </span>
              )}
              {!p.disponible && puedePedir(p) && (
                <button
                  onClick={() => p.comoPedir && solicitarPermiso(p.antena, p.comoPedir)}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 cursor-pointer"
                >
                  Permitir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
