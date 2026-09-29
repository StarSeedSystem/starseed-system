/**
 * Feed de la Red · los «posts 400» del 28-09 (contrato «consumo», 2026-09-29). La consulta del
 * widget se rechazaba una y otra vez. Ahora: el primer 400 por esquema deja UN aviso con el
 * error real de Postgres y la sesión sigue con una consulta que no nombra columnas dudosas; si
 * la tabla ni existe, el feed queda vacío sin volver a preguntar.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Resp = { data: unknown; error: unknown; status: number };
const db = vi.hoisted(() => ({
  consultas: [] as string[],
  preciso: null as unknown as Resp,
  tolerante: null as unknown as Resp,
}));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: (cols: string) => {
        const esTolerante = cols === "*";
        const cadena = {
          neq: () => cadena,
          order: () => cadena,
          limit: async () => {
            db.consultas.push(esTolerante ? "tolerante" : "preciso");
            return esTolerante ? db.tolerante : db.preciso;
          },
        };
        return cadena;
      },
    }),
  }),
}));

const fila = (id: string, type = "post") => ({
  id,
  type,
  author_id: "a1",
  content: { text: `hola ${id}` },
  created_at: "2026-09-28T10:00:00Z",
});

beforeEach(async () => {
  db.consultas = [];
  const m = await import("@/lib/feed/network-feed");
  m._reiniciarFeedParaPruebas();
  vi.restoreAllMocks();
});

describe("fetchNetworkFeedConEstado", () => {
  test("esquema del Lienzo: una sola consulta precisa", async () => {
    db.preciso = { data: [fila("p1")], error: null, status: 200 };
    const { fetchNetworkFeedConEstado } = await import("@/lib/feed/network-feed");
    const r = await fetchNetworkFeedConEstado({ limit: 5 });
    expect(r.fallo).toBeNull();
    expect(r.posts.map((p) => p.id)).toEqual(["p1"]);
    expect(db.consultas).toEqual(["preciso"]);
  });

  test("un 400 por columna ausente avisa UNA vez y pasa a la consulta tolerante (sin más 400)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.preciso = { data: null, error: { code: "42703", message: "column posts.interactions does not exist" }, status: 400 };
    db.tolerante = { data: [fila("p1"), fila("c1", "comment"), fila("p2")], error: null, status: 200 };
    const { fetchNetworkFeedConEstado, enrichCommentCounts } = await import("@/lib/feed/network-feed");
    const r1 = await fetchNetworkFeedConEstado({ limit: 5 });
    expect(r1.fallo).toBeNull();
    expect(r1.posts.map((p) => p.id)).toEqual(["p1", "p2"]); // el comentario se filtra aquí
    const r2 = await fetchNetworkFeedConEstado({ limit: 5 });
    expect(r2.posts).toHaveLength(2);
    expect(db.consultas).toEqual(["preciso", "tolerante", "tolerante"]);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("42703");
    // Lo que depende de `type`/`post_references` ya no pregunta.
    const conConteos = await enrichCommentCounts(r1.posts);
    expect(conConteos).toBe(r1.posts);
  });

  test("tabla ausente (404): feed vacío y ni una petición más", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.preciso = { data: null, error: { code: "PGRST205", message: "Could not find the table" }, status: 404 };
    const { fetchNetworkFeedConEstado, fetchNetworkFeed } = await import("@/lib/feed/network-feed");
    const r = await fetchNetworkFeedConEstado();
    expect(r.posts).toEqual([]);
    expect(await fetchNetworkFeed()).toEqual([]);
    expect(await fetchNetworkFeed()).toEqual([]);
    expect(db.consultas).toEqual(["preciso"]);
  });

  test("un 503 no cambia de modo: se devuelve el fallo para que el sondeo espere", async () => {
    db.preciso = { data: null, error: { message: "Service Unavailable" }, status: 503 };
    const { fetchNetworkFeedConEstado } = await import("@/lib/feed/network-feed");
    const r = await fetchNetworkFeedConEstado();
    expect(r.fallo?.status).toBe(503);
    db.preciso = { data: [fila("p9")], error: null, status: 200 };
    const r2 = await fetchNetworkFeedConEstado();
    expect(r2.posts.map((p) => p.id)).toEqual(["p9"]);
    expect(db.consultas).toEqual(["preciso", "preciso"]);
  });
});
