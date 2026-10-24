"""Pruebas de `cloudroom_modelos` (CRM1024J): qué modelos de la nube de Cloudroom abren hilos y en qué
rueda. Todo puro: el catálogo es el de `room-cli cloud status --json` medido en la Mac el 2026-10-24,
sin room-cli, sin red y sin disco."""
import os
import sys
import time
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import cloudroom_modelos as CM  # noqa: E402
# (2026-10-24) Las pruebas no leen la config real de modelos de Pi.
import cloudroom_modelos as _CMP  # noqa: E402
_CMP.PI_MODELOS = "/nonexistent/cloudroom-pi-modelos.json"


AHORA = 1_800_000_000.0
ISO = lambda dt: datetime.fromtimestamp(AHORA + dt, timezone.utc).isoformat()  # noqa: E731
TXT = lambda dt: time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA + dt))  # noqa: E731

#: El catálogo de hoy: Codex con dos modelos que no escriben, Claude Code con todos sus alias y los
#: harnesses sin modelos hasta que la cuenta tenga sus claves.
CODEX = {"id": "codex", "model": "gpt-6-luna", "provider": "openai",
         "models": [{"model": m, "reasoning_levels": ["low", "high"]} for m in
                    ("gpt-reserve", "gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-luna", "codex-auto-review")]}
CLAUDE = {"id": "claude-code", "provider": "anthropic", "models": [{"model": m} for m in (
    "default", "claude-opus-5-5", "opus", "fable", "claude-fable-5-1", "sonnet", "claude-sonnet-5-5", "haiku", "claude-haiku-5-5")]}
VACIOS = [{"id": h, "models": []} for h in ("cursor", "fx", "hermes", "devin", "openclaw")]
HOY = {"authenticated": True, "harnesses": [CODEX, CLAUDE, {"id": "pi", "provider_selection": True, "models": []},
                                            {"id": "opencode", "models": []}] + VACIOS}


def med_codex(*pcts, reinicia=3600, **extras):
    return {"version": 1, "medidores": {"codex": {"ok": True, "extras": extras, "ventanas": [
        {"id": "v%d" % i, "usado_pct": p, "reinicia": ISO(reinicia)} for i, p in enumerate(pcts)]}}}


def lim(semana, sesion=10, hace_h=1):
    return {"lecturas": [{"t": ISO(-hace_h * 3600), "semana_pct": semana, "sesion_pct": sesion}]}


def pares(cands):
    return [(h, m) for h, m, _ in cands]


class CatalogoDeHoy(unittest.TestCase):
    def test_solo_codex_escritor_con_claude_por_encima_del_30(self):
        r = CM.evaluar_modelos(HOY, med_codex(32), lim(45), {}, AHORA)
        self.assertEqual(pares(r["candidatos"]), [("codex", "gpt-6-luna"), ("codex", "gpt-5.6-terra"), ("codex", "gpt-5.6-luna")])
        self.assertIn("32 %", r["candidatos"][0][2])
        self.assertTrue(any(h == "claude-code" and "45" in m for h, m in r["descartes"]))

    def test_claude_code_solo_sonnet_y_haiku_una_vez_y_al_final(self):
        c = CM.candidatos_modelo(HOY, med_codex(32), lim(20), {}, AHORA)
        self.assertEqual(pares(c)[-2:], [("claude-code", "sonnet"), ("claude-code", "haiku")])
        self.assertFalse({m for h, m in pares(c) if h == "claude-code"} & {"default", "opus", "claude-opus-5-5", "fable"})

    def test_claude_code_con_lectura_vieja_o_al_tope_fuera(self):
        for limites in (lim(10, hace_h=8), lim(30), lim(10, sesion=75), {}, None):
            self.assertNotIn("claude-code", {h for h, _ in pares(CM.candidatos_modelo(HOY, {}, limites, {}, AHORA))}, limites)

    def test_codex_hasta_el_80(self):
        self.assertEqual(pares(CM.candidatos_modelo(HOY, med_codex(79.9), {}, {}, AHORA))[0], ("codex", "gpt-6-luna"))
        r = CM.evaluar_modelos(HOY, med_codex(12, 80), {}, {}, AHORA)  # manda la ventana más llena
        self.assertEqual(r["candidatos"], [])
        self.assertIn("80 %", CM.texto_descartes(r["descartes"]))
        self.assertEqual(CM.candidatos_modelo(HOY, med_codex(5, bloqueado=True), {}, {}, AHORA), [])

    def test_ventana_ya_reiniciada_no_cuenta_y_sin_medidor_se_usa(self):
        self.assertEqual(len(CM.candidatos_modelo(HOY, med_codex(95, reinicia=-60), {}, {}, AHORA)), 3)
        sin = CM.candidatos_modelo(HOY, {}, {}, {}, AHORA)
        self.assertEqual(len(sin), 3)
        self.assertIn("sin lectura", sin[0][2])

    def test_nunca_un_modelo_que_la_nube_no_lista(self):
        catalogo = {(h["id"], m["model"]) for h in HOY["harnesses"] for m in h["models"]}
        self.assertTrue(set(pares(CM.candidatos_modelo(HOY, {}, lim(1), {}, AHORA))) <= catalogo)
        self.assertEqual(CM.candidatos_modelo(None, {}, {}, {}, AHORA), [])
        self.assertEqual(CM.candidatos_modelo({"data": {"harnesses": [dict(CODEX, connected=False)]}}, {}, {}, {}, AHORA), [])


