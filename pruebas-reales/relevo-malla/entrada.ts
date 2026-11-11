// Banco del relevo (REL1111I): UNA neurona por contexto de Chromium (su almacenamiento, sus claves y sus módulos), con el código
// real del transporte universal (crearEnviador, despacho y entrega una sola vez), el motor de relevo, el motor de archivos, el
// sello de archivos y el canal de señalización de llamadas. Los carriles los simula correr.mjs (Node) con su capacidad,
// retardo, pérdida y corte: aquí solo entran y salen textos por `__salida` / `relevo.entrada`.
import * as tu from "@/lib/malla/transporte-universal";
import * as rv from "@/lib/malla/relevo/motor";
import * as rvReal from "@/lib/malla/relevo/real";
import { crearAlmacenEnMemoria, crearMotorArchivos, type CanalArchivos, type EstadoTransferencia } from "@/lib/network/archivos-malla";
import { recibirArchivo } from "@/lib/malla/recepcion-sellada";
import { crearCanalSellado } from "@/lib/malla/canal-sellado";
import { myEncryptionPublicKey } from "@/ai/astraura/mesh/recipient-crypto";
import { myFingerprint } from "@/ai/astraura/mesh/mesh-identity";
import { abrirCanalLlamadaPorTransporte } from "@/lib/llamadas/canal-enlace-transporte";

declare global {
  interface Window {
    __salida(carrilId: string, texto: string): Promise<boolean>;
    relevo: unknown;
  }
}

type Carril = { id: string; tipo: "ble" | "nativo"; vecina: string; kbps: number; rttMs: number };
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
let yo = { id: "", nombre: "", uid: "cuenta-alex" };
let carriles: Carril[] = [];
const huellas = new Map<string, string>();
const claves = new Map<string, JsonWebKey>();
const lineas: Array<{ t: number; l: string }> = [];
const recibidos: Array<{ t: number; id: string; canal: string; cuerpo: unknown; etiqueta: string; enlaceId: string; tipo: string }> = [];
const auditoria = { tramasRelevadas: 0, conMarcaEnClaro: 0, bytes: 0 };
const MARCAS = ["SECRETO-MENSAJE", "SECRETO-ARCHIVO", "SECRETO-NOMBRE"];

const anotar = (l: string) => lineas.push({ t: ms(), l });

// ── motor de relevo real (vacío con un árbol anterior) ──
const crearMotorRelevo = (rv as unknown as { crearMotorRelevo?: typeof rv.crearMotorRelevo }).crearMotorRelevo;
const crearCriptoReal = (rvReal as unknown as { crearCriptoReal?: typeof rvReal.crearCriptoReal }).crearCriptoReal;
let motor: rv.MotorRelevo | null = null;
let releva: { ok: boolean; motivo?: string } = { ok: true };

// ── motor de archivos real ──
const terminados: Array<{ t: number; id: string; rol: string; nombre: string; sha: string; bytes: number; cifrado: string | null; via: string | null }> = [];
const archivos = crearMotorArchivos({
  almacen: crearAlmacenEnMemoria(),
  politica: () => "auto-aceptar",
  onCompletado: (e: EstadoTransferencia, blob: Blob) => {
    void blob.arrayBuffer().then(async (b) => {
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      terminados.push({ t: ms(), id: e.id, rol: e.rol, nombre: e.nombre, sha: h, bytes: b.byteLength, cifrado: (e as { cifradoArchivo?: string }).cifradoArchivo ?? null, via: (e as { via?: string }).via ?? null });
    });
  },
});

function carrilesRelevo(): rv.CarrilRelevo[] {
  return carriles.map((c) => ({ id: c.id, tipo: c.tipo, vecina: c.vecina, mismaCuenta: true, nombre: c.vecina, kbps: c.kbps, rttMs: c.rttMs, huella: huellas.get(c.vecina) ?? null }));
}

function enlaces(): tu.EnlaceDisponible[] {
  return carriles.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    etiqueta: `${c.vecina} · ${c.tipo}`,
    alcanza: { neuronDeviceId: c.vecina, uid: yo.uid },
    abierto: true,
    sinInternet: true,
    rttMs: c.rttMs,
    capacidadKbps: c.kbps,
    admite: { mensaje: true, archivo: true, flujo: false },
  }));
}

const enviarCarril = async (id: string, texto: string) => window.__salida(id, texto);

