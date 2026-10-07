import { readFile } from 'node:fs/promises';
import { join, homedir } from 'node:path';

export interface VentanaCredito {
  id: string;
  etiqueta: string;
  usado_pct: number;
  reinicia: string; // ISO date string
}

export interface SaldoCredito {
  valor: number;
  unidad: string;
}

export interface ExtrasCredito {
  [key: string]: any;
  // Known from contract: bloqueado?, uso_normal?, reinicios_gratis?, reinicio_gratis_vence?
}

export interface MedidorCredito {
  id: string;
  proveedor: string;
  nombre: string;
  tipo: string;
  plan: string | null;
  ventanas: VentanaCredito[];
  saldo: SaldoCredito | null;
  extras: ExtrasCredito;
  fuente: string;
  leido: string; // ISO date string
  ok: boolean;
  obsoleto: boolean;
  error: string | null;
  enlace: string;
}

export interface HistorialEntry {
  t: string; // ISO date
  v: Record<string, number>; // window id -> usado_pct
}

export interface DocCreditos {
  version: number;
  t: string; // ISO date
  medidores: Record<string, MedidorCredito>;
  historial: Record<string, HistorialEntry[]>;
}

// Extended interfaces for estado
interface VentanaEstado extends VentanaCredito {
  tono: 'peligro' | 'aviso' | 'ok';
  queda: number;
  reiniciada: boolean;
  minutosParaReinicio: number;
}

interface MedidorEstado extends MedidorCredito {
  ventanas: VentanaEstado[];
  tono: 'peligro' | 'aviso' | 'ok';
  haceMin: number;
  obsoleto: boolean;
  resumen: string;
}

export async function leerCreditosPago(
  ruta: string = join(homedir(), '.starseed', 'medidores-credito.json')
): Promise<DocCreditos | null> {
  try {
    const contenido = await readFile(ruta, 'utf-8');
    const parsed = JSON.parse(contenido);
    // Basic validation: we expect at least version and medidores
    if (parsed.version && parsed.medidores) {
      return parsed as DocCreditos;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function estadoCreditos(doc: DocCreditos | null, ahora: number): MedidorEstado[] {
  if (!doc) return [];

  const medidoresArray = Object.values(doc.medidores);
  
  // Process each medidor
  const medidoresConEstado: MedidorEstado[] = medidoresArray.map(m => {
    // Process windows
    const ventanasEstado: VentanaEstado[] = m.ventanas.map(ventana => {
      const reiniciaTime = new Date(ventana.reinicia).getTime();
      const reiniciada = ahora > reiniciaTime;
      const usado_pct_estado = reiniciada ? 0 : ventana.usado_pct;
      
      // Determine tono for window
      let tono: 'peligro' | 'aviso' | 'ok';
      if (usado_pct_estado >= 90) tono = 'peligro';
      else if (usado_pct_estado >= 70) tono = 'aviso';
      else tono = 'ok';
      
      const queda = 100 - usado_pct_estado;
      const minutosParaReinicio = reiniciada ? 0 : Math.max(0, Math.ceil((reiniciaTime - ahora) / (1000 * 60)));
      
      return {
        ...ventana,
        usado_pct: usado_pct_estado, // Override with estado value (0 if reiniciada)
        tono,
        queda,
        reiniciada,
        minutosParaReinicio
      };
    });
    
    // Determine medidor tono (worst of windows)
    let medidorTono: 'peligro' | 'aviso' | 'ok' = 'ok';
    if (ventanasEstado.length > 0) {
      // Find the worst tono: peligro > aviso > ok
      if (ventanasEstado.some(v => v.tono === 'peligro')) {
        medidorTono = 'peligro';
      } else if (ventanasEstado.some(v => v.tono === 'aviso')) {
        medidorTono = 'aviso';
      }
    } else {
      // No windows: check if we have data (saldo or extras?) 
      // Contract: if no ok and no data -> aviso
      // We consider no data if no windows and no saldo
      if (!m.saldo) {
        medidorTono = 'aviso';
      }
    }
    
    // haceMin: minutes since leido
    const leidoTime = new Date(m.leido).getTime();
    const haceMin = Math.max(0, Math.ceil((ahora - leidoTime) / (1000 * 60)));
    
    // obsoleto: leido older than 45 minutes
    const obsoleto = haceMin > 45;
    
    // resumen
    const resumen = resumenCredito(m);
    
    return {
      ...m,
      ventanas: ventanasEstado,
      tono: medidorTono,
      haceMin,
      obsoleto,
      resumen
    };
  });
  
  // Order: claude, codex, then rest by name
  const orden = ['claude', 'codex'];
  const sorted = [...medidoresConEstado].sort((a, b) => {
    const idxA = orden.indexOf(a.id);
    const idxB = orden.indexOf(b.id);
    if (idxA !== -1 && idxB === -1) return -1;
    if (idxA === -1 && idxB !== -1) return 1;
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Both not in special order, sort by nombre
    return a.nombre.localeCompare(b.nombre);
  });
  
  return sorted;
}

export function resumenCredito(m: MedidorCredito): string {
  // If no windows and no saldo, return 'sin lectura'
  if ((!m.ventanas || m.ventanas.length === 0) && !m.saldo) {
    return 'sin lectura';
  }
  
  // If has saldo but no windows, return saldo format
  if (m.saldo && (!m.ventanas || m.ventanas.length === 0)) {
    // Format valor with two decimal places and comma as decimal separator
    const valorFormato = m.saldo.valor.toFixed(2).replace('.', ',');
    return `saldo ${valorFormato} ${m.saldo.unidad}`;
  }
  
  // Find the window with highest usado_pct (most used)
  let ventanaMasUsada = m.ventanas[0];
  for (const ventana of m.ventanas) {
    if (ventana.usado_pct > ventanaMasUsada.usado_pct) {
      ventanaMasUsada = ventana;
    }
  }
  
  const { usado_pct, reinicia } = ventanaMasUsada;
  const fecha = new Date(reinicia);
  
  // Format day short in Spanish in America/Mexico_City timezone (e.g., 'vie' for viernes)
  const diaCorto = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'America/Mexico_City' }).format(fecha);
  
  // Format time as H:mm in America/Mexico_City timezone (without leading zero for hour)
  const horaFormato = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(fecha);
  
  return `${usado_pct} % ${ventanaMasUsada.id} · reinicia ${diaCorto} ${horaFormato}`;
}

export function textoExtras(m: MedidorCredito): string {
  const parts: string[] = [];
  
  if (m.extras.reinicios_gratis !== undefined && m.extras.reinicio_gratis_vence !== undefined) {
    const fecha = new Date(m.extras.reinicio_gratis_vence);
    const dia = fecha.getDate();
    const mesCorto = fecha.toLocaleString('es', { month: 'short', timeZone: 'America/Mexico_City' }).toLowerCase();
    parts.push(`${m.extras.reinicios_gratis} reinicio gratis hasta el ${dia} ${mesCorto}`);
  }
  
  if (m.extras.bloqueado) {
    parts.push(`bloqueado: ${m.extras.bloqueado}`);
  }
  
  if (m.extras.uso_normal === false) {
    parts.push('uso normal cortado');
  }
  
  return parts.join(', ');
}