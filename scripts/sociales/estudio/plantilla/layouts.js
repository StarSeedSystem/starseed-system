/*
 * layouts.js — la capa de texto del Estudio MetaGeminis (DOM, no WebGL: nítida a cualquier tamaño).
 *
 * Un «beat» es un bloque de texto con tiempo: { t, d, kicker, titular, sub, cuerpo, lista[], cta, url, sello, acento, ancla, fin }.
 * Los vídeos encadenan beats (tipografía cinética); los estáticos muestran uno solo en su estado final.
 * Cada tamaño sale de la zona segura del formato (márgenes de interfaz de cada medio), y cada beat se ajusta solo:
 * si no cabe, baja la escala hasta que quepa sin cortar ni una palabra.
 *
 * Marcado: *palabra* se pinta con el color de acento del beat. data-capa marca lo que mide verificar.py.
 */

export const TEXTO = { zenith: "#5AA9FF", horizonte: "#10B981", logica: "#FFBF00", anchor: "#FF6B86", nieve: "#F8F9FA" };
export const MARCA = { zenith: "#007FFF", horizonte: "#10B981", logica: "#FFBF00", anchor: "#DC143C", nieve: "#F8F9FA" };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const outBack = (x) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function el(tag, cls, padre, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

const FLECHA = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M4.5 12h14M13 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Divide el texto en palabras; *…* marca acento. Devuelve la lista de spans .w. */
function palabras(cont, texto, colorAcento) {
  const out = [];
  const partes = String(texto).split("*");
  partes.forEach((trozo, i) => {
    const acento = i % 2 === 1;
    let toks = trozo.split(/\s+/).filter(Boolean);
    // Puntuación pegada a la palabra anterior («*social*, abierto»): se funde con esa palabra para que nunca quede sola al inicio de línea.
    if (i > 0 && out.length && toks.length && /^[,.;:!?)»”]/.test(trozo)) {
      const m = /^([,.;:!?)»”]+)(.*)$/.exec(toks[0]);
      if (m) {
        if (cont.lastChild && cont.lastChild.nodeType === 3) cont.removeChild(cont.lastChild);
        out[out.length - 1].textContent += m[1];
        toks = m[2] ? [m[2], ...toks.slice(1)] : toks.slice(1);
        if (!m[2]) cont.appendChild(document.createTextNode(" "));
      }
    }
    toks.forEach((p) => {
      const w = el("span", "w" + (acento ? " ac" : ""), cont, p);
      if (acento) w.style.color = colorAcento;
      out.push(w);
      cont.appendChild(document.createTextNode(" "));
    });
  });
  return out;
}

