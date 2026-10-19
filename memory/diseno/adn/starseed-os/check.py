import sys
import os

# Añadir scripts/puente al path de forma relativa desde este archivo
sys.path.append(os.path.join(os.path.dirname(__file__), '../../../../scripts/puente'))

from adn_comprobar import main

if __name__ == '__main__':
    # Ejecutar el comprobador pasando el directorio actual
    main(os.path.dirname(__file__))