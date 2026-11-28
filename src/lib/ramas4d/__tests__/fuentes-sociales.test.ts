import { describe, it, expect } from "vitest";
import type { Observador } from "../alcance";
import type { OsPage, OsGroup, OsEvent } from "@/lib/os-social";
import type { NormalizedPost } from "@/lib/social-posts";
import type { EventRow } from "@/lib/events/events-store";
import {
  nodoDesdePagina,
  nodoDesdeGrupo,
  nodosDesdeEspacio,
  crearFuenteEntidades,
} from "../fuentes/entidades";
import {
  nodoDesdePublicacion,
  aristasDePublicacion,
  publicacionDesdeNormalizada,
  crearFuenteSocial,
  type PublicacionVista,
} from "../fuentes/social";
import {
  alcanceDesdeScope,
  nodoDesdePropuesta,
  nodosDesdeVotos,
  nodoDesdeDelegacion,
  nodoDesdeMembresia,
  crearFuenteGobierno,
  type PropuestaVista,
  type VotoVista,
} from "../fuentes/gobierno";
import {
  nodoDesdeEvento,
  eventoDesdeOsEvento,
  eventoDesdeFila,
  aristasDeEvento,
  crearFuenteEventos,
  type EventoVista,
} from "../fuentes/eventos";

const observador: Observador = {
  id: "u1",
  contactos: ["u2"],
  grupos: ["grupo-1"],
  comunidades: ["com-1"],
};

function pagina(overrides: Partial<OsPage> = {}): OsPage {
  return {
    id: "pag-1",
    slug: "ciencia",
    name: "Ciencia Abierta",
    kind: "comunidad",
    description: "Descripción que no debe copiarse al grafo",
    tags: ["ciencia"],
    accent: "#10B981",
    memberCount: 40,
    ...overrides,
  };
}

function grupo(overrides: Partial<OsGroup> = {}): OsGroup {
  return {
    id: "grp-1",
    slug: "asamblea-1",
    name: "Asamblea del barrio",
    kind: "asamblea",
    description: "Descripción que no debe copiarse al grafo",
    tags: ["barrio"],
    accent: "#FFBF00",
    memberCount: 12,
    ...overrides,
  };
}

function osEvento(overrides: Partial<OsEvent> = {}): OsEvent {
  return {
    id: "ev-1",
    slug: "encuentro-1",
    title: "Encuentro de saberes",
    kind: "taller",
    description: "Descripción que no debe copiarse al grafo",
    startsAt: "2026-12-01T18:00:00.000Z",
    location: "Plaza",
    organizerSlug: "ciencia",
    tags: ["taller"],
    attendeeCount: 25,
    ...overrides,
  };
}

function filaEvento(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "fila-1",
    owner: "u9",
    title: "Reunión privada",
    starts_at: "2026-12-02T10:00:00.000Z",
    kind: "asamblea",
    visibility: "private",
    created_at: "2026-11-20T10:00:00.000Z",
    meta: { attendees: 3, tags: ["privado"] },
    ...overrides,
  };
}

