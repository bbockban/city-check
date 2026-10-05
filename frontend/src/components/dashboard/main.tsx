import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';

const Main = () => (
  <section className="relative overflow-hidden">
    <div className="container mx-auto px-4 md:px-6 py-16 md:py-24 relative z-10">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
          Valida y visualiza tus
          <span className="block mt-2 bg-linear-to-r from-medium-blue via-white to-medium-blue bg-clip-text text-transparent">
            proyectos en BIM
          </span>
        </h1>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button
            asChild
            variant="gradient"
            size="lg"
            className="text-lg px-8 py-6"
          >
            <Link to={ROUTES.VALIDATOR}>
              Comenzar validación
              <ArrowRight className="ml-2 size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  </section>
);

export default Main;
