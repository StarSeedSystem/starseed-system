// Relé de estaciones en vivo: servidor WebSocket para el Oracle A1 gratuito (S1010-EV-ORACLE-1b).
// Por qué: cada mensaje de Supabase Realtime cuenta una vez por oyente y, con muchos, las respuestas
// de hora agotan la cuota gratuita (architecture/estaciones-en-vivo-parametricas.md §4.1). El relé
// reparte los mismos sobres sin contar mensajes. Es ADITIVO: el cliente (src/lib/estaciones/canal-rele.ts)
// sigue en Supabase y verifica la firma de todo lo que llega. Contrato (§4.3), salas en salas.mjs:
//   · se abre `/ws?tema=<tema>`; solo se reparten textos `{"t":"est",…}` (≤ 40 000) a los DEMÁS de la sala;
//   · al cambiar la sala, cada conectado recibe `{"t":"rele","n":N}` (N le cuenta a él);
//   · cierres: 1008 sala rechazada (motivo de salas.mjs), 1009 trama demasiado grande, 1013 saturado.
// Privacidad: nunca registra el contenido, el tema ni la URL (en una privada el tema sale del token).
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { crearSalas } from "./salas.mjs";

const ABIERTO = 1; // WebSocket.OPEN
const LATIDO_MS = 30_000;
const CUENTAS_MS = 60_000;
// 40 000 caracteres ocupan como mucho 120 000 bytes en UTF-8: por encima, `ws` cierra con 1009.
const MAX_TRAMA = 128 * 1024;
// Un oyente lento no llena la memoria: se le salta el sobre (es idempotente por `n`; el próximo lo pone al día).
const MAX_PENDIENTE = 1024 * 1024;
const cero = () => ({ entradas: 0, rechazadas: 0, mensajes: 0, entregas: 0, saltados: 0 });

/** El tema de `/ws?tema=…`, o "" si la URL no se entiende (salas.mjs lo rechaza). */
export function temaDeUrl(url) {
  try {
    return new URL(url ?? "", "http://rele").searchParams.get("tema") ?? "";
  } catch {
    return "";
  }
}

/** Monta el relé. `ServidorWS` se inyecta para probarlo sin red; `registrar` recibe las cuentas. */
export function crearRele(opciones = {}) {
  const { ServidorWS = WebSocketServer, host = "127.0.0.1", puerto = 8787, maxConexiones = 5000 } = opciones;
  const registrar = opciones.registrar ?? console.log;
  const salas = crearSalas();
  const vivas = new WeakSet();
  let cuentas = cero();
  const wss = new ServidorWS({ host, port: puerto, path: "/ws", maxPayload: MAX_TRAMA });

  // Todos los de la sala reciben la cifra contándose a sí mismos; el cliente enseña N − 1.
  function anunciar(tema) {
    const aviso = JSON.stringify({ t: "rele", n: salas.presencia(tema) });
    for (const c of salas.miembros(tema)) if (c.readyState === ABIERTO) c.send(aviso);
  }

  wss.on("connection", (ws, req) => {
    ws.on("error", () => {}); // un socket roto no tumba el relé: su «close» llega igual
    if (wss.clients.size > maxConexiones) return ws.close(1013, "relé saturado");
    const tema = temaDeUrl(req?.url);
    const r = salas.entrar(tema, ws);
    if (!r.ok) {
      cuentas.rechazadas++;
      return ws.close(1008, r.motivo);
    }
    cuentas.entradas++;
    vivas.add(ws);
    ws.on("pong", () => vivas.add(ws));
    ws.on("message", (datos, binario) => {
      cuentas.mensajes++;
      if (binario) return; // los sobres son texto: lo binario no se reparte
      const texto = datos.toString();
      for (const c of salas.difundir(ws, texto)) {
        if (c.readyState !== ABIERTO) continue;
        if (c.bufferedAmount > MAX_PENDIENTE) cuentas.saltados++;
        else {
          c.send(texto);
          cuentas.entregas++;
        }
      }
    });
    ws.on("close", () => {
      salas.salir(ws);
      anunciar(tema);
    });
    anunciar(tema);
  });

  // Ping cada 30 s: quien no contestó al anterior se corta (su «close» lo saca de la sala).
  function latir() {
    for (const ws of wss.clients) {
      if (vivas.delete(ws)) ws.ping();
      else ws.terminate();
    }
  }

  function volcarCuentas() {
    registrar(JSON.stringify({ t: new Date().toISOString(), conexiones: wss.clients.size, ...cuentas }));
    cuentas = cero();
  }

  // 1001 («me voy»): el cliente vuelve a conectar solo, con su espera creciente.
  function apagar(listo = () => {}) {
    for (const ws of wss.clients) ws.close(1001, "el relé se reinicia");
    wss.close(listo);
  }

  return { wss, salas, latir, volcarCuentas, apagar };
}

function arrancar() {
  const puerto = Number(process.env.PUERTO) || 8787;
  const maxConexiones = Number(process.env.MAX_CONEXIONES) || 5000;
  const rele = crearRele({ host: process.env.HOST || "127.0.0.1", puerto, maxConexiones });
  rele.wss.on("listening", () => console.log(`relé de estaciones escuchando en el puerto ${puerto}`));
  // Puerto ocupado o sin permiso: salir con error para que systemd/Docker lo reinicie y se vea.
  rele.wss.on("error", (e) => (console.error(`relé de estaciones: ${e.message}`), process.exit(1)));
  const temporizadores = [setInterval(rele.latir, LATIDO_MS), setInterval(rele.volcarCuentas, CUENTAS_MS)];
  const salir = () => {
    temporizadores.forEach(clearInterval);
    rele.apagar(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  for (const senal of ["SIGTERM", "SIGINT"]) process.on(senal, salir);
}

// Arranca solo al ejecutarlo (`node servidor.mjs`, `npm start`), nunca al importarlo en una prueba.
const real = (ruta) => (ruta ? realpathSync(ruta) : "");
if (real(process.argv[1]) === real(fileURLToPath(import.meta.url))) arrancar();
