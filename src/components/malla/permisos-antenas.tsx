'use client';

import { useEffect, useState, useMemo } from 'react';
import { inventarioPorMedio, Plataforma } from '../../lib/malla/cristal/permisos-antenas';
import { resumenTransportes, ResumenTransportes, EstadoTransporte } from '../../lib/malla/estado-transportes';
// (BLE1108A) Bluetooth directo de la app nativa (solo se pinta allí).
import BluetoothDirectoPanel from './bluetooth-directo-panel';

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

  const resumen: ResumenTransportes = useMemo(() => {
    if (estado.loading) return { detectados: [], usables: [], pendientes: [] };
    return resumenTransportes({ plataforma: estado.plataforma, ...estado.capabilities });
  }, [estado.plataforma, estado.capabilities, estado.loading]);

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

  const renderCategoria = (titulo: string, items: EstadoTransporte[], color: string) => (
    <details key={titulo} className="group" style={{ marginBottom: '12px' }}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-white/80 list-none">
        <span className="rounded-full size-2" style={{ backgroundColor: color }} aria-hidden />
        {titulo} <span className="ml-auto text-[11px] font-normal text-white/40">{items.length}</span>
      </summary>
      <div className="mt-2 space-y-1 ml-4">
        {items.map((t, idx) => (
          <div key={`${titulo}-${idx}`} className="flex items-center gap-2 text-[11px] text-white/60">
            <span className="font-medium text-white/80">{t.transporte}</span>
            {t.motivo && <span className="text-white/45">— {t.motivo}</span>}
          </div>
        ))}
        {items.length === 0 && <p className="text-[11px] text-white/35">—</p>}
      </div>
    </details>
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-white/90 mb-3">Permisos de antenas</h2>
      <p className="text-sm text-white/50 mb-4">Plataforma detectada: {estado.plataforma}</p>
      <BluetoothDirectoPanel />
      
      <div className="space-y-2 mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-medium text-white/70 mb-3">Resumen de transportes</h3>
        {renderCategoria('✅ Usables', resumen.usables, '#22c55e')}
        {renderCategoria('⏳ Pendientes', resumen.pendientes, '#f59e0b')}
        {renderCategoria('📋 Detectados', resumen.detectados, '#3b82f6')}
      </div>

      <div className="space-y-3" data-testid="lista-permisos">
        {estado.inventario.map((i, idx) => (
          <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="font-medium text-white/90">{i.antena}</h3>
            <p className="mt-1 text-sm text-white/60">Disponible: {i.disponible ? 'Sí' : 'No'}</p>
            {!i.disponible && i.motivo && <p className="mt-1 text-sm text-amber-300">Motivo: {i.motivo}</p>}
            {i.disponible && !i.permisoConcedido && i.comoPedir && <p className="mt-1 text-sm text-sky-300">Para habilitar: {i.comoPedir}</p>}
            {i.disponible && !i.permisoConcedido && (
              <button onClick={() => solicitarPermiso(i.antena)} className="mt-2 cursor-pointer rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-200 transition-colors hover:bg-sky-500/20">Permitir</button>
            )}
            {i.disponible && i.permisoConcedido && <span className="mt-2 inline-block text-sm text-emerald-400">Permitido</span>}
          </div>
        ))}
      </div>
    </div>
  );
}