import { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { Medio } from "./tipos";

export class RecuerdoBot extends FragmentoMemoria {
  botId: string;
  bytes: number;
  usos: number;
  fijado?: boolean;

  constructor(
    id: string,
    alcance: AlcanceMemoria,
    texto: string,
    origen: string,
    at: number,
    botId: string,
    bytes: number,
    usos: number,
    fijado?: boolean,
    etiquetas?: string[]
  ) {
    super({ id, alcance, texto, origen, at, etiquetas });
    this.botId = botId;
    this.bytes = bytes;
    this.usos = usos;
    this.fijado = fijado;
  }

  puntuar(ahora: number): number {
    const vidaMediaDias = 30;
    const vidaMediaMs = vidaMediaDias * 24 * 60 * 60 * 1000;
    const dias = (ahora - this.at) / (1000 * 60 * 60 * 24);
    const recencia = Math.exp(-Math.LN2 * dias / vidaMediaDias);
    return this.usos * recencia;
  }

  static regular(recuerdos: RecuerdoBot[], cuotaBytes: number, ahora: number): {
    conservar: RecuerdoBot[];
    olvidar: RecuerdoBot[];
  } {
    // Primero, separar los fijados (nunca se olvidan) de los no fijados
    const fijados: RecuerdoBot[] = [];
    const noFijados: RecuerdoBot[] = [];

    for (const recuerdo of recuerdos) {
      if (recuerdo.fijado) {
        fijados.push(recuerdo);
      } else {
        noFijados.push(recuerdo);
      }
    }

    // Ordenar los no fijados por puntuación ascendente (menor puntuación primero)
    const noFijadosOrdenados = noFijados
      .slice()
      .sort((a, b) => a.puntuar(ahora) - b.puntuar(ahora));

    // Ahora, intentar conservar tantos como quepan dentro de la cuota
    const conservar: RecuerdoBot[] = [...fijados]; // Empezamos con todos los fijados
    let bytesActuales = fijados.reduce((sum, r) => sum + r.bytes, 0);

    // Añadir no fijados mientras quepan en la cuota
    for (const recuerdo of noFijadosOrdenados) {
      if (bytesActuales + recuerdo.bytes <= cuotaBytes) {
        conservar.push(recuerdo);
        bytesActuales += recuerdo.bytes;
      } else {
        // No cabe, así que este y todos los siguientes se olvidarán
        break;
      }
    }

    // Los olvidados son los no fijados que no pudimos conservar
    const olvidar: RecuerdoBot[] = noFijadosOrdenados.slice(
      conservar.length - fijados.length
    );

    return { conservar, olvidar };
  }
}

export const CUOTA_POR_MEDIO: Record<Medio, number> = {
  web: 5 * 1024 * 1024, // 5 MB
  pwa: 50 * 1024 * 1024, // 50 MB
  nativo: 500 * 1024 * 1024, // 500 MB
  servidor: 2 * 1024 * 1024 * 1024, // 2 GB
  xr: 20 * 1024 * 1024, // 20 MB
};