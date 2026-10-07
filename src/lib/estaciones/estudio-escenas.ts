// Estudio de producción · escenas y fuentes (puro, sin red ni DOM).
// Contrato: architecture/estaciones.md §10.

export type TipoFuente =
  | "camara" | "pantalla" | "microfono" | "imagen" | "texto" | "enlace" | "estacion-interna";

export interface Fuente {
  id: string;
  tipo: TipoFuente;
  etiqueta: string;
  url?: string;
  texto?: string;
  ruta?: string;
}

export interface Capa {
  id: string;
  fuente: Fuente;
  x: number; // 0..1
  y: number;
  ancho: number;
  alto: number;
  z: number;
  visible: boolean;
  volumen?: number; // 0..1
}

export interface Escena {
  id: string;
  nombre: string;
  capas: Capa[];
}

export interface Salida {
  id: string;
  ancho: number;
  alto: number;
  fps: number;
  kbpsMax: number;
}

export const SALIDAS: Record<string, Salida> = {
  horizontal: { id: "horizontal", ancho: 1920, alto: 1080, fps: 30, kbpsMax: 6000 },
  vertical: { id: "vertical", ancho: 1080, alto: 1920, fps: 30, kbpsMax: 6000 },
  cuadrada: { id: "cuadrada", ancho: 1080, alto: 1080, fps: 30, kbpsMax: 6000 },
  "solo-audio": { id: "solo-audio", ancho: 0, alto: 0, fps: 0, kbpsMax: 128 },
  "malla-baja": { id: "malla-baja", ancho: 640, alto: 360, fps: 15, kbpsMax: 300 },
};

const TIPOS_CON_AUDIO: ReadonlySet<TipoFuente> = new Set([
  "camara", "pantalla", "microfono", "enlace", "estacion-interna",
]);

const ASPECTO_REF = 16 / 9; // las plantillas se diseñan en horizontal

interface CapaPlantilla {
  tipo: TipoFuente;
  x: number; y: number; ancho: number; alto: number; z: number; volumen?: number;
}

export interface Plantilla {
  id: string;
  nombre: string;
  capas: CapaPlantilla[];
}

export const PLANTILLAS: Record<string, Plantilla> = {
  presentador: {
    id: "presentador", nombre: "Presentador",
    capas: [{ tipo: "camara", x: 0, y: 0, ancho: 1, alto: 1, z: 0 }],
  },
  "pantalla-camara": {
    id: "pantalla-camara", nombre: "Pantalla + cámara",
    capas: [
      { tipo: "pantalla", x: 0, y: 0, ancho: 1, alto: 1, z: 0 },
      { tipo: "camara", x: 0.7, y: 0.65, ancho: 0.3, alto: 0.3, z: 1, volumen: 1 },
    ],
  },
  "entrevista-2": {
    id: "entrevista-2", nombre: "Entrevista (2)",
    capas: [
      { tipo: "camara", x: 0, y: 0, ancho: 0.5, alto: 1, z: 0 },
      { tipo: "camara", x: 0.5, y: 0, ancho: 0.5, alto: 1, z: 1 },
    ],
  },
  "solo-audio": {
    id: "solo-audio", nombre: "Solo audio",
    capas: [{ tipo: "microfono", x: 0, y: 0, ancho: 1, alto: 1, z: 0, volumen: 1 }],
  },
  rotulo: {
    id: "rotulo", nombre: "Rótulo a pantalla completa",
    capas: [
      { tipo: "imagen", x: 0, y: 0, ancho: 1, alto: 1, z: 0 },
      { tipo: "texto", x: 0.1, y: 0.75, ancho: 0.8, alto: 0.2, z: 1 },
    ],
  },
};

export function escenaDesdePlantilla(idPlantilla: string, fuentes: Fuente[]): Escena {
  const plantilla = PLANTILLAS[idPlantilla];
  if (!plantilla) throw new Error(`Plantilla desconocida: ${idPlantilla}`);
  const usadas = new Set<string>();
  const capas: Capa[] = plantilla.capas.map((c, i) => {
    const fuente = fuentes.find((f) => f.tipo === c.tipo && !usadas.has(f.id));
    if (!fuente) throw new Error(`Falta una fuente de tipo ${c.tipo}`);
    usadas.add(fuente.id);
    return { id: `capa-${i}`, fuente, x: c.x, y: c.y, ancho: c.ancho, alto: c.alto, z: c.z, visible: true, volumen: c.volumen };
  });
  return { id: `escena-${idPlantilla}`, nombre: plantilla.nombre, capas };
}

const ajustar = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));

export function adaptarEscena(escena: Escena, salida: Salida): Escena {
  if (salida.ancho === 0 || salida.alto === 0) {
    return { ...escena, capas: escena.capas.filter((c) => TIPOS_CON_AUDIO.has(c.fuente.tipo)) };
  }
  const aspecto = salida.ancho / salida.alto;
  const capas = escena.capas.map((c) => {
    const pantallaCompleta = c.x === 0 && c.y === 0 && c.ancho >= 1 && c.alto >= 1;
    if (pantallaCompleta) return { ...c, x: 0, y: 0, ancho: 1, alto: 1 };
    // Conserva la proporción en píxeles suponiendo diseño 16:9 de referencia.
    const alto = Math.min(c.alto * (aspecto / ASPECTO_REF), 1);
    const ancho = Math.min(c.ancho, 1);
    return { ...c, ancho, alto, x: ajustar(c.x, 1 - ancho), y: ajustar(c.y, 1 - alto) };
  });
  return { ...escena, capas };
}

export function validarFuente(f: Fuente): string[] {
  const errores: string[] = [];
  if (!f.id || !f.etiqueta) errores.push("La fuente necesita id y etiqueta");
  if ((f.tipo === "imagen" || f.tipo === "enlace")) {
    if (!f.url || !f.url.startsWith("https://")) errores.push("La URL debe ser https");
  }
  if (f.tipo === "estacion-interna" && (!f.ruta || !f.ruta.startsWith("/"))) {
    errores.push("La ruta interna debe empezar por /");
  }
  if (f.tipo === "texto" && !(f.texto ?? "").trim()) errores.push("El rótulo no puede estar vacío");
  return errores;
}

function actualizar(escena: Escena, capaId: string, f: (c: Capa) => Capa): Escena {
  return { ...escena, capas: escena.capas.map((c) => (c.id === capaId ? f({ ...c }) : c)) };
}

export function moverCapa(escena: Escena, capaId: string, dx: number, dy: number): Escena {
  return actualizar(escena, capaId, (c) => ({
    ...c,
    x: ajustar(c.x + dx, 1 - Math.min(c.ancho, 1)),
    y: ajustar(c.y + dy, 1 - Math.min(c.alto, 1)),
  }));
}

export function alternarCapa(escena: Escena, capaId: string): Escena {
  return actualizar(escena, capaId, (c) => ({ ...c, visible: !c.visible }));
}

export function volumenCapa(escena: Escena, capaId: string, volumen: number): Escena {
  return actualizar(escena, capaId, (c) => ({ ...c, volumen: ajustar(volumen, 1) }));
}
