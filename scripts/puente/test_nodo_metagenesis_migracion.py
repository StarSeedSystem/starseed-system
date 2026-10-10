# -*- coding: utf-8 -*-
"""Prueba REAL de la migración 20261011100000_metagenesis_nodos.sql en un Postgres de usar y tirar.

Levanta un clúster temporal (Postgres 16 del contenedor; se salta si la máquina no tiene `initdb`),
imita lo mínimo de Supabase (roles anon/authenticated/service_role, `auth.users`, `auth.uid()`,
esquema `extensions`, publicación `supabase_realtime`, `profiles`), aplica la migración de accesos
(20261010091000) y la de nodos DOS veces (idempotente) y comprueba con la RLS impersonando roles:
arriendo atómico (toma, renovación, caducidad, relevo ordenado, ceder), llaves de nodo, órdenes
solo de miembros y a su nombre, lista blanca de argumentos, tope por hora, foto solo del líder y
la huella de la llave invisible incluso para los miembros. Nunca toca la base de verdad.
"""
import glob
import json
import os
import pwd
import re
import sys
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
RAIZ = os.path.dirname(os.path.dirname(DIR))
MIG = os.path.join(RAIZ, "supabase", "migrations")

STUB = r"""
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.profiles (user_id uuid, handle text, display_name text, name text,
  created_at timestamptz DEFAULT now());
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000a1e7', 'maggasukha@star.seed'),
  ('00000000-0000-0000-0000-0000000000de', 'dev@star.seed'),
  ('00000000-0000-0000-0000-0000000000ee', 'otra@star.seed')
ON CONFLICT DO NOTHING;
"""

