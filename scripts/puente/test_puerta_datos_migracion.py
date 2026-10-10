# -*- coding: utf-8 -*-
"""Prueba REAL de la migración 20261011120000_puerta_datos.sql en un Postgres de usar y tirar (PDA1010).

Levanta un clúster temporal (Postgres 16 del contenedor; se salta si la máquina no tiene `initdb`),
imita lo mínimo de Supabase (roles anon/authenticated/service_role, `auth.users`, `auth.uid()`,
esquema `extensions`) y las tablas que la réplica toca con su DDL real (`relevo_eventos`,
`neuron_devices`, `os_presencia`), aplica la migración de accesos de MetaGenesis y la de la puerta
DOS veces (idempotente) y comprueba, impersonando roles como lo haría PostgREST:

  · la llave de la puerta: sin ella, con otra o revocada → 42501; anon no puede darla de alta;
  · el lote con la MISMA forma que arma `servicios/puerta-datos/src/replica.mjs`;
  · neuronas: solo adelanta filas que existen y son de esa cuenta (nunca crea ni cambia dueño);
  · presencia: adelanta `visto` y no toca `visible`;
  · eventos con los límites de relevo_eventos y fechas raras o del futuro saneadas;
  · el espejo del arriendo solo lo leen miembros de MetaGenesis; os_puerta_datos, cuentas con sesión;
  · tope de lotes por día; y la vuelta atrás (rollback) deja relevo_eventos/neuronas intactas.
Nunca toca la base de verdad.
"""
import glob
import hashlib
import json
import os
import pwd
import shutil
import socket
import subprocess
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIR))
MIG = os.path.join(RAIZ, "supabase", "migrations")

CUENTA = "00000000-0000-0000-0000-00000000a1e7"
OTRA = "00000000-0000-0000-0000-0000000000ee"
LLAVE = "llave-de-la-puerta-" + "x" * 30
HUELLA = hashlib.sha256(LLAVE.encode()).hexdigest()

