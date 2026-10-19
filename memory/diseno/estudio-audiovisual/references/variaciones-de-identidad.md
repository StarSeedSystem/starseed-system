# Variaciones de identidad: de las referencias a la Librería

La identidad de StarSeed es dinámica: una marca, muchas variaciones. Este es el método para crear variaciones
de todo tipo (animaciones, transiciones, elementos 3D animados, tipografía, color, composición, iconos, sonido),
aprobarlas y publicarlas en la Librería del OS.

## 1. Familias de variación

| Familia | Clave en el OS | Qué varía |
|---|---|---|
| animación | `animacion:<id>` | siembra, respiración, alquimia, cristalización…: tiempos, curvas, escalonado, recorrido |
| transición | `transicion:<id>` | entrada cardinal, fundido con desenfoque, elemento compartido, barrido de horizonte |
| elemento 3D | `elemento-3d:<id>` | forma, material, luz, cámara, ritmo |
| tipografía | `tipografia:<id>` | emparejamiento, escala, medida, peso |
| paleta y registro | `tema:<id>` | registro, cobertura, fondo, brillo |
| composición | `composicion:<id>` | rejilla, centro, perímetro, proporciones por aparato |
| icono e imagen | `icono:<id>` | trazo, relleno, estilo de imagen |
| sonido | `sonido:<id>` | logo sonoro, ambientes, transiciones sonoras |

Estas claves siguen la gramática de `architecture/variaciones-publicas.md` del repo, para que cada variación
aprobada aparezca en el clic derecho «Variaciones públicas» del elemento correspondiente.

## 2. De la referencia al patrón (análisis de varios medios)

Se estudian referencias de distintos medios (web, vídeo, cartel, 3D, sonido) para entender **cómo** están
hechas y crear algo **propio**:

1. **Elegir referencias** del catálogo `config/referencias-inspiracion.json` (Motion Primitives,
   transitions.dev, LottieFiles, Kinetics, Navbar Gallery…) y de lo que Alex aporte. Respetar sus canales: MCP
   o API oficial, o abrirlas en el navegador; nada de raspado ni descarga masiva.
2. **Medir el patrón:** duración, curva, escalonado, recorrido, estructura de la retícula, proporciones,
   emparejamiento tipográfico, ritmo de cortes, movimientos de cámara. Se anotan números, no se copian piezas.
3. **Traducir a StarSeed:** el patrón se rehace con los tokens, las formas y el vocabulario de movimiento de la
   marca, con nombre propio.
4. **Innovar:** al menos tres variaciones por patrón (sobria, expresiva, experimental), cada una con su
   registro.
5. **Citar:** cada variación guarda las referencias de las que aprendió (crédito, no copia).
6. **Comprobar:** pruebas del ADN (`scripts/comprobar_adn.py`), contraste, movimiento reducido, licencias.

Nunca se copian textos, marcas, logos, capturas ni assets de terceros; de una referencia sale un diseño nuevo.

## 3. Ficha de cada variación

```json
{
  "clave": "transicion:entrada-cardinal",
  "nombre": "Entrada cardinal · expresiva",
  "familia": "transicion",
  "registro": "nexus",
  "fundamentos": ["anticipación", "aceleración y frenado", "escalonado"],
  "parametros": { "duracionMs": 720, "curva": "cubic-bezier(0.16, 1, 0.3, 1)", "recorridoPx": 24, "escalonadoMs": 60 },
  "movimientoReducido": { "duracionMs": 200, "recorridoPx": 0 },
  "ejemplo": "examples/transiciones.html#entrada-cardinal",
  "referencias": [{ "id": "transitions-dev", "que_se_aprendio": "orden de entrada por grupos" }],
  "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
  "estado": "propuesta"
}
```

## 4. Aprobación y paso a la Librería

1. **Propuesta:** el estudio presenta las variaciones a Alex en un artefacto Design o Slides (vista previa
   animada, ficha y referencias).
2. **Aprobación:** Alex aprueba, pide cambios o descarta. Solo lo aprobado sigue.
3. **Registro:** las aprobadas se guardan como fichas en `starseed_memory_root/diseno/variaciones-aprobadas/`
   y se añaden al artefacto Design System «StarSeed OS» (componente o sección).
4. **Librería:** cuando exista `os_variaciones` (ola VPU1019 del repo), se publican como variaciones públicas
   de su clave, con autor, licencia y referencias; mientras tanto se publican como elementos del catálogo
   público de la Librería (`library_public_items`, categoría diseño, carpeta de su familia).
5. **Seguimiento:** cada variación publicada conserva su origen (`de_variacion`) para que otras personas
   creen las suyas a partir de ella.
