import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ConstructorArbol,
  TAM_HOJA,
  aHex,
  arbolDeBytes,
  elegirTamanoPieza,
  formatearIman,
  geometria,
  hashPieza,
  longitudPieza,
  parsearIman,
  pruebaDeNodo,
  rangoConPrueba,
  raizDesdeCapa,
  verificarCapa,
  verificarPrueba,
  verificarRango,
  validarUrlEspejo,
  ipv4NoPublica,
  semillaDeArbol,
  firmarSemilla,
  verificarSemilla,
  leerSemilla,
  crearFirmante,
  crearVerificador,
  generarParFirma,
  crearClaveSellado,
  sellarTodo,
  abrirTodo,
  sellarPieza,
  abrirPieza,
  planSellado,
  sellarMetadatos,
  abrirMetadatos,
  idEnjambre,
  crearSecretoEnjambre,
  envolverClave,
  abrirPaqueteClave,
  importarClaveSellado,
  type GanchosSobre,
  type Iman,
} from "../index";
import { bytesDePrueba } from "./red-simulada";

const sha = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());
const par = (a: Uint8Array, b: Uint8Array) => sha(Buffer.concat([a, b]));

/** Referencia independiente (node:crypto): árbol BEP 52 con relleno de ceros hasta potencia de dos. */
function raizReferencia(datos: Uint8Array): Uint8Array {
  const hojas: Uint8Array[] = [];
  for (let o = 0; o < datos.length || hojas.length === 0; o += TAM_HOJA) hojas.push(sha(datos.subarray(o, Math.min(datos.length, o + TAM_HOJA))));
  let n = 1;
  while (n < hojas.length) n *= 2;
  while (hojas.length < n) hojas.push(new Uint8Array(32));
  let capa = hojas;
  while (capa.length > 1) {
    const s: Uint8Array[] = [];
    for (let i = 0; i < capa.length; i += 2) s.push(par(capa[i], capa[i + 1]));
    capa = s;
  }
  return capa[0];
}

