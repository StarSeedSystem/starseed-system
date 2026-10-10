/**
 * El kit y StarSeed OS se entienden: mismos temas, mismas firmas, mismos enlaces, mismos códigos de
 * emparejado y la MISMA sesión en vivo en los dos sentidos (anfitrión del OS ↔ oyente del kit y al
 * revés), también privada. Importa los módulos REALES del OS (`@/lib/...`).
 */

import { describe, expect, it } from "vitest";

import * as osCripto from "@/lib/estaciones/cripto-estacion";
import * as osModelo from "@/lib/estaciones/transmision-parametrica";
import { SesionEnVivo as SesionOS } from "@/lib/estaciones/sesion-en-vivo";
import * as osCodigo from "@/lib/malla/codigo-emparejado";

import * as kitCripto from "../src/cripto";
import * as kitModelo from "../src/modelo";
import { SesionEnVivo as SesionKit } from "../src/sesion";
import * as kitCodigo from "../src/codigo-emparejado";
import { esperarA, hubEnMemoria } from "./falsos";

const PARAMS: kitModelo.ParametrosSesion = {
  tipo: "omnifrecuencias",
  entonacion: { volumen: 0.6, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: -0.5, y: 0, z: 0 }, { id: "b", f: 436, onda: "triangle", vol: 0.4, x: 0.5, y: 0, z: 0 }] },
};

async function fichaNueva(privada = false) {
  const llaves = await kitCripto.crearLlaves();
  const id = await kitCripto.idDeLlave(llaves.publica);
  const ficha = kitModelo.sanearFicha({ v: 1, id, fuente: "omnifrecuencias", titulo: "Prueba de vínculo", enlace: "https://omnifrecuencias.vercel.app/", pk: llaves.publica, privada, params: PARAMS, creada: Date.now() })!;
  return { llaves, ficha };
}

const SONDEO = { rafaga: 10, rafagaMs: 5, porVuelta: 2, periodoMs: 200, periodoMaxMs: 400 };

describe("cripto y temas: el kit y el OS calculan lo mismo", () => {
  it("id de la llave, temas pública y privada", async () => {
    const { llaves, ficha } = await fichaNueva();
    expect(await osCripto.idDeLlave(llaves.publica)).toBe(ficha.id);
    expect(kitCripto.temaPublico(ficha.id)).toBe(osCripto.temaPublico(ficha.id));
    const token = kitCripto.crearToken();
    expect(await kitCripto.temaPrivado(ficha.id, token)).toBe(await osCripto.temaPrivado(ficha.id, token));
  });

  it("lo que firma el kit lo verifica el OS y lo que cifra uno lo descifra el otro", async () => {
    const { llaves, ficha } = await fichaNueva();
    const f = await kitCripto.firmar(llaves.privada, "s\nestado\nx");
    expect(await osCripto.verificar(ficha.pk, "s\nestado\nx", f)).toBe(true);
    expect(await osCripto.verificar(ficha.pk, "s\nestado\ny", f)).toBe(false);
    const token = kitCripto.crearToken();
    const c1 = await kitCripto.cifrar(ficha.id, token, "hola OS");
    expect(await osCripto.descifrar(ficha.id, token, c1)).toBe("hola OS");
    const c2 = await osCripto.cifrar(ficha.id, token, "hola kit");
    expect(await kitCripto.descifrar(ficha.id, token, c2)).toBe("hola kit");
  });
});

describe("enlaces: el mismo enlace sirve en el OS y en la app", () => {
  it("pública: el OS lee el enlace del kit y el kit el del OS", async () => {
    const { ficha } = await fichaNueva();
    const delKit = kitModelo.enlaceDeSesion(ficha);
    const leidoOS = osModelo.leerEnlaceSesion(`https://starseed-os.vercel.app${delKit}`);
    expect(leidoOS?.id).toBe(ficha.id);
    expect(leidoOS?.ficha).toEqual(ficha);
    expect(osModelo.enlaceDeSesion(ficha as osModelo.FichaSesion)).toBe(delKit);
  });

  it("privada con token y control viajan en el fragmento", async () => {
    const { llaves, ficha } = await fichaNueva(true);
    const token = kitCripto.crearToken();
    const control = await kitCripto.exportarPrivada(llaves.privada);
    const e = kitModelo.enlaceDeSesion(ficha, { token, control });
    expect(e.includes("?")).toBe(false);
    const l = osModelo.leerEnlaceSesion(e);
    expect(l?.token).toBe(token);
    expect(l?.control).toBe(control);
    expect(l?.ficha?.privada).toBe(true);
  });
});

describe("códigos de emparejado sin internet", () => {
  it("un código del kit lo lee el OS y uno del OS lo lee el kit", async () => {
    const sdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=candidate:1 1 udp 1 192.168.1.5 5000 typ host\r\n";
    const k = await kitCodigo.codificarCodigo({ r: "o", s: "abc123", sdp, n: "Omnifrecuencias" });
    const enOS = await osCodigo.decodificarCodigo(k);
    expect(enOS.ok && enOS.datos.sdp === sdp && enOS.datos.n === "Omnifrecuencias").toBe(true);
    const o = await osCodigo.codificarCodigo({ r: "a", s: "abc123", sdp });
    const enKit = await kitCodigo.decodificarCodigo(o);
    expect(enKit.ok && enKit.datos.r === "a" && enKit.datos.s === "abc123").toBe(true);
  });
});

describe("la MISMA sesión en vivo entre el OS y una app", () => {
  for (const sentido of ["OS emite → app sigue", "app emite → OS sigue"] as const) {
    for (const privada of [false, true]) {
      it(`${sentido}${privada ? " (privada)" : ""}: reloj común, estado y acciones firmadas`, async () => {
        const { llaves, ficha } = await fichaNueva(privada);
        const token = privada ? kitCripto.crearToken() : null;
        const hub = hubEnMemoria();
        const Anfitrion = sentido.startsWith("OS") ? SesionOS : SesionKit;
        const Oyente = sentido.startsWith("OS") ? SesionKit : SesionOS;
        const anfitrion = new Anfitrion({ ficha: ficha as never, token, llave: llaves.privada, referencia: true, canales: [hub.nuevo()], lotePongMs: 0, sondeo: SONDEO });
        const oyente = new Oyente({ ficha: ficha as never, token, canales: [hub.nuevo()], lotePongMs: 0, sondeo: SONDEO });
        anfitrion.arrancar();
        oyente.arrancar();
        try {
          await esperarA(() => oyente.foto().reloj.modo === "sincronizado");
          const r = await anfitrion.accion("iniciar", { enMs: 50 });
          expect(r.ok).toBe(true);
          await esperarA(() => oyente.foto().estado.linea.some((a) => a.tipo === "iniciar"));
          await new Promise((res) => setTimeout(res, 80));
          const fa = anfitrion.foto();
          const fo = oyente.foto();
          expect(fo.posicion.fase).toBe("sonando");
          expect(fo.posicion.ancla).toBe(fa.posicion.ancla);
          // Mismo proceso: el reloj común del oyente coincide con el del anfitrión al milisegundo.
          expect(Math.abs(oyente.ahora() - anfitrion.ahora())).toBeLessThan(2);
          expect(fo.descartados).toBe(0);
          // Cambio de parámetros para todos.
          const nuevos = { ...PARAMS, entonacion: { ...PARAMS.entonacion, volumen: 0.3 } } as never;
          expect((await anfitrion.accion("parametros", { params: nuevos, enMs: 20 })).ok).toBe(true);
          await esperarA(() => oyente.foto().estado.linea.some((a) => a.tipo === "parametros"));
          await new Promise((res) => setTimeout(res, 40));
          const p = oyente.foto().posicion.params;
          expect(p.tipo === "omnifrecuencias" && p.entonacion.volumen).toBe(0.3);
          // Un oyente sin llave no puede mandar para todos.
          expect((await oyente.accion("pausar")).ok).toBe(false);
          if (privada) expect(hub.enviados.every((t) => !t.includes('"d":'))).toBe(true);
        } finally {
          anfitrion.cerrar();
          oyente.cerrar();
        }
      });
    }
  }

  it("un mensaje con firma falsa se descarta en los dos lados", async () => {
    const { ficha } = await fichaNueva();
    const otro = await kitCripto.crearLlaves();
    const hub = hubEnMemoria();
    const oyenteOS = new SesionOS({ ficha: ficha as never, canales: [hub.nuevo()], sondeo: SONDEO });
    const oyenteKit = new SesionKit({ ficha, canales: [hub.nuevo()], sondeo: SONDEO });
    oyenteOS.arrancar();
    oyenteKit.arrancar();
    const intruso = hub.nuevo();
    const d = JSON.stringify({ n: 1, t: Date.now(), tipo: "pausar" });
    intruso.enviar(JSON.stringify({ t: "est", s: ficha.id, e: "accion", d, f: await kitCripto.firmar(otro.privada, `${ficha.id}\naccion\n${d}`) }));
    await esperarA(() => oyenteOS.foto().descartados > 0 && oyenteKit.foto().descartados > 0);
    expect(oyenteOS.foto().estado.linea.length).toBe(0);
    expect(oyenteKit.foto().estado.linea.length).toBe(0);
    oyenteOS.cerrar();
    oyenteKit.cerrar();
  });
});