STUB = r"""
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.profiles (user_id uuid, handle text, display_name text, name text,
  created_at timestamptz DEFAULT now());
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000a1e7', 'maggasukha@star.seed'),
  ('00000000-0000-0000-0000-0000000000ee', 'otra@star.seed')
ON CONFLICT DO NOTHING;
-- DDL real de las tablas que toca la réplica (copiado de sus migraciones).
CREATE TABLE IF NOT EXISTS public.relevo_eventos (
  id bigint generated always as identity primary key, t timestamptz not null default now(),
  quien text not null, tipo text not null, tarea text null, texto text not null, datos jsonb null);
CREATE TABLE IF NOT EXISTS public.neuron_devices (
  id text PRIMARY KEY, owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name text,
  kind text, capabilities jsonb NOT NULL DEFAULT '{}'::jsonb, permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.os_presencia (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visto timestamptz NOT NULL DEFAULT now(), visible boolean NOT NULL DEFAULT true);
INSERT INTO public.neuron_devices (id, owner, name, last_seen_at) VALUES
  ('mac-1', '00000000-0000-0000-0000-00000000a1e7', 'Mac', now() - interval '2 hours'),
  ('movil-otra', '00000000-0000-0000-0000-0000000000ee', 'Móvil', now() - interval '2 hours')
ON CONFLICT DO NOTHING;
INSERT INTO public.os_presencia (user_id, visto, visible) VALUES
  ('00000000-0000-0000-0000-0000000000ee', now() - interval '3 hours', false)
ON CONFLICT DO NOTHING;
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


def lote_como_replica_mjs(ahora_iso):
    """La forma EXACTA que arma replica.mjs (armarLote)."""
    return {
        "eventos": [
            {"t": ahora_iso, "quien": "enjambre", "tipo": "integrada", "tarea": "T1", "texto": "T1 integrada", "datos": {"sha": "abc"}},
            {"t": "no-es-fecha", "quien": "vigia", "tipo": "aviso", "tarea": None, "texto": "x" * 5000, "datos": None},
            {"t": "2999-01-01T00:00:00Z", "quien": "futuro", "tipo": "aviso", "tarea": "", "texto": "del futuro", "datos": None},
            {"t": ahora_iso, "quien": "", "tipo": "sin-quien", "texto": "fuera"},
        ],
        "neuronas": [
            {"cuenta": CUENTA, "neurona": "mac-1", "visto": ahora_iso},
            {"cuenta": CUENTA, "neurona": "movil-otra", "visto": ahora_iso},   # no es suya
            {"cuenta": CUENTA, "neurona": "no-existe", "visto": ahora_iso},    # no se crea
        ],
        "presencia": [
            {"cuenta": CUENTA, "visto": ahora_iso},
            {"cuenta": OTRA, "visto": ahora_iso},
            {"cuenta": "00000000-0000-0000-0000-000000000bad", "visto": ahora_iso},  # sin cuenta
        ],
        "arriendo": {"lider": "mac-a1b2c3", "termino": 3, "expira": ahora_iso, "foto": {"nodos": 2}, "foto_en": ahora_iso},
    }


@unittest.skipUnless(_bin("initdb") and _bin("pg_ctl") and _bin("psql"), "sin Postgres en esta máquina")
class TestMigracionPuertaDatos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.como = []
        if os.geteuid() == 0:
            try:
                pwd.getpwnam("postgres")
            except KeyError:
                raise unittest.SkipTest("como root hace falta el usuario postgres")
            cls.como = ["runuser", "-u", "postgres", "--"]
        cls.dir = tempfile.mkdtemp(prefix="pd-pg-")
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

    def psql(self, sql, esperar_error=None):
        orden = self.como + [_bin("psql"), "-h", self.dir, "-p", str(self.puerto), "-U", "postgres", "-d", "postgres",
                             "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
        r = subprocess.run(orden, input="\\set VERBOSITY verbose\n" + sql, capture_output=True, text=True, timeout=120)
        if esperar_error:
            self.assertNotEqual(r.returncode, 0, "se esperaba el error %s" % esperar_error)
            self.assertIn(esperar_error, r.stderr, r.stderr[-800:])
            return r.stderr
        self.assertEqual(r.returncode, 0, (r.stdout[-1500:], r.stderr[-3000:]))
        return r.stdout.strip()

    def como_rol(self, rol, sql, sub="", esperar_error=None):
        return self.psql("SET ROLE %s;\nSELECT set_config('request.jwt.claim.sub', '%s', false) \\g /dev/null\n%s" % (rol, sub, sql),
                         esperar_error=esperar_error)

    def rpc(self, rol, llave, lote, esperar_error=None, sub=""):
        lit = json.dumps(lote, ensure_ascii=False).replace("'", "''")
        return self.como_rol(rol, "SELECT public.puerta_datos_replicar('%s', '%s'::jsonb);" % (llave.replace("'", "''"), lit),
                             sub=sub, esperar_error=esperar_error)

    def test_migracion_idempotente_y_segura(self):
        self.psql(STUB)
        with open(os.path.join(MIG, "20261010091000_metagenesis_accesos.sql"), encoding="utf-8") as f:
            self.psql(f.read())
        with open(os.path.join(MIG, "20261011120000_puerta_datos.sql"), encoding="utf-8") as f:
            sql = f.read()
        self.psql(sql)
        self.psql(sql)  # dos veces: idempotente

        # Alta de la llave: anon no puede; una cuenta que no es dueña tampoco; la clave de servicio sí.
        self.como_rol("anon", "SELECT public.puerta_datos_registrar_llave('puerta-a1', '%s');" % HUELLA,
                      esperar_error="42501")
        self.como_rol("authenticated", "SELECT public.puerta_datos_registrar_llave('puerta-a1', '%s');" % HUELLA,
                      sub=OTRA, esperar_error="42501")
        self.como_rol("service_role", "SELECT public.puerta_datos_registrar_llave('puerta-a1', '%s');" % HUELLA)
        # La tabla de llaves es invisible para anon y para las cuentas.
        self.como_rol("anon", "SELECT count(*) FROM public.puerta_datos_llaves;", esperar_error="42501")
        self.como_rol("authenticated", "SELECT count(*) FROM public.puerta_datos_llaves;", sub=CUENTA, esperar_error="42501")

        ahora = self.psql("SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');")
        lote = lote_como_replica_mjs(ahora)
        # Sin llave buena no entra nada.
        self.rpc("anon", "corta", lote, esperar_error="42501")
        self.rpc("anon", "z" * 40, lote, esperar_error="42501")
        # Con la llave, como anon (la clave pública que lleva la puerta).
        res = json.loads(self.rpc("anon", LLAVE, lote))
        self.assertEqual(res["eventos"], 3)        # el sin «quien» no entra
        self.assertEqual(res["neuronas"], 1)       # solo la suya y existente
        self.assertEqual(res["presencia"], 2)      # la cuenta inventada no
        self.assertEqual(res["arriendo"], 1)

        ev = self.psql("SELECT quien, tipo, coalesce(tarea, '-'), char_length(texto), t <= now() FROM public.relevo_eventos ORDER BY id;")
        filas = [l.split("|") for l in ev.splitlines()]
        self.assertEqual([f[0] for f in filas], ["enjambre", "vigia", "futuro"])
        self.assertEqual(filas[1][3], "4000")                  # recortado a 4000
        self.assertTrue(all(f[4] == "t" for f in filas))       # nada del futuro
        self.assertEqual(filas[2][2], "-")                     # tarea vacía → null
        self.assertEqual(self.psql("SELECT datos->>'sha' FROM public.relevo_eventos WHERE quien = 'enjambre';"), "abc")

        # Neuronas: la de la cuenta adelantada; la de otra cuenta intacta; ninguna creada.
        self.assertEqual(self.psql("SELECT last_seen_at > now() - interval '1 minute' FROM public.neuron_devices WHERE id = 'mac-1';"), "t")
        self.assertEqual(self.psql("SELECT last_seen_at < now() - interval '1 hour' FROM public.neuron_devices WHERE id = 'movil-otra';"), "t")
        self.assertEqual(self.psql("SELECT count(*) FROM public.neuron_devices;"), "2")
        self.assertEqual(self.psql("SELECT owner::text FROM public.neuron_devices WHERE id = 'movil-otra';"), OTRA)

        # Presencia: `visto` adelanta, `visible` de la otra persona sigue en false.
        self.assertEqual(self.psql("SELECT visible FROM public.os_presencia WHERE user_id = '%s';" % OTRA), "f")
        self.assertEqual(self.psql("SELECT visto > now() - interval '1 minute' FROM public.os_presencia WHERE user_id = '%s';" % OTRA), "t")
        # Un lote viejo no retrocede `visto`.
        self.rpc("anon", LLAVE, {"presencia": [{"cuenta": OTRA, "visto": "2026-01-01T00:00:00Z"}]})
        self.assertEqual(self.psql("SELECT visto > now() - interval '1 minute' FROM public.os_presencia WHERE user_id = '%s';" % OTRA), "t")

        # Espejo del arriendo: miembros sí, el resto no; os_puerta_datos: cuentas sí, anon no.
        self.psql("INSERT INTO public.metagenesis_accesos (account_id, rol) VALUES ('%s', 'dueño') ON CONFLICT DO NOTHING;" % CUENTA)
        self.assertEqual(self.como_rol("authenticated", "SELECT datos->>'lider' FROM public.puerta_datos_espejo;", sub=CUENTA), "mac-a1b2c3")
        self.assertEqual(self.como_rol("authenticated", "SELECT count(*) FROM public.puerta_datos_espejo;", sub=OTRA), "0")
        self.como_rol("anon", "SELECT count(*) FROM public.puerta_datos_espejo;", esperar_error="42501")
        self.assertEqual(self.como_rol("authenticated", "SELECT activa FROM public.os_puerta_datos;", sub=OTRA), "f")
        self.como_rol("anon", "SELECT url FROM public.os_puerta_datos;", esperar_error="42501")
        self.como_rol("authenticated", "UPDATE public.os_puerta_datos SET activa = true;", sub=CUENTA, esperar_error="42501")
        # La URL solo acepta https sin ruta.
        self.psql("UPDATE public.os_puerta_datos SET url = 'https://datos.ejemplo.sslip.io', activa = true;")
        self.psql("UPDATE public.os_puerta_datos SET url = 'http://inseguro.example';", esperar_error="23514")

        # Un dueño también puede dar de alta (o rotar) la llave.
        self.como_rol("authenticated", "SELECT public.puerta_datos_registrar_llave('puerta-a1', '%s');" % HUELLA, sub=CUENTA)

        # Revocar: la llave deja de valer al momento.
        self.psql("UPDATE public.puerta_datos_llaves SET revocada = true;")
        self.rpc("anon", LLAVE, {"eventos": []}, esperar_error="42501")
        self.psql("UPDATE public.puerta_datos_llaves SET revocada = false;")

        # Tope de lotes del día.
        self.psql("UPDATE public.puerta_datos_llaves SET lotes_dia = 2000, dia = current_date;")
        self.rpc("anon", LLAVE, {"eventos": []}, esperar_error="54000")

        # Vuelta atrás: se va lo de la puerta y se quedan los datos replicados.
        with open(os.path.join(MIG, "20261011120000_puerta_datos_rollback.sql"), encoding="utf-8") as f:
            self.psql(f.read())
        self.assertEqual(self.psql("SELECT to_regclass('public.os_puerta_datos') IS NULL;"), "t")
        self.assertEqual(self.psql("SELECT count(*) FROM public.relevo_eventos;"), "3")
        self.assertEqual(self.psql("SELECT count(*) FROM public.neuron_devices;"), "2")


if __name__ == "__main__":
    unittest.main()