OPENCODE = {"id": "opencode", "models": [{"model": m} for m in (
    "nvidia/moonshotai/kimi-k3", "nvidia/deepseek-v4-pro", "xkiro/qwen3-coder-plus", "xkiro/minimax-m3",
    "groq/gpt-oss-120b", "llm7/gpt-oss", "aihubmix/x", "tokenrouter/z-ai/glm-5.3-free", "apinex/a", "openai/gpt-5")]}


class Gratis(unittest.TestCase):
    def test_opencode_primero_intercalado_por_proveedor_y_sin_los_que_no_escriben(self):
        estado = {"harnesses": [CODEX, OPENCODE]}
        c = pares(CM.candidatos_modelo(estado, {}, {}, {}, AHORA))
        self.assertEqual(c[:4], [("opencode", "nvidia/moonshotai/kimi-k3"), ("opencode", "xkiro/qwen3-coder-plus"),
                                 ("opencode", "nvidia/deepseek-v4-pro"), ("opencode", "xkiro/minimax-m3")])
        self.assertEqual(c[4][0], "codex")
        self.assertEqual(len(c), 7)  # groq, llm7, aihubmix, tokenrouter, apinex y openai, fuera
        motivos = CM.texto_descartes(CM.evaluar_modelos(estado, {}, {}, {}, AHORA)["descartes"], maximo=9)
        for palabra in ("groq no escribe", "apinex retirado", "openai es de pago"):
            self.assertIn(palabra, motivos)

    def test_salud_compartida_caido_y_sin_cupo(self):
        estado = {"harnesses": [OPENCODE]}
        salud = {"nim": {"estado": "caido"}, "xkiro": {"sin_cupo_hasta": TXT(3600)}}
        self.assertEqual(CM.candidatos_modelo(estado, {}, {}, salud, AHORA), [])
        texto = CM.texto_descartes(CM.evaluar_modelos(estado, {}, {}, salud, AHORA)["descartes"], maximo=9)
        self.assertIn("nvidia caído", texto)
        self.assertIn("xkiro sin cupo hasta las", texto)
        vuelto = {"nim": {"estado": "ok"}, "xkiro": {"sin_cupo_hasta": TXT(-60)}}
        self.assertEqual(len(CM.candidatos_modelo(estado, {}, {}, vuelto, AHORA)), 4)
        # también en ISO con «T», como lo escriben otros directores
        iso = {"xkiro": {"sin_cupo_hasta": TXT(3600).replace(" ", "T")}}
        self.assertNotIn("xkiro", {m.split("/")[0] for _h, m in pares(CM.candidatos_modelo(estado, {}, {}, iso, AHORA))})

    def test_pi_toma_el_proveedor_del_harness(self):
        pi = {"id": "pi", "provider": "nvidia", "provider_selection": True, "models": [{"model": "kimi-k3"}]}
        self.assertEqual(pares(CM.candidatos_modelo({"harnesses": [pi]}, {}, {}, {}, AHORA)), [("pi", "kimi-k3")])
        self.assertEqual(CM.candidatos_modelo({"harnesses": [pi]}, {}, {}, {"nim": {"estado": "caído"}}, AHORA), [])
        self.assertEqual(CM.proveedor_de({"id": "pi", "provider": "pi"}, "m"), "")

    def test_orden_gratis_codex_otros_claude(self):
        cursor = {"id": "cursor", "models": ["composer-1"]}
        estado = {"harnesses": [CLAUDE, cursor, CODEX, OPENCODE]}
        orden = [h for h, _m in pares(CM.candidatos_modelo(estado, {}, lim(5), {}, AHORA))]
        self.assertEqual(list(dict.fromkeys(orden)), ["opencode", "codex", "cursor", "claude-code"])


