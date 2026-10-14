export const CITA_FUNDAMENTO = `«El fundamento filosófico de StarSeed es el **diamante en esencia de conciencia**, y la **piedra
filosofal** es la estructura y metodología de cada usuario, grupo y comunidad, y en sí de toda la
sociedad StarSeed. La **semilla**, o sea el sistema de StarSeed, es la piedra filosofal, y el
diamante es el **sistema completo**. La **alquimia de la transformación a oro** es el proceso y
desarrollo creativo sociocultural y económicamente ecológico y autosustentable.»`;
export const SIMBOLOS: Array<{ id: 'diamante' | 'piedra' | 'alquimia'; nombre: string; es: string; pregunta: string }> = [
  {
    id: 'diamante',
    nombre: 'Diamante',
    es: 'El sistema completo, con la conciencia como esencia',
    pregunta: '¿Esto encaja en el todo (una identidad, una memoria, una red) o lo fragmenta?'
  },
  {
    id: 'piedra',
    nombre: 'Piedra filosofal',
    es: 'El sistema StarSeed como estructura y metodología propia de cada persona, grupo y comunidad (sus Genesis, PoliGenesis y MetaGenesis, sus enjambres, su interfaz editable)',
    pregunta: '¿Cada uno puede darle su propia forma y método sin perder el núcleo común?'
  },
  {
    id: 'alquimia',
    nombre: 'Alquimia',
    es: 'El proceso: desarrollo creativo, sociocultural, económicamente ecológico y autosustentable',
    pregunta: '¿Esto transforma algo en valor creativo y social sin gastar de más (créditos, energía, datos) y puede sostenerse solo?'
  }
];
export const FUENTE = 'memory/principles.md §0';