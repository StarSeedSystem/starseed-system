"""Jev dentro de los directores: segunda lectura de una decisión YA tomada.

Los directores (`director-nube.py`, `director-orquestacion.py`) deciden en seco por
reglas: esas reglas protegen cupos y crédito. Aquí Jev actúa de consejero sobre la
decisión ya hecha, nunca de autoridad:

- un NO determinista NO se convierte en SÍ jamás (las reglas son el suelo);
- un SÍ determinista solo puede frenarse si Jev da probabilidad ALTA (>= UMBRAL_FRENADO)
  de que lanzar ahora sea mala idea; frenar es barato, lanzar de más cuesta cupo;
- sin Jev, sin presupuesto o en duda (`si_no` devuelve None), gana el determinista.

El motivo siempre nombra quién decidió («determinista», «Jev frenó: …») para que en
el canal se distinga una decisión de una regla.
"""

# Probabilidad mínima de «mala idea» para que Jev frene un SÍ del director.
UMBRAL_FRENADO = 0.8


def consejo_de_lanzamiento(estado_texto, decision_determinista, jev=None):
    """(decision_final, motivo). `decision_determinista` es True/False.

    Se consulta a Jev UNA sola vez por decisión y solo cuando hay algo que frenar:
    con un NO del director no se gasta la llamada, porque el resultado está fijado.
    """
    if not decision_determinista:
        # Las reglas del director protegen cupos y crédito: Jev no las revierte.
        return False, "determinista"
    if jev is None:
        return True, "determinista (sin Jev)"
    p_mala = jev.si_no(estado_texto, "¿Es mala idea lanzar ahora?")
    if p_mala is None:
        # Sin presupuesto, sin red o en duda: None no es una opinión de Jev,
        # es el camino normal; decide el determinista.
        return True, "determinista (Jev no contestó)"
    if p_mala >= UMBRAL_FRENADO:
        return False, "Jev frenó: %.2f" % p_mala
    return True, "Jev dejó pasar: %.2f" % p_mala