class Rueda(unittest.TestCase):
    C = [("opencode", "nvidia/a", ""), ("codex", "gpt-6-luna", ""), ("codex", "gpt-5.6-terra", "")]

    def test_cada_tarea_empieza_en_su_puesto_y_sigue_con_los_demas(self):
        o = CM.orden_por_tarea(4, self.C, 0)
        self.assertEqual([x[0][1] for x in o], ["nvidia/a", "gpt-6-luna", "gpt-5.6-terra", "nvidia/a"])
        self.assertEqual([m for _h, m, _ in o[1]], ["gpt-6-luna", "gpt-5.6-terra", "nvidia/a"])
        self.assertEqual(CM.orden_por_tarea(2, [], 0), [[], []])

    def test_la_rueda_sigue_donde_la_dejo_el_registro(self):
        reg = [{"tarea": "X", "hilo": "h1", "t": AHORA - 99, "harness": "codex", "modelo": "gpt-5.6-terra"},
               {"tarea": "Y", "hilo": "h2", "t": AHORA - 50, "harness": "opencode", "modelo": "nvidia/a"},
               {"tarea": "Z", "hilo": "h3", "t": AHORA - 50, "harness": "codex", "modelo": "gpt-6-luna"}]
        self.assertEqual(CM.inicio_rueda(self.C, reg), 2)  # mismo t: manda el último anotado
        self.assertEqual(CM.inicio_rueda(self.C, reg[:1]), 0)  # tras el último, vuelta al primero
        self.assertEqual(CM.inicio_rueda(self.C, [{"harness": "codex", "modelo": "retirado", "t": AHORA}]), 0)
        self.assertEqual(CM.inicio_rueda([], reg), 0)

    def test_modelo_fijado_por_entorno(self):
        self.assertEqual(CM.modelo_fijado(HOY, "gpt-5.6-luna"), ("codex", "gpt-5.6-luna"))
        self.assertEqual(CM.modelo_fijado(HOY, "claude-code/haiku"), ("claude-code", "haiku"))
        self.assertIsNone(CM.modelo_fijado(HOY, "claude-opus-9"))
        self.assertIsNone(CM.modelo_fijado(HOY, ""))
        fijo = ("codex", "gpt-5.6-luna", "fijado")
        o = CM.orden_por_tarea(2, self.C, 1, fijo)
        self.assertTrue(all(x[0] == fijo and len(x) == 4 for x in o))

    def test_fallos_que_son_del_modelo(self):
        for e in ("HTTP 400: Cloud supports new Codex, Pi, … threads", "Select a model with --model for Cloud",
                  "error: unknown model 'x'", "harness claude-code is not connected"):
            self.assertTrue(CM.fallo_de_modelo(e), e)
        for e in ("TimeoutExpired", "error: a value is required", "spawn sin id de hilo", "", None):
            self.assertFalse(CM.fallo_de_modelo(e), e)


if __name__ == "__main__":
    unittest.main()


def test_pi_suma_sus_modelos_declarados_aunque_la_nube_no_los_liste():
    import cloudroom_modelos as CM
    estado = {"harnesses": [{"id": "pi", "provider": "openai-codex", "models": []},
                            {"id": "codex", "models": [{"model": "gpt-6-luna"}]}]}
    hs = {n: m for n, _h, m in CM.harnesses_nube(estado, declarados=["nvidia/z-ai/glm-5.3"])}
    assert hs["pi"] == ["nvidia/z-ai/glm-5.3"] and hs["codex"] == ["gpt-6-luna"]
    assert CM.proveedor_de({"id": "pi", "provider": "openai-codex"}, "nvidia/z-ai/glm-5.3") == "nvidia"


