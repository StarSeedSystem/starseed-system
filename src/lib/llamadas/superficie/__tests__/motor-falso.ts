/**
 * Motor falso para probar el adaptador (LLA1108G): cumple `MotorMinimo`, apunta cada llamada y puede conectarse a
 * un «bus» con otros motores falsos (la difusión de los mensajes de aplicación y la presencia, como el canal real).
 */
import { vi } from "vitest";
import type { MotorMinimo } from "../adaptador-motor";
import type { CargaApp, EstadoLlamada, ParticipanteLlamada } from "@/lib/llamadas/tipos";
import type { EntornoLlamada } from "../matriz-controles";

export const ENTORNO_ESCRITORIO: EntornoLlamada = { pantalla: true, androidWebView: false, macWebView: false, movil: false, camaras: 1, pip: true, pantallaCompleta: true, setSinkId: true, rutasNativas: 0, grabadora: true };

export class BusFalso {
  miembros: MotorFalso[] = [];
  /** Motores que no escuchan (como un aparato con una versión vieja): no acusan nada. */
  sordos = new Set<string>();
  unir(m: MotorFalso) {
    this.miembros.push(m);
    this.sincronizar();
  }
  difundir(de: MotorFalso, carga: CargaApp) {
    for (const m of this.miembros) {
      if (m === de || this.sordos.has(m.miId)) continue;
      queueMicrotask(() => m.recibir(de.miId, JSON.parse(JSON.stringify(carga)) as CargaApp));
    }
  }
  sincronizar() {
    for (const m of this.miembros) m.reconstruir();
  }
}

export class MotorFalso implements MotorMinimo {
  cerrada = false;
  llamadas: string[] = [];
  enviados: CargaApp[] = [];
  errores: Record<string, string | null> = {};
  private e: EstadoLlamada;
  private readonly oyentes = new Set<(e: EstadoLlamada) => void>();
  private readonly oyentesApp = new Set<(de: string, c: CargaApp) => void>();
  micro = true;
  camara = false;
  pantalla = false;
  unido: number;

  constructor(
    readonly miId: string,
    readonly nombre: string,
    readonly bus: BusFalso | null = null,
    unido = 1,
    extra: Partial<EstadoLlamada> = {},
  ) {
    this.unido = unido;
    this.e = this.construir(extra);
    bus?.unir(this);
  }

  private construir(extra: Partial<EstadoLlamada> = {}): EstadoLlamada {
    const miembros = this.bus ? this.bus.miembros : [this];
    const otrosEnBus = miembros.some((m) => m === this) ? miembros : [this, ...miembros];
    const participantes: ParticipanteLlamada[] = otrosEnBus
      .slice()
      .sort((a, b) => (a === this ? -1 : b === this ? 1 : a.unido - b.unido))
      .map((m) => ({
        id: m.miId,
        uid: m.miId,
        nombre: m.nombre,
        avatar: null,
        invitado: false,
        micro: m.micro,
        camara: m.camara,
        pantalla: m.pantalla,
        unido: m.unido,
        yo: m === this,
        stream: null,
        conexion: "conectado" as const,
        calidad: "buena" as const,
        nivel: 0,
      }));
    return {
      fase: "en-curso",
      participantes,
      hablante: null,
      inicio: 1_000,
      micro: this.micro,
      camara: this.camara,
      pantalla: this.pantalla,
      dispositivos: { microfonos: [], camaras: [{ id: "c1", nombre: "Frontal" }, { id: "c2", nombre: "Trasera" }], altavoces: [] },
      seleccion: { microId: null, camaraId: "c1", altavozId: null },
      aviso: null,
      motivoFin: null,
      contestada: true,
      rechazos: [],
      medio: { tipo: "webrtc", texto: "Voz por WebRTC · cifrada", cifrada: true },
      ...extra,
    };
  }

  /** Cambia partes del estado del motor (como un parche del motor real). */
  poner(extra: Partial<EstadoLlamada>) {
    this.e = { ...this.construir(), ...extra };
    this.emitir();
  }
  reconstruir() {
    this.e = this.construir({ medio: this.e.medio, fase: this.e.fase, videoNoDisponible: this.e.videoNoDisponible, motivoFin: this.e.motivoFin, contestada: this.e.contestada });
    this.emitir();
  }
  private emitir() {
    for (const cb of Array.from(this.oyentes)) cb(this.e);
  }
  recibir(de: string, c: CargaApp) {
    for (const cb of Array.from(this.oyentesApp)) cb(de, c);
  }

  estado = () => this.e;
  suscribir = (cb: (e: EstadoLlamada) => void) => {
    this.oyentes.add(cb);
    return () => void this.oyentes.delete(cb);
  };
  suscribirApp = (cb: (de: string, c: CargaApp) => void) => {
    this.oyentesApp.add(cb);
    return () => void this.oyentesApp.delete(cb);
  };
  enviarApp = (c: CargaApp) => {
    this.enviados.push(c);
    this.bus?.difundir(this, c);
    return true;
  };
  private async cambiar(que: "micro" | "camara" | "pantalla"): Promise<string | null> {
    this.llamadas.push(que);
    const err = this.errores[que];
    if (err) return err;
    this[que] = !this[que];
    this.bus ? this.bus.sincronizar() : this.reconstruir();
    return null;
  }
  alternarMicro = () => this.cambiar("micro");
  alternarCamara = () => this.cambiar("camara");
  alternarPantalla = () => this.cambiar("pantalla");
  cambiarCamara = vi.fn(async (id: string) => {
    this.llamadas.push(`cambiarCamara:${id}`);
    this.e = { ...this.e, seleccion: { ...this.e.seleccion, camaraId: id } };
    this.emitir();
    return null;
  });
  cambiarAltavoz = vi.fn((id: string) => void this.llamadas.push(`altavoz:${id}`));
  colgar = vi.fn((motivo?: string) => {
    this.llamadas.push("colgar");
    this.cerrada = true;
    this.e = { ...this.e, fase: "terminada", motivoFin: motivo ?? "Has salido de la llamada." };
    this.emitir();
    return { duracionMs: 1000, contestada: true, otrosDentro: 1 };
  });
  metricasPares = () => [{ id: "otro", rttMs: 80, perdidos: 2, recibidos: 98, jitterMs: 5 }];
}

export async function vaciar(vueltas = 10) {
  for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}
