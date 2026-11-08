/**
 * Integral: Supabase-like fetch → puerta.cjs (cliente, TLS en Node) → puente → túnel por la «malla» (en memoria) →
 * puente → puerta.cjs (puerta, TCP) → servidor HTTPS. El TLS va de punta a punta: la malla solo ve texto cifrado.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fetchConPuerta, registrarRespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";
import { AJUSTES_PUERTA_POR_DEFECTO } from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio } from "@/lib/malla/puerta/tabla";
import { atenderEntradas, activarModoLocal, crearAbrirTcpLocal, respaldoFetchLocal, RUTA_LOCAL_PUERTA, type PostLocal } from "@/lib/malla/puerta/puente-local";
import { crearGestorPuerta, type MetaVecino, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";

const req = createRequire(import.meta.url);
const P = req("../../../../../native/servidor-local/puerta.cjs") as {
  crearPuertaLocal(o?: unknown): { manejar(q: http.IncomingMessage, r: http.ServerResponse): void; parar(): void };
};

function certificado(): { key: Buffer; cert: Buffer } | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pta-int-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    return { key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const cert = certificado();
const cierres: Array<() => void> = [];
afterAll(() => cierres.forEach((f) => f()));

function servidorLocal(puerta: { manejar(q: http.IncomingMessage, r: http.ServerResponse): void }): Promise<{ post: PostLocal }> {
  return new Promise((res) => {
    const s = http.createServer((q, r) => puerta.manejar(q, r));
    s.listen(0, "127.0.0.1", () => {
      const base = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
      cierres.push(() => {
        s.closeAllConnections();
        s.close();
      });
      res({ post: (accion, cuerpo, cab, senal) => fetch(base + RUTA_LOCAL_PUERTA + accion, { method: "POST", body: cuerpo ?? null, headers: cab, signal: senal }) });
    });
  });
}

describe.skipIf(!cert)("integral: fetch → malla → puerta → sitio (TLS de punta a punta)", () => {
  it("una lectura de «Supabase» sin salida propia llega por la puerta; la malla no ve nada legible", async () => {
    const visto: string[] = [];
    const web = https.createServer(cert as { key: Buffer; cert: Buffer }, (q, r) => {
      r.writeHead(200, { "content-type": "application/json", "x-visto": "puerta" });
      r.end(JSON.stringify({ perfil: "datos-secretos-777", apikey: q.headers.apikey }));
    });
    await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
    cierres.push(() => web.close());
    const puertoWeb = (web.address() as { port: number }).port;

    // Dos neuronas con sus servidores locales de Node.
    const nodoA = P.crearPuertaLocal({ tlsOpciones: { ca: (cert as { cert: Buffer }).cert }, permitirPuertoFetch: true });
    const nodoB = P.crearPuertaLocal();
    cierres.push(() => nodoA.parar(), () => nodoB.parar());
    const A = await servidorLocal(nodoA);
    const B = await servidorLocal(nodoB);

    // Malla en memoria entre A («tablet», sin internet) y B («mac», con internet).
    const oyentes = new Map<string, (v: string, t: Trama, m: MetaVecino) => void>();
    const transporte = (yo: string, otro: string): TransportePuerta => ({
      yo: () => yo,
      vecinos: () => [otro],
      tamTrozo: () => 2048,
      async enviar(_v, t) {
        visto.push(JSON.stringify(t));
        queueMicrotask(() => oyentes.get(otro)?.(yo, JSON.parse(JSON.stringify(t)) as Trama, { mismaCuenta: true, tipoEnlace: "ble", etiqueta: "Bluetooth directo" }));
        return true;
      },
      alRecibir(cb) {
        oyentes.set(yo, cb);
        return () => oyentes.delete(yo);
      },
    });
    const estadoMac = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
    const ajMac = { ...AJUSTES_PUERTA_POR_DEFECTO, permitirRedPrivada: true, puertos: [443, puertoWeb] };
    const gMac = crearGestorPuerta({
      transporte: transporte("mac", "tablet"),
      tabla: new TablaPuertas(() => Date.now(), "mac"),
      ajustes: () => ajMac,
      estado: () => estadoMac,
      anuncioPropio: () => crearAnuncioPropio({ id: "mac", capas: ["internet"], latenciaMs: 15, estado: estadoMac, ahora: Date.now() }),
      abrirTcp: crearAbrirTcpLocal(B.post),
    });
    const tablaTablet = new TablaPuertas(() => Date.now(), "tablet");
    const gTablet = crearGestorPuerta({
      transporte: transporte("tablet", "mac"),
      tabla: tablaTablet,
      ajustes: () => AJUSTES_PUERTA_POR_DEFECTO,
      estado: () => ({ conInternet: false, bateria: 0.8, cargando: false, medida: false }),
      anuncioPropio: () => null,
    });
    gMac.iniciar();
    gTablet.iniciar();
    cierres.push(() => gMac.detener(), () => gTablet.detener());
    await new Promise((r) => setTimeout(r, 50));
    expect(tablaTablet.candidatas().map((c) => c.anuncio.id)).toEqual(["mac"]);

    const h = atenderEntradas(A.post, gTablet);
    cierres.push(() => h.detener());
    await activarModoLocal(A.post, true, false);
    const baja = registrarRespaldoFetch(respaldoFetchLocal(A.post, { activo: () => true, hayPuertas: () => tablaTablet.candidatas().length > 0, sinSalida: () => true }));
    cierres.push(baja);

    const baseCaido = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const f = fetchConPuerta(baseCaido);
    const res = await f(`https://127.0.0.1:${puertoWeb}/rest/v1/perfiles?select=*`, { headers: { apikey: "anon-key-1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-visto")).toBe("puerta");
    expect(await res.json()).toEqual({ perfil: "datos-secretos-777", apikey: "anon-key-1" });

    const todo = visto.join("");
    expect(todo).not.toContain("datos-secretos-777");
    expect(todo).not.toContain("perfiles");
    expect(todo).not.toContain("anon-key-1");
    expect(gMac.auditoria().length + gMac.compartiendo().length).toBeGreaterThan(0);
  }, 20_000);
});