describe("árbol de Merkle", () => {
  it("la raíz coincide con una implementación de referencia independiente (BEP 52) para varios tamaños", async () => {
    for (const n of [0, 1, 100, TAM_HOJA, TAM_HOJA + 1, 3 * TAM_HOJA, 5 * TAM_HOJA + 7, 8 * TAM_HOJA, 9 * TAM_HOJA - 1]) {
      const d = bytesDePrueba(n, n + 1);
      const a = await arbolDeBytes(d);
      expect(aHex(a.raiz), `tamaño ${n}`).toBe(aHex(raizReferencia(d)));
    }
  });

  it("el constructor en flujo da lo mismo con cualquier troceado de la entrada", async () => {
    const d = bytesDePrueba(7 * TAM_HOJA + 333, 9);
    const base = await arbolDeBytes(d);
    const c = new ConstructorArbol();
    let o = 0;
    for (const k of [1, 5000, 16383, 16384, 16385, 40000, 99999999]) {
      await c.agregar(d.subarray(o, Math.min(d.length, o + k)));
      o = Math.min(d.length, o + k);
    }
    const a = await c.cerrar();
    expect(aHex(a.raiz)).toBe(aHex(base.raiz));
    expect(a.tamano).toBe(d.length);
  });

  it("geometría: piezas, nivel y longitud de la última; se encoge si el contenido es menor que la pieza", () => {
    const g = geometria(10 * 64 * 1024 + 5, 64 * 1024)!;
    expect(g.nPiezas).toBe(11);
    expect(g.nivelPieza).toBe(2);
    expect(longitudPieza(g, 0)).toBe(64 * 1024);
    expect(longitudPieza(g, 10)).toBe(5);
    expect(longitudPieza(g, 11)).toBe(0);
    const chico = geometria(20_000, 1024 * 1024)!;
    expect(chico.nPiezas).toBe(1);
    expect(chico.tamanoPieza).toBe(2 * TAM_HOJA);
    expect(geometria(-1, 65536)).toBeNull();
    expect(geometria(10, 1000)).toBeNull();
    expect(elegirTamanoPieza(1_000_000)).toBe(64 * 1024);
    expect(elegirTamanoPieza(10 * 1024 ** 3)).toBe(1024 * 1024);
  });

  it("cada pieza se verifica con su prueba contra la raíz, y cualquier alteración falla", async () => {
    const d = bytesDePrueba(13 * 64 * 1024 + 99, 3);
    const a = await arbolDeBytes(d);
    const g = geometria(d.length, 64 * 1024)!;
    for (let i = 0; i < g.nPiezas; i++) {
      const pieza = d.subarray(i * g.tamanoPieza, i * g.tamanoPieza + longitudPieza(g, i));
      const h = (await hashPieza(pieza, g.nivelPieza))!;
      expect(aHex(h)).toBe(aHex(a.capas[g.nivelPieza][i]));
      const prueba = await pruebaDeNodo(a.capas, g.nivelPieza, i);
      expect(prueba.length).toBe(g.profundidad - g.nivelPieza);
      expect(await verificarPrueba(g, h, g.nivelPieza, i, prueba, a.raiz)).toBe(true);
      // índice cambiado, prueba recortada, byte cambiado
      expect(await verificarPrueba(g, h, g.nivelPieza, (i + 1) % g.nPiezas, prueba, a.raiz)).toBe(g.nPiezas === 1);
      expect(await verificarPrueba(g, h, g.nivelPieza, i, prueba.slice(1), a.raiz)).toBe(false);
      const mala = pieza.slice();
      mala[0] ^= 1;
      expect(await verificarPrueba(g, (await hashPieza(mala, g.nivelPieza))!, g.nivelPieza, i, prueba, a.raiz)).toBe(false);
    }
    expect(await hashPieza(new Uint8Array(64 * 1024 + 1), g.nivelPieza)).toBeNull();
  });

  it("la capa de piezas completa se verifica contra la raíz y una capa con un hash cambiado no", async () => {
    const d = bytesDePrueba(21 * 64 * 1024, 4);
    const a = await arbolDeBytes(d);
    const g = geometria(d.length, 64 * 1024)!;
    const capa = a.capas[g.nivelPieza];
    expect(await verificarCapa(g, capa, a.raiz)).toBe(true);
    expect(aHex((await raizDesdeCapa(g, capa))!)).toBe(aHex(a.raiz));
    const mala = capa.map((h) => h.slice());
    mala[7][3] ^= 1;
    expect(await verificarCapa(g, mala, a.raiz)).toBe(false);
    expect(await verificarCapa(g, capa.slice(1), a.raiz)).toBe(false);
  });

  it("rangos de la capa (estilo BEP 52): válidos con prueba, rechazados si no están alineados o la prueba falla", async () => {
    const d = bytesDePrueba(40 * 64 * 1024 + 1, 5);
    const a = await arbolDeBytes(d);
    const g = geometria(d.length, 64 * 1024)!;
    for (const [desde, cuantas] of [[0, 8], [8, 8], [32, 16], [0, 64], [40, 8]] as const) {
      const r = await rangoConPrueba(a.capas, g, desde, cuantas);
      expect(r, `${desde}+${cuantas}`).not.toBeNull();
      expect(await verificarRango(g, desde, cuantas, r!.hashes, r!.prueba, a.raiz)).toBe(true);
      const mal = r!.hashes.map((h) => h.slice());
      mal[0][0] ^= 1;
      expect(await verificarRango(g, desde, cuantas, mal, r!.prueba, a.raiz)).toBe(false);
    }
    expect(await rangoConPrueba(a.capas, g, 3, 8)).toBeNull();
    expect(await rangoConPrueba(a.capas, g, 0, 6)).toBeNull();
    expect(await rangoConPrueba(a.capas, g, 0, 1024)).toBeNull();
    expect(await rangoConPrueba(a.capas, g, 64, 8)).toBeNull();
  });
});

