import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

import { useIfcParcelContext } from './ifc-parcel-context';
import IFCViewer from './ifc-viewer';
import MapViewer from './map-viewer';

const Viewers = () => {
  const { isGeoreferenced } = useIfcParcelContext();

  return (
    <div className="flex-1 overflow-hidden">
      <Tabs className="flex h-full flex-col" defaultValue="viewer">
        <div className="rounded-none border-b border-medium-blue">
          <TabsList className="flex w-full items-center rounded-none bg-primary-dark sm:w-auto">
            <TabsTrigger
              className="flex-1 rounded-full text-medium-blue data-[state=active]:bg-medium-blue data-[state=active]:text-white sm:flex-none"
              value="viewer"
            >
              Visor 3D
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 rounded-full text-medium-blue data-[state=active]:bg-medium-blue data-[state=active]:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              disabled={!isGeoreferenced}
              value="map"
            >
              Mapa 3D
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-hidden">
          <TabsContent className="m-0 h-full" value="viewer">
            <IFCViewer />
          </TabsContent>
          <TabsContent className="m-0 h-full" value="map">
            <MapViewer />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Viewers;
