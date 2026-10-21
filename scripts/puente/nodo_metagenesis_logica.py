from typing import List, Dict, Any, Tuple

# Conjunto de estados que indican que una tarea ya está cerrada
CERRADAS = {
    "commit",
    "hecho",
    "integrada",
    "sustituida",
    "rechazada",
    "descartada",
    "obsoleta",
    "informe",
    "reasignada",
}


def reparaciones_superadas(
    tareas: List[Dict[str, Any]],
    progreso: Dict[str, Any],
    publicacion: Dict[str, Any],
) -> List[Tuple[str, str]]:
    """PURA. De las tareas con `origen: "metagenesis"` cuyo título empieza por «Puerta de publicación en rojo»
    (y sus sucesoras con sufijos -dN, -b, -c…), devuelve `[(id, nota)]` de las que no están cerradas cuando
    la publicación está hoy en verde."""
    pub_sha = publicacion.get("sha")
    pub_fase = publicacion.get("fase")

    # Si la publicación no está en verde, no hay nada que aplicar
    if pub_fase not in ("publicada", "ok") and not (
        pub_sha and pub_sha != publicacion.get("sha_rojo")
    ):
        return []

    res: List[Tuple[str, str]] = []
    for t in tareas:
        if t.get("origen") == "metagenesis" and "Puerta de publicación en rojo" in str(
            t.get("titulo", "")
        ):
            tid = str(t.get("id"))
            estado = (
                progreso.get(tid) or {}
            ).get("estado") if isinstance(progreso.get(tid), dict) else ""
            if estado not in CERRADAS:
                res.append(
                    (
                        tid,
                        f"NO APLICA: la puerta de publicación volvió a verde (publicado {pub_sha})",
                    )
                )
    return res
