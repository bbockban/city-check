import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type MapTransformState = {
  lngLat: [number, number];
  rotateZ: number;
} | null;

type MapTransformContextValue = {
  georefParams: MapTransformState;
  setGeorefParams: (params: MapTransformState) => void;
};

const MapTransformContext = createContext<MapTransformContextValue | null>(null);

export const MapTransformProvider = ({ children }: { children: ReactNode }) => {
  const [georefParams, setGeorefParams] = useState<MapTransformState>(null);

  return (
    <MapTransformContext.Provider value={{ georefParams, setGeorefParams }}>
      {children}
    </MapTransformContext.Provider>
  );
};

export const useMapTransformContext = (): MapTransformContextValue => {
  const ctx = useContext(MapTransformContext);

  if (!ctx) {
    throw new Error('useMapTransformContext must be used inside MapTransformProvider');
  }

  return ctx;
};
