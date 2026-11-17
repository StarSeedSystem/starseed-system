def motivo_de_bloqueo(prueba, publicacion):
    if prueba["estado"] == "fallo":
        clase = "compilacion"
        evidencia = (publicacion.get("evidencia", "") if publicacion.get("fase") == "bloqueado" 
                   else prueba.get("evidencia", ""))
        return {
            "clase": clase,
            "clave": clase + prueba.get("sha", "")[:9],
            "resumen": f"Compilación fallida (hash: {prueba.get('sha', '')[:9]})" if prueba
            else "No hay información de prueba",
            "evidencia": _sanitizar_texto(prueba.get("evidencia", ""))
        }
    elif publicacion.get("fase") == "bloqueado":
        clase = "publicacion"
        evidencia = publicacion.get("evidencia", "")
        return {
            "clase": clase,
            "clave": clase + publicacion.get("sha", "")[:9],
            "resumen": f"Publicación bloqueada (hash: {publicacion.get('sha', '')[:9]})" if publicacion
            else "No hay información de publicación",
            "evidencia": _sanitizar_texto(evidencia)
        }
    return None


def tarea_de_arreglo(motivo):
    if motivo is None:
        return None
    clave = motivo["clave"]
    id_ = "DSB" + clave[:10]
    evidencia = motivo["evidencia"]
    resumen = motivo["resumen"]
    
    return {
        "ola": "DSB",
        "tareas": [
            {
                "id": id_,
                "ola": "DSB",
                "titulo": f"URGENTE · {resumen}",
                "urgente": True,
                "archivos": [],
                "depende": [],
                "prompt": f"Arreglar el bloqueo:\n\nResumen: {resumen}\nEvidencia: {evidencia}\n\nEncontrar la causa en el archivo que nombra la evidencia, arreglar SOLO eso, y no tocar frenos ni pruebas ajenas."
            }
        ]
    }


def ya_pedida(clave, nombres_de_colas):
    return any(clave in nombre for nombre in nombres_de_colas)


def _sanitizar_texto(texto):
    if not texto:
        return ""
    texto = str(texto)
    
    import re
    texto = re.sub(r'\033\[[0-9;]*m', '', texto)
    
    claves = ["sk-", "ak_", "ghp_"]
    for clave in claves:
        if clave in texto:
            texto = texto.replace(clave, "<<clave>>")
    
    for hex_char in re.findall(r'[0-9a-fA-F]{32,}', texto):
        texto = texto.replace(hex_char, "<<clave>>")
    
    if len(texto) > 1200:
        texto = texto[:1197] + "..."
    return texto