// El enviador REAL del transporte universal, con los carriles del banco y (si existe) el relevo como en la app.
const deps: tu.DepsEnvio = {
  listar: async () => enlaces(),
  enviarP2P: () => false,
  enviarRele: async () => ({ ok: false, detalle: "sin servidor en el banco" }),
  enviarLora: async () => ({ ok: false, detalle: "sin radio en el banco" }),
  esperarAcuse: async () => false,
  nuevoId: () => crypto.randomUUID(),
  origen: () => ({ s: `sync-${yo.id}` }),
  enviarNativo: async (e, texto) => ((await enviarCarril(e.id, texto)) ? { ok: true, detalle: "acusado por el carril" } : { ok: false, detalle: "carril caído" }),
  enviarBle: async (e, texto) => ((await enviarCarril(e.id, texto)) ? { ok: true, detalle: "acusado por el carril" } : { ok: false, detalle: "carril caído" }),
};
const conRelevo: tu.DepsEnvio = {
  ...deps,
  relevo: async (destino, sobre, o) => {
    if (!motor || !destino.neuronDeviceId) return null;
    // Igual que `relevo/real.ts`: sin ruta, solo se espera si la hubo hace poco.
    if (!motor.alcanza(destino.neuronDeviceId)) {
      const hace = motor.alcanzableHace(destino.neuronDeviceId);
      if (!o.esperarRuta || hace === null || hace > 120_000) return null;
    }
    const r = await motor.enviarMensaje(destino.neuronDeviceId, sobre, { plazoMs: 20_000 });
    return {
      ok: r.ok,
      confirmado: r.confirmado,
      enlace: r.ok ? { id: `relevo:${r.relevo ?? "directo"}`, tipo: (r.carril ?? "ble") as tu.TipoEnlace, etiqueta: r.relevo ? `por relevo de ${r.nombreRelevo}` : "directo" } : null,
      relevo: r.ok && r.relevo ? { neurona: r.relevo, nombre: r.nombreRelevo } : null,
      detalle: r.motivo ?? `${r.intentos.length} intentos`,
    };
  },
};
const enviar = tu.crearEnviador(conRelevo);

tu.alRecibirMensaje("nota", (m) => recibidos.push({ t: ms(), id: m.id, canal: m.canal, cuerpo: m.cuerpo, etiqueta: m.origen.etiqueta, enlaceId: m.origen.enlaceId, tipo: m.origen.tipo }));

function iniciarMotor(): void {
  if (!crearMotorRelevo || !crearCriptoReal) return;
  motor =
    crearMotorRelevo({
      yo: () => ({ neurona: yo.id, uid: yo.uid, nombre: yo.nombre, clave: claves.get(yo.id) ?? null }),
      carriles: carrilesRelevo,
      enviarPorCarril: (id, texto) => enviarCarril(id, texto),
      clavePublica: async (n) => claves.get(n) ?? null,
      cripto: crearCriptoReal((n) => huellas.get(n) ?? motor?.huellaDe(n) ?? null),
      puedoRelevar: () => releva,
      entregar: (m) => {
        const f = (tu as unknown as { entregarDesdeRelevo?: (x: tu.MensajeEntrante) => void }).entregarDesdeRelevo;
        f?.({
          id: m.sobre.id,
          canal: m.sobre.c,
          cuerpo: m.sobre.b,
          origen: { tipo: m.carril.tipo as tu.TipoEnlace, enlaceId: `relevo:${m.relevo ?? m.origen}`, etiqueta: m.relevo ? `por relevo de ${m.nombreRelevo}` : "directo" },
          at: Date.now(),
        });
      },
      alArchivo: (origen, texto, canal, info) =>
        recibirArchivo(archivos, canal, texto, { mismaCuenta: true, via: info.relevo ? `por relevo de ${info.nombreRelevo}` : "directo", etiquetaOrigen: origen, nodoId: origen }),
      alRelevar: (t) => {
        auditoria.tramasRelevadas++;
        auditoria.bytes += t.p.length;
        if (MARCAS.some((m) => t.p.includes(m))) auditoria.conMarcaEnClaro++;
      },
      anotar,
    }) ?? null;
  if (motor) {
    (tu as unknown as { fijarReceptorRelevo?: (f: (texto: string, o: tu.MensajeEntrante["origen"]) => void) => void }).fijarReceptorRelevo?.((texto, o) => {
      motor?.recibir(texto, o.enlaceId);
    });
    setInterval(() => motor?.tic(), 1000);
  }
}

// Canal directo de archivos por un carril (como el de la red local nativa), para el «par antiguo».
const canalesDirectos = new Map<string, CanalArchivos>();
function canalDirecto(id: string): CanalArchivos {
  let c = canalesDirectos.get(id);
  if (!c) {
    c = { enviar: (t) => (void enviarCarril(id, t), true), alMensaje: () => () => undefined };
    canalesDirectos.set(id, c);
  }
  return c;
}

let llamada: ReturnType<typeof abrirCanalLlamadaPorTransporte> | null = null;
const presencias: Array<{ t: number; ids: string[] }> = [];

