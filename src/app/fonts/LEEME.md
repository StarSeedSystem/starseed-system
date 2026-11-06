# Fuentes del OS

Las cinco fuentes del layout (Inter, Roboto, Outfit, Space Grotesk y Source Code Pro) se sirven
desde aquí con `next/font/local`: subconjunto latino, archivos variables, bajados de Google Fonts el
2026-11-06. Antes las descargaba `next/font/google` en cada build y Google empezó a dar URLs sin
extensión, que tumbaban el `next build` (1106F). Licencia: SIL Open Font License 1.1, texto en
`licencias/`. Para renovarlas: `python3 ~/.starseed/opus1031/aplicar-1106f.py` muestra cómo se bajaron.
