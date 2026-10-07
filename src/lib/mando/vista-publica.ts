import type { Visibilidad } from "./ambito";

export interface EstadoAmbito {
  ambito: { nombre: string; visibilidad: Visibilidad };
  olas: {
    nombre: string;
    avance: number;
    tareas: { id: string; titulo: string; estado: string; prompt?: string; archivos?: string[]; registro?: unknown; proveedor?: string }[];
  }[];
  integradas: { titulo: string; fecha: string | Date; archivos?: string[]; commit?: string }[];
  motor: { estado: string; ultimo_reporte: string | Date | number; proveedores?: string[] };
  medidores?: { creditos?: unknown };
  chat: { canal: string; autor: string; texto: string }[];
}

export interface VistaPublica {
  nombre: string;
  olas: { nombre: string; avance: number; tareas: { titulo: string; estado: string }[] }[];
  integradas: { titulo: string; fecha: string }[];
  motor: { estado: string; haceMin: number };
  avanceMedio: number;
  chat: { autor: string; texto: string }[];
}

function parseFecha(v: string | Date | number): number {
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? Date.now() : t;
}

export function vistaPublica(estado: EstadoAmbito): VistaPublica | null {
  if (estado.ambito.visibilidad !== "publico") return null;

  const nombre = estado.ambito.nombre;

  const olas = estado.olas.map(o => ({
    nombre: o.nombre,
    avance: o.avance,
    tareas: o.tareas.map(t => ({ titulo: t.titulo, estado: t.estado })),
  }));

  const integradas = estado.integradas.map(i => ({
    titulo: i.titulo,
    fecha: i.fecha instanceof Date ? i.fecha.toISOString() : String(i.fecha),
  }));

  const ultimo = parseFecha(estado.motor.ultimo_reporte);
  const haceMin = Math.max(0, Math.round((Date.now() - ultimo) / 60000));

  const motor = { estado: estado.motor.estado, haceMin };

  const avanceMedio = olas.length
    ? olas.reduce((s, o) => s + o.avance, 0) / olas.length
    : 0;

  const chat = estado.chat
    .filter(m => m.canal === "publico")
    .map(m => ({ autor: m.autor, texto: m.texto }));

  return { nombre, olas, integradas, motor, avanceMedio, chat };
}
