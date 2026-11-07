/**
 * pedir-actualizacion — «Pedir actualización» a otra neurona de la MISMA cuenta (VER1107B, 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/sincronizacion-neuronas.md §9.
 *
 * Mensaje `neurona.actualizar.solicitud` (v1) FIRMADO con la identidad de malla de quien lo pide
 * (`wrapSigned` v2: firma + instante + nonce). Viaja por dos caminos a la vez (el receptor se queda con
 * uno por su id): el canal de broadcast de la cuenta (`neurona:actualizar`, con internet) y el transporte
 * universal (canal `neurona-actualizar`: red local nativa, enlace sin internet, malla de la cuenta…).
 *
 * Quien lo recibe SOLO lo acepta si:
 *   · la firma es válida (v2) y fresca (±10 min, nonce no repetido: `acceptFreshness`);
 *   · el cuerpo dice esta cuenta y esta neurona como destino, y no viene de ella misma;
 *   · la huella que firma es de una neurona de ESTA cuenta: el registro verificado del servidor
 *     (`boundAccountFor`, la fila de identidad la insertó la propia cuenta) o, sin internet, un vínculo
 *     RECORDADO con esa misma huella y esta cuenta.
 * Aceptado, la neurona abre SU ventana de actualización («Hay una versión nueva»): nunca instala sola, y
 * el updater de Tauri sigue verificando la firma de la versión. Nada más se hace con el mensaje.
 */

export const TIPO_SOLICITUD = "neurona.actualizar.solicitud";
/** Canal del transporte universal. */
export const CANAL_SOLICITUD = "neurona-actualizar";
/** Evento del broadcast de la cuenta. */
export const EVENTO_CUENTA_SOLICITUD = "neurona:actualizar";
/** Evento de ventana: «mira ahora si hay versión nueva» (lo escucha `AvisoActualizacion`). */
export const EVENTO_BUSCAR_ACTUALIZACION = "starseed:buscar-actualizacion";
/** Cuánto vale una solicitud desde que se firmó. */
export const VENTANA_SOLICITUD_MS = 10 * 60_000;

export interface SolicitudActualizacion {
  t: typeof TIPO_SOLICITUD;
  v: 1;
  id: string;
  /** Neurona que lo pide. */
  de: string;
  /** Su nombre, para decir quién lo pidió. */
  deNombre?: string;
  /** Neurona destino. */
  para: string;
  /** Cuenta de las dos. */
  cuenta: string;
  /** Versión que se sabe publicada (solo informativa: manda el canal del updater del destino). */
  version?: string;
  ts: number;
}

export interface DetalleBuscar {
  /** Quién lo pidió (otra neurona); ausente si lo pidió la persona aquí. */
  pedidaPor?: string;
}

/** Lo que devuelve `unwrapSigned`. */
export interface SobreDesenvuelto {
  body: unknown;
  verified: boolean;
  fp?: string;
  ts?: number;
  nonce?: string;
}

export interface ContextoValidacion {
  miCuenta: string | null;
  miNeurona: string | null;
  /** Cuenta verificada de una huella (registro de identidades). */
  cuentaDeHuella: (fp: string) => string | null;
  /** Huellas de vínculos RECORDADOS de esta cuenta (camino sin internet). */
  huellasVinculadas?: ReadonlySet<string>;
  /** Identidades revocadas (Adenda 108): nunca valen, ni por un vínculo. */
  revocada?: (fp: string) => boolean;
  ahora: number;
}

export type Validacion = { ok: true; solicitud: SolicitudActualizacion } | { ok: false; motivo: string };

const ID = /^[\w:.-]{1,100}$/;

function esTexto(x: unknown, max: number): x is string {
  return typeof x === "string" && x.length > 0 && x.length <= max;
}

