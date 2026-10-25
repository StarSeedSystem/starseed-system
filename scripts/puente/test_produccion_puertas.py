"""Pruebas puras de scripts/puente/produccion_puertas.py (§3.2 y §3.3).

Sin red ni archivos: `decidir` y `panel` se inyectan.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_puertas as pp


def _diff(archivo, anadidas, eliminadas=None):
    lineas = ["diff --git a/%s b/%s" % (archivo, archivo),
              "--- a/%s" % archivo, "+++ b/%s" % archivo,
              "@@ -0,0 +1,%d @@" % (len(anadidas) + len(eliminadas or []))]
    lineas += ["+" + a for a in anadidas]
    lineas += ["-" + e for e in (eliminadas or [])]
    return "\n".join(lineas)


def test_escanear_detecta_patrones_tipicos():
    diff = _diff("src/lib/x.ts", [
        'const a = "sk-abcdefghijklmnop1234";',
        'const g = "ghp_0123456789abcdefghij";',
        'token = "github_pat_11AAAAAA0123456789abcdefghijkl"',
        'jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"',
        'aws = "AKIAIOSFODNN7EXAMPLE"',
        'slack = "xoxb-123456789012-abcdefghij"',
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "DATABASE_API_KEY=supervalor9",
        'NEXT_PUBLIC_SECRET_KEY=valor123',
    ])
    tipos = [h["tipo"] for h in pp.escanear_secretos(diff)]
    for esperado in ("sk", "ghp", "github_pat", "jwt", "akia", "xox", "pem",
                     "variable-entorno", "next-public-clave"):
        assert esperado in tipos, (esperado, tipos)
    assert len(tipos) == len(set(tipos))  # una línea, un hallazgo


def test_escanear_archivo_env_y_filtrado_de_valores():
    diff = _diff(".env.local", ["FOO=bar"]) + "\n" + _diff(
        "app/config.ts", ['WEBHOOK_TOKEN="abcdefgh123456"'])
    hallazgos = pp.escanear_secretos(diff)
    assert any(h["tipo"] == "archivo-env" and h["archivo"] == ".env.local"
               for h in hallazgos)
    assert all("abcdefgh123456" not in json.dumps(h) for h in hallazgos)
    assert all(set(h) == {"archivo", "linea", "tipo"} for h in hallazgos)


def test_escanear_ignora_eliminadas_y_contexto():
    diff = _diff("src/a.ts", [], eliminadas=['OLD_KEY="sk-abcdefghij123456"'])
    diff += "\n contexto sin signo NEXT_PUBLIC_SUPABASE_URL=https://x.co"
    assert pp.escanear_secretos(diff) == []


def test_escanear_no_confunde_marcadores_de_documentacion_con_claves():
    # (2026-10-07) Un texto de ayuda frenaba la autopublicación: «STARSEED_MOTOR_TOKEN=<token…».
    diff = _diff("src/lib/mando/motores.ts", [
        '"(una línea STARSEED_MOTOR_TOKEN=<token… Se enseña una sola vez"',
        "OPENAI_API_KEY=${OPENAI_API_KEY}",
        "GITHUB_TOKEN=$(gh auth token)",
        "STRIPE_SECRET_KEY={{ secrets.STRIPE }}",
    ])
    assert [h for h in pp.escanear_secretos(diff) if h["tipo"] == "variable-entorno"] == []
    # …pero un valor real sigue frenando.
    # (el valor se monta en tiempo de ejecución: la autopublicación escanea este mismo archivo)
    real = _diff("src/a.ts", ["MOTOR_TOKEN=" + "abc123def456ghi"])
    assert [h["tipo"] for h in pp.escanear_secretos(real)] == ["variable-entorno"]


def test_escanear_no_frena_marcadores_de_documentacion_en_cualquier_archivo():
    # (2026-10-25, PRO1025A) Las cinco líneas EXACTAS de `.agent/skills/claude-video-studio/` que
    # frenaron la autopublicación de 77 commits desde el 24-10: textos de ayuda, no claves. Ni
    # son archivos de prueba ni plantillas: la regla vale en cualquier archivo.
    base = ".agent/skills/claude-video-studio/"
    reales = {
        base + "README.md": [
            "   in your project folder: `HIGGSFIELD_API_KEY=your_key_id:your_key_secret`. "
            "Never paste a key into the chat."],
        base + "questions.md": [
            '  HIGGSFIELD_API_KEY=your_key_id:your_key_secret (from https://console.higgsfield.ai). '
            'Never paste it here. Tell me when it is done."'],
        base + "references/media.md": [
            "- The person sets `HIGGSFIELD_API_KEY=key_id:key_secret` in their shell, or in a `.env` file"],
        base + "scripts/doctor.sh": [
            '    say higgsfield "no key. Make a file called .env in this folder with one line: '
            'HIGGSFIELD_API_KEY=your_key_id:your_key_secret (from https://console.higgsfield.ai). '
            'Never paste it into chat."'],
        base + "scripts/higgsfield.py": [
            "called .env in your project folder:  HIGGSFIELD_API_KEY=your_key_id:your_key_secret"],
    }
    for ruta, lineas in reales.items():
        assert pp.escanear_secretos(_diff(ruta, lineas)) == [], ruta
    # Las dos formas, sin distinguir mayúsculas y con puntuación de prosa detrás.
    marcadores = [
        "OPENAI_API_KEY=your_openai_key", "OPENAI_API_KEY=YOUR_API_KEY_HERE",
        "TELEGRAM_BOT_TOKEN=mi_token_de_telegram", "BREVO_API_KEY=tu_clave_de_brevo",
        "X_API_KEY=my_api_key_here.", "STRIPE_SECRET_KEY=insert_key_here",
        "SMTP_PASSWORD=paste_password_here", "GROQ_API_KEY=pega_tu_clave_aqui",
        "GROQ_API_KEY=pon_la_clave_aqui,", "GEMINI_API_KEY=Your_Key_Here",
        "AUTH_TOKEN=token_here", "AUTH_TOKEN=TOKEN-HERE", "CLIENT_SECRET=client_id:client_secret",
        "HF_API_KEY=api_key:api_secret", "STARSEED_SERVER_TOKEN=xxxxxxxxxxxx",
        "OPENAI_API_KEY=xxx-xxx-xxx", "API_KEY='key.id.value'", 'AUTH_TOKEN="aquí_token"',
    ]
    for ruta in ("README.md", "docs/guia.md", "scripts/ayuda.sh", "src/lib/x.ts"):
        for linea in marcadores:
            assert pp.escanear_secretos(_diff(ruta, [linea])) == [], (ruta, linea)
    # También en la variante `NEXT_PUBLIC_…`.
    assert pp.escanear_secretos(_diff("README.md", ["NEXT_PUBLIC_API_KEY=your_public_key"])) == []


def test_escanear_sigue_frenando_valores_aleatorios_aunque_vayan_en_documentacion():
    # El valor se monta en tiempo de ejecución: este archivo también lo escanea la autopublicación.
    aleatorio = "".join(["Zq8v", "R2mL", "9pXw", "K3dT"])
    hex_largo = "".join(["3f9a", "2c1e", "7b4d", "4e8a", "9c2f", "1a2b"])
    contraejemplos = [
        "HIGGSFIELD_API_KEY=" + aleatorio,
        "HIGGSFIELD_API_KEY=" + aleatorio + ":" + aleatorio[::-1],
        "HIGGSFIELD_API_KEY=" + hex_largo,
        "HIGGSFIELD_API_KEY=key_id:" + aleatorio,  # una palabra de marcador y un trozo real
        "HIGGSFIELD_API_KEY=" + aleatorio + "_secret",
        "HIGGSFIELD_API_KEY=secret_" + aleatorio,
        # Un prefijo de marcador no libra un resto aleatorio (ni en mayúsculas).
        "HIGGSFIELD_API_KEY=your_" + aleatorio,
        "HIGGSFIELD_API_KEY=my_" + hex_largo,
        "HIGGSFIELD_API_KEY=" + "PON_" + aleatorio.upper(),
        "HIGGSFIELD_API_KEY=pega_" + aleatorio + "_aqui",
        # El prefijo es con guion bajo: «mi-clave-secreta» es una contraseña de palabras.
        "HIGGSFIELD_API_KEY=" + "-".join(["mi", "clave", "secreta"]),
        # Palabras corrientes que no son de marcador: bajo `_TOKEN` siguen siendo una contraseña.
        "HIGGSFIELD_API_TOKEN=" + "-".join(["caballo", "correcto", "pila"]),
        "HIGGSFIELD_API_KEY=" + "yourkey" + aleatorio,  # `your` sin guion bajo
    ]
    for ruta in ("README.md", "docs/guia.md", "scripts/ayuda.sh", "src/lib/x.ts"):
        for linea in contraejemplos:
            tipos = [h["tipo"] for h in pp.escanear_secretos(_diff(ruta, [linea]))]
            assert tipos == ["variable-entorno"], (ruta, linea[:24], tipos)
    # Un marcador legible no tapa un secreto que venga detrás en la misma línea.
    mixta = "`A_API_KEY=your_key_id:your_key_secret` y B_API_KEY=" + aleatorio
    assert [h["tipo"] for h in pp.escanear_secretos(_diff("README.md", [mixta]))] == ["variable-entorno"]
    # Los patrones con forma de clave nunca se libran por parecer documentación.
    assert [h["tipo"] for h in pp.escanear_secretos(
        _diff("README.md", ["tu_clave: sk-" + aleatorio]))] == ["sk"]
    # Y el hallazgo sigue sin llevar el valor.
    h = pp.escanear_secretos(_diff("README.md", ["HIGGSFIELD_API_KEY=" + aleatorio]))
    assert all(aleatorio not in json.dumps(x) for x in h)


def test_escanear_no_frena_claves_falsas_de_pruebas_ni_plantillas():
    # (2026-10-08) `test_destilacion_corpus.py` lleva claves falsas para comprobar que se tachan
    # y frenó 43 commits. Los valores se montan aquí en tiempo de ejecución por la misma razón.
    falsas = ['API_KEY: "' + "sk-" + "test1234567890ab" + '"',
              '"apiKey": "' + "sk-" + "proj-1234567890" + '"',
              '"apiKey": "' + "sk-" + "proj-9876543210" + '"',
              'aws = "' + "AKIA" + "IOSFODNN7EXAMPLE" + '"']
    for ruta in ("scripts/puente/test_destilacion_corpus.py", "src/lib/__tests__/x.ts",
                 "src/lib/a.test.tsx", ".env.example"):
        assert pp.escanear_secretos(_diff(ruta, falsas)) == [], ruta
    # Una plantilla con marcadores no frena; un `.env` de verdad sí, por el nombre.
    assert pp.escanear_secretos(_diff(".env.example", ["OPENAI_API_KEY=" + "tu-clave-aqui"])) == []
    assert [h["tipo"] for h in pp.escanear_secretos(_diff(".env.production", ["X=1"]))] == ["archivo-env"]


def test_escanear_sigue_frenando_claves_reales_en_pruebas_y_codigo():
    real = "sk-" + "Zq8vR2mL9pXw4Tn7Kd3B"  # forma aleatoria, sin marcador
    for ruta in ("scripts/puente/test_x.py", "src/lib/x.ts", ".env.example"):
        assert [h["tipo"] for h in pp.escanear_secretos(_diff(ruta, ['k = "' + real + '"']))] == ["sk"], ruta
    # Fuera de pruebas, un marcador NO libra: el código de producción no debe llevar claves.
    falsa = "sk-" + "test1234567890ab"
    assert [h["tipo"] for h in pp.escanear_secretos(_diff("src/lib/x.ts", ['k = "' + falsa + '"']))] == ["sk"]
    # El nombre de la variable no libra: cuenta el VALOR.
    assert [h["tipo"] for h in pp.escanear_secretos(
        _diff("scripts/puente/test_y.py", ["TEST_API_KEY=" + "Zq8vR2mL9pXw"]))] == ["variable-entorno"]


def test_escanear_no_frena_claves_de_almacenamiento_ni_nombres_de_variable():
    # (2026-10-10, DSB1010) Las dos líneas EXACTAS de src/lib/protomolecula/orbe-bus.ts que
    # frenaron la autopublicación de 6 commits: son claves de localStorage, no secretos.
    reales = [
        'export const PROTO_ORB_POS_KEY = "starseed.protomolecula.orbe.pos.v1";',
        'export const PROTO_ORB_FAB_KEY = "starseed.protomolecula.orbe.enabled.v1";',
    ]
    assert pp.escanear_secretos(_diff("src/lib/protomolecula/orbe-bus.ts", reales)) == []
    otras = [
        'const DOCK_KEY = "starseed.dock.items.v2";',
        "const HUB_KEY = 'starseed:hub:mapa-3d';",
        'const OMNI_KEY = "starseed_omni_last_session";',
        'export const A11Y_STORAGE_KEY = "starseed.a11y.prefs.v1";',
        'const HOOKS_KEY = "starseed.n8n.hooks.v1";',
        'const LS_KEY = "aurora-guide-seen";',
        'const ENV_KEY = "OPENAI_API_KEY";',
        'const NOMBRE_SECRET = "GOOGLE_OAUTH_CLIENT_SECRET";',
        "const MOTOR_TOKEN = process.env.STARSEED_MOTOR_TOKEN ?? '';",
        "MOTOR_TOKEN = os.getenv('STARSEED_MOTOR_TOKEN')",
        "NEXT_PUBLIC_GOOGLE_API_KEY=$GOOGLE_API_KEY",
        "BREVO_API_KEY=xkeysib-...",
        "const RE_TOKEN = /^[A-Za-z0-9_-]{20}$/;",
    ]
    assert pp.escanear_secretos(_diff("src/lib/x.ts", otras)) == []


def test_escanear_sigue_frenando_secretos_con_nombre_de_clave():
    # Los valores se montan en tiempo de ejecución: nunca un literal con forma real en el repo.
    aleatorio = "".join(["Zq8v", "R2mL", "9pXw", "K3dT"])
    casos = {
        # Un trozo aleatorio dentro del espacio «starseed.» no es una clave de almacenamiento.
        "prefijo-con-aleatorio": 'const PROTO_KEY = "' + "starseed_" + aleatorio + '";',
        # Bajo `_TOKEN`, `_SECRET` y `_PASSWORD` las palabras con guiones no libran.
        "contrasena-de-palabras": "DB_PASSWORD=" + "-".join(["caballo", "correcto", "pila"]),
        "token-de-palabras": 'API_TOKEN="' + "-".join(["hola", "que", "tal"]) + '"',
        "token-starseed-con-ano": "MOTOR_TOKEN=" + "starseed-" + "2024",
        # («MI_CLAVE_SECRETA» ya no cuenta: es un marcador «mi…» de documentación, PRO1025A.)
        "secreto-en-mayusculas": 'X_SECRET = "' + "_".join(["CABALLO", "CORRECTO", "PILA"]) + '"',
        "mayusculas-sin-vocales": 'X_KEY = "' + "_".join(["QZXW", "PLMK", "RTVB"]) + '"',
        # Un UUID o un hexadecimal largo con guiones sigue siendo una credencial.
        "uuid": 'SERVICE_KEY = "' + "-".join(["3f9a2c1e", "7b4d", "4e8a", "9c2f", "1a2b3c4d5e6f"]) + '"',
        # Palabras que HABLAN de claves bajo `_KEY` no se libran por la regla genérica.
        "palabras-de-clave": 'ADMIN_KEY = "' + "-".join(["mi", "clave", "secreta"]) + '"',
        "service-role": 'SUPABASE_SERVICE_ROLE_KEY="' + "-".join(["clave", "de", "servicio"]) + '"',
        # Una línea con una clave de almacenamiento Y un secreto detrás sigue frenando.
        "misma-linea": 'A_KEY = "starseed.x.v1"; B_TOKEN = "' + aleatorio + '"',
        # Un valor de texto dentro de una cadena de ayuda no se toma por código.
        "ayuda-con-valor": '"exporta MOTOR_TOKEN=' + "abc123" + "def456ghi" + ' en tu shell"',
    }
    for caso, linea in casos.items():
        tipos = [h["tipo"] for h in pp.escanear_secretos(_diff("src/lib/x.ts", [linea]))]
        assert tipos == ["variable-entorno"], (caso, tipos)
    # Los patrones con forma de clave nunca se libran por el nombre de la variable.
    sk = "sk-" + aleatorio
    assert [h["tipo"] for h in pp.escanear_secretos(
        _diff("src/lib/x.ts", ['const STORAGE_KEY = "' + sk + '";']))] == ["sk"]


def test_migracion_destructiva():
    assert pp.migracion_destructiva("DROP TABLE users;")[0] is True
    assert pp.migracion_destructiva("truncate t;")[0] is True
    assert pp.migracion_destructiva("delete from t where id=1;")[0] is True
    assert pp.migracion_destructiva(
        "alter table t alter column c type bigint;")[0] is True
    assert pp.migracion_destructiva("ALTER TABLE t RENAME TO u;")[0] is True
    ok, motivo = pp.migracion_destructiva(
        "ALTER TABLE t ADD COLUMN c int NOT NULL;")
    assert ok and "NOT NULL" in motivo
    assert pp.migracion_destructiva(
        "ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0;") == (False, None)
    assert pp.migracion_destructiva(
        "CREATE TABLE IF NOT EXISTS t (id int);") == (False, None)
    assert pp.migracion_destructiva(
        "-- DROP TABLE t\nCREATE INDEX i ON t(c);") == (False, None)


def _candidata(tid, **extra):
    base = {"id": tid, "titulo": "Título de %s" % tid,
            "prompt": "haz la tarea %s" % tid, "motivo_ola": "ola de prueba",
            "diffstat": " 2 files changed", "archivos": ["src/a.ts"],
            "veredictos": {"revisor": "verde"}}
    base.update(extra)
    return base


def test_paquete_contexto_campos_y_tope():
    c = _candidata("t1", prompt="x" * 9000)
    ctx = "contexto " * 2000
    paquete = pp.paquete_contexto(c, ctx)
    for clave in ("tid", "titulo", "prompt_tarea", "motivo_ola",
                  "peticion_alex", "diffstat", "archivos", "contexto_area",
                  "veredictos"):
        assert clave in paquete
    assert len(json.dumps(paquete, ensure_ascii=False).encode("utf-8")) <= 6144
    assert paquete["archivos"] == ["src/a.ts"]
    p2 = pp.paquete_contexto(_candidata("t1"), "")
    assert p2["veredictos"] == {"revisor": "verde"}


def test_preguntas_lote_formato_y_troceo():
    lotes = pp.preguntas_lote([_candidata("a"), _candidata("b")])
    assert len(lotes) == 1 and len(lotes[0]) == 6
    assert lotes[0]["coherente_a"]["tipo"] == "si-no"
    assert lotes[0]["mejora_a"]["niveles"] == ["1", "2", "3", "4", "5"]
    assert lotes[0]["riesgo_a"]["opciones"] == ["bajo", "medio", "alto"]
    troceados = pp.preguntas_lote([_candidata("t%d" % i) for i in range(10)])
    assert len(troceados) == 2
    assert len(troceados[0]) == 24 and len(troceados[1]) == 6


def _resp_ok(tid, p=0.9, mejora=4, riesgo="bajo"):
    return {"coherente_%s" % tid: {"respuesta": "sí", "p": p},
            "mejora_%s" % tid: {"valor": mejora},
            "riesgo_%s" % tid: {"respuesta": riesgo}}


def test_decidir_lote_regla_exacta():
    c = _candidata("t1")
    r = pp.decidir_lote(_resp_ok("t1"), [c], 0.7)
    assert r["t1"]["publica"] and r["t1"]["via"] == "jev"
    assert not pp.decidir_lote(_resp_ok("t1", p=0.5), [c], 0.7)["t1"]["publica"]
    assert not pp.decidir_lote(_resp_ok("t1", mejora=2), [c], 0.7)["t1"]["publica"]
    no_alto = pp.decidir_lote(_resp_ok("t1", riesgo="alto"), [c], 0.7)
    assert not no_alto["t1"]["publica"]
    medio_sin = pp.decidir_lote(_resp_ok("t1", riesgo="medio"), [c], 0.7)
    assert not medio_sin["t1"]["publica"]
    medio_con = pp.decidir_lote(_resp_ok("t1", riesgo="medio"),
                                [_candidata("t1", pruebas_completas=True)], 0.7)
    assert medio_con["t1"]["publica"]


def test_decidir_lote_determinista_en_rojo_nunca_se_salva():
    c = _candidata("t1", puertas={"seguridad": "rojo"})
    panel = lambda _c: [{"coherente": "sí", "mejora": 5, "riesgo": "bajo"}] * 3
    r = pp.decidir_lote(_resp_ok("t1"), [c], 0.7, panel=panel)
    assert r["t1"]["publica"] is False and r["t1"]["via"] == "determinista"


def test_decidir_lote_panel_de_respaldo_y_sin_panel():
    c = _candidata("t1")
    votos = [{"coherente": "sí", "mejora": 5, "riesgo": "bajo"},
             {"coherente": "sí", "mejora": 3, "riesgo": "medio"},
             {"coherente": "no", "mejora": 4, "riesgo": "bajo"}]
    r = pp.decidir_lote({}, [c], 0.7, panel=lambda _c: list(votos))
    assert r["t1"]["publica"] and r["t1"]["via"] == "panel"  # mayoría sí, mediana 4
    votos_no = [{"coherente": "no", "mejora": 5, "riesgo": "bajo"}] * 3
    r2 = pp.decidir_lote({}, [c], 0.7, panel=lambda _c: list(votos_no))
    assert not r2["t1"]["publica"]
    r3 = pp.decidir_lote({}, [c], 0.7)
    assert r3["t1"]["publica"] is False and r3["t1"]["via"] == "sin_panel"


class _DecidirFalso:
    def __init__(self, respuestas):
        self.llamadas = 0
        self._respuestas = respuestas

    def consultar_lote(self, estado, preguntas, quien=None, dominio="", anotar=True):
        self.llamadas += 1
        assert len(preguntas) <= pp.MAX_PREGUNTAS_LOTE
        return {"respuestas": dict(self._respuestas), "medio": "falso"}


def test_juzgar_lote_decidir_una_vez_por_ciclo():
    candidatas = [_candidata("t%d" % i) for i in range(8)]  # 24 preguntas
    todas = {}
    for c in candidatas:
        todas.update(_resp_ok(c["id"]))
    decidir = _DecidirFalso(todas)
    r = pp.juzgar_lote(candidatas, decidir, 0.7)
    assert decidir.llamadas == 1
    assert all(v["publica"] for v in r.values())
    muchas = [_candidata("t%d" % i) for i in range(10)]
    decidir2 = _DecidirFalso(todas)
    pp.juzgar_lote(muchas, decidir2, 0.7)
    assert decidir2.llamadas == 2
