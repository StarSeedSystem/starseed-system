#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Canales de actualización por sistema (2026-10-09)
// ---------------------------------------------------------------------------
// QUÉ: a partir del `latest.json` que sube tauri-action para StarSeed OS, crea
// `latest-nexus.json` y `latest-cafe.json` en el MISMO Release, con las URLs y
// las firmas (.sig) de los instaladores de Nexus y de Café.
//
// POR QUÉ: los tres sistemas comparten binario y Release. tauri-action solo sabe
// escribir un `latest.json`, y antes los tres se lo pisaban; luego se dejó solo
// el del OS, y Nexus/Café se quedaron sin poder actualizarse (si lo hubieran
// hecho con el canal del OS, se habrían convertido en StarSeed OS).
//
// CÓMO: lee el Release de la etiqueta (también en borrador), descarga
// `latest.json`, cambia en cada plataforma el nombre del archivo del OS por el
// del sistema (StarSeed.OS_… → StarSeed.Nexus_…), lee su `.sig` real y sube el
// resultado. Si falta un instalador o su firma, falla y dice cuál: un canal con
// un hueco haría que esa plataforma no se actualizara sin que nadie lo viera.
//
// Uso (CI): GITHUB_TOKEN=… REPO=owner/repo TAG=v0.3.0 node canales-updater.mjs
// ═══════════════════════════════════════════════════════════════════════════

const API = "https://api.github.com";
const { GITHUB_TOKEN, REPO, TAG } = process.env;
const SISTEMAS = { nexus: "StarSeed.Nexus", cafe: "StarSeed.Cafe" };
const PREFIJO_OS = "StarSeed.OS";

/** PURA. Nombre del archivo del OS → nombre del mismo archivo para otro sistema. */
export function nombreParaSistema(nombreOS, prefijoSistema) {
  if (!nombreOS.startsWith(PREFIJO_OS)) return null;
  const resto = nombreOS.slice(PREFIJO_OS.length);
  if (!/^[_-]/.test(resto)) return null;
  return prefijoSistema + resto;
}

/** PURA. Construye el manifiesto de un sistema a partir del del OS. */
export function manifiestoParaSistema(latestOS, prefijoSistema, firmas, base, notas) {
  const faltan = [];
  const platforms = {};
  for (const [clave, p] of Object.entries(latestOS.platforms || {})) {
    const nombreOS = decodeURIComponent(String(p.url).split("/").pop() || "");
    const nombre = nombreParaSistema(nombreOS, prefijoSistema);
    const firma = nombre ? firmas[nombre] : undefined;
    if (!nombre || !firma) {
      faltan.push(`${clave}: ${nombre || nombreOS}`);
      continue;
    }
    platforms[clave] = { signature: firma, url: `${base}/${encodeURIComponent(nombre)}` };
  }
  return { faltan, manifiesto: { version: latestOS.version, notes: notas, pub_date: latestOS.pub_date, platforms } };
}

async function gh(ruta, opciones = {}) {
  const r = await fetch(ruta.startsWith("http") ? ruta : `${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
      ...(opciones.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${opciones.method || "GET"} ${ruta} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function contenidoAsset(asset) {
  const r = await gh(`/repos/${REPO}/releases/assets/${asset.id}`, { headers: { Accept: "application/octet-stream" } });
  return (await r.text()).trim();
}

async function main() {
  if (!GITHUB_TOKEN || !REPO || !TAG) throw new Error("Faltan GITHUB_TOKEN, REPO o TAG");
  // /releases/tags/{tag} no ve los borradores: se busca en la lista (con token sí salen).
  const lista = await (await gh(`/repos/${REPO}/releases?per_page=50`)).json();
  const release = lista.find((r) => r.tag_name === TAG);
  if (!release) throw new Error(`No hay Release con la etiqueta ${TAG}`);
  const assets = Object.fromEntries(release.assets.map((a) => [a.name, a]));
  if (!assets["latest.json"]) throw new Error("El Release no tiene latest.json (¿falló el job del OS?)");
  const latestOS = JSON.parse(await contenidoAsset(assets["latest.json"]));

  const base = `https://github.com/${REPO}/releases/download/${TAG}`;
  let fallos = 0;
  for (const [sistema, prefijo] of Object.entries(SISTEMAS)) {
    const firmas = {};
    for (const nombre of Object.keys(assets)) {
      if (nombre.startsWith(prefijo) && nombre.endsWith(".sig")) {
        firmas[nombre.slice(0, -4)] = await contenidoAsset(assets[nombre]);
      }
    }
    const notas = `${prefijo.replace(".", " ")} ${latestOS.version}`;
    const { faltan, manifiesto } = manifiestoParaSistema(latestOS, prefijo, firmas, base, notas);
    if (faltan.length) {
      console.error(`✗ ${sistema}: faltan instaladores o firmas → ${faltan.join(" · ")}`);
      fallos++;
      continue;
    }
    const nombre = `latest-${sistema}.json`;
    if (process.env.SECO === "1") {
      // Ensayo: no sube nada, solo enseña qué subiría.
      console.log(`(seco) ${nombre}: ${Object.entries(manifiesto.platforms).map(([k, p]) => `${k} → ${decodeURIComponent(p.url.split("/").pop())} [firma ${p.signature.length} c]`).join(" · ")}`);
      continue;
    }
    if (assets[nombre]) await gh(`/repos/${REPO}/releases/assets/${assets[nombre].id}`, { method: "DELETE" });
    const subida = release.upload_url.replace(/\{.*\}$/, `?name=${nombre}`);
    await gh(subida, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manifiesto, null, 2) });
    console.log(`✓ ${nombre}: ${Object.keys(manifiesto.platforms).length} plataformas (${Object.keys(manifiesto.platforms).join(", ")})`);
  }
  if (fallos) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
