// Corre los casos del relevo (REL1111I) en Chromium: una neurona por contexto, carriles simulados en Node.
//   node correr.mjs [salida-nueva] [caso|todos] [salida-vieja]
// casos: a-c-por-b · cae-b-con-d · cae-b-sin-nadie · dos-relevos · directo-aparece · bucle · declina · vieja · timbre · todos
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirNuevo = path.resolve(process.argv[2] ?? path.join(aqui, "salida"));
const caso = process.argv[3] ?? "todos";
const dirViejo = path.resolve(process.argv[4] ?? path.join(aqui, "salida-antes"));
const require = createRequire(import.meta.url);
let pw;
for (const c of ["/opt/npm-tools/node_modules/playwright", "playwright"]) {
  try {
    pw = require(c);
    break;
  } catch {
    /* siguiente */
  }
}
const srv = http.createServer((q, r) => {
  const [, arbol, ...resto] = q.url.split("?")[0].split("/");
  const base = arbol === "viejo" ? dirViejo : dirNuevo;
  const f = path.join(base, resto.join("/") || "index.html");
  if (!f.startsWith(base) || !fs.existsSync(f)) return r.writeHead(404).end();
  r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }).end(fs.readFileSync(f));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const url = (arbol) => `http://127.0.0.1:${srv.address().port}/${arbol}/`;