ESCENARIO = r"""
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.espera_error(_sql text, _codigo text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'PRUEBA: se esperaba el error % y no hubo error: %', _codigo, _sql;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> _codigo THEN
    RAISE EXCEPTION 'PRUEBA: se esperaba % y llegó % (%) en: %', _codigo, SQLSTATE, SQLERRM, _sql;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.afirma(_ok boolean, _que text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_ok, false) THEN RAISE EXCEPTION 'PRUEBA FALLIDA: %', _que; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.espera_error(text, text), pg_temp.afirma(boolean, text) TO anon, authenticated, service_role;

-- Dev entra en MetaGenesis (lo da el dueño).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a1e7', false);
SET ROLE authenticated;
SELECT public.metagenesis_otorgar('dev@star.seed', 'desarrollador');
-- Un dueño da de alta dos nodos (huellas de llaves de PRUEBA).
SELECT public.metagenesis_registrar_nodo('mac-aaaaaa', encode(extensions.digest('llave-de-prueba-de-la-mac-0123456789', 'sha256'), 'hex'), 'mac');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE service_role;
SELECT public.metagenesis_registrar_nodo('oracle-a1-bbbbbb', encode(extensions.digest('llave-de-prueba-del-a1-0123456789ab', 'sha256'), 'hex'), 'oracle-a1');
RESET ROLE;

-- Un desarrollador (no dueño) no da de alta nodos.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000de', false);
SET ROLE authenticated;
SELECT pg_temp.espera_error($q$ SELECT public.metagenesis_registrar_nodo('neurona-cccccc', repeat('a', 64), 'neurona') $q$, '42501');
RESET ROLE;

-- Los nodos hablan como anon con su llave.
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT pg_temp.espera_error($q$ SELECT public.metagenesis_nodo_hola('mac-aaaaaa', 'llave-equivocada-0123456789abcdef0123') $q$, '42501');
SELECT pg_temp.afirma(public.metagenesis_nodo_hola('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789'), 'hola con la llave buena');
SELECT pg_temp.espera_error($q$ SELECT * FROM public.metagenesis_arriendo $q$, '42501');
SELECT pg_temp.espera_error($q$ SELECT public.metagenesis_registrar_nodo('x-aaaaaa', repeat('a', 64), 'neurona') $q$, '42501');

-- 1) El primero que llega toma el arriendo (término 1); el segundo lo ve, no lo toma.
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', 'mac',
  '{"modo":"real"}', 1500, 900)->'arriendo'->>'lider') = 'mac-aaaaaa', 'la Mac toma el mando');
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', 'oracle-a1',
  '{"modo":"real"}', 1250, 900)->'arriendo'->>'lider') = 'mac-aaaaaa', 'el A1 ve a la Mac de líder');
SELECT pg_temp.afirma(jsonb_array_length(public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab',
  'oracle-a1', '{"modo":"real"}', 1250, 900)->'nodos') = 2, 'dos nodos vivos');
RESET ROLE;

-- 2) La Mac deja de latir: el arriendo caduca y el A1 lo toma (término 2).
UPDATE public.metagenesis_arriendo SET expira = now() - interval '1 second';
SET ROLE anon;
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', 'oracle-a1',
  '{"modo":"real"}', 1250, 900)->'arriendo') @> '{"lider":"oracle-a1-bbbbbb","termino":2}', 'relevo por caducidad');
-- 3) La Mac vuelve: sin racha estable no quita el mando…
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', 'mac',
  '{"modo":"real"}', 1500, 900)->'arriendo'->>'lider') = 'oracle-a1-bbbbbb', 'la Mac recién llegada no quita el mando');
RESET ROLE;
UPDATE public.metagenesis_nodos SET desde = now() - interval '700 seconds' WHERE nodo = 'mac-aaaaaa';
SET ROLE anon;
-- …con racha estable y +100 puntos, relevo ordenado (término 3).
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', 'mac',
  '{"modo":"real"}', 1500, 900)->'arriendo') @> '{"lider":"mac-aaaaaa","termino":3}', 'relevo ordenado');
-- 4) Ceder: con puntos negativos ni renueva; tras ceder, el A1 lo toma (término 4).
SELECT pg_temp.afirma(public.metagenesis_nodo_ceder('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789'), 'ceder');
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', 'mac',
  '{"modo":"real"}', -500, 900)->'arriendo'->>'expira')::timestamptz <= now(), 'quien cede no renueva');
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', 'oracle-a1',
  '{"modo":"real"}', 1250, 900)->'arriendo') @> '{"lider":"oracle-a1-bbbbbb","termino":4}', 'el A1 toma tras ceder');
RESET ROLE;

-- 5) Órdenes: una cuenta sin acceso no puede; un miembro sí, a su nombre y con la lista blanca.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ee', false);
SET ROLE authenticated;
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion) VALUES ('continuar') $q$, '42501');
SELECT pg_temp.afirma((SELECT count(*) FROM public.metagenesis_arriendo) = 0, 'sin acceso no ve el arriendo');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000de', false);
SET ROLE authenticated;
INSERT INTO public.metagenesis_ordenes (accion, para) VALUES ('revisar_bloqueadas', 'lider');
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion, args) VALUES ('continuar', '{"rm":"-rf"}') $q$, '22023');
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion, args) VALUES ('lanzar_cola', '{"cola":"../x"}') $q$, '22023');
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion) VALUES ('borrar_todo') $q$, '23514');
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion, por) VALUES ('continuar', '00000000-0000-0000-0000-00000000a1e7') $q$, '42501');
SELECT pg_temp.espera_error($q$ UPDATE public.metagenesis_ordenes SET estado = 'hecha' $q$, '42501');
SELECT pg_temp.espera_error($q$ SELECT huella_llave FROM public.metagenesis_nodos $q$, '42501');
SELECT pg_temp.afirma((SELECT count(*) FROM public.metagenesis_nodos) = 2, 'el miembro ve los nodos (sin la huella)');
SELECT pg_temp.afirma((SELECT por FROM public.metagenesis_ordenes LIMIT 1) = '00000000-0000-0000-0000-0000000000de', 'la orden va a su nombre');
RESET ROLE;

-- 6) La recoge SOLO el líder (el A1), una vez, y solo él escribe su resultado.
SELECT id AS orden_id FROM public.metagenesis_ordenes WHERE accion = 'revisar_bloqueadas' \gset
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
-- (la Mac sigue cediendo: puntos negativos durante 30 min, como hace nodo_metagenesis.py)
SELECT pg_temp.afirma(jsonb_array_length(public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789',
  'mac', '{"modo":"real"}', -500, 900)->'ordenes') = 0, 'la Mac (no líder) no recoge órdenes del líder');
SELECT pg_temp.afirma((public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', 'oracle-a1',
  '{"modo":"real"}', 1250, 900)->'ordenes'->0->>'accion') = 'revisar_bloqueadas', 'el líder recoge la orden');
SELECT pg_temp.afirma(jsonb_array_length(public.metagenesis_nodo_latir('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab',
  'oracle-a1', '{"modo":"real"}', 1250, 900)->'ordenes') = 0, 'y no la recoge dos veces');
SELECT pg_temp.afirma(NOT public.metagenesis_nodo_orden_resultado('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789',
  (:orden_id)::bigint, 'hecha', 'no era mía'), 'otro nodo no escribe el resultado');
SELECT pg_temp.afirma(public.metagenesis_nodo_orden_resultado('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab',
  (:orden_id)::bigint, 'en_marcha', 'lanzado'), 'el que la tomó escribe el resultado');
-- 7) Foto: solo la publica el líder.
SELECT pg_temp.afirma(NOT public.metagenesis_nodo_foto('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', '{"lider":"mac"}'), 'foto de quien no dirige');
SELECT pg_temp.afirma(public.metagenesis_nodo_foto('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', '{"lider":"oracle-a1-bbbbbb"}'), 'foto del líder');
SELECT pg_temp.afirma(public.metagenesis_nodo_colas('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', '[{"id":"P1"}]'), 'colas portables');
SELECT pg_temp.afirma(public.metagenesis_nodo_leer_colas('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab') = '[{"id":"P1"}]', 'leer colas');
SELECT pg_temp.afirma(public.metagenesis_nodo_bitacora('oracle-a1-bbbbbb', 'llave-de-prueba-del-a1-0123456789ab', 'decision', 'prueba'), 'bitácora');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000de', false);
SET ROLE authenticated;
SELECT pg_temp.afirma((SELECT estado FROM public.metagenesis_ordenes WHERE id = :orden_id) = 'en_marcha', 'el miembro ve el resultado');
SELECT pg_temp.afirma((SELECT foto->>'lider' FROM public.metagenesis_arriendo) = 'oracle-a1-bbbbbb', 'el miembro ve la foto');
-- 8) Tope: 30 órdenes por hora y cuenta.
DO $$ BEGIN FOR i IN 1..29 LOOP INSERT INTO public.metagenesis_ordenes (accion) VALUES ('continuar'); END LOOP; END $$;
SELECT pg_temp.espera_error($q$ INSERT INTO public.metagenesis_ordenes (accion) VALUES ('continuar') $q$, '54000');
RESET ROLE;

-- 9) Un nodo revocado ya no late.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a1e7', false);
SET ROLE authenticated;
SELECT pg_temp.afirma(public.metagenesis_revocar_nodo('mac-aaaaaa'), 'revocar');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT pg_temp.espera_error($q$ SELECT public.metagenesis_nodo_latir('mac-aaaaaa', 'llave-de-prueba-de-la-mac-0123456789', 'mac', '{}', 1500, 900) $q$, '42501');
RESET ROLE;
SELECT pg_temp.afirma((SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                       AND tablename IN ('metagenesis_arriendo', 'metagenesis_ordenes')) = 2, 'tiempo real');
SELECT 'ESCENARIO_OK';
"""


