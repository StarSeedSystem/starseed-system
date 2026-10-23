# Servicio de earshot

**Descripción**
El servicio expone una API que recibe fragmentos de audio (WAV o PCM) de máximo 15 s y devuelve una lista de etiquetas con confianza. El servicio no guarda los datos de audio y rechaza peticiones sin token o con token inválido.

**Puntos clave**
- Ruta base: `/oir`.
- Se requiere el header `Authorization: Bearer <TOKEN>` si la variable `STARSEED_OIDO_TOKEN` está definida.
- Si `EARSHOT_OFFLINE=1` se aceptan solo la primera descarga.
- La respuesta es un JSON: `{"tags": ["etiqueta1", "etiqueta2"]}`.
- El servicio no ejecuta el comando `llm` (subida a Gemini) por política.

**Instalación**
```bash
deploy oido Servicio
```

**Testing** - ver `test_servidor.py`.