window.relevo = {
  arbolConRelevo: typeof crearMotorRelevo === "function" && !!crearCriptoReal && typeof (tu as unknown as { fijarReceptorRelevo?: unknown }).fijarReceptorRelevo === "function",
  async iniciar(p: { id: string; nombre: string }) {
    yo = { ...yo, ...p };
    const pub = await myEncryptionPublicKey();
    const huella = await myFingerprint();
    if (pub) claves.set(yo.id, { kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
    iniciarMotor();
    return { pub: claves.get(yo.id) ?? null, huella, conRelevo: !!motor };
  },
  /** Lo que los saludos de los carriles directos prueban: huella y clave de cada vecina directa. */
  conocer(v: { neurona: string; huella: string; pub: JsonWebKey | null }) {
    huellas.set(v.neurona, v.huella);
    if (v.pub) claves.set(v.neurona, v.pub);
  },
  fijarCarriles(lista: Carril[]) {
    carriles = lista;
    motor?.refrescar();
  },
  entrada(carrilId: string, texto: string) {
    const c = carriles.find((x) => x.id === carrilId);
    if (!c) return;
    if (texto.startsWith('{"t":"tu.')) {
      tu.despacharTextoTransporte(texto, { tipo: c.tipo, enlaceId: c.id, etiqueta: `${c.vecina} · ${c.tipo}` }, (r) => void enviarCarril(c.id, r));
    } else if (texto.startsWith('{"t":"archivo.')) {
      recibirArchivo(archivos, canalDirecto(c.id), texto, { mismaCuenta: true, via: "directo", etiquetaOrigen: c.vecina });
    }
  },
  releva(ok: boolean, motivo?: string) {
    releva = ok ? { ok: true } : { ok: false, motivo: motivo ?? "apagado" };
  },
  async mensaje(destino: string, texto: string) {
    const r = await enviar({ neuronDeviceId: destino }, "nota", { texto });
    anotar(`app mensaje destino=${destino} ok=${r.ok} confirmado=${r.confirmado} enlace=${r.enlace?.etiqueta ?? "-"}`);
    return { ok: r.ok, confirmado: r.confirmado, enlace: r.enlace, relevo: r.relevo ?? null, motivo: r.motivo ?? null, intentos: r.intentos.map((i) => `${i.enlaceId}:${i.ok}`) };
  },
  /** Envía un archivo de `bytes` (con marca dentro y en el nombre) a `destino`: directo si hay carril, si no por relevo. */
  async archivo(destino: string, bytes: number) {
    const datos = new Uint8Array(bytes);
    const marca = new TextEncoder().encode("SECRETO-ARCHIVO-");
    for (let i = 0; i < bytes; i++) datos[i] = i % 64 < marca.length ? marca[i % 64] : (i * 7919) % 251;
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", datos)))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const directo = carriles.find((c) => c.vecina === destino);
    let canal: CanalArchivos | null = null;
    let via = "directo";
    if (directo) canal = canalDirecto(directo.id);
    else if (motor) {
      const pub = claves.get(destino) ?? motor.claveAnunciada(destino);
      if (pub) {
        canal = crearCanalSellado(motor.canalHacia(destino), { destinatarios: () => [{ pub }], parCifra: () => true });
        via = "relevo";
      }
    }
    if (!canal) return { ok: false, motivo: "sin carril directo y sin relevo", sha };
    const r = await archivos.enviarArchivo(canal, new Blob([datos]), `SECRETO-NOMBRE-${bytes}.bin`, { tipo: "dispositivo", id: destino });
    anotar(`app archivo destino=${destino} via=${via} id=${r.id} ok=${r.ok}`);
    return { ok: r.ok, id: r.id, sha, via, motivo: r.error ?? null };
  },
  estado() {
    return {
      yo: yo.id,
      recibidos,
      terminados,
      transferencias: archivos.listaTransferencias().map((e) => ({ id: e.id, rol: e.rol, fase: e.fase, progreso: e.progreso, trozos: e.trozos, cifrado: e.cifradoArchivo ?? null, reparto: e.repartoVias ?? null, motivo: e.motivo ?? null })),
      lineas,
      estadisticas: motor?.estadisticas() ?? null,
      auditoria,
      destinos: motor?.destinos() ?? [],
      presencias,
    };
  },
  ruta(d: string) {
    return motor?.alcanza(d) ?? null;
  },
  /** Abre el canal de señalización de llamadas (el real de src/lib/llamadas) hacia `neurona` y publica mi presencia. */
  llamar(neurona: string, sesionId: string) {
    const clave = `${yo.uid}:${yo.id}`;
    llamada = abrirCanalLlamadaPorTransporte(neurona, sesionId, clave, {
      enviar: async (n, cuerpo) => {
        const r = await enviar({ neuronDeviceId: n }, "llamada-canal", cuerpo, { esperarAcuseMs: 1500 });
        return { ok: r.ok, via: r.enlace?.tipo };
      },
      alRecibir: (cb) => tu.alRecibirMensaje("llamada-canal", (m) => cb({ cuerpo: m.cuerpo, origen: { tipo: m.origen.tipo } })),
      hayEnlace: (n) => carriles.some((c) => c.vecina === n) || !!motor?.alcanza(n),
      yo: () => yo.id,
    });
    llamada.onPresencia((p) => presencias.push({ t: ms(), ids: p.map((x) => x.id) }));
    llamada.publicar({ id: clave, uid: yo.uid, nombre: yo.nombre, avatar: null, invitado: false, micro: true, camara: false, pantalla: false, unido: Date.now() });
    anotar(`app llamada abierta hacia=${neurona} sesion=${sesionId}`);
    return true;
  },
  ms,
  listo: true,
};