/** Arma el cuerpo (sin firmar). Pura. */
export function crearSolicitud(p: { id: string; de: string; deNombre?: string; para: string; cuenta: string; version?: string; ahora: number }): SolicitudActualizacion {
  return {
    t: TIPO_SOLICITUD,
    v: 1,
    id: p.id,
    de: p.de,
    ...(p.deNombre ? { deNombre: p.deNombre.slice(0, 60) } : {}),
    para: p.para,
    cuenta: p.cuenta,
    ...(p.version ? { version: p.version.slice(0, 40) } : {}),
    ts: p.ahora,
  };
}

/** ¿Se acepta esta solicitud? (la frescura del nonce la pone el llamador con `acceptFreshness`). Pura. */
export function validarSolicitud(d: SobreDesenvuelto, ctx: ContextoValidacion): Validacion {
  if (!d.verified || !d.fp) return { ok: false, motivo: "La firma no es válida." };
  if (typeof d.ts !== "number" || !d.nonce) return { ok: false, motivo: "Sin instante ni nonce firmados." };
  if (Math.abs(ctx.ahora - d.ts) > VENTANA_SOLICITUD_MS) return { ok: false, motivo: "La solicitud caducó." };
  const b = d.body as Partial<SolicitudActualizacion> | null;
  if (
    !b ||
    typeof b !== "object" ||
    b.t !== TIPO_SOLICITUD ||
    b.v !== 1 ||
    !esTexto(b.id, 100) ||
    !ID.test(b.id) ||
    !esTexto(b.de, 100) ||
    !esTexto(b.para, 100) ||
    !esTexto(b.cuenta, 100) ||
    (b.deNombre !== undefined && !esTexto(b.deNombre, 60)) ||
    (b.version !== undefined && !esTexto(b.version, 40))
  ) {
    return { ok: false, motivo: "No es una solicitud de actualización." };
  }
  if (!ctx.miCuenta) return { ok: false, motivo: "Sin sesión: no se sabe de qué cuenta es esta neurona." };
  if (b.cuenta !== ctx.miCuenta) return { ok: false, motivo: "Viene de otra cuenta." };
  if (!ctx.miNeurona || b.para !== ctx.miNeurona) return { ok: false, motivo: "No es para esta neurona." };
  if (b.de === ctx.miNeurona) return { ok: false, motivo: "La pidió esta misma neurona." };
  if (ctx.revocada?.(d.fp)) return { ok: false, motivo: "Esa identidad está revocada." };
  const dueno = ctx.cuentaDeHuella(d.fp);
  const propia = dueno === ctx.miCuenta || (!dueno && !!ctx.huellasVinculadas?.has(d.fp));
  if (!propia) return { ok: false, motivo: "La firma no es de una neurona de tu cuenta." };
  return { ok: true, solicitud: b as SolicitudActualizacion };
}

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function quienSoy(): Promise<{ uid: string | null; neurona: string | null }> {
  const [{ uidActual }, neu] = await Promise.all([import("@/lib/consumo/usuario"), import("@/lib/neurons/neurons")]);
  const uid = await uidActual().catch(() => null);
  let neurona: string | null = null;
  try {
    neurona = neu.resolverAliasEsteMedio() || neu.thisDeviceId() || null;
  } catch {
    neurona = null;
  }
  return { uid, neurona };
}