describe("semilla, firma e imán", () => {
  it("una semilla pública firmada se verifica; cambiarle algo o falsificar la huella lo rompe", async () => {
    const d = bytesDePrueba(300_000, 6);
    const arbol = await arbolDeBytes(d);
    const par1 = await generarParFirma();
    const par2 = await generarParFirma();
    const base = semillaDeArbol(arbol, { ambito: "publico", nombre: "app-android.apk", mime: "application/vnd.android.package-archive", creada: 1 })!;
    const firmada = (await firmarSemilla(base, crearFirmante(par1)))!;
    const ver = crearVerificador();
    expect(await verificarSemilla(firmada, ver)).toBe(true);
    expect(await verificarSemilla({ ...firmada, nombre: "otra.apk" }, ver)).toBe(false);
    expect(await verificarSemilla({ ...firmada, tamano: firmada.tamano + 1 }, ver)).toBe(false);
    expect(await verificarSemilla(base, ver)).toBe(false); // pública sin firma
    // firma de otra clave con la huella de la primera
    const robada = (await firmarSemilla(base, crearFirmante(par2)))!;
    expect(await verificarSemilla({ ...robada, firma: { ...robada.firma!, fp: firmada.firma!.fp } }, ver)).toBe(false);
    // solo se aceptan editores de confianza
    expect(await verificarSemilla(firmada, crearVerificador({ aceptarFp: () => false }))).toBe(false);
    expect(await verificarSemilla(firmada, crearVerificador({ aceptarFp: (fp) => fp === firmada.firma!.fp }))).toBe(true);
    expect(await verificarSemilla(firmada, crearVerificador({ exigirCert: true }))).toBe(false);
  });

  it("las semillas no públicas no llevan nombre ni MIME y leerSemilla lo exige", async () => {
    const arbol = await arbolDeBytes(bytesDePrueba(1000, 7));
    const s = semillaDeArbol(arbol, { ambito: "privado", nombre: "secreto.pdf", mime: "application/pdf", creada: 1 })!;
    expect(s.nombre).toBe("");
    expect(s.mime).toBe("");
    expect(leerSemilla({ ...s, nombre: "secreto.pdf" })).toBeNull();
    expect(leerSemilla({ ...s, tamanoPieza: 1000 })).toBeNull();
    expect(leerSemilla({ ...s, raiz: "zz" })).toBeNull();
    expect(leerSemilla({ ...s, espejos: ["http://a.example.com/x"] })).toBeNull();
    expect(leerSemilla(null)).toBeNull();
  });

  const RAIZ = "ab".repeat(32);

  it("un imán se escribe y se lee de vuelta; el nombre solo viaja en ámbito público", () => {
    const i: Iman = { raiz: RAIZ, nombre: "Canción nº 1 & más.mp3", tamano: 123456789, ambito: "publico", huella: "id:0123abcd", espejos: ["https://cdn.example.com/a/b.bin?x=1"], rastreadores: ["rastreador/starseed.app"], tamanoPieza: 262144 };
    const t = formatearIman(i)!;
    expect(t.startsWith("starseed:?xt=urn:ss256:" + RAIZ)).toBe(true);
    expect(parsearIman(t)).toEqual(i);
    const priv = formatearIman({ ...i, ambito: "privado" })!;
    expect(priv).not.toContain("dn=");
    expect(parsearIman(priv)?.nombre).toBeUndefined();
    expect(parsearIman(formatearIman({ raiz: RAIZ, espejos: [], rastreadores: [] })!)).toEqual({ raiz: RAIZ, espejos: [], rastreadores: [] });
  });

  it("rechaza imanes hostiles", () => {
    const xt = "xt=urn:ss256:" + RAIZ;
    const malos: unknown[] = [
      null, 5, "", "starseed:", "starseed:?", "magnet:?" + xt, "STARSEED:?" + xt, " starseed:?" + xt, "starseed:?" + xt + " ",
      "starseed:?dn=x", "starseed:?xt=urn:btih:" + "ab".repeat(20), "starseed:?xt=urn:ss256:" + "ab".repeat(31), "starseed:?xt=urn:ss256:" + "zz".repeat(32),
      "starseed:?" + xt + "&" + xt, "starseed:?" + xt + "&k=abc", "starseed:?" + xt + "&key=" + "00".repeat(32), "starseed:?" + xt + "&ck=AA", "starseed:?" + xt + "&x.foo=1",
      "starseed:?" + xt + "&dn=%zz", "starseed:?" + xt + "&dn=%00", "starseed:?" + xt + "&dn=a%0Ab", "starseed:?" + xt + "&dn=%E2%80%AEgpj.exe", "starseed:?" + xt + "&dn=" + "a".repeat(300),
      "starseed:?" + xt + "&xl=-1", "starseed:?" + xt + "&xl=1e3", "starseed:?" + xt + "&xl=99999999999999999999", "starseed:?" + xt + "&xl=",
      "starseed:?" + xt + "&am=todos", "starseed:?" + xt + "&fi=<script>", "starseed:?" + xt + "&ra=http://evil/x y",
      "starseed:?" + xt + "&es=http://cdn.example.com/a", "starseed:?" + xt + "&es=javascript:alert(1)", "starseed:?" + xt + "&es=file:///etc/passwd",
      "starseed:?" + xt + "&es=https://user:pw@cdn.example.com/a", "starseed:?" + xt + "&es=https://127.0.0.1/a", "starseed:?" + xt + "&es=https://localhost/a",
      "starseed:?" + xt + "&es=https://[::1]/a", "starseed:?" + xt + "&es=https://169.254.169.254/latest", "starseed:?" + xt + "&es=https://0x7f.1/a", "starseed:?" + xt + "&es=https://2130706433/a",
      "starseed:?" + xt + "&ps=100", "starseed:?" + xt + "&ps=8", "starseed:?" + xt + "&&dn=a", "starseed:?" + xt + "&dn=a=b",
      "starseed:?" + xt + "&" + "es=https://a.example.com/".repeat(1) + "&".repeat(3),
      "starseed:?" + xt + "&dn=" + "%41".repeat(2000),
    ];
    for (const m of malos) expect(parsearIman(m), String(m).slice(0, 80)).toBeNull();
    // más de cuatro espejos
    const cinco = Array.from({ length: 5 }, (_, k) => "&es=" + encodeURIComponent(`https://m${k}.example.com/f`)).join("");
    expect(parsearIman("starseed:?" + xt + cinco)).toBeNull();
    expect(formatearIman({ raiz: "nope", espejos: [], rastreadores: [] })).toBeNull();
    expect(formatearIman({ raiz: RAIZ, espejos: ["https://10.0.0.1/x"], rastreadores: [] })).toBeNull();
  });

  it("validarUrlEspejo: solo https público", () => {
    expect(validarUrlEspejo("https://objects.githubusercontent.com/x/y.bin")).toBe("https://objects.githubusercontent.com/x/y.bin");
    expect(validarUrlEspejo("https://abc.supabase.co:443/storage/v1/object/public/a")).not.toBeNull();
    for (const u of ["https://nas.local/x", "https://servidor.internal/x", "https://intranet/x", "https://a.example.com:8443/x", "https://a.example.com/x#frag", "https://8.8.8.8.nip.io\\@evil/x", "https://exa\tmple.com/", "ftp://a.example.com/x"]) expect(validarUrlEspejo(u), u).toBeNull();
    expect(validarUrlEspejo("https://8.8.8.8/x")).not.toBeNull();
    expect(validarUrlEspejo("https://a.example.com:8443/x", { puertos: [8443] })).not.toBeNull();
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"]) expect(ipv4NoPublica(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1"]) expect(ipv4NoPublica(ip), ip).toBe(false);
  });
});

