"""DIR1121E: el Director presidente puede actuar en MetaGenesis con una lista cerrada, no solo leer."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_presidente as DP  # noqa: E402
import motores_director as M  # noqa: E402


def _trozos(orden):
    i, j = orden.index("--allowedTools"), orden.index("--disallowedTools")
    fin = orden.index("--resume") if "--resume" in orden else len(orden)
    return orden[i + 1:j], orden[j + 1:fin]


def test_puede_usar_el_chat_director_y_frenar_la_publicacion():
    permitidas, vetadas = _trozos(M.orden_claude("hola"))
    for n in ("director_leer", "director_decir", "director_bandeja", "director_responder", "produccion_estado",
              "produccion_vetar", "produccion_pausar"):
        assert "mcp__starseed-director__" + n in permitidas
    assert "mcp__starseed-director__produccion_reanudar" not in permitidas
    assert "mcp__starseed-director__produccion_reanudar" in vetadas


def test_la_terminal_es_una_lista_cerrada_de_ordenes_de_metagenesis():
    permitidas, vetadas = _trozos(M.orden_claude("hola"))
    bash = [x for x in permitidas if x.startswith("Bash")]
    assert bash and all(x.startswith("Bash(") and x.endswith(":*)") for x in bash)
    assert "Bash" not in permitidas and "Bash(*)" not in permitidas
    for orden in ("python3 scripts/puente/director_chat.py", "python3 scripts/puente/sincronizador_direccion.py publicar-canal",
                  "python3 scripts/puente/buscar_capacidad.py", "python3 scripts/puente/nube-gh.py lanzar",
                  "starseed-relevo", "starseed-enjambre.py", "git status"):
        assert "Bash(%s:*)" % orden in permitidas


def test_lo_reservado_sigue_vetado():
    permitidas, vetadas = _trozos(M.orden_claude("hola"))
    juntas = " ".join(permitidas)
    for palabra in ("git push", "commit-seguro", "autopublicar", "oracle_nodo", "secretos", "sudo", "rm:", "agy"):
        assert palabra not in juntas
    for orden in ("git push", "rm", "sudo", "python3 scripts/puente/commit-seguro.py", "python3 scripts/puente/oracle_nodo.py",
                  "python3 scripts/puente/nube-gh.py secretos", "launchctl kickstart"):
        assert "Bash(%s:*)" % orden in vetadas
    for nombre in ("Edit", "Write", "NotebookEdit", "WebFetch", "Task"):
        assert nombre in vetadas[0]


def test_la_sesion_va_al_final_y_no_se_mezcla_con_los_permisos():
    orden = M.orden_claude("sigue", sesion="ses-1")
    assert orden[-2:] == ["--resume", "ses-1"]
    permitidas, vetadas = _trozos(orden)
    assert "ses-1" not in permitidas and "ses-1" not in vetadas


def test_el_prompt_le_dice_que_puede_actuar():
    prompt = DP.prompt_presidente("¿cómo vamos?", [], "contexto")
    assert "Puedes actuar" in prompt and "starseed-director" in prompt and "publicar-canal" in prompt
    assert "no quitas una pausa de publicación" in prompt