/** Pide a otra neurona de la cuenta que abra su ventana de actualización. Nunca lanza. */
export async function pedirActualizacion(destino: {
  neurona: string;
  nombre?: string;
  syncDeviceId?: string;
  version?: string;
  miNombre?: string;
}): Promise<{ ok: boolean; texto: string }> {
  try {
    const { uid, neurona } = await quienSoy();
    if (!uid || !neurona) return { ok: false, texto: "Inicia sesión para pedírselo a tus neuronas." };
    if (destino.neurona === neurona) return { ok: false, texto: "Esa es esta neurona: usa «Buscar actualizaciones»." };
    const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
    const cuerpo = crearSolicitud({ id: nuevoId(), de: neurona, deNombre: destino.miNombre, para: destino.neurona, cuenta: uid, version: destino.version, ahora: Date.now() });
    const sobre = await wrapSigned(cuerpo);
    if (sobre.v !== 2) return { ok: false, texto: "Esta neurona no puede firmar (sin WebCrypto): no se manda nada sin firma." };
    const caminos: string[] = [];
    try {
      const rs = await import("@/lib/sync/realtime-sync");
      await rs.sendAccountBroadcast(EVENTO_CUENTA_SOLICITUD, sobre);
      caminos.push("el canal de tu cuenta");
    } catch {
      /* sin internet o sin sesión: queda la malla */
    }
    try {
      const tu = await import("@/lib/malla/transporte-universal");
      const r = await tu.enviarMensaje({ neuronDeviceId: destino.neurona, syncDeviceId: destino.syncDeviceId, uid }, CANAL_SOLICITUD, sobre);
      if (r.ok && r.enlace) caminos.push(r.enlace.etiqueta);
    } catch {
      /* sin enlace directo */
    }
    if (!caminos.length) return { ok: false, texto: "No hay ningún camino hacia esa neurona ahora (ni internet ni enlace directo)." };
    const quien = destino.nombre ? `«${destino.nombre}»` : "esa neurona";
    return {
      ok: true,
      texto: `Pedido a ${quien} por ${caminos.join(" y ")}. Le saldrá su ventana de actualización; no se instala nada sin que allí lo acepten.`,
    };
  } catch {
    return { ok: false, texto: "No se pudo mandar el pedido." };
  }
}

/** Escucha los pedidos que llegan y, si valen, abre la ventana de actualización de esta neurona. */
export function iniciarEscuchaPedidos(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const vistos = new Set<string>();
  const procesar = async (sobre: unknown) => {
    try {
      const [{ unwrapSigned }, { acceptFreshness }, relay, quien] = await Promise.all([
        import("@/ai/astraura/mesh/mesh-identity"),
        import("@/ai/astraura/mesh/replay-guard"),
        import("@/ai/astraura/mesh/server-relay"),
        quienSoy(),
      ]);
      const d = await unwrapSigned(sobre);
      const id = (d.body as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || vistos.has(id)) return; // llegó por los dos caminos
      let huellasVinculadas = new Set<string>();
      try {
        const motor = await import("@/lib/malla/sincronizacion-neuronas-motor");
        huellasVinculadas = new Set(
          motor
            .vinculosDeNeuronas()
            .filter((v) => v.recordado && v.huella && v.cuenta === quien.uid)
            .map((v) => v.huella as string),
        );
      } catch {
        /* sin motor de vínculos */
      }
      const r = validarSolicitud(d, {
        miCuenta: quien.uid,
        miNeurona: quien.neurona,
        cuentaDeHuella: (fp) => relay.boundAccountFor(fp),
        huellasVinculadas,
        revocada: (fp) => relay.isRevoked(fp),
        ahora: Date.now(),
      });
      if (!r.ok) return;
      if (!acceptFreshness(d.fp, d.ts, d.nonce, id)) return; // repetición
      vistos.add(id);
      const detalle: DetalleBuscar = { pedidaPor: r.solicitud.deNombre || "otra neurona tuya" };
      window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR_ACTUALIZACION, { detail: detalle }));
    } catch {
      /* un pedido roto no rompe nada */
    }
  };
  const bajas: Array<() => void> = [];
  let vivo = true;
  const guardar = (baja: () => void) => (vivo ? bajas.push(baja) : baja());
  void import("@/lib/sync/realtime-sync")
    .then((rs) => guardar(rs.onAccountBroadcast(EVENTO_CUENTA_SOLICITUD, (p) => void procesar(p))))
    .catch(() => undefined);
  void import("@/lib/malla/transporte-universal")
    .then((tu) => guardar(tu.alRecibirMensaje(CANAL_SOLICITUD, (m) => void procesar(m.cuerpo))))
    .catch(() => undefined);
  return () => {
    vivo = false;
    for (const f of bajas.splice(0)) {
      try {
        f();
      } catch {
        /* */
      }
    }
  };
}