describe("sellado determinista de contenido privado", () => {
  const U = 64 * 1024;

  it("mismo claro y misma clave dan el mismo texto cifrado; el árbol se calcula sobre ese texto", async () => {
    const k = (await crearClaveSellado())!;
    const claro = bytesDePrueba(200_000, 11);
    const a = (await sellarTodo(k, claro, U))!;
    const b = (await sellarTodo(k, claro, U))!;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const plan = planSellado(claro.length, U)!;
    expect(a.length).toBe(plan.tamanoCifrado);
    expect(plan.nPiezas).toBe(4);
    const ra = await arbolDeBytes(a);
    const rb = await arbolDeBytes(b);
    expect(aHex(ra.raiz)).toBe(aHex(rb.raiz));
    // otra clave: otro texto cifrado
    const k2 = (await crearClaveSellado())!;
    const c = (await sellarTodo(k2, claro, U))!;
    expect(Buffer.from(c).equals(Buffer.from(a))).toBe(false);
    // y se abre entero
    expect(Buffer.from((await abrirTodo(k, a, U))!).equals(Buffer.from(claro))).toBe(true);
    expect(await abrirTodo(k2, a, U)).toBeNull();
  });

  it("cada pieza sellada coincide con una pieza del árbol y se abre sola", async () => {
    const k = (await crearClaveSellado())!;
    const claro = bytesDePrueba(150_000, 12);
    const cif = (await sellarTodo(k, claro, U))!;
    const g = geometria(cif.length, U)!;
    const plan = planSellado(claro.length, U)!;
    expect(g.nPiezas).toBe(plan.nPiezas);
    for (let i = 0; i < g.nPiezas; i++) {
      const p = cif.subarray(i * g.tamanoPieza, i * g.tamanoPieza + longitudPieza(g, i));
      const claroPieza = (await abrirPieza(k, i, g.nPiezas, p))!;
      expect(Buffer.from(claroPieza).equals(Buffer.from(claro.subarray(i * (U - 16), Math.min(claro.length, (i + 1) * (U - 16)))))).toBe(true);
    }
  });

  it("una pieza no se puede mover de sitio, truncar, cambiar o abrir con otra clave ni con otro total", async () => {
    const k = (await crearClaveSellado())!;
    const claro = bytesDePrueba(3 * (U - 16), 13);
    const cif = (await sellarTodo(k, claro, U))!;
    const p0 = cif.subarray(0, U);
    const p1 = cif.subarray(U, 2 * U);
    expect(await abrirPieza(k, 0, 3, p0)).not.toBeNull();
    expect(await abrirPieza(k, 1, 3, p0)).toBeNull(); // índice cambiado
    expect(await abrirPieza(k, 0, 3, p1)).toBeNull(); // pieza de otro sitio
    expect(await abrirPieza(k, 0, 4, p0)).toBeNull(); // total distinto
    expect(await abrirPieza(k, 0, 3, p0.subarray(0, U - 1))).toBeNull(); // truncada
    const mala = p0.slice();
    mala[100] ^= 1;
    expect(await abrirPieza(k, 0, 3, mala)).toBeNull();
    expect(await abrirPieza((await crearClaveSellado())!, 0, 3, p0)).toBeNull();
    expect(await sellarPieza(k, 3, 3, new Uint8Array(1))).toBeNull();
    expect(await sellarPieza(k, -1, 3, new Uint8Array(1))).toBeNull();
  });

  it("los metadatos (nombre, MIME) van sellados y solo se abren con la clave y para esa raíz", async () => {
    const k = (await crearClaveSellado())!;
    const raiz = "cd".repeat(32);
    const m = (await sellarMetadatos(k, raiz, { nombre: "nómina.pdf", mime: "application/pdf", tamanoClaro: 1234 }))!;
    expect(m).not.toContain("nómina");
    expect(await abrirMetadatos(k, raiz, m)).toEqual({ nombre: "nómina.pdf", mime: "application/pdf", tamanoClaro: 1234 });
    expect(await abrirMetadatos(k, "ef".repeat(32), m)).toBeNull();
    expect(await abrirMetadatos((await crearClaveSellado())!, raiz, m)).toBeNull();
  });

  it("el id del enjambre con secreto no se puede calcular sabiendo solo la raíz", async () => {
    const raiz = "12".repeat(32);
    const s1 = crearSecretoEnjambre();
    const s2 = crearSecretoEnjambre();
    const pub = await idEnjambre(raiz);
    const a = await idEnjambre(raiz, s1);
    const b = await idEnjambre(raiz, s2);
    expect(new Set([pub, a, b]).size).toBe(3);
    expect(await idEnjambre(raiz, s1)).toBe(a);
    expect(a).not.toContain(raiz.slice(0, 16));
    await expect(idEnjambre("nope")).rejects.toThrow();
  });

  it("la clave se envuelve por destinatario con un gancho y solo la abre quien tiene el sobre", async () => {
    const guardados: Array<{ para: string; carga: unknown }> = [];
    const g = (quien: string): GanchosSobre => ({
      envolver: async (dest, carga) => dest.map((d) => ({ para: d, carga: JSON.stringify(carga) })),
      abrir: async (s) => {
        const o = s as { para: string; carga: string };
        guardados.push({ para: o.para, carga: o.carga });
        return o.para === quien ? JSON.parse(o.carga) : null;
      },
    });
    const k = (await crearClaveSellado())!;
    const sec = crearSecretoEnjambre();
    const raiz = "34".repeat(32);
    const sobres = (await envolverClave(g("x"), ["ana", "beto"], raiz, k, sec))!;
    expect(sobres.length).toBe(2);
    const ana = (await abrirPaqueteClave(g("ana"), sobres, raiz))!;
    expect(Buffer.from(ana.clave.raw).equals(Buffer.from(k.raw))).toBe(true);
    expect(Buffer.from(ana.secreto).equals(Buffer.from(sec))).toBe(true);
    expect(await abrirPaqueteClave(g("carla"), sobres, raiz)).toBeNull();
    expect(await abrirPaqueteClave(g("ana"), sobres, "56".repeat(32))).toBeNull();
    expect(await envolverClave(g("x"), [], raiz, k, sec)).toBeNull();
    expect(await importarClaveSellado(new Uint8Array(31))).toBeNull();
  });
});
