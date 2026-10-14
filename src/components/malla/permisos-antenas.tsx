'use client';

import { useEffect, useState } from 'react';
import { inventarioPorMedio, PermisosAntenasParams, Plataforma } from '../../lib/malla/cristal/permisos-antenas';

interface Props {
  plataforma: Plataforma;
}

export default function PermisosAntenas({ plataforma }: Props) {
  const [state, setState] = useState<Record<string, { disponible: boolean; motivo: string; comoPedir: string | null }>>({});

  const computeState = () => {
    const hasBluetoothAPI = !!navigator.bluetooth;
    const hasSerialAPI = !!navigator.serial;
    const hasNfcAPI = !!('NDEFReader' in window);
    const hasGeoAPI = !!navigator.geolocation;

    const getTieneX = (apiAvailable: boolean, permissionKey: string): boolean => {
      if (!apiAvailable) return false;
      return localStorage.getItem(permissionKey) === 'true';
    };

    const params: PermisosAntenasParams = {
      plataforma,
      tieneBluetooth: getTieneX(hasBluetoothAPI, 'permiso-bluetooth'),
      tieneSerial: getTieneX(hasSerialAPI, 'permiso-serial'),
      tieneNfc: getTieneX(hasNfcAPI, 'permiso-nfc'),
      tieneGeo: getTieneX(hasGeoAPI, 'permiso-geo'),
    };

    const inventario = inventarioPorMedio(params);
    const obj: Record<string, { disponible: boolean; motivo: string; comoPedir: string | null }> = {};
    for (const ant of inventario) {
      obj[ant.antena] = { disponible: ant.disponible, motivo: ant.motivo, comoPedir: ant.comoPedir };
    }
    return obj;
  };

  useEffect(() => {
    setState(computeState());
  }, [plataforma]);

  const requestPermission = async (antena: string, permissionKey: string, requestFn: () => Promise<void>) => {
    try {
      await requestFn();
      localStorage.setItem(permissionKey, 'true');
    } catch (err) {
      console.error(`Error requesting permiso para ${antena}:`, err);
      localStorage.setItem(permissionKey, 'false');
    }
    setState(computeState());
  };

  return (
    <div>
      {Object.entries(state).map(([antena, info]) => (
        <div key={antena} style={{ marginBottom: '16px', padding: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
          <h3 style={{ marginTop: 0 }}>{antena}</h3>
          <p style={{ marginBottom: '8px' }}>
            {info.disponible ? 'Disponible' : 'No disponible'}
            {info.motivo && !info.disponible ? ` (${info.motivo})` : ''}
          </p>
          {!info.disponible && info.comoPedir ? (
            <button 
              onClick={() => alert(info.comoPedir)} 
              className="cursor-pointer"
              style={{ marginRight: '8px' }}
            >
              {info.comoPedir}
            </button>
          ) : (
            <>
              {info.disponible ? (
                <button 
                  onClick={() => alert('Ya tiene permiso concedido para esta antena.')} 
                  className="cursor-pointer"
                  style={{ marginRight: '8px' }}
                >
                  Permitir (ya concedido)
                </button>
              ) : (
                <button 
                  onClick={() => {
                    switch (antena) {
                      case 'Bluetooth':
                        if (!navigator.bluetooth) return alert('Bluetooth no disponible');
                        requestPermission('Bluetooth', 'permiso-bluetooth', () => navigator.bluetooth.requestDevice({ acceptAllDevices: true }));
                        break;
                      case 'Serial':
                        if (!navigator.serial) return alert('Serial no disponible');
                        requestPermission('Serial', 'permiso-serial', () => navigator.serial.requestPort());
                        break;
                      case 'NFC':
                        if (!('NDEFReader' in window)) return alert('NFC no disponible');
                        requestPermission('NFC', 'permiso-nfc', () => {
                          const reader = new NDEFReader();
                          return reader.scan().then(() => reader.stop());
                        });
                        break;
                      case 'Geolocalización':
                        if (!navigator.geolocation) return alert('Geolocalización no disponible');
                        requestPermission('Geolocalización', 'permiso-geo', () => new Promise((r, e) => navigator.geolocation.getCurrentPosition(r, e)));
                        break;
                      default:
                        alert('No hay acción disponible para esta antena.');
                    }
                  }}
                  className="cursor-pointer"
                  style={{ marginRight: '8px' }}
                >
                  Solicitar permiso
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}