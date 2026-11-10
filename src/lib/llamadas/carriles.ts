/**
 * carriles — un carril estable por flujo de la llamada (LLA1110D). Lógica PURA (el tiempo se inyecta).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Antes la llamada tenía UN medio y lo decidían dos señales que se contradecían (ver
 * architecture/llamadas-telefonia.md § «Carriles por flujo»): el medio daba un salto cada medio segundo.
 * Ahora cada flujo —señalización, voz, vídeo de cámara, pantalla y datos— tiene su carril, elegido entre
 * los carriles que de verdad están arriba, con estas reglas:
 *  · Voz: estabilidad y poco retardo. Se queda donde funciona; solo se mueve si su carril está caído o
 *    degradado de forma SOSTENIDA (EVIDENCIA) y una sola vez por ENFRIAMIENTO. Que aparezca otro carril
 *    mejor nunca la mueve.
 *  · Vídeo y pantalla: capacidad. WebRTC (o un carril Wi-Fi) si lo hay; vídeo ligero por el enlace de
 *    datos si solo hay Bluetooth. Suben a un carril mejor con histéresis (sano durante EVIDENCIA).
 *  · Cada flujo cae y vuelve por su cuenta sin tocar a los demás.
 *  · La persona puede forzar un carril por flujo; si el forzado no está arriba, manda la elección automática.
 *  · Desempate entre los dos extremos: decide el DIRECTOR (el par descortés de la negociación, id menor) y
 *    el otro sigue lo que el director hace con la voz (ver `soyDirector`).
 */

export type Flujo = "senal" | "voz" | "video" | "pantalla" | "datos";
export type Carril = "webrtc" | "awdl" | "wifi-aware" | "wifi-direct" | "lan-tcp" | "ble-l2cap" | "ble-gatt";

export const FLUJOS: readonly Flujo[] = ["senal", "voz", "video", "pantalla", "datos"];
export const CARRILES: readonly Carril[] = ["webrtc", "awdl", "wifi-aware", "wifi-direct", "lan-tcp", "ble-l2cap", "ble-gatt"];

/** Una medida de salud de un carril, tal como la ve este extremo. */
export interface MuestraCarril {
  carril: Carril;
  arriba: boolean;
  rttMs?: number | null;
  perdidaPct?: number | null;
  kbps?: number | null;
}

export interface ReglaFlujo {
  /** Orden de preferencia para la PRIMERA elección (y para subir, si `subir`). */
  preferencia: readonly Carril[];
  /** Cuánto tiempo seguido hace falta la evidencia (caído/degradado, o mejor y sano) para cambiar. */
  evidenciaMs: number;
  /** Tiempo mínimo entre dos cambios del mismo flujo. */
  enfriamientoMs: number;
  /** ¿Sube a un carril preferido cuando aparece (con histéresis)? La voz NO. */
  subir: boolean;
}

const BLE: readonly Carril[] = ["ble-l2cap", "ble-gatt"];
const IP: readonly Carril[] = ["webrtc", "wifi-direct", "wifi-aware", "awdl", "lan-tcp"];

export const REGLAS: Record<Flujo, ReglaFlujo> = {
  // La señalización va por lo que esté: la prioridad es que llegue (el transporte universal ya reintenta).
  senal: { preferencia: ["lan-tcp", "wifi-direct", "wifi-aware", "awdl", ...BLE, "webrtc"], evidenciaMs: 3_000, enfriamientoMs: 10_000, subir: false },
  voz: { preferencia: ["webrtc", ...BLE, "lan-tcp", "wifi-direct", "wifi-aware", "awdl"], evidenciaMs: 6_000, enfriamientoMs: 30_000, subir: false },
  video: { preferencia: [...IP, ...BLE], evidenciaMs: 3_000, enfriamientoMs: 10_000, subir: true },
  pantalla: { preferencia: [...IP, ...BLE], evidenciaMs: 3_000, enfriamientoMs: 10_000, subir: true },
  datos: { preferencia: ["lan-tcp", "wifi-direct", "wifi-aware", "awdl", "webrtc", ...BLE], evidenciaMs: 3_000, enfriamientoMs: 10_000, subir: true },
};

/** Umbrales de «sano» (los mismos que `nivelCalidadVoz` usa para «mala»). */
export function carrilSano(m: MuestraCarril | undefined | null): boolean {
  if (!m || !m.arriba) return false;
  if ((m.perdidaPct ?? 0) >= 15) return false;
  if ((m.rttMs ?? 0) >= 1200) return false;
  return true;
}

/** ¿Este extremo decide (director) frente a ese par? El descortés de la negociación (id menor), así es la misma regla en los dos. */
export function soyDirector(miId: string, otroId: string): boolean {
  return miId < otroId;
}

export function esCarrilBle(c: Carril | null | undefined): boolean {
  return c === "ble-l2cap" || c === "ble-gatt";
}

export function esCarrilIp(c: Carril | null | undefined): boolean {
  return !!c && !esCarrilBle(c);
}

export interface CambioCarril {
  flujo: Flujo;
  de: Carril | null;
  a: Carril | null;
  motivo: string;
  /** Las muestras que sostienen la decisión (para el registro). */
  muestras: string;
}

interface EstadoFlujo {
  actual: Carril | null;
  ultimoCambio: number;
  /** Desde cuándo el carril actual está caído o degradado (null: sano). */
  maloDesde: number | null;
  /** Candidato mejor y desde cuándo está sano sin interrupción (solo flujos que suben). */
  mejor: Carril | null;
  mejorDesde: number | null;
}

/** Texto corto de las muestras: «ble-l2cap:ok rtt=80 · webrtc:caido». */
export function textoMuestras(ms: readonly MuestraCarril[]): string {
  return ms
    .map((m) => {
      if (!m.arriba) return `${m.carril}:caido`;
      const p: string[] = [`${m.carril}:${carrilSano(m) ? "ok" : "mal"}`];
      if (typeof m.rttMs === "number") p.push(`rtt=${Math.round(m.rttMs)}`);
      if (typeof m.perdidaPct === "number" && m.perdidaPct > 0) p.push(`perd=${Math.round(m.perdidaPct)}%`);
      if (typeof m.kbps === "number") p.push(`kbps=${Math.round(m.kbps)}`);
      return p.join(" ");
    })
    .join(" · ");
}

/**
 * Elige y mantiene el carril de cada flujo. Una instancia por par. `actualizar` es la única entrada: con las
 * muestras de ahora devuelve los cambios (normalmente ninguno). Es determinista: mismas muestras y mismo
 * tiempo → misma respuesta, así los dos extremos convergen.
 */
export class SelectorCarriles {
  private readonly e = new Map<Flujo, EstadoFlujo>();
  private readonly forzados = new Map<Flujo, Carril>();
  private readonly reglas: Record<Flujo, ReglaFlujo>;

  constructor(reglas: Partial<Record<Flujo, Partial<ReglaFlujo>>> = {}) {
    const r = {} as Record<Flujo, ReglaFlujo>;
    for (const f of FLUJOS) r[f] = { ...REGLAS[f], ...(reglas[f] ?? {}) };
    this.reglas = r;
    for (const f of FLUJOS) this.e.set(f, { actual: null, ultimoCambio: -Infinity, maloDesde: null, mejor: null, mejorDesde: null });
  }

  carril(f: Flujo): Carril | null {
    return this.e.get(f)!.actual;
  }

  forzado(f: Flujo): Carril | null {
    return this.forzados.get(f) ?? null;
  }

  /** La persona fuerza (o suelta, con null) el carril de un flujo. Se aplica en el siguiente `actualizar`. */
  forzar(f: Flujo, c: Carril | null): void {
    if (c) this.forzados.set(f, c);
    else this.forzados.delete(f);
  }

  /** El otro extremo (director) movió este flujo: se sigue sin esperar evidencia propia, y cuenta como cambio (enfriamiento). */
  seguir(f: Flujo, c: Carril | null, ahora: number): CambioCarril | null {
    const s = this.e.get(f)!;
    if (s.actual === c) return null;
    const de = s.actual;
    s.actual = c;
    s.ultimoCambio = ahora;
    s.maloDesde = null;
    s.mejor = null;
    s.mejorDesde = null;
    return { flujo: f, de, a: c, motivo: "sigue-al-director", muestras: "" };
  }

  /**
   * Fija el carril a lo que pasa DE VERDAD (la voz arrancó por un carril, la señal va por el enlace directo). No arranca
   * el enfriamiento salvo que antes ya hubiera carril (un cambio real).
   */
  fijar(f: Flujo, c: Carril | null, ahora: number): CambioCarril | null {
    const s = this.e.get(f)!;
    if (s.actual === c) return null;
    const de = s.actual;
    if (de !== null) s.ultimoCambio = ahora;
    s.actual = c;
    s.maloDesde = null;
    s.mejor = null;
    s.mejorDesde = null;
    return { flujo: f, de, a: c, motivo: "arranque", muestras: "" };
  }

  /** Carriles que pueden llevar ese flujo, en su orden de preferencia, entre los que están arriba. */
  private candidatos(f: Flujo, porCarril: Map<Carril, MuestraCarril>, puede: (f: Flujo, c: Carril) => boolean): Carril[] {
    return this.reglas[f].preferencia.filter((c) => puede(f, c) && carrilSano(porCarril.get(c)));
  }

  /**
   * Revisa todos los flujos (o los de `solo`). `puede(f, c)`: si ese carril sabe llevar ese flujo en este
   * aparato (p. ej. la voz por `lan-tcp` no existe: con IP la voz va por WebRTC).
   */
  actualizar(muestras: readonly MuestraCarril[], ahora: number, puede: (f: Flujo, c: Carril) => boolean = () => true, solo: readonly Flujo[] = FLUJOS): CambioCarril[] {
    const porCarril = new Map<Carril, MuestraCarril>();
    for (const m of muestras) porCarril.set(m.carril, m);
    const texto = textoMuestras(muestras);
    const cambios: CambioCarril[] = [];
    for (const f of solo) {
      const regla = this.reglas[f];
      const s = this.e.get(f)!;
      const cands = this.candidatos(f, porCarril, puede);
      const mover = (a: Carril | null, motivo: string) => {
        if (a === s.actual) return;
        cambios.push({ flujo: f, de: s.actual, a, motivo, muestras: texto });
        // La primera elección no es un «cambio»: no arranca el enfriamiento (si no, el primer carril mejor esperaría de más).
        if (s.actual !== null) s.ultimoCambio = ahora;
        s.actual = a;
        s.maloDesde = null;
        s.mejor = null;
        s.mejorDesde = null;
      };
      // 1) Forzado por la persona y arriba: manda (sin esperar).
      const forz = this.forzados.get(f);
      if (forz && puede(f, forz) && porCarril.get(forz)?.arriba) {
        if (s.actual !== forz) mover(forz, "forzado");
        continue;
      }
      // 2) Primera elección: el preferido que esté sano.
      if (s.actual === null) {
        if (cands.length) mover(cands[0], "primera-eleccion");
        continue;
      }
      // 3) ¿El actual está sano?
      const actual = porCarril.get(s.actual);
      const sano = carrilSano(actual) && puede(f, s.actual);
      if (!sano) {
        if (s.maloDesde === null) s.maloDesde = ahora;
        const caido = !actual?.arriba;
        // Caído del todo: basta media evidencia; degradado: la evidencia entera. Siempre con enfriamiento,
        // salvo que el carril haya desaparecido y haya otro (no se deja el flujo sin carril por el enfriamiento).
        const espera = caido ? regla.evidenciaMs / 2 : regla.evidenciaMs;
        const enfriado = ahora - s.ultimoCambio >= regla.enfriamientoMs || caido;
        if (ahora - s.maloDesde >= espera && enfriado) {
          const destino = cands.find((c) => c !== s.actual) ?? null;
          if (destino) mover(destino, caido ? `${s.actual}-caido` : `${s.actual}-degradado`);
          else if (caido && !cands.length) mover(null, `${s.actual}-caido-sin-alternativa`);
        }
        continue;
      }
      s.maloDesde = null;
      // 4) Sano. La voz se queda; los flujos que suben miran si hay uno preferido sano de forma sostenida.
      if (!regla.subir) continue;
      const iActual = regla.preferencia.indexOf(s.actual);
      const mejor = cands.find((c) => regla.preferencia.indexOf(c) < iActual) ?? null;
      if (!mejor) {
        s.mejor = null;
        s.mejorDesde = null;
        continue;
      }
      if (s.mejor !== mejor) {
        s.mejor = mejor;
        s.mejorDesde = ahora;
      }
      if (ahora - (s.mejorDesde ?? ahora) >= regla.evidenciaMs && ahora - s.ultimoCambio >= regla.enfriamientoMs) mover(mejor, `${mejor}-mejor-sostenido`);
    }
    return cambios;
  }

  /** Foto para la interfaz: el carril de cada flujo, y el forzado si lo hay. */
  foto(): Record<Flujo, { carril: Carril | null; forzado: Carril | null }> {
    const out = {} as Record<Flujo, { carril: Carril | null; forzado: Carril | null }>;
    for (const f of FLUJOS) out[f] = { carril: this.e.get(f)!.actual, forzado: this.forzados.get(f) ?? null };
    return out;
  }
}

/** Nombre corto para la persona: «Bluetooth», «Wi-Fi directo», «red local»… */
export function etiquetaCarril(c: Carril | null): string {
  switch (c) {
    case "webrtc":
      return "WebRTC";
    case "awdl":
      return "AWDL";
    case "wifi-aware":
      return "Wi-Fi Aware";
    case "wifi-direct":
      return "Wi-Fi directo";
    case "lan-tcp":
      return "red local";
    case "ble-l2cap":
    case "ble-gatt":
      return "Bluetooth";
    default:
      return "—";
  }
}

/** «Voz: Bluetooth · Vídeo: Wi-Fi directo» (solo los flujos con carril). */
export function textoCarriles(f: Partial<Record<Flujo, { carril: Carril | null }>>): string {
  const nombres: Record<Flujo, string> = { senal: "Señal", voz: "Voz", video: "Vídeo", pantalla: "Pantalla", datos: "Datos" };
  return (["voz", "video", "pantalla"] as Flujo[])
    .filter((k) => f[k]?.carril)
    .map((k) => `${nombres[k]}: ${etiquetaCarril(f[k]!.carril)}`)
    .join(" · ");
}

/**
 * Limitador del registro: como mucho `max` líneas por clave cada `ventanaMs` (por defecto 4 por minuto).
 * Devuelve true si se puede anotar.
 */
export class LimiteRegistro {
  private readonly t = new Map<string, number[]>();
  constructor(
    private readonly max = 4,
    private readonly ventanaMs = 60_000,
  ) {}
  puede(clave: string, ahora: number): boolean {
    const l = (this.t.get(clave) ?? []).filter((x) => ahora - x < this.ventanaMs);
    if (l.length >= this.max) {
      this.t.set(clave, l);
      return false;
    }
    l.push(ahora);
    this.t.set(clave, l);
    return true;
  }
}