def _bin(nombre):
    for patron in ("/usr/lib/postgresql/*/bin/%s" % nombre, "/opt/homebrew/opt/postgresql*/bin/%s" % nombre,
                   "/usr/local/opt/postgresql*/bin/%s" % nombre):
        hallados = sorted(glob.glob(patron))
        if hallados:
            return hallados[-1]
    return shutil.which(nombre)


def _puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(_bin("initdb") and _bin("pg_ctl") and _bin("psql"), "sin Postgres en esta máquina")
class TestMigracionNodos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.como = []
        if os.geteuid() == 0:
            try:
                pwd.getpwnam("postgres")
            except KeyError:
                raise unittest.SkipTest("como root hace falta el usuario postgres")
            cls.como = ["runuser", "-u", "postgres", "--"]
        cls.dir = tempfile.mkdtemp(prefix="mg-pg-")
        os.chmod(cls.dir, 0o777)
        cls.datos = os.path.join(cls.dir, "datos")
        cls.puerto = _puerto_libre()
        subprocess.run(cls.como + [_bin("initdb"), "-D", cls.datos, "-A", "trust", "-U", "postgres", "--no-sync"],
                       check=True, capture_output=True)
        subprocess.run(cls.como + [_bin("pg_ctl"), "-D", cls.datos, "-o", "-p %d -k %s -c listen_addresses=''" % (cls.puerto, cls.dir),
                                   "-l", os.path.join(cls.dir, "log"), "-w", "start"], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        subprocess.run(cls.como + [_bin("pg_ctl"), "-D", cls.datos, "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(cls.dir, ignore_errors=True)

    def psql(self, sql=None, archivo=None):
        orden = self.como + [_bin("psql"), "-h", self.dir, "-p", str(self.puerto), "-U", "postgres", "-d", "postgres",
                             "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
        if archivo:
            orden += ["-f", archivo]
        r = subprocess.run(orden, input=sql, capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, (r.stdout[-1500:], r.stderr[-3000:]))
        return r.stdout

    def _literal(self, v, nombre):
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, int):
            return "%d::%s" % (v, "bigint" if nombre == "_id" else "integer")
        if isinstance(v, (dict, list)):
            return "'%s'::jsonb" % json.dumps(v, ensure_ascii=False).replace("'", "''")
        if v is None:
            return "NULL"
        return "'%s'::text" % str(v).replace("'", "''")

    def http_postgrest(self, metodo, url, cab, cuerpo, tope):
        """Lo mínimo de PostgREST para las RPC: POST /rest/v1/rpc/<f> → SELECT f(_a => …) como anon."""
        m = re.search(r"/rest/v1/rpc/([a-z_]+)$", url)
        if metodo != "POST" or not m:
            return 404, json.dumps({"code": "PGRST202"})
        args = json.loads(cuerpo or b"{}")
        lista = ", ".join("%s => %s" % (k, self._literal(v, k)) for k, v in args.items())
        sql = ("\\set VERBOSITY verbose\nSET ROLE anon;\nSELECT set_config('request.jwt.claim.sub', '', false) \\g /dev/null\n"
               "SELECT to_jsonb(public.%s(%s));\n" % (m.group(1), lista))
        orden = self.como + [_bin("psql"), "-h", self.dir, "-p", str(self.puerto), "-U", "postgres", "-d", "postgres",
                             "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]
        r = subprocess.run(orden, input=sql, capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            codigo = (re.search(r"ERROR:\s+([0-9A-Z]{5})", r.stderr) or [None, "XX000"])[1]
            return (403 if codigo == "42501" else 400), json.dumps({"code": codigo, "message": r.stderr[-200:]})
        lineas = [l for l in r.stdout.splitlines() if l.strip()]
        return 200, lineas[-1] if lineas else "null"

    def test_migracion_idempotente_y_segura(self):
        self.psql(STUB)
        accesos = os.path.join(MIG, "20261010091000_metagenesis_accesos.sql")
        nodos = os.path.join(MIG, "20261011100000_metagenesis_nodos.sql")
        for ruta in (accesos, nodos, nodos):  # la de nodos, dos veces: idempotente
            with open(ruta, encoding="utf-8") as f:
                self.psql(f.read())
        salida = self.psql(ESCENARIO)
        self.assertIn("ESCENARIO_OK", salida)
        self._contrato_python_sql()

    def _contrato_python_sql(self):
        """El nodo de verdad (nodo_metagenesis.Nodo) en modo tablas contra las funciones de verdad."""
        import hashlib
        import nodo_metagenesis as N
        import nodo_metagenesis_logica as L
        from test_nodo_metagenesis import MedioFalso, Reloj

        llaves = {"a": "llave-python-del-nodo-a-0123456789abcdef", "b": "llave-python-del-nodo-b-0123456789abcdef"}
        ids = {"a": L.id_de_nodo("oracle-a1", "huella-py-a"), "b": L.id_de_nodo("nube-cowork", "huella-py-b")}
        medios = {"a": "oracle-a1", "b": "nube-cowork"}
        for k in ("a", "b"):
            self.psql("SET ROLE service_role; SELECT public.metagenesis_registrar_nodo('%s', '%s', '%s');"
                      % (ids[k], hashlib.sha256(llaves[k].encode()).hexdigest(), medios[k]))
        # El arriendo de las pruebas de arriba lo tiene otro nodo: se libera (como si caducara).
        self.psql("UPDATE public.metagenesis_arriendo SET expira = now() - interval '1 second';"
                  " UPDATE public.metagenesis_ordenes SET estado = 'caducada' WHERE estado = 'pendiente';")
        env = {"NEXT_PUBLIC_SUPABASE_URL": "http://postgrest.prueba", "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon-prueba"}
        reloj = Reloj(time.time())
        nodos = {}
        medios_falsos = {}
        for k in ("a", "b"):
            medios_falsos[k] = MedioFalso(medio=medios[k], autoritativo=False)
            nodos[k] = N.Nodo(env=dict(env), medir=medios_falsos[k].medir, ejecutar=medios_falsos[k].ejecutar,
                              http=self.http_postgrest, reloj=reloj, persistir=False, huella="huella-py-" + k,
                              memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True},
                              llave=llaves[k], chat=lambda t: None)
        ia = nodos["a"].vuelta()
        ib = nodos["b"].vuelta()
        self.assertEqual((ia["enlace"], ib["enlace"]), ("tablas", "tablas"))
        self.assertTrue(ia["soy_lider"])
        self.assertEqual(ib["lider"], ids["a"])
        self.assertEqual(set(ib["vivos"]) & {ids["a"], ids["b"]}, {ids["a"], ids["b"]})
        # Un miembro deja una orden para el líder desde «cualquier neurona» (RLS).
        # (el dueño: la cuenta de desarrollo ya gastó su tope de 30 órdenes por hora arriba)
        self.psql("SET ROLE authenticated;\n"
                  "SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a1e7', false);\n"
                  "INSERT INTO public.metagenesis_ordenes (accion, para) VALUES ('buscar_capacidad', 'lider');")
        ia = nodos["a"].vuelta()
        self.assertEqual([o["estado"] for o in ia["ordenes"]], ["hecha"])
        self.assertIn(("buscar_capacidad", False, {}), medios_falsos["a"].hechas)
        estado = self.psql("SELECT estado || '|' || tomada_por FROM public.metagenesis_ordenes WHERE accion = 'buscar_capacidad';")
        self.assertEqual(estado.strip(), "hecha|%s" % ids["a"])
        # La foto del líder llega a la tabla y la lee un miembro.
        foto = self.psql("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000de', false);"
                         " SELECT foto->>'lider' FROM public.metagenesis_arriendo;")
        self.assertIn(ids["a"], foto)


if __name__ == "__main__":
    unittest.main()
