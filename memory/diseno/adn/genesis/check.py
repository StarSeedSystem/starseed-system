import os
import sys

# Resolver el comprobador común desde cualquier directorio de ejecución.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../scripts/puente")))
from adn_comprobar import main

if __name__ == "__main__":
    main(os.path.dirname(__file__))