function propuesta(overrides: Partial<PropuestaVista> = {}): PropuestaVista {
  return {
    id: "p1",
    scope: "group",
    scope_ref: "grupo-1",
    author: "u2",
    title: "Aprobar el reglamento",
    kind: "policy",
    options: [
      { id: "yes", label: "Sí" },
      { id: "no", label: "No" },
    ],
    params: { votingMinutes: 60, minParticipants: 1, minPercent: 0, threshold: 50, urgency: "high" },
    status: "open",
    created_at: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}

function voto(overrides: Partial<VotoVista> = {}): VotoVista {
  return {
    proposal_id: "p1",
    voter: "u2",
    choice: "yes",
    weight: 1,
    created_at: "2026-11-20T11:00:00.000Z",
    ...overrides,
  };
}

function publicacion(overrides: Partial<PublicacionVista> = {}): PublicacionVista {
  return {
    id: "post-1",
    titulo: "Hola red",
    creadaEn: "2026-11-20T10:00:00.000Z",
    tipo: "post",
    medio: "image",
    etiquetas: ["ciencia"],
    autor: "Ana",
    ...overrides,
  };
}

function evento(overrides: Partial<EventoVista> = {}): EventoVista {
  return {
    id: "ev-1",
    slug: "encuentro-1",
    titulo: "Encuentro de saberes",
    tipo: "taller",
    comienzaEn: "2026-12-01T18:00:00.000Z",
    organizadorSlug: "ciencia",
    asistentes: 25,
    etiquetas: ["taller"],
    ...overrides,
  };
}

describe("fuente de entidades", () => {
  it("mapea una página a una entidad pública con su sistema y sin copiar la descripción", () => {
    const nodo = nodoDesdePagina(pagina());
    expect(nodo.id).toBe("entidad:page:ciencia");
    expect(nodo.tipo).toBe("entidad");
    expect(nodo.ref).toBe("/pagina/ciencia");
    expect(nodo.alcance).toBe("publico");
    expect(nodo.capas).toContain("entidades");
    expect(nodo.tema).toBe("cultural");
    expect(nodo.categoria).toBe("comunidad");
    expect(nodo.etiquetas).toContain("real");
    expect(nodo.peso).toBeGreaterThan(0.6);
    expect(JSON.stringify(nodo)).not.toContain("no debe copiarse");
  });

  it("mapea un grupo por su tipo canónico (asamblea) y su ruta de grupo", () => {
    const nodo = nodoDesdeGrupo(grupo());
    expect(nodo.id).toBe("entidad:group:asamblea-1");
    expect(nodo.ref).toBe("/grupo/asamblea-1");
    expect(nodo.categoria).toBe("asamblea");
    expect(nodo.tema).toBe("politico");
    expect(nodo.etiquetas).toContain("asamblea");
  });

  it("solo expone las pestañas públicas o de la entidad; la privada no aparece", () => {
    const { nodos, aristas } = nodosDesdeEspacio("grupo-1", "group", [
      { id: "tab-1", titulo: "Mural", tipo: "pizarra", sesionId: "ses-1", visibilidad: "publica", accesoPublico: "ver" },
      { id: "tab-2", titulo: "Notas", tipo: "documento", sesionId: "ses-2", visibilidad: "entidad", accesoPublico: "ninguno" },
      { id: "tab-3", titulo: "Diario", tipo: "texto", sesionId: "ses-3", visibilidad: "privada", accesoPublico: "ninguno" },
    ]);
    expect(nodos).toHaveLength(2);
    expect(nodos.map((n) => n.id)).not.toContain("espacio:grupo-1:tab-3");
    const privada = nodos.find((n) => n.id === "espacio:grupo-1:tab-2");
    expect(privada?.alcance).toBe("grupo");
    expect(privada?.dueno).toBe("grupo-1");
    expect(aristas).toHaveLength(2);
    expect(aristas[0]).toMatchObject({ de: "entidad:group:grupo-1", tipo: "contiene" });
  });

  it("la fuente lee datos inyectados y avisa a sus suscriptores", async () => {
    const fuente = crearFuenteEntidades(async () => ({
      paginas: [pagina()],
      grupos: [grupo()],
    }));
    const avisos: string[] = [];
    const soltar = fuente.suscribir((e) => avisos.push(e.tipo));
    const { nodos, aristas } = await fuente.leer(observador);
    expect(nodos.size).toBe(2);
    expect(aristas).toHaveLength(0);
    expect(avisos).toContain("fuente_leida");
    soltar();
  });
});

describe("fuente social", () => {
  it("mapea una publicación como referencia abrible, con formato según su medio", () => {
    const nodo = nodoDesdePublicacion(publicacion({ medio: "video" }));
    expect(nodo.id).toBe("publicacion:post-1");
    expect(nodo.tipo).toBe("publicacion");
    expect(nodo.formato).toBe("video");
    expect(nodo.ref).toBe("/post/post-1");
    expect(nodo.alcance).toBe("publico");
    expect(nodo.titulo).toBe("Hola red");
    expect(nodo.etiquetas).toContain("video");
    expect(nodo.etiquetas).toContain("ciencia");
  });

  it("usa un título de referencia cuando la publicación no trae título", () => {
    expect(nodoDesdePublicacion(publicacion({ titulo: undefined })).titulo).toBe("Publicación de Ana");
    expect(nodoDesdePublicacion(publicacion({ titulo: undefined, autor: undefined })).titulo).toBe("Publicación");
  });

  it("traduce cada medio al formato del nodo", () => {
    expect(nodoDesdePublicacion(publicacion({ medio: "gallery" })).formato).toBe("imagen");
    expect(nodoDesdePublicacion(publicacion({ medio: "audio" })).formato).toBe("audio");
    expect(nodoDesdePublicacion(publicacion({ medio: "pdf" })).formato).toBe("documento");
    expect(nodoDesdePublicacion(publicacion({ medio: "link" })).formato).toBe("enlace");
    expect(nodoDesdePublicacion(publicacion({ medio: null })).formato).toBe("texto");
  });

  it("enlaza la publicación con su entidad contenedora sin duplicar contenido", () => {
    const p = publicacion({ entidad: { tipo: "group", slug: "grupo-1" } });
    const aristas = aristasDePublicacion(p);
    expect(aristas).toHaveLength(1);
    expect(aristas[0]).toMatchObject({
      de: "entidad:group:grupo-1",
      a: "publicacion:post-1",
      tipo: "contiene",
    });
  });

  it("adapta la publicación normalizada de social-posts a la vista del grafo", () => {
    const normalizada: NormalizedPost = {
      id: "post-2",
      authorName: "Luz",
      title: "Mirada",
      body: "Texto que no se copia",
      kind: "ensayo",
      createdAt: "2026-11-21T10:00:00.000Z",
      likes: 4,
      commentsCount: 1,
      media: { kind: "image", url: "https://ejemplo.org/foto.png" },
      tags: ["arte"],
    };
    const vista = publicacionDesdeNormalizada(normalizada);
    expect(vista.id).toBe("post-2");
    expect(vista.titulo).toBe("Mirada");
    expect(vista.medio).toBe("image");
    expect(vista.tipo).toBe("ensayo");
    expect(vista.etiquetas).toEqual(["arte"]);
    expect(JSON.stringify(vista)).not.toContain("no se copia");
  });

  it("la fuente social lee las publicaciones inyectadas", async () => {
    const fuente = crearFuenteSocial(async () => ({ publicaciones: [publicacion()] }));
    const { nodos } = await fuente.leer(observador);
    expect(nodos.size).toBe(1);
    expect(nodos.get("publicacion:post-1")?.tipo).toBe("publicacion");
  });
});

describe("fuente de gobierno", () => {
  it("traduce cada ámbito a un alcance de visibilidad seguro", () => {
    expect(alcanceDesdeScope("global")).toBe("publico");
    expect(alcanceDesdeScope("group")).toBe("grupo");
    expect(alcanceDesdeScope("page")).toBe("comunidad");
    expect(alcanceDesdeScope("community")).toBe("comunidad");
    expect(alcanceDesdeScope("account")).toBe("privado");
    expect(alcanceDesdeScope("message")).toBe("privado");
    expect(alcanceDesdeScope("desconocido")).toBe("privado");
  });

  it("mapea una propuesta de grupo a una rama de flujo con su estado y urgencia", () => {
    const nodo = nodoDesdePropuesta(propuesta());
    expect(nodo.id).toBe("propuesta:p1");
    expect(nodo.tipo).toBe("propuesta");
    expect(nodo.formato).toBe("flujo");
    expect(nodo.ref).toBe("/network/politics?propuesta=p1");
    expect(nodo.alcance).toBe("grupo");
    expect(nodo.dueno).toBe("grupo-1");
    expect(nodo.capas).toContain("gobierno");
    expect(nodo.etiquetas).toContain("policy");
    expect(nodo.etiquetas).toContain("open");
    expect(nodo.etiquetas).toContain("high");
    expect(nodo.peso).toBe(1);
  });

  it("una propuesta de cuenta es privada de su autor y no copia la descripción", () => {
    const nodo = nodoDesdePropuesta(
      propuesta({ scope: "account", scope_ref: null, status: "rejected" }),
    );
    expect(nodo.alcance).toBe("privado");
    expect(nodo.dueno).toBe("u2");
    expect(nodo.peso).toBeLessThan(1);
    expect(JSON.stringify(nodo)).not.toContain("Descripción");
  });

  it("representa los votos como nodos públicos y aristas «vota», sin el comentario privado", () => {
    const conComentario = { ...voto(), comment: "SECRETO-PRIVADO" };
    const { nodos, aristas } = nodosDesdeVotos(propuesta(), [conComentario]);
    expect(nodos).toHaveLength(1);
    expect(nodos[0].id).toBe("voto:p1:u2");
    expect(nodos[0].titulo).toBe("Voto · Sí");
    expect(nodos[0].tipo).toBe("voto");
    expect(nodos[0].alcance).toBe("publico");
    expect(aristas[0]).toMatchObject({ de: "voto:p1:u2", a: "propuesta:p1", tipo: "vota" });
    expect(JSON.stringify(nodos)).not.toContain("SECRETO-PRIVADO");
  });

  it("la delegación es privada de quien delega y la membresía privada de su cuenta", () => {
    const delegacion = nodoDesdeDelegacion({
      delegator_user: "u1",
      delegate_user: "u3",
      topic: "group:grupo-1",
      expires_at: "2027-01-01T00:00:00.000Z",
    });
    expect(delegacion.alcance).toBe("privado");
    expect(delegacion.dueno).toBe("u1");
    expect(delegacion.etiquetas).toContain("group:grupo-1");

    const membresia = nodoDesdeMembresia({ grupoSlug: "grupo-1", usuarioId: "u1", rol: "miembro" });
    expect(membresia.alcance).toBe("privado");
    expect(membresia.dueno).toBe("u1");
    expect(membresia.ref).toBe("/grupo/grupo-1");
    expect(membresia.etiquetas).toContain("miembro");
  });

  it("la fuente de gobierno compone propuestas, votos, delegaciones y membresías", async () => {
    const fuente = crearFuenteGobierno(async () => ({
      propuestas: [propuesta()],
      votos: [voto()],
      delegaciones: [
        { delegator_user: "u1", delegate_user: "u3", topic: "group:grupo-1", expires_at: "2027-01-01T00:00:00.000Z" },
      ],
      membresias: [{ usuarioId: "u1", grupoSlug: "grupo-1", rol: "miembro" }],
    }));
    const { nodos, aristas } = await fuente.leer(observador);
    expect(nodos.has("propuesta:p1")).toBe(true);
    expect(nodos.has("voto:p1:u2")).toBe(true);
    expect(nodos.has("membresia:grupo-1:u1")).toBe(true);
    expect(aristas.some((a) => a.tipo === "vota")).toBe(true);
  });
});

describe("fuente de eventos", () => {
  it("adapta un evento social del OS a la vista del grafo sin copiar su descripción", () => {
    const vista = eventoDesdeOsEvento(osEvento());
    expect(vista.id).toBe("ev-1");
    expect(vista.slug).toBe("encuentro-1");
    expect(vista.organizadorSlug).toBe("ciencia");
    expect(vista.asistentes).toBe(25);
    expect(JSON.stringify(vista)).not.toContain("no debe copiarse");
  });

  it("mapea el evento a una constelación pública abrible", () => {
    const nodo = nodoDesdeEvento(evento());
    expect(nodo.id).toBe("evento:encuentro-1");
    expect(nodo.tipo).toBe("evento");
    expect(nodo.formato).toBe("documento");
    expect(nodo.ref).toBe("/evento/encuentro-1");
    expect(nodo.alcance).toBe("publico");
    expect(nodo.capas).toContain("eventos");
    expect(nodo.etiquetas).toContain("taller");
    expect(nodo.peso).toBeGreaterThan(0.6);
  });

  it("respeta la privacidad de un evento privado del calendario", () => {
    const vista = eventoDesdeFila(filaEvento());
    expect(vista.alcance).toBe("privado");
    expect(vista.dueno).toBe("u9");
    expect(nodoDesdeEvento(vista).alcance).toBe("privado");
  });

  it("enlaza el evento con la página que lo organiza", () => {
    const aristas = aristasDeEvento(evento());
    expect(aristas).toHaveLength(1);
    expect(aristas[0]).toMatchObject({
      de: "entidad:page:ciencia",
      a: "evento:encuentro-1",
      tipo: "contiene",
    });
  });

  it("la fuente de eventos lee los eventos inyectados", async () => {
    const fuente = crearFuenteEventos(async () => ({ eventos: [evento()] }));
    const { nodos, aristas } = await fuente.leer(observador);
    expect(nodos.size).toBe(1);
    expect(aristas).toHaveLength(0);
  });
});
