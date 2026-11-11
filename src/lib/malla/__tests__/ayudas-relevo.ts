/** Ayudas de prueba del relevo (REL1111I): neuronas con motor real, claves reales (WebCrypto) y carriles en memoria que se cortan. */
import { decryptEnvelopeWith, encryptEnvelopeFor } from "@/ai/astraura/mesh/recipient-crypto";
import { crearMotorRelevo, type CarrilRelevo, type MensajeRelevado, type MotorRelevo } from "@/lib/malla/relevo/motor";
import type { CriptoRelevo, FirmaRelevo, TramaDatos } from "@/lib/malla/relevo/sobre";

async function sha(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return "id:" + Buffer.from(h).toString("base64url").slice(0, 20);
}

export interface NeuronaPrueba {
  id: string;
  nombre: string;
  motor: MotorRelevo;
  recibidos: MensajeRelevado[];
  relevadas: TramaDatos[];
  lineas: string[];
  pub: JsonWebKey;
  huella: string;
  releva: { ok: boolean; motivo?: string };
}

interface Carril {
  a: string;
  b: string;
  tipo: string;
  arriba: boolean;
  kbps: number;
  rttMs: number;
}

export class RedPrueba {
  neuronas = new Map<string, NeuronaPrueba>();
  carriles: Carril[] = [];
  tramas = 0;
  directorioClaves = new Map<string, JsonWebKey>();
  huellas = new Map<string, string>();
  /** Si es false, las claves solo se aprenden por los anuncios (nadie las da «en vivo»). */
  clavesEnVivo = true;

  async neurona(id: string, nombre = id): Promise<NeuronaPrueba> {
    const ecdh = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const pub = await crypto.subtle.exportKey("jwk", ecdh.publicKey);
    const pubLimpia: JsonWebKey = { kty: "EC", crv: "P-256", x: pub.x, y: pub.y };
    const ecdsa = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const k = await crypto.subtle.exportKey("jwk", ecdsa.publicKey);
    const huella = await sha(`${k.x}.${k.y}`);
    this.directorioClaves.set(id, pubLimpia);
    this.huellas.set(id, huella);
    const datos = (c: unknown) => new TextEncoder().encode(JSON.stringify(c ?? null));
    const red = this;
    const cripto: CriptoRelevo = {
      cifrar: (p, obj) => encryptEnvelopeFor(p, obj),
      abrir: (s) => decryptEnvelopeWith(s as Parameters<typeof decryptEnvelopeWith>[0], ecdh.privateKey),
      firmar: async (c) => ({ s: Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ecdsa.privateKey, datos(c))).toString("base64"), k, f: huella }) satisfies FirmaRelevo,
      verificar: async (c, f, neurona) => {
        const key = await crypto.subtle.importKey("jwk", f.k, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        if (!(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(f.s, "base64"), datos(c)))) return false;
        const conocida = red.huellas.get(neurona);
        return (await sha(`${f.k.x}.${f.k.y}`)) === conocida;
      },
    };
    const n: NeuronaPrueba = { id, nombre, motor: null as unknown as MotorRelevo, recibidos: [], relevadas: [], lineas: [], pub: pubLimpia, huella, releva: { ok: true } };
    n.motor = crearMotorRelevo({
      yo: () => ({ neurona: id, uid: "cuenta-1", nombre, clave: pubLimpia }),
      carriles: () => this.carrilesDe(id),
      enviarPorCarril: (cid, texto) => this.enviar(id, cid, texto),
      clavePublica: async (x) => (this.clavesEnVivo ? (this.directorioClaves.get(x) ?? null) : null),
      cripto,
      puedoRelevar: () => n.releva,
      entregar: (m) => n.recibidos.push(m),
      alRelevar: (t) => n.relevadas.push(t),
      anotar: (l) => n.lineas.push(l),
    });
    this.neuronas.set(id, n);
    return n;
  }

  carrilesDe(id: string): CarrilRelevo[] {
    return this.carriles
      .filter((c) => c.arriba && (c.a === id || c.b === id))
      .map((c) => {
        const otra = c.a === id ? c.b : c.a;
        return { id: `${c.tipo}:${id}>${otra}`, tipo: c.tipo, vecina: otra, mismaCuenta: true, nombre: this.neuronas.get(otra)?.nombre ?? otra, kbps: c.kbps, rttMs: c.rttMs, huella: this.huellas.get(otra) ?? null };
      });
  }

  unir(a: string, b: string, tipo = "ble", kbps = 200, rttMs = 40): void {
    const c = this.carriles.find((x) => x.tipo === tipo && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (c) {
      c.arriba = true;
      c.kbps = kbps;
      c.rttMs = rttMs;
    } else this.carriles.push({ a, b, tipo, arriba: true, kbps, rttMs });
    this.refrescar();
  }

  cortar(a: string, b: string): void {
    for (const c of this.carriles) if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) c.arriba = false;
    this.refrescar();
  }

  refrescar(): void {
    for (const n of this.neuronas.values()) n.motor.refrescar();
  }

  enviar(de: string, carrilId: string, texto: string): boolean {
    const m = /^([a-z]+):(.+)>(.+)$/.exec(carrilId);
    if (!m) return false;
    const [, tipo, , otra] = m;
    const c = this.carriles.find((x) => x.arriba && x.tipo === tipo && ((x.a === de && x.b === otra) || (x.a === otra && x.b === de)));
    if (!c) return false;
    this.tramas++;
    setTimeout(() => {
      if (!c.arriba) return;
      this.neuronas.get(otra)?.motor.recibir(texto, `${tipo}:${otra}>${de}`);
    }, Math.max(1, Math.round(c.rttMs / 2)));
    return true;
  }

  /** Deja que los anuncios lleguen (unas vueltas de reloj real). */
  async asentar(ms = 120): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  parar(): void {
    for (const n of this.neuronas.values()) n.motor.parar();
  }
}

export function sobreDe(id: string, texto: string) {
  return { t: "tu.msg" as const, v: 1 as const, id, c: "nota", b: { texto }, de: { s: "sync-x" } };
}