function qrSvg(matriz) {
  const n = matriz.length;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (matriz[y][x]) { let l = 1; while (x + l < n && matriz[y][x + l]) l++; d += `M${x} ${y}h${l}v1h-${l}z`; x += l; } else x++;
    }
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="Código QR hacia la web de StarSeed"><path d="${d}" fill="#050b18"/></svg>`;
}

function sello(padre, simbolo, tam) {
  const s = el("div", "sello", padre);
  s.style.width = s.style.height = tam + "px";
  const img = el("img", "", s);
  img.src = simbolo.src;
  img.alt = "Símbolo de StarSeed";
  return s;
}

function tipografia(cfg, aw, ah) {
  const base = Math.min(aw, ah * 0.95);
  const rel = { kicker: 0.031, titular: 0.155, sub: 0.04, cuerpo: 0.036, item: 0.082, cta: 0.042, url: 0.034, aviso: 0.026, marca: 0.095 };
  const out = {};
  for (const k of Object.keys(rel)) out[k] = rel[k] * base;
  Object.assign(out, cfg.tipografia || {});
  out.base = base;
  return out;
}

/** Zona segura y zonas a evitar, dibujadas encima (solo con depurar=true). */
function dibujarDepuracion(cfg, A) {
  const d = document.getElementById("depurar");
  d.innerHTML = "";
  const zs = el("div", "zona-segura", d);
  Object.assign(zs.style, { left: A.x + "px", top: A.y + "px", width: A.ancho + "px", height: A.alto + "px" });
  (cfg.formato.evitar || []).forEach((z) => {
    const e = el("div", "zona-evitar", d);
    Object.assign(e.style, { left: z.izquierda + "px", top: z.arriba + "px", width: z.ancho + "px", height: z.alto + "px" });
  });
}

function rectsDeTexto(e, org) {
  const palabrasEl = e.querySelectorAll(".w");
  const fuentes = palabrasEl.length ? [...palabrasEl] : [e];
  const lineas = [];
  fuentes.forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const x = r.left - org.left, y = r.top - org.top;
    const l = lineas.find((q) => Math.abs(q[1] - y) < r.height * 0.4);
    if (l) { const x2 = Math.max(l[0] + l[2], x + r.width); l[0] = Math.min(l[0], x); l[2] = x2 - l[0]; l[3] = Math.max(l[3], r.height); }
    else lineas.push([x, y, r.width, r.height]);
  });
  return lineas;
}

/** Tramo de degradado con smoothstep (n paradas): un quiebre de pendiente en un degradado lineal se ve como una banda horizontal. */
function tramoVelo(x0, a0, x1, a1, n) {
  return Array.from({ length: n + 1 }, (_, k) => { const u = k / n, e = u * u * (3 - 2 * u); return `rgba(2,6,16,${(a0 + (a1 - a0) * e).toFixed(3)}) ${(x0 + (x1 - x0) * u).toFixed(2)}%`; });
}

function capasVisibles(raiz) {
  const org = raiz.getBoundingClientRect();
  const out = [];
  raiz.querySelectorAll("[data-capa], .ac").forEach((e) => {
    const cs = getComputedStyle(e);
    let n = e, op = 1, oculto = false;
    while (n && n !== raiz) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden") oculto = true; op *= parseFloat(s.opacity); n = n.parentElement; }
    if (oculto || op < 0.5) return;
    const rects = rectsDeTexto(e, org);
    if (!rects.length) return;
    out.push({
      id: e.dataset.capa || "acento", rol: e.dataset.rol || (e.classList.contains("ac") ? "acento" : "texto"),
      texto: (e.textContent || "").trim().slice(0, 120), rects, color: cs.color, tam: parseFloat(cs.fontSize), peso: cs.fontWeight,
    });
  });
  return out;
}

// ───────────────────────── beats (vídeo y estáticos) ─────────────────────────

function crearBeat(b, cfg, seguro, T, A) {
  const ancla = b.ancla || cfg.ancla || "centro";
  const anchoTexto = (b.ancho_texto || cfg.ancho_texto || 1) * A.ancho;
  const raiz = el("div", `beat ${ancla}${b.vertical ? " " + b.vertical : ""}`, seguro);
  raiz.style.display = "none";
  const col = el("div", "col", raiz);
  col.style.maxWidth = anchoTexto + "px";
  if (b.fila) { col.style.flexDirection = "row"; col.style.alignItems = "center"; col.style.gap = (b.fila_gap || 0.02) * A.ancho + "px"; col.style.flexWrap = "nowrap"; }
  const acentoTxt = TEXTO[b.acento || "zenith"];
  const acentoMarca = MARCA[b.acento || "zenith"];
  const partes = [];
  const add = (nodo, tipo, extra = {}) => partes.push({ nodo, tipo, ...extra });

  if (b.sello) { const s = sello(col, cfg._simbolo, 1); s.dataset.sello = "1"; add(s, "sello"); }
  if (b.kicker) { const k = el("div", "kicker", col); k.dataset.capa = "kicker"; k.dataset.rol = "kicker"; k.style.color = acentoTxt; add(k, "texto", { ws: palabras(k, b.kicker, acentoTxt) }); }
  if (b.titular) { const h = el("div", "titulo", col); h.dataset.capa = "titular"; h.dataset.rol = "titular"; h.style.color = TEXTO.nieve; h.style.textWrap = "balance"; add(h, "texto", { ws: palabras(h, b.titular, acentoTxt) }); }
  if (b.sub) { const s = el("div", "sub", col); s.dataset.capa = "sub"; s.dataset.rol = "sub"; s.style.textWrap = "balance"; add(s, "texto", { ws: palabras(s, b.sub, acentoTxt) }); }
  if (b.cuerpo) { const s = el("div", "cuerpo", col); s.dataset.capa = "cuerpo"; s.dataset.rol = "cuerpo"; s.style.textWrap = "balance"; add(s, "texto", { ws: palabras(s, b.cuerpo, acentoTxt) }); }
  if (b.lista) {
    const l = el("div", "lista", col);
    b.lista.forEach((it, i) => {
      const item = typeof it === "string" ? { texto: it } : it;
      const fila = el("div", "item", l);
      const barra = el("i", "", fila);
      barra.style.background = MARCA[item.color || b.acento || "zenith"];
      barra.style.boxShadow = `0 0 18px ${MARCA[item.color || b.acento || "zenith"]}`;
      const tx = el("span", "", fila);
      tx.dataset.capa = "item" + i; tx.dataset.rol = "item";
      tx.style.color = TEXTO[item.color || b.acento || "zenith"];
      tx.textContent = item.texto;
      add(fila, "item", { rel: item.t === undefined ? i * (b.lista_paso || 0.9) : item.t, barra, tx });
    });
  }
  if (b.cta) { const p = el("div", "pildora", col); p.dataset.rol = "cta"; const tx = el("span", "", p, b.cta); tx.dataset.capa = "cta"; tx.dataset.rol = "cta"; const ic = el("span", "", p); ic.innerHTML = FLECHA; ic.style.display = "inline-flex"; add(p, "cta", { tx, ic }); }
  if (b.url) { const u = el("div", "url", col, b.url); u.dataset.capa = "url"; u.dataset.rol = "url"; add(u, "texto", { ws: [] }); }
  if (b.aviso) { const a = el("div", "aviso", col, b.aviso); a.dataset.capa = "aviso"; a.dataset.rol = "aviso"; add(a, "texto", { ws: [] }); }

  function estilos(f) {
    const px = (k) => (T[k] * f);
    partes.forEach((p) => {
      const n = p.nodo;
      if (p.tipo === "sello") { n.style.width = n.style.height = px("base") * 0.2 + "px"; n.style.marginBottom = px("base") * 0.05 + "px"; }
      else if (n.classList.contains("kicker")) { n.style.fontSize = px("kicker") + "px"; n.style.marginBottom = px("kicker") * 0.7 + "px"; }
      else if (n.classList.contains("titulo")) { n.style.fontSize = px("titular") + "px"; n.style.marginBottom = px("titular") * 0.16 + "px"; }
      else if (n.classList.contains("sub")) { n.style.fontSize = px("sub") + "px"; n.style.marginTop = px("sub") * 0.2 + "px"; n.style.marginBottom = px("sub") * 0.35 + "px"; }
      else if (n.classList.contains("cuerpo")) { n.style.fontSize = px("cuerpo") + "px"; n.style.marginTop = px("cuerpo") * 0.25 + "px"; }
      else if (n.classList.contains("lista")) { n.style.gap = px("item") * 0.34 + "px"; n.style.margin = px("item") * 0.12 + "px 0"; }
      else if (n.classList.contains("item")) { n.style.fontSize = px("item") + "px"; p.barra.style.width = px("item") * 0.16 + "px"; p.barra.style.height = px("item") * 0.82 + "px"; p.barra.style.marginRight = px("item") * 0.3 + "px"; }
      else if (n.classList.contains("pildora")) { n.style.fontSize = px("cta") + "px"; n.style.padding = `${px("cta") * 0.46}px ${px("cta") * 1.0}px`; n.style.gap = px("cta") * 0.45 + "px"; n.style.marginTop = px("cta") * 0.55 + "px"; }
      else if (n.classList.contains("url")) { n.style.fontSize = px("url") + "px"; n.style.marginTop = px("url") * 0.55 + "px"; }
      else if (n.classList.contains("aviso")) { n.style.fontSize = px("aviso") + "px"; n.style.marginTop = px("aviso") * 0.9 + "px"; }
    });
    col.querySelectorAll(".lista").forEach((l) => { l.style.gap = px("item") * 0.34 + "px"; });
  }

  // Ajuste: baja la escala hasta que el bloque quepa en la zona segura y ninguna palabra desborde.
  raiz.style.display = "flex";
  let f = b.escala || 1;
  for (let i = 0; i < 30; i++) {
    estilos(f);
    const alto = col.getBoundingClientRect().height;
    const desborda = [...col.querySelectorAll(".w")].some((w) => w.offsetWidth > anchoTexto + 1) || col.scrollWidth > anchoTexto + 1;
    if (alto <= A.alto * 0.98 && !desborda) break;
    f *= 0.95;
  }
  raiz.style.display = "none";
  return { raiz, col, partes, b, f, acentoMarca };
}

function actualizarBeat(bt, t, sinTexto, cfg) {
  const b = bt.b;
  const t0 = b.t || 0;
  const fin = !!b.fin;
  const t1 = fin ? Infinity : t0 + (b.d || 2);
  const dentro = t >= t0 - 1e-6 && t <= t1 + 1e-6;
  bt.raiz.style.display = dentro ? "flex" : "none";
  if (!dentro) return;
  const din = b.entrada || 0.6, dout = fin ? 0 : (b.salida || 0.4);
  const q = dout ? clamp01((t - (t1 - dout)) / dout) : 0;
  const fuera = outCubic(q);
  const modo = b.efecto || "palabras";
  bt.partes.forEach((p, j) => {
    const off = j * 0.11;
    const rel = (p.rel || 0);
    const pi = clamp01((t - t0 - off - rel) / din);
    const e = outCubic(pi);
    const n = p.nodo;
    if (p.tipo === "texto" && modo === "palabras" && p.ws && p.ws.length) {
      const f = p.nodo.style.fontSize ? parseFloat(p.nodo.style.fontSize) : 32;
      p.ws.forEach((w, i) => {
        const wi = clamp01((t - t0 - off - i * 0.07) / din);
        const we = outBack(wi);
        w.style.opacity = String(clamp01(wi * 1.6) * (1 - fuera));
        w.style.transform = `translateY(${(1 - we) * f * 0.55 - fuera * f * 0.25}px) scale(${0.94 + 0.06 * clamp01(we)})`;
        w.style.filter = wi < 1 || fuera > 0 ? `blur(${(1 - wi) * f * 0.12 + fuera * f * 0.08}px)` : "none";
      });
      n.style.opacity = "1"; n.style.transform = "none";
    } else {
      const f = 40;
      n.style.opacity = String(e * (1 - fuera));
      n.style.transform = `translateY(${(1 - e) * f * 0.6 - fuera * f * 0.3}px) scale(${p.tipo === "sello" || p.tipo === "cta" ? 0.9 + 0.1 * outBack(pi) : 1})`;
      if (p.tipo === "texto" && p.ws) p.ws.forEach((w) => { w.style.opacity = "1"; w.style.transform = "none"; w.style.filter = "none"; });
    }
  });
}

export function montarLayout(cfg, seguro, simbolo) {
  cfg._simbolo = simbolo;
  const m = cfg.formato.margenes;
  const A = { x: m.izquierda, y: m.arriba, ancho: cfg.formato.ancho - m.izquierda - m.derecha, alto: cfg.formato.alto - m.arriba - m.abajo };
  Object.assign(seguro.style, { left: A.x + "px", top: A.y + "px", width: A.ancho + "px", height: A.alto + "px" });
  const raiz = document.getElementById("raiz");
  if (cfg.depurar) dibujarDepuracion(cfg, A);
  const T = tipografia(cfg, A.ancho, A.alto);
  if (cfg.layout === "lamina") return montarLamina(cfg, seguro, simbolo, A, T, raiz);

  // Marca arriba (o donde diga el formato)
  const posMarca = cfg.marca_pos || "arriba-izq";
  let marcaEl = null;
  if (posMarca !== "oculta") {
    marcaEl = el("div", "marca", seguro);
    const tam = T.marca;
    sello(marcaEl, simbolo, tam);
    const nombre = el("span", "nombre", marcaEl, cfg.marca.nombre || "StarSeed");
    nombre.style.fontSize = tam * 0.5 + "px";
    nombre.style.marginLeft = tam * 0.28 + "px";
    nombre.dataset.capa = "marca"; nombre.dataset.rol = "marca";
    if (cfg.marca_sin_nombre) nombre.style.display = "none";
    if (posMarca === "arriba-izq") { marcaEl.style.left = "0px"; marcaEl.style.top = "0px"; }
    else if (posMarca === "arriba-centro") { marcaEl.style.left = "50%"; marcaEl.style.top = "0px"; marcaEl.style.transform = "translateX(-50%)"; }
    else if (posMarca === "abajo-izq") { marcaEl.style.left = "0px"; marcaEl.style.bottom = "0px"; }
  }
  // Pie: URL y aviso de IA durante todo el vídeo si el beat final no los trae
  let pie = null;
  if (cfg.pie) {
    pie = el("div", "pie", seguro);
    const u = el("div", "url", pie, cfg.pie.url || ""); u.dataset.capa = "pie-url"; u.dataset.rol = "url"; u.style.fontSize = T.url * 0.8 + "px";
    if (cfg.pie.aviso) { const a = el("div", "aviso", pie, cfg.pie.aviso); a.dataset.capa = "pie-aviso"; a.dataset.rol = "aviso"; a.style.fontSize = T.aviso + "px"; a.style.textAlign = "right"; a.style.maxWidth = A.ancho * 0.55 + "px"; }
  }
  const beats = (cfg.textos || []).map((b) => crearBeat(b, cfg, seguro, T, A));
  const velo = cfg.velo || "radial-gradient(ellipse 85% 70% at 50% 50%, rgba(2,6,16,0.0) 0%, rgba(2,6,16,0.0) 45%, rgba(2,6,16,0.55) 100%), linear-gradient(180deg, " + [...tramoVelo(10, 0, 31, 0.46, 9), ...tramoVelo(31, 0.46, 55, 0.46, 1), ...tramoVelo(55, 0.46, 76, 0, 9)].join(", ") + ")";

  return {
    velo,
    actualizar(t, o) {
      raiz.classList.toggle("sin-texto", !!o.sinTexto);
      if (marcaEl) {
        const p = clamp01((t - 0.1) / 0.8);
        // Cuando el cierre trae el sello grande, la marca de la esquina cede su sitio (no pueden convivir: son el mismo símbolo).
        const cierre = beats.find((bt) => bt.b.sello && bt.b.fin);
        const cede = cierre ? outCubic(clamp01((t - (cierre.b.t || 0) + 0.15) / 0.35)) : 0;
        marcaEl.style.opacity = String((cfg.modo === "estatico" ? 1 : outCubic(p)) * (1 - cede));
      }
      if (pie) pie.style.opacity = String(clamp01((t - (cfg.pie.t || 0)) / 0.6));
      beats.forEach((bt) => actualizarBeat(bt, t, !!o.sinTexto, cfg));
    },
    capas() { return capasVisibles(raiz); },
    seguro: A,
  };
}

// ───────────────────────── láminas (carrusel) y cartel ─────────────────────────

function montarLamina(cfg, seguro, simbolo, A, T, raiz) {
  const b = (cfg.textos && cfg.textos[0]) || {};
  const acentoTxt = TEXTO[b.acento || "zenith"];
  const cont = el("div", "lamina", seguro);
  const u = A.ancho; // unidad: ancho de la zona segura
  let hueco = null;

  function construir(R) {
    cont.innerHTML = "";
    const sup = el("div", "fila-sup", cont);
    const marcaEl = el("div", "", sup);
    marcaEl.style.display = "flex"; marcaEl.style.alignItems = "center";
    sello(marcaEl, simbolo, u * 0.1 * R);
    const nombre = el("span", "nombre", marcaEl, cfg.marca.nombre || "StarSeed");
    Object.assign(nombre.style, { fontFamily: "Rajdhani", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", fontSize: u * 0.05 * R + "px", marginLeft: u * 0.03 * R + "px", textShadow: "0 2px 12px rgba(2,6,23,0.85)" });
    nombre.dataset.capa = "marca"; nombre.dataset.rol = "marca";
    if (b.numero) {
      const n = el("div", "num", sup, b.numero);
      Object.assign(n.style, { fontSize: u * 0.04 * R + "px", padding: `${u * 0.012 * R}px ${u * 0.035 * R}px` });
      n.dataset.capa = "numero"; n.dataset.rol = "numero";
    }
    hueco = el("div", "", cont);
    hueco.style.flex = String(b.hueco === undefined ? 1 : b.hueco);
    const bloque = el("div", "", cont);
    bloque.style.display = "flex"; bloque.style.flexDirection = "column"; bloque.style.gap = u * 0.03 * R + "px";
    if (b.ancho_bloque) bloque.style.maxWidth = b.ancho_bloque * u + "px";
    if (b.kicker) { const k = el("div", "kicker", bloque); k.dataset.capa = "kicker"; k.dataset.rol = "kicker"; k.style.color = acentoTxt; k.style.fontSize = u * 0.031 * R + "px"; k.textContent = b.kicker; }
    if (b.titular) { const h = el("div", "titulo", bloque); h.dataset.capa = "titular"; h.dataset.rol = "titular"; h.style.color = TEXTO.nieve; h.style.fontSize = u * (b.tam_titular || 0.12) * R + "px"; h.style.textWrap = "balance"; palabras(h, b.titular, acentoTxt); }
    if (b.cuerpo) { const c = el("div", "cuerpo", bloque); c.dataset.capa = "cuerpo"; c.dataset.rol = "cuerpo"; c.style.fontSize = u * 0.037 * R + "px"; c.style.textWrap = "pretty"; c.style.maxWidth = (b.ancho_cuerpo || 0.92) * u + "px"; palabras(c, b.cuerpo, acentoTxt); }
    if (b.tarjetas) {
      const tj = el("div", "tarjetas", bloque);
      tj.style.gridTemplateColumns = `repeat(${b.columnas || 1}, 1fr)`;
      tj.style.gap = u * 0.025 * R + "px";
      b.tarjetas.forEach((c, i) => {
        const card = el("div", "tarjeta", tj);
        card.style.setProperty("--c", MARCA[c.color || "zenith"]);
        card.style.padding = `${u * 0.03 * R}px ${u * 0.035 * R}px ${u * 0.03 * R}px ${u * 0.05 * R}px`;
        const h = el("h3", "", card, c.titulo); h.style.fontSize = u * (b.tam_tarjeta || 0.058) * R + "px"; h.style.color = TEXTO[c.color || "zenith"]; h.dataset.capa = "tarjeta" + i; h.dataset.rol = "tarjeta-titulo";
        if (c.texto) { const p = el("p", "", card, c.texto); p.style.fontSize = u * 0.034 * R + "px"; p.style.marginTop = u * 0.012 * R + "px"; p.dataset.capa = "tarjeta-texto" + i; p.dataset.rol = "tarjeta-texto"; }
      });
    }
    const pildora = (padre, texto, tam, relleno) => {
      const p = el("div", "pildora", padre);
      p.style.fontSize = u * tam * R + "px"; p.style.padding = `${u * relleno * 0.5 * R}px ${u * relleno * R}px`; p.style.gap = u * 0.02 * R + "px"; p.style.alignSelf = "flex-start";
      const tx = el("span", "", p, texto); tx.dataset.capa = "cta"; tx.dataset.rol = "cta";
      const ic = el("span", "", p); ic.innerHTML = FLECHA; ic.style.display = "inline-flex";
      return p;
    };
    if (b.qr && cfg.qr) {
      const fila = el("div", "", bloque);
      fila.style.display = "flex"; fila.style.alignItems = "center"; fila.style.gap = u * 0.04 * R + "px";
      const q = el("div", "qr", fila);
      const qt = u * (b.qr_tam || 0.28) * R;
      q.style.width = q.style.height = qt + "px";
      q.innerHTML = qrSvg(cfg.qr.matriz);
      const lado = el("div", "", fila);
      lado.style.display = "flex"; lado.style.flexDirection = "column"; lado.style.gap = u * 0.02 * R + "px";
      if (b.qr_texto) { const t1 = el("div", "sub", lado); t1.dataset.capa = "qr-texto"; t1.dataset.rol = "sub"; t1.style.fontSize = u * 0.04 * R + "px"; t1.style.color = TEXTO.nieve; palabras(t1, b.qr_texto, acentoTxt); }
      if (b.cta) pildora(lado, b.cta, 0.04, 0.08);
    } else if (b.cta) pildora(bloque, b.cta, 0.042, 0.084);
    const pie = el("div", "", cont);
    Object.assign(pie.style, { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: u * 0.03 * R + "px", gap: u * 0.03 * R + "px" });
    const sinUrl = b.pie === "" || (b.cta && b.cta === cfg.marca.url && !b.pie);
    if (sinUrl) pie.style.justifyContent = "flex-end";
    if (!sinUrl) { const url = el("div", "url", pie, b.pie || cfg.marca.url); url.dataset.capa = "url"; url.dataset.rol = "url"; url.style.fontSize = u * 0.034 * R + "px"; }
    if (b.pie_derecha) { const d = el("div", "aviso", pie); d.dataset.capa = "aviso"; d.dataset.rol = "aviso"; d.style.fontSize = u * 0.027 * R + "px"; d.style.textAlign = "right"; d.style.maxWidth = u * 0.5 + "px"; d.textContent = b.pie_derecha; }
    if (b.desliza) {
      const s = el("div", "pildora", pie); s.style.fontSize = u * 0.034 * R + "px"; s.style.padding = `${u * 0.014 * R}px ${u * 0.03 * R}px`; s.style.gap = u * 0.015 * R + "px";
      s.style.background = "rgba(248,249,250,0.14)"; s.style.color = "#f8f9fa"; s.style.boxShadow = "inset 0 0 0 1.5px rgba(248,249,250,0.55)";
      const tx = el("span", "", s, b.desliza); tx.dataset.capa = "desliza"; tx.dataset.rol = "cta"; tx.style.color = "#f8f9fa";
      const ic = el("span", "", s); ic.innerHTML = FLECHA; ic.style.display = "inline-flex";
    }
  }

  let R = cfg.escala_lamina || 1;
  const huecoMin = A.alto * (b.hueco_min === undefined ? 0.12 : b.hueco_min);
  for (let i = 0; i < 30; i++) {
    construir(R);
    const desborda = cont.scrollHeight > cont.clientHeight + 1 || hueco.offsetHeight < huecoMin;
    if (!desborda) break;
    R *= 0.95;
  }
  // Velo a medida: oscurece justo detrás del bloque de texto (donde empieza el kicker) y deja respirar la escena arriba.
  const org = raiz.getBoundingClientRect();
  const bl = cont.querySelector(".kicker, .titulo");
  const tope = bl ? (bl.getBoundingClientRect().top - org.top) / org.height : 0.5;
  const p0 = Math.max(4, tope * 100 - 16), p1 = Math.max(p0 + 5, tope * 100 - 1.5);
  // Tramos suavizados (smoothstep): un quiebre de pendiente en el degradado se ve como una banda horizontal.
  const tramo = (x0, a0, x1, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const u = k / n, e = u * u * (3 - 2 * u); return `rgba(2,6,16,${(a0 + (a1 - a0) * e).toFixed(3)}) ${(x0 + (x1 - x0) * u).toFixed(2)}%`; });
  const pTop = Math.min(p0 * 0.5, 12);
  const velo = cfg.velo || `linear-gradient(180deg, ${[...tramo(0, 0.5, pTop, 0.07, 6), ...tramo(pTop, 0.07, p0, 0.12, 4), ...tramo(p0, 0.12, p1, 0.66, 10), ...tramo(p1, 0.66, 100, 0.82, 6)].join(", ")})`;
  return {
    velo,
    actualizar(t, o) { raiz.classList.toggle("sin-texto", !!o.sinTexto); },
    capas() { return capasVisibles(raiz); },
    seguro: A,
    escala: R,
  };
}
