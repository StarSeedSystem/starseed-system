// src/app/(app)/info/constitution/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const constitutionContent = [
    { 
        type: 'title', 
        level: 1,
        text: "Título I: Fundamentos y Principios Universales" 
    },
    { 
        type: 'article', 
        level: 2,
        title: "Artículo 1: Principio de Beneficio Comunitario",
        text: "Toda perspectiva, acto, propuesta, política o tecnología debe orientarse hacia el bien común, priorizando la armonía con el entorno, el bienestar de las generaciones futuras y la protección de todos los seres. Se propicia la cooperación sobre la competencia, garantizando que el desarrollo material, social, intelectual y espiritual se oriente al florecimiento colectivo."
    },
    { 
        type: 'article', 
        level: 2,
        title: "Artículo 2: Equilibrio con la Naturaleza y el Cosmos",
        text: "La sociedad reconoce su interdependencia con todos los ecosistemas y formas de vida. Las decisiones deberán ser evaluadas considerando su impacto ambiental, la regeneración de recursos y la preservación del equilibrio planetario y universal. La humanidad es guardiana, no dueña, de la Tierra y del espacio que habita."
    },
    { 
        type: 'article', 
        level: 2,
        title: "Artículo 3: Sostenibilidad y Abundancia Ecológica",
        text: "La abundancia se entiende como la satisfacción holística de las necesidades, sin agotar ni dañar los recursos. Se promueve la adopción de energías limpias, la agricultura sostenible, la economía circular y la restauración de hábitats, garantizando que las futuras generaciones gocen de igualdad de oportunidades para prosperar."
    },
    { 
        type: 'article', 
        level: 2,
        title: "Artículo 4: Transparencia, Veracidad y Accesibilidad",
        text: "La información circula de forma abierta, verificable y comprensible. Los datos, decisiones y resultados deben ser accesibles a toda la ciudadanía, facilitando el entendimiento y la participación informada. La red StarSeed asegura el acceso equitativo a la información, impulsando la alfabetización digital, educativa y política."
    },
    { 
        type: 'title', 
        level: 1,
        text: "Título II: Derechos, Deberes y Participación Ciudadana" 
    },
    { 
        type: 'article', 
        level: 2,
        title: "Artículo 5: Derechos Fundamentales",
        text: "Todos los seres humanos tienen derecho a:\n•\tExistir en paz, libres de violencia, opresión o discriminación.\n•\tAcceder a educación libre, universal y de calidad, que estimule el pensamiento crítico, la creatividad y el bienestar integral.\n•\tParticipar activamente en las decisiones políticas, económicas y culturales, mediante plataformas democráticas y tecnologías transparentes.\n•\tRecibir atención en salud integral, incluyendo salud física, mental, emocional, social y espiritual.\n•\tDisfrutar de una alimentación saludable, agua limpia, vivienda digna y un entorno seguro y armonioso."
    },
     { 
        type: 'article', 
        level: 2,
        title: "Artículo 6: Deberes Ciudadanos",
        text: "Cada individuo debe:\n•\tContribuir al bienestar común, respetar la dignidad de todos los seres y participar con honestidad en la construcción colectiva.\n•\tCuidar el entorno natural y social, evitando daños y procurando restaurar lo que haya sido deteriorado.\n•\tCompartir conocimientos, habilidades y experiencias, favoreciendo la evolución cultural, educativa y tecnológica de la comunidad.\n•\tRespetar las normas, acuerdos y decisiones colectivas, siempre bajo principios de justicia, transparencia y equidad."
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 7: Participación Democrática y Ontocrática',
        text: 'La sociedad adopta un sistema político ontocrático-ciberdélico, donde la inteligencia colectiva, fortalecida por la tecnología y la sabiduría ancestral, guía las decisiones. Todos pueden opinar, proponer y votar con respeto. Se promueven asambleas periódicas, foros virtuales y presenciales, y consultas abiertas. Las entidades federativas se organizan por comunidades reales, no por divisiones artificiales, garantizando representatividad y cercanía.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título III: Organización Política, Económica y Social'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 8: Distribución de Recursos y Medios de Producción',
        text: 'Los recursos se administran democráticamente a través de plataformas accesibles a todos. Los medios de producción son gestionados por voluntarios, apoyados por la inteligencia artificial, en concordancia con lo acordado democráticamente. La propiedad, entendida como responsabilidad compartida, se orienta a la satisfacción de necesidades y no a la acumulación individual.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 9: Cooperación y Economía Ética',
        text: 'La economía promueve la cooperación sobre la competencia. Se busca la prosperidad compartida mediante prácticas como el intercambio justo, el comercio ético, el apoyo mutuo y la eliminación gradual del lucro desmesurado. Las tecnologías automatizadas se utilizan para liberar a las personas de trabajos alienantes, permitiendo más tiempo para la educación, el ocio creativo, el servicio comunitario y el crecimiento personal.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 10: Justicia y Resolución de Conflictos',
        text: 'Los conflictos se gestionan mediante la justicia restaurativa, el diálogo y la mediación. Se aplica un juicio en tres niveles —moral, ético y universal— buscando la comprensión del contexto, la restauración del daño y la rehabilitación del individuo. Las acciones caóticas o destructivas no se castigan en el sentido punitivo, sino que se aborda la raíz del problema con educación, terapia, mentoría y apoyo comunitario, evitando la exclusión y la discriminación.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título IV: Educación, Cultura y Conocimiento'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 11: Sistema Educativo Libre y Universal',
        text: 'La educación es pilar fundamental. La Red Socioeducativa provee acceso a clases, artículos, talleres, laboratorios y bibliotecas virtuales, guiadas por expertos y IA personalizadas. Se fomenta el pensamiento crítico, la innovación, la sensibilidad cultural, el amor por el conocimiento y la resolución creativa de problemas.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 12: Cultura y Expresión Artística',
        text: 'La cultura se entiende como un tejido vivo que integra arte, espiritualidad, valores, historia, lenguas y costumbres. La creación artística se apoya activamente, integrando diversos medios (2D, AR, VR) y promoviendo el diálogo intercultural, el intercambio de ideas y la expresión sin censura injustificada, siempre dentro de un marco de respeto y armonía.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 13: Desarrollo Espiritual y Salud Integral',
        text: 'Se reconoce la dimensión espiritual del ser humano. Se promueven prácticas como la meditación, el yoga, ceremonias ancestrales, terapias holísticas, sabidurías chamánicas y consultas con expertos en salud mental y emocional. El objetivo es el desarrollo integral, el equilibrio interno y la resiliencia personal y colectiva.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título V: Tecnología, Información y Ética Digital'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 14: Uso Ético de la Tecnología e IA',
        text: 'La inteligencia artificial, la robótica y la automatización se utilizan para liberar a la humanidad de labores tediosas, mejorar la calidad de vida, la eficiencia en la distribución de recursos y la toma de decisiones. Cualquier sistema tecnológico debe ser transparente, explicable y alineado con los principios éticos de esta Constitución.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 15: Protección de Datos y Privacidad',
        text: 'La privacidad es un derecho fundamental. Los datos personales se protegen, anonimizan y utilizan exclusivamente con consentimiento informado. Las plataformas deben garantizar la seguridad y el respeto de la identidad individual.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 16: Canales de Comunicación y Conocimientos Globales',
        text: 'Las transmisiones, noticias y contenidos se categorizan por niveles de fundamentalidad y se almacenan en bibliotecas digitales seguras. Los mensajes urgentes se notifican a toda la sociedad o regiones específicas. La información se verifica, ofreciendo perspectivas diversas y consejos equilibrados para el bien común.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título VI: Técnicas, Métodos y Consejos para el Bien Común'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 17: Métodos de Toma de Decisiones',
        text: 'Se integran diversas técnicas deliberativas:\n•\tAsambleas ciudadanas rotatorias.\n•\tVotaciones con plazos razonables y herramientas interactivas.\n•\tConsultas con expertos, IA y sabios comunitarios.\n•\tEspacios de retroalimentación continua, encuestas y foros temáticos.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 18: Prácticas de Bienestar y Prevención de Conflictos',
        text: 'Se recomiendan métodos como la comunicación no violenta, la resolución creativa de problemas, la escucha activa, la empatía, la atención plena y el acompañamiento psicológico para evitar la escalada de tensiones. Toda acción se orienta a la sanación de vínculos y la reconstitución del tejido social.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 19: Entrenamiento en Habilidades Prácticas y Sostenibles',
        text: 'La ciudadanía se capacita en agricultura ecológica, energías renovables, sistemas comunitarios de agua, compostaje, bioconstrucción, programación ética, artesanía local, medicina preventiva y reciclaje creativo. El objetivo es cultivar la autosuficiencia, la colaboración local y la innovación responsable.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título VII: Proyección Universal e Intergaláctica'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 20: Integración Intergaláctica y Alianzas Universales',
        text: 'La Sociedad StarSeed reconoce la posibilidad de interactuar con otras civilizaciones planetarias o intergalácticas. Se fomentan el intercambio cultural, científico y espiritual, buscando la paz, el respeto mutuo y la comprensión universal. Cualquier contacto o colaboración con entidades exteriores se guiará por los mismos principios éticos y evolutivos.'
    },
    {
        type: 'title',
        level: 1,
        text: 'Título VIII: Revisión, Actualización y Aplicación de la Constitución'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 21: Flexibilidad y Evolución Continua',
        text: 'Esta Constitución es un documento vivo, revisable periódicamente mediante procesos democráticos. La ciudadanía puede proponer modificaciones, adaptando el marco legal a las necesidades cambiantes del entorno, la tecnología y la evolución social, garantizando su coherencia con los valores fundamentales.'
    },
    {
        type: 'article',
        level: 2,
        title: 'Artículo 22: Cumplimiento y Responsabilidad Colectiva',
        text: 'La aplicación de estas leyes es responsabilidad de todos. El sistema político, las redes tecnológicas, las asambleas ciudadanas y los comités de sabios y voluntarios velarán por el cumplimiento, la educación permanente en sus principios y la corrección de desviaciones.\nLos mecanismos de justicia restaurativa y los procesos educativos sirven como cauce para la resolución de conflictos y el fortalecimiento de la cohesión social.'
    }
];