def test_pi_declarados_lee_la_config_y_tolera_que_falte(tmp_path):
    import json
    import cloudroom_modelos as CM
    ruta = tmp_path / "pi.json"
    ruta.write_text(json.dumps({"modelos": ["nvidia/z-ai/glm-5.3", "", 3]}))
    assert CM.pi_declarados(str(ruta)) == ["nvidia/z-ai/glm-5.3"]
    assert CM.pi_declarados(str(tmp_path / "no-existe.json")) == []


def test_topes_y_claves_de_la_config(tmp_path):
    """CRM1024K: los topes de hilos a la vez y los NOMBRES de las claves salen de la config."""
    import json
    import cloudroom_modelos as CM
    ruta = tmp_path / "pi.json"
    ruta.write_text(json.dumps({"simultaneos": {"NVIDIA": 2, "xkiro": True, "mal": -1, "groq": 0},
                                "claves": {"nvidia": "NVIDIA_API_KEY", "mistral": "", "xkiro": 3}}))
    assert CM.simultaneos_declarados(str(ruta)) == {"nvidia": 2, "groq": 0}
    assert CM.claves_declaradas(str(ruta)) == {"nvidia": "NVIDIA_API_KEY"}
    assert CM.simultaneos_declarados(str(tmp_path / "no.json")) == {}


def test_solo_los_modelos_de_pi_cuya_clave_esta_en_la_nube():
    import cloudroom_modelos as CM
    declarados = ["nvidia/z-ai/glm-5.3", "mistral/devstral-medium-latest", "gemini/gemini-3.6-flash", "otro/x"]
    claves = {"nvidia": "NVIDIA_API_KEY", "mistral": "MISTRAL_API_KEY", "gemini": "GEMINI_API_KEY"}
    nombres = CM.nombres_env({"variables": [{"name": "NVIDIA_API_KEY", "hint": "nvap"}, {"name": "GEMINI_API_KEY"}, {}], "repos": []})
    assert nombres == {"NVIDIA_API_KEY", "GEMINI_API_KEY"}
    assert CM.pi_con_clave(declarados, claves, nombres) == ["nvidia/z-ai/glm-5.3", "gemini/gemini-3.6-flash", "otro/x"]
    assert CM.pi_con_clave(declarados, claves, None) == declarados  # sin poder leer la lista, no se filtra
    assert CM.nombres_env(None) is None and CM.nombres_env({"error": "x"}) is None


def test_reparto_con_tope_por_proveedor_gratuito():
    import cloudroom_modelos as CM
    nim, kiro, codex = ("pi", "nvidia/z-ai/glm-5.3", ""), ("pi", "xkiro/qwen/qwen3-coder-plus:free", ""), ("codex", "gpt-6-luna", "")
    filas = [{"harness": "pi", "modelo": "nvidia/z-ai/glm-5.3"}, {"harness": "codex", "modelo": "gpt-6-luna"},
             {"harness": "pi", "modelo": "sin-proveedor"}, "basura"]
    assert CM.vivos_por_proveedor(filas) == {"nvidia": 1}
    ordenes = [[nim, kiro, codex], [nim, kiro, codex], [kiro, nim, codex], [nim, kiro]]
    salida = CM.repartir_por_tope(ordenes, {"nvidia": 1}, {"nvidia": 2, "xkiro": 1})
    assert [o[0] if o else None for o in salida] == [nim, kiro, codex, None]
    assert salida[1] == [kiro, codex]  # el que ya no cabe sale también de los de reserva
    assert CM.repartir_por_tope([[codex]] * 5, {}, {}) == [[codex]] * 5  # Codex no lo cuenta este tope


def test_gemini_de_pi_mira_la_salud_de_google():
    import cloudroom_modelos as CM
    salud = {"google": {"estado": "vivo", "sin_cupo_hasta": "2099-01-01 00:00:00"}}
    assert "gemini sin cupo" in CM.estado_proveedor(salud, "gemini", "2026-10-24 12:00:00")
    assert CM.estado_proveedor({}, "gemini", "2026-10-24 12:00:00") == ""
