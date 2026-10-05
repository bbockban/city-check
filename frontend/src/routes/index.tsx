import { createFileRoute } from '@tanstack/react-router';

import Main from '@/components/dashboard/main';
import Info from '@/components/dashboard/info';

const HomeComponent = () => (
  <div className="min-h-screen bg-primary">
    <div className="absolute inset-0 overflow-visiblae pointer-events-none">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-medium-blue/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-[100px]"></div>
    </div>
    <header className="border-b border-medium-blue/30 bg-primary/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img alt="CityCheck" className="w-9 h-9" src="/favicon.svg" />
          <span className="text-xl font-semibold text-white">CityCheck</span>
        </div>
      </div>
    </header>
    <Main />
    <Info />
  </div>
);

export const Route = createFileRoute('/')({ component: HomeComponent });
