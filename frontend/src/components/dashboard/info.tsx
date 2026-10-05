import { Card, CardContent } from '@/components/ui/card';

const INFO_CARDS = [
  {
    content: 'Arrastra tu archivo IFC o selecciónalo desde tu dispositivo.',
    title: 'Carga tu archivo IFC',
  },
  {
    content: 'Explora tu modelo BIM en un visor 3D interactivo con controles profesionales y navegación intuitiva.',
    title: 'Visualiza en 3D',
  },
  {
    content: 'Posiciona tu proyecto en un mapa 3D georreferenciado y analiza cómo se verá dentro de su entorno real.',
    title: 'Geolocaliza tu proyecto',
  },
  {
    content: 'Verifica tu modelo según la normativa vigente y obtén un reporte claro con los resultados.',
    title: 'Valida con la normativa',
  },
];

const Info = () => (
  <section className="container mx-auto px-4 md:px-6 py-16 md:py-24">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12 md:flex items-end gap-6">
        <h2 className="text-3xl md:text-5xl font-bold text-white">
          Cómo funciona
        </h2>
        <p className="text-lg text-grey">
          Cuatro pasos simples para validar tus proyectos
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {INFO_CARDS.map(({ title, content }) => (
          <Card key={title} className="border border-medium-blue/30 bg-transparent backdrop-blur-sm">
            <CardContent className="flex flex-col justify-between min-h-36 pt-6 space-y-3">
              <h3 className="text-xl font-semibold text-white">
                {title}
              </h3>
              <p className="text-grey text-sm">
                {content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

export default Info;