export default function ConstitutionPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-3xl">Constitución de la Sociedad StarSeed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold font-headline text-primary">Preámbulo</h2>
                    <p className="mt-2 text-muted-foreground leading-relaxed">
                        La Sociedad StarSeed surge con el propósito de crear un entorno en el que todas las formas de vida, presentes y futuras, gocen de una existencia digna, pacífica, próspera y armónica. Inspirada en la cooperación, la sabiduría colectiva, la sostenibilidad ecológica, la justicia social y la evolución espiritual y tecnológica, esta Constitución establece los fundamentos, leyes, derechos y principios que regirán el desarrollo comunitario. Su objetivo es guiar a la humanidad hacia una civilización integrada, consciente, abundante y respetuosa del universo al que pertenece, promoviendo la libertad, la participación, la educación, la salud integral, la innovación y la protección de todos los seres.
                    </p>
                </section>

                <Separator />

                <div className="prose prose-invert max-w-none text-foreground/90 space-y-6">
                    {constitutionContent.map((item, index) => {
                        if (item.type === 'title') {
                            return <h2 key={index} className="text-2xl font-bold font-headline text-primary pt-4 border-t">{item.text}</h2>
                        }
                        if (item.type === 'article') {
                            return (
                                <article key={index}>
                                    <h3 className="text-lg font-semibold font-headline">{item.title}</h3>
                                    <p className="mt-1 whitespace-pre-line">{item.text}</p>
                                </article>
                            )
                        }
                        return null;
                    })}
                </div>

                 <Separator />

                <section>
                    <h2 className="text-xl font-semibold font-headline text-primary">Conclusión</h2>
                    <p className="mt-2 text-muted-foreground leading-relaxed">
                       La Constitución de la Sociedad StarSeed establece las bases para un mundo en el que la evolución humana trasciende la competencia destructiva, integrando sabiduría ancestral, tecnologías avanzadas, educación integral, justicia compasiva y armonía ecológica. Este marco ético, práctico y flexible asegura que todos los seres gocen de la libertad, la paz, la abundancia y el respeto que merecen, forjando una sociedad universal que honra su pasado, abraza su presente y crea su futuro común con esperanza e imaginación.
                    </p>
                </section>
            </CardContent>
        </Card>
    );
}