const nav = await pw.chromium.launch();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────── la red simulada ───────── */
class Red {
  constructor() {
    this.n = new Map();
    this.carriles = [];
    this.ocupado = new Map();
    this.tramas = new Map(); // "A>B" → tramas entregadas
    this.t0 = Date.now();
  }
  ahora() {
    return Date.now() - this.t0;
  }
  async neurona(id, nombre = id, arbol = "nuevo") {
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${id}] pageerror`, e.message));
    await page.exposeBinding("__salida", (_src, carrilId, texto) => this.salida(id, carrilId, texto));
    await page.goto(url(arbol));
    await page.waitForFunction(() => window.relevo?.listo);
    const ini = await page.evaluate((p) => window.relevo.iniciar(p), { id, nombre });
    const n = { id, nombre, page, ctx, arbol, ...ini };
    this.n.set(id, n);
    return n;
  }
  carril(a, b, tipo) {
    return this.carriles.find((c) => c.tipo === tipo && ((c.a === a && c.b === b) || (c.a === b && c.b === a)));
  }
  async publicar(ids) {
    for (const id of ids) {
      const n = this.n.get(id);
      if (!n) continue;
      const lista = this.carriles
        .filter((c) => c.arriba && (c.a === id || c.b === id))
        .map((c) => {
          const otra = c.a === id ? c.b : c.a;
          return { id: `${c.tipo}:${id}>${otra}`, tipo: c.tipo, vecina: otra, kbps: c.kbps, rttMs: c.rttMs };
        });
      await n.page.evaluate((l) => window.relevo.fijarCarriles(l), lista);
    }
  }
  async unir(a, b, { tipo = "nativo", kbps = 20_000, rttMs = 10, perdida = 0 } = {}) {
    let c = this.carril(a, b, tipo);
    if (!c) {
      c = { a, b, tipo, kbps, rttMs, perdida, arriba: true, epoca: 0 };
      this.carriles.push(c);
    }
    Object.assign(c, { kbps, rttMs, perdida, arriba: true });
    // El saludo del carril prueba huella y clave de cada lado (como `nl.hola` / el saludo de Bluetooth).
    const na = this.n.get(a);
    const nb = this.n.get(b);
    await na.page.evaluate((v) => window.relevo.conocer(v), { neurona: b, huella: nb.huella, pub: nb.pub });
    await nb.page.evaluate((v) => window.relevo.conocer(v), { neurona: a, huella: na.huella, pub: na.pub });
    await this.publicar([a, b]);
  }
  async cortar(a, b) {
    for (const c of this.carriles) if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) {
      c.arriba = false;
      c.epoca++;
    }
    await this.publicar([a, b]);
  }
  async degradar(a, b, tipo, kbps, rttMs) {
    const c = this.carril(a, b, tipo);
    Object.assign(c, { kbps, rttMs });
    await this.publicar([a, b]);
  }
  salida(de, carrilId, texto) {
    const m = /^([a-z]+):(.+)>(.+)$/.exec(carrilId);
    if (!m) return false;
    const [, tipo, , a] = m;
    const c = this.carril(de, a, tipo);
    if (!c || !c.arriba) return false;
    if (c.perdida && Math.random() < c.perdida) return true;
    const dir = `${de}>${a}`;
    const bytes = Buffer.byteLength(texto);
    const inicio = Math.max(Date.now(), this.ocupado.get(dir) ?? 0);
    const fin = inicio + (bytes * 8) / c.kbps;
    this.ocupado.set(dir, fin);
    const epoca = c.epoca;
    setTimeout(() => {
      if (!c.arriba || c.epoca !== epoca) return;
      this.tramas.set(dir, (this.tramas.get(dir) ?? 0) + 1);
      const n = this.n.get(a);
      void n?.page.evaluate(([cid, t]) => window.relevo.entrada(cid, t), [`${tipo}:${a}>${de}`, texto]).catch(() => undefined);
    }, Math.max(0, fin - Date.now() + c.rttMs / 2));
    return true;
  }
  /** Mete un texto en `a` como si llegara por su carril con `de` (tramas fabricadas: bucles, vistas viejas). */
  inyectar(de, a, tipo, texto) {
    void this.n.get(a).page.evaluate(([cid, t]) => window.relevo.entrada(cid, t), [`${tipo}:${a}>${de}`, texto]);
  }
  estado(id) {
    return this.n.get(id).page.evaluate(() => window.relevo.estado());
  }
  ms(id) {
    return this.n.get(id).page.evaluate(() => window.relevo.ms());
  }
  async cerrar() {
    for (const n of this.n.values()) await n.ctx.close();
  }
}

async function hasta(f, msMax = 30_000, paso = 100) {
  const fin = Date.now() + msMax;
  let v = await f();
  while (!v && Date.now() < fin) {
    await espera(paso);
    v = await f();
  }
  return v;
}
const lineas = (e, re) => e.lineas.filter((x) => re.test(x.l));
const terminadoCon = async (red, id, sha) => (await red.estado(id)).terminados.find((x) => x.sha === sha && x.rol === "recibir");

/* ───────── casos ───────── */
const casos = {
  // A–B y B–C, ningún carril A–C: mensaje y archivo de A a C, solos, sellados; B no ve nada en claro.
  async "a-c-por-b"() {
    const red = new Red();
    try {
      await red.neurona("A", "MaggaBook");
      await red.neurona("B", "Maggaboard");
      await red.neurona("C", "Teléfono");
      await red.unir("A", "B");
      await red.unir("B", "C", { tipo: "ble", kbps: 400, rttMs: 60 });
      await espera(600);
      const m = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "SECRETO-MENSAJE uno"));
      const arch = await red.n.get("A").page.evaluate(() => window.relevo.archivo("C", 120_000));
      const fin = await hasta(() => terminadoCon(red, "C", arch.sha), 60_000);
      const eC = await red.estado("C");
      const eB = await red.estado("B");
      const eA = await red.estado("A");
      const recibido = eC.recibidos.filter((r) => r.cuerpo?.texto === "SECRETO-MENSAJE uno");
      const r = {
        mensaje: m,
        recibidoEnC: recibido.map((x) => ({ etiqueta: x.etiqueta, enlaceId: x.enlaceId })),
        archivo: { ...arch, terminadoEnC: fin ?? null },
        transferenciaA: eA.transferencias,
        auditoriaB: eB.auditoria,
        estadisticasB: eB.estadisticas,
        lineasA: lineas(eA, /ruta|entregado/).map((x) => `${x.t} ${x.l}`),
        lineasB: lineas(eB, /relevo-pasa|tabla/).map((x) => `${x.t} ${x.l}`),
      };
      r.pasa =
        m.ok && m.confirmado && m.relevo?.neurona === "B" && recibido.length === 1 && recibido[0].etiqueta === "por relevo de Maggaboard" &&
        !!fin && fin.cifrado === "archivo" && eB.auditoria.tramasRelevadas > 0 && eB.auditoria.conMarcaEnClaro === 0;
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // Dos relevos (B rápido, D por Bluetooth); a mitad de un archivo cae B: sigue por D, sin duplicados. Cuatro neuronas.
  async "cae-b-con-d"() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C", "D"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "C");
      await red.unir("A", "D", { tipo: "ble", kbps: 600, rttMs: 60 });
      await red.unir("D", "C", { tipo: "ble", kbps: 600, rttMs: 60 });
      await espera(600);
      const rutaAntes = await red.n.get("A").page.evaluate(() => window.relevo.ruta("C"));
      const arch = await red.n.get("A").page.evaluate(() => window.relevo.archivo("C", 400_000));
      await hasta(async () => ((await red.estado("A")).transferencias[0]?.progreso ?? 0) >= 20, 30_000);
      const p0 = (await red.estado("A")).transferencias[0]?.progreso ?? 0;
      const tCorteA = await red.ms("A");
      const tCorte = Date.now();
      await red.cortar("A", "B");
      let tSigue = null;
      await hasta(async () => {
        const p = (await red.estado("A")).transferencias[0]?.progreso ?? 0;
        if (p > p0 + 1 && tSigue === null) tSigue = Date.now() - tCorte;
        return tSigue !== null;
      }, 30_000, 25);
      const m = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "SECRETO-MENSAJE durante"));
      const fin = await hasta(() => terminadoCon(red, "C", arch.sha), 90_000);
      const eA = await red.estado("A");
      const eC = await red.estado("C");
      const cambio = lineas(eA, /^ruta destino=C de=B a=D/).map((x) => ({ ms: x.t - tCorteA, l: x.l }));
      const r = {
        rutaAntes,
        cambio,
        msHastaQueSigue: tSigue,
        mensaje: m,
        terminadoEnC: fin ?? null,
        recibidosEnC: eC.recibidos.length,
        terminadosEnC: eC.terminados.filter((x) => x.sha === arch.sha).length,
        duplicadosC: eC.estadisticas?.duplicados ?? null,
      };
      r.pasa = rutaAntes?.relevo === "B" && cambio.length >= 1 && !!fin && r.terminadosEnC === 1 && m.ok && m.relevo?.neurona === "D" && eC.recibidos.length === 1;
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // Cae el único relevo a mitad: espera y reanuda (archivo y un mensaje mandado durante el corte), sin duplicados.
  async "cae-b-sin-nadie"() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "C");
      await espera(600);
      const arch = await red.n.get("A").page.evaluate(() => window.relevo.archivo("C", 400_000));
      await hasta(async () => ((await red.estado("A")).transferencias[0]?.progreso ?? 0) >= 20, 30_000);
      await red.cortar("B", "C");
      const pm = red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "SECRETO-MENSAJE en el corte"));
      await espera(8_000);
      const durante = (await red.estado("C")).recibidos.length;
      const tVuelve = Date.now();
      await red.unir("B", "C");
      const m = await pm;
      const fin = await hasta(() => terminadoCon(red, "C", arch.sha), 90_000);
      const eA = await red.estado("A");
      const eC = await red.estado("C");
      const r = {
        recibidosDuranteElCorte: durante,
        mensaje: m,
        msDesdeQueVuelveHastaFin: fin ? Date.now() - tVuelve : null,
        terminadoEnC: fin ?? null,
        terminadosEnC: eC.terminados.filter((x) => x.sha === arch.sha).length,
        recibidosEnC: eC.recibidos.length,
        lineasA: lineas(eA, /en-espera|reanuda|ruta destino=C/).map((x) => `${x.t} ${x.l}`),
      };
      r.pasa = durante === 0 && m.ok && !!fin && r.terminadosEnC === 1 && eC.recibidos.length === 1;
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // Dos relevos de distinta calidad: se toma el mejor; si el bueno se degrada mucho, se cambia (histéresis: no por poco).
  async "dos-relevos"() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C", "D"]) await red.neurona(x);
      await red.unir("A", "B", { tipo: "ble", kbps: 150, rttMs: 90 });
      await red.unir("B", "C", { tipo: "ble", kbps: 150, rttMs: 90 });
      await red.unir("A", "D");
      await red.unir("D", "C");
      await espera(600);
      const m1 = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "uno"));
      await red.degradar("A", "D", "nativo", 15_000, 12); // un poco peor: no cambia
      await espera(1_500);
      const m2 = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "dos"));
      await red.degradar("A", "D", "nativo", 40, 600); // mucho peor que B: cambia
      await espera(1_500);
      const m3 = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "tres"));
      const eA = await red.estado("A");
      const r = { m1: m1.relevo, m2: m2.relevo, m3: m3.relevo, rutas: lineas(eA, /^ruta destino=C/).map((x) => x.l) };
      r.pasa = m1.relevo?.neurona === "D" && m2.relevo?.neurona === "D" && m3.relevo?.neurona === "B" && r.rutas.some((l) => /a=B motivo=mejor/.test(l));
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // Con un archivo yendo por B aparece un carril directo A–C: el tráfico pasa a él.
  async "directo-aparece"() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "C");
      await espera(600);
      const arch = await red.n.get("A").page.evaluate(() => window.relevo.archivo("C", 400_000));
      await hasta(async () => ((await red.estado("A")).transferencias[0]?.progreso ?? 0) >= 20, 30_000);
      const porBAntes = red.tramas.get("B>C") ?? 0;
      const tA = await red.ms("A");
      await red.unir("A", "C");
      const fin = await hasta(() => terminadoCon(red, "C", arch.sha), 60_000);
      const directas = red.tramas.get("A>C") ?? 0;
      const porBDespues = (red.tramas.get("B>C") ?? 0) - porBAntes;
      const m = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "ya directo"));
      const eA = await red.estado("A");
      const cambio = lineas(eA, /^ruta destino=C de=B a=directo/).map((x) => ({ ms: x.t - tA, l: x.l }));
      const r = { cambio, tramasDirectasAC: directas, tramasPorBTrasElCambio: porBDespues, terminado: !!fin, mensaje: { relevo: m.relevo, enlace: m.enlace } };
      r.pasa = !!fin && cambio.length === 1 && directas > 10 && porBDespues < directas && m.ok && !m.relevo;
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // A–B, B–D, D–C: B no tiene carril con C (solo D). A no tiene ruta de un relevo; y si a B le llega una trama para C (una vista
  // vieja de A), B NO la pasa a D (un relevo solo entrega por carril directo): dice que no. Una trama que ya pasó por B se corta.
  async bucle() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "D", "C"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "D");
      await red.unir("D", "C");
      await espera(600);
      const antes = [...red.tramas.values()].reduce((s, x) => s + x, 0);
      const m = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "no hay ruta"));
      // Trama «de A para C» que le llega a B (como si A aún creyera que B llega a C).
      red.inyectar("A", "B", "nativo", JSON.stringify({ t: "tu.rvd", v: 1, id: "vieja-1", o: "A", d: "C", r: ["A"], ttl: 2, k: "m", p: "{}" }));
      // Trama que ya pasó por B y le vuelve desde D: se corta (bucle).
      red.inyectar("D", "B", "nativo", JSON.stringify({ t: "tu.rvd", v: 1, id: "vuelta-1", o: "A", d: "C", r: ["A", "B"], ttl: 1, k: "m", p: "{}" }));
      await espera(1_000);
      const durante = [...red.tramas.values()].reduce((s, x) => s + x, 0) - antes;
      const eB = await red.estado("B");
      const eD = await red.estado("D");
      const r = {
        mensaje: { ok: m.ok, motivo: m.motivo },
        tramasDurante: durante,
        porBHaciaD: red.tramas.get("B>D") ?? 0,
        relevadasB: eB.estadisticas?.relevadas,
        relevadasD: eD.estadisticas?.relevadas,
        negativasB: eB.estadisticas?.negativasDadas,
        buclesCortadosB: eB.estadisticas?.bucles,
        lineasB: eB.lineas.filter((x) => /no-relevo|bucle/.test(x.l)).map((x) => x.l),
      };
      r.pasa = !m.ok && eB.estadisticas?.relevadas === 0 && eD.estadisticas?.relevadas === 0 && eB.estadisticas?.negativasDadas === 1 && eB.estadisticas?.bucles === 1 && durante < 40;
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // B dice que no (tope de batería) aunque su anuncio aún dijera que sí: negativa, veto y el mensaje va por D.
  async declina() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C", "D"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "C");
      await red.unir("A", "D", { tipo: "ble", kbps: 400, rttMs: 60 });
      await red.unir("D", "C", { tipo: "ble", kbps: 400, rttMs: 60 });
      await espera(600);
      await red.n.get("B").page.evaluate(() => window.relevo.releva(false, "batería por debajo del 30 %"));
      const m = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "por D"));
      await espera(11_000); // el siguiente anuncio de B ya dice «no releva»
      const ruta = await red.n.get("A").page.evaluate(() => window.relevo.ruta("C"));
      const eA = await red.estado("A");
      const eB = await red.estado("B");
      const r = { mensaje: m.relevo, negativasB: eB.estadisticas?.negativasDadas, rutaTrasAnuncio: ruta, lineasA: lineas(eA, /veto|no-releva|ruta destino=C/).map((x) => x.l) };
      r.pasa = m.ok && m.relevo?.neurona === "D" && eB.estadisticas?.negativasDadas >= 1 && ruta?.relevo === "D" && eA.lineas.some((x) => /tabla B no-releva/.test(x.l));
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // Un par con el código de antes (main de la prueba 36): el directo sigue igual en los dos sentidos, nunca es relevo ni destino.
  async vieja() {
    const red = new Red();
    try {
      await red.neurona("A");
      const V = await red.neurona("V", "vieja", "viejo");
      await red.neurona("C");
      await red.unir("A", "V");
      await red.unir("V", "C");
      await espera(1_500);
      const ida = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("V", "hola vieja"));
      const vuelta = await V.page.evaluate(() => window.relevo.mensaje("A", "hola nueva"));
      const aC = await red.n.get("A").page.evaluate(() => window.relevo.mensaje("C", "por la vieja no"));
      const eV = await red.estado("V");
      const eA = await red.estado("A");
      const r = { arbolV: V.conRelevo, ida: { ok: ida.ok, enlace: ida.enlace?.id }, vuelta: { ok: vuelta.ok, enlace: vuelta.enlace?.id }, recibidosV: eV.recibidos.length, recibidosA: eA.recibidos.length, aC: { ok: aC.ok, motivo: aC.motivo }, destinosA: eA.destinos };
      r.pasa = V.conRelevo === false && ida.ok && vuelta.ok && eV.recibidos.length === 1 && eA.recibidos.length === 1 && !aC.ok && !eA.destinos.includes("C");
      return r;
    } finally {
      await red.cerrar();
    }
  },
  // La señalización real de llamadas (canal-enlace-transporte) de A a C por B: la presencia de cada uno llega al otro.
  async timbre() {
    const red = new Red();
    try {
      for (const x of ["A", "B", "C"]) await red.neurona(x);
      await red.unir("A", "B");
      await red.unir("B", "C", { tipo: "ble", kbps: 200, rttMs: 80 });
      await espera(600);
      const tA = Date.now();
      await red.n.get("A").page.evaluate(() => window.relevo.llamar("C", "sesion-1"));
      await red.n.get("C").page.evaluate(() => window.relevo.llamar("A", "sesion-1"));
      const enC = await hasta(async () => (await red.estado("C")).presencias.some((p) => p.ids.some((i) => i.endsWith(":A"))), 15_000);
      const msC = Date.now() - tA;
      const enA = await hasta(async () => (await red.estado("A")).presencias.some((p) => p.ids.some((i) => i.endsWith(":C"))), 15_000);
      const eC = await red.estado("C");
      const r = { presenciaDeAEnC: !!enC, presenciaDeCEnA: !!enA, msHastaQueSuenaEnC: enC ? msC : null, origenEnC: eC.recibidos.length };
      r.pasa = !!enC && !!enA;
      return r;
    } finally {
      await red.cerrar();
    }
  },
};

const lista = caso === "todos" ? Object.keys(casos) : caso.split(",");
const out = {};
for (const c of lista) {
  const t = Date.now();
  try {
    out[c] = await casos[c]();
  } catch (e) {
    out[c] = { pasa: false, error: String(e?.stack ?? e) };
  }
  out[c].segundos = Math.round((Date.now() - t) / 100) / 10;
  console.error(`${c}: ${out[c].pasa ? "PASA" : "FALLA"} (${out[c].segundos} s)`);
}
console.log(JSON.stringify(out, null, 2));
await nav.close();
srv.close();
