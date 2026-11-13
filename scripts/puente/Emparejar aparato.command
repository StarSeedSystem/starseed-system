#!/bin/zsh
# Emparejar un aparato para escribir en los chats de Genesis (GEN1114B, contrato §3.3).
# Doble clic: abre Terminal en esta orden. Pide el código que muestra el aparato, la contraseña de
# administrador de la Mac y el nivel (Intro = solo texto). `genesis_aparatos.py acceso-escritorio` deja
# una copia en el Escritorio con la raíz del repo escrita abajo.
RAIZ_POR_DEFECTO="/Users/alex/Documents/starseed-os-main"
AQUI="${0:A:h}"
if [[ -f "$AQUI/genesis_aparatos.py" ]]; then
  RAIZ="${AQUI:h:h}"
else
  RAIZ="$RAIZ_POR_DEFECTO"
fi
PY=/opt/homebrew/bin/python3
[[ -x "$PY" ]] || PY=python3
cd "$RAIZ" && "$PY" scripts/puente/genesis_aparatos.py emparejar
echo
read -r "?Pulsa Intro para cerrar esta ventana. "
