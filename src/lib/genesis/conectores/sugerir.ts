/** GENESIS · SUGERIDOR POR ÁMBITO (Ola 1019G · GCA1019K · architecture/genesis-conectores-abiertos.md §2–§3).
 * Cruza lo que el ámbito tiene (ofertas de sus neuronas y servidores del cerebro, vinculadas, asignaciones) con el
 * catálogo y los contenedores y propone en orden: local por activar, gratis por vincular (con enlaces oficiales),
 * de pago SOLO con permiso del ámbito y para papeles que nada más cubre, y sin opción. PURO: sin red, disco ni
 * reloj; jamás valores de claves. Lo privado no sale de la cuenta: un papel «local» solo lo cubren sus máquinas. */
import type { Asignacion } from "./asignaciones";
import type { Gratis, OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";
import type { ContenedorOpcion } from "./contenedores";
import type { OfertaContexto } from "./escalera";

export interface EntradaSugerir {
  asignaciones: Asignacion<Papel>[]; catalogo: OpcionCatalogo[];
  /** Lo que ofrecen las neuronas y los servidores del cerebro del ámbito (todo local). */
  ofertas: OfertaContexto[];
  /** Ids de opciones ya vinculadas o activas en el ámbito. */
  vinculadas: ReadonlySet<string>; contenedores: ContenedorOpcion[];
  /** Potencia MEDIDA por id (`puntuarPotencia`); lo no medido va detrás, en el orden de entrada. */
  potencia?: ReadonlyMap<string, number>;
}

export interface Sugerencia {
  id: string; nombre: string; tipo: OpcionCatalogo["tipo"];
  /** Papeles del ámbito a los que sirve (vacío en un contenedor: corre procesos, no cubre un papel). */
  papeles: Papel[];
  enlaceAlta: string | null; enlaceClave: string | null;
  /** Límite gratis tal cual consta en el catálogo; `null` si no consta (nunca se inventa). */
  limite: Gratis | null;
  verificado: OpcionCatalogo["verificado"] | ContenedorOpcion["verificado"];
  /** `variables` lleva solo NOMBRES de variables de entorno, nunca valores. */
  privacidad: Privacidad; variables: string[]; motivo: string;
}

export interface PapelSinOpcion { papel: Papel; motivo: string }

export type GrupoSugerencias =
  | { clave: "local-por-activar" | "gratis-por-vincular" | "de-pago-con-permiso"; titulo: string; opciones: Sugerencia[] }
  | { clave: "sin-opcion"; titulo: string; papeles: PapelSinOpcion[] };

/** Cuánto se aleja cada privacidad de la neurona; «desconocida» cuenta como lo peor. */
const RANGO: Record<Privacidad, number> = { local: 0, "nube-sin-retencion": 1, "nube-con-retencion": 2, desconocida: 3 };
type AsigPapel = Asignacion<Papel>;
const admite = (a: AsigPapel, p: Privacidad) => RANGO[p] <= RANGO[a.preferencias.privacidad];
const permitePago = (a: AsigPapel) => (a.preferencias.presupuesto ?? 0) > 0;
const usa = (a: AsigPapel, id: string) => a.cadena.includes(id) || a.respaldo.includes(id);
const privacidadDe = (c: ContenedorOpcion): Privacidad => (c.aptoPrivado ? "local" : "nube-con-retencion");

const deCatalogo = (o: OpcionCatalogo, papeles: Papel[], motivo: string): Sugerencia => ({
  id: o.id, nombre: o.nombre, tipo: o.tipo, papeles, enlaceAlta: o.enlaceAlta, enlaceClave: o.enlaceClave,
  limite: o.gratis, verificado: o.verificado, privacidad: o.privacidad, variables: [...o.variables], motivo });
const deContenedor = (c: ContenedorOpcion, motivo: string): Sugerencia => ({
  id: c.id, nombre: c.nombre, tipo: "contenedor", papeles: [], enlaceAlta: c.enlaceAlta, enlaceClave: null,
  limite: null, verificado: c.verificado, privacidad: privacidadDe(c), variables: [], motivo });

/** Más papeles primero; luego lo más privado, lo verificado y el id, para un orden estable. */
const porUtilidad = (a: Sugerencia, b: Sugerencia) => b.papeles.length - a.papeles.length
  || RANGO[a.privacidad] - RANGO[b.privacidad]
  || Number(Boolean(b.verificado)) - Number(Boolean(a.verificado)) || a.id.localeCompare(b.id);

export function sugerirParaAmbito(e: EntradaSugerir): GrupoSugerencias[] {
  const { asignaciones, catalogo, ofertas, vinculadas, contenedores, potencia } = e;
  const cubiertos = new Set<Papel>();
  const papelesDe = (filtro: (a: AsigPapel) => boolean) => asignaciones.filter(filtro).map((a) => a.clave);

  // 1) Local por activar: capacidad de neuronas y servidores del cerebro que ninguna cadena usa.
  const pot = (id: string) => potencia?.get(id) ?? Number.MIN_SAFE_INTEGER;
  const local: Sugerencia[] = [];
  for (const o of [...ofertas].sort((x, y) => pot(y.id) - pot(x.id))) {
    const sirve = asignaciones.filter((a) => o.papel.includes(a.clave));
    sirve.forEach((a) => cubiertos.add(a.clave));
    const libres = sirve.filter((a) => !usa(a, o.id)).map((a) => a.clave);
    if (libres.length) local.push({ id: o.id, nombre: o.nombre, tipo: o.tipo, papeles: libres, enlaceAlta: null,
      enlaceClave: null, limite: null, verificado: null, privacidad: "local", variables: [],
      motivo: "Capacidad local sin usar: añádela a la cadena de estos papeles." });
  }
  for (const c of contenedores) if (!vinculadas.has(c.id) && !c.requiereCuenta && !c.requierePago)
    local.push(deContenedor(c, "Contenedor local: tu neurona o tu servidor corre los procesos de los agentes."));

  // 2) Gratis por vincular. Lo «local» del catálogo solo cuenta si una neurona lo ofrece de verdad.
  const idsOferta = new Set(ofertas.map((o) => o.id));
  const gratis: Sugerencia[] = [];
  const dePago: OpcionCatalogo[] = [];
  for (const o of catalogo) {
    if (idsOferta.has(o.id) || o.privacidad === "local") continue;
    if (o.gratis === null) { dePago.push(o); continue; }
    const papeles = papelesDe((a) => o.papeles.includes(a.clave) && admite(a, o.privacidad));
    papeles.forEach((p) => cubiertos.add(p));
    if (papeles.length && o.requiereCuenta && !vinculadas.has(o.id))
      gratis.push(deCatalogo(o, papeles, "Gratis: crea tu cuenta en el enlace oficial y vincula la clave."));
  }

  // 3) De pago: solo con presupuesto del ámbito y para papeles que nada local ni gratis cubre.
  const pagoPara = (o: OpcionCatalogo) => papelesDe((a) => permitePago(a) && !cubiertos.has(a.clave)
    && o.papeles.includes(a.clave) && admite(a, o.privacidad));
  dePago.filter((o) => vinculadas.has(o.id)).forEach((o) => pagoPara(o).forEach((p) => cubiertos.add(p)));
  const pago = dePago.filter((o) => !vinculadas.has(o.id))
    .map((o) => deCatalogo(o, pagoPara(o), "De pago, con el permiso y el tope del ámbito.")).filter((s) => s.papeles.length);
  pago.forEach((s) => s.papeles.forEach((p) => cubiertos.add(p)));
  // Contenedores con cuenta: gratis si alguna asignación admite su privacidad; de pago, además con permiso.
  for (const c of contenedores) {
    const admitido = asignaciones.some((a) => admite(a, privacidadDe(c)) && (!c.requierePago || permitePago(a)));
    if (vinculadas.has(c.id) || !c.requiereCuenta || !admitido) continue;
    if (c.requierePago) pago.push(deContenedor(c, "Contenedor de pago, con el permiso y el tope del ámbito."));
    else gratis.push(deContenedor(c, "Contenedor gratis para los procesos de los agentes: crea tu cuenta y emparéjalo."));
  }

  // 4) Sin opción: papeles sin ningún candidato, con el porqué.
  const sinOpcion = asignaciones.filter((a) => !cubiertos.has(a.clave)).map((a): PapelSinOpcion => ({
    papel: a.clave,
    motivo: a.preferencias.privacidad === "local"
      ? "Lo privado no sale de la cuenta y ninguna neurona ni servidor del cerebro sirve para este papel."
      : permitePago(a) ? "No hay nada local, gratis ni de pago para este papel en el catálogo."
        : "No hay nada local ni gratis para este papel y el ámbito no permite pago.",
  }));
  const conPago = pago.length
    ? [{ clave: "de-pago-con-permiso" as const, titulo: "De pago con permiso", opciones: pago.sort(porUtilidad) }] : [];
  return [{ clave: "local-por-activar", titulo: "Local por activar", opciones: local },
    { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: gratis.sort(porUtilidad) },
    ...conPago, { clave: "sin-opcion", titulo: "Sin opción", papeles: sinOpcion }];
}
