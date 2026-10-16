'use client';

import { useEffect, useState } from 'react';
import { inventarioPorMedio, Plataforma } from '../../lib/malla/cristal/permisos-antenas';

export default function PermisosAntenas() {
  const [estado, setEstado] = useState<{
    plataforma: Plataforma;
    capabilities: { tieneBluetooth: boolean; tieneSerial: boolean; tieneNfc: boolean; tieneGeo: boolean };
    inventario: { antena: string; disponible: boolean; motivo: string; comoPedir: string | null; permisoConcedido: boolean }[];
    loading: boolean;
  }>({
    plataforma: 'web-chromium',
    capabilities: { tieneBluetooth: false, tieneSerial: false, tieneNfc: false, tieneGeo: false },
    inventario: [],
    loading: true
  });

  useEffect(() => { detectarPlataformaYCapacidades(); }, []);
  useEffect(() => {
    if (!estado.loading) {
      const raw = inventarioPorMedio({ plataforma: estado.plataforma, ...estado.capabilities });
      setEstado(prev => ({ ...prev, inventario: raw.map(i => ({ ...i, permisoConcedido: localStorage.getItem(`permiso_${i.antena}`) === 'true' })) }));
    }
  }, [estado.plataforma, estado.capabilities, estado.loading]);

  const detectarPlataformaYCapacidades = async () => {
    setEstado(prev => ({ ...prev, loading: true }));
    try {
      const ua = navigator.userAgent;
      let plataforma: Plataforma = 'web-chromium';
      const win = window as any;
      if (win.__TAURI__ || win.TAURI) plataforma = ua.includes('Android') ? 'tauri-android' : 'tauri-escritorio';
      else if (ua.includes('iPhone') || ua.includes('iPad')) plataforma = 'web-safari';
      else if (ua.includes('Firefox')) plataforma = 'web-firefox';
      else if (ua.includes('Android')) plataforma = 'android-chromium';
      
      setEstado(prev => ({
        ...prev,
        plataforma,
        capabilities: {
          tieneBluetooth: 'bluetooth' in navigator,
          tieneSerial: 'serial' in navigator,
          tieneNfc: 'NDEFReader' in window,
          tieneGeo: 'geolocation' in navigator
        }
      }));
    } catch (e) {
      console.error('Error detecting platform:', e);
      setEstado(prev => ({
        ...prev,
        plataforma: 'web-chromium',
        capabilities: { tieneBluetooth: false, tieneSerial: false, tieneNfc: false, tieneGeo: false }
      }));
    } finally {
      setEstado(prev => ({ ...prev, loading: false }));
    }
  };

  const solicitarPermiso = async (antena: string) => {
    try {
      switch (antena) {
        case 'Geolocalización':
          if ('geolocation' in navigator) {
            await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, () => rej(new Error('Usuario denegó geolocalización')), { timeout: 10000 }));
            localStorage.setItem(`permiso_${antena}`, 'true');
          }
          break;
        case 'Web Bluetooth':
          if ('bluetooth' in navigator) { await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true }); localStorage.setItem(`permiso_${antena}`, 'true'); }
          break;
        case 'Web Serial':
          if ('serial' in navigator) { await (navigator as any).serial.requestPort(); localStorage.setItem(`permiso_${antena}`, 'true'); }
          break;
        case 'Web NFC':
          if ('NDEFReader' in window) { const r = new (window as any).NDEFReader(); await r.scan(); localStorage.setItem(`permiso_${antena}`, 'true'); }
          break;
        default:
          localStorage.setItem(`permiso_${antena}`, 'true');
          break;
      }
    } catch (e) { console.error(`Error al solicitar permiso para ${antena}:`, e); throw e; }
  };

  if (estado.loading) return <div>Detectando plataforma y capacidades...</div>;

  return (
    <div>
      <h2>Permisos de antenas</h2>
      <p>Plataforma detectada: {estado.plataforma}</p>
      <div>
            {estado.inventario.map((i, idx) => (
              <div key={idx} style={{ border: '1px solid #ccc', margin: '10px 0', padding: '10px' }}>
                <h3>{i.antena}</h3>
                <p>Disponible: {i.disponible ? 'Sí' : 'No'}</p>
                {!i.disponible && <p>Motivo: {i.motivo}</p>}
                {i.disponible && !i.permisoConcedido && i.comoPedir && <p>Para habilitar: {i.comoPedir}</p>}
                {i.disponible && !i.permisoConcedido && (
                  <button onClick={() => solicitarPermiso(i.antena)} className="cursor-pointer">Permitir</button>
                )}
                {i.disponible && i.permisoConcedido && <span style={{ color: 'green' }}>Permitido</span>}
              </div>
            ))}
      </div>
    </div>
  );
}