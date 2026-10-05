import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Building2,
  Columns3,
  DoorOpen,
  Layers,
  Layers3,
  MapPin,
  MoveUpRight,
  PanelTop,
  RectangleVertical,
  SeparatorHorizontal,
  Square,
  Triangle,
} from 'lucide-react';

const ifcCategoryIconMap: Record<string, LucideIcon> = {
  IfcBeam: SeparatorHorizontal,
  IfcBuilding: Building2,
  IfcBuildingStorey: Layers,
  IfcColumn: Columns3,
  IfcDoor: DoorOpen,
  IfcRoof: Triangle,
  IfcSite: MapPin,
  IfcSlab: Layers3,
  IfcSpace: Square,
  IfcStair: MoveUpRight,
  IfcStairFlight: MoveUpRight,
  IfcWall: RectangleVertical,
  IfcWallStandardCase: RectangleVertical,
  IfcWindow: PanelTop,
};

const normalizedIconMap = new Map(
  Object.entries(ifcCategoryIconMap).map(([key, icon]) => [key.toLowerCase(), icon]),
);

/** Generic fallback (`Box`) for any IFC category outside the curated map above. */
export const ifcCategoryIcon = (categoryLabel: string): LucideIcon =>
  normalizedIconMap.get(categoryLabel.toLowerCase()) ?? Box;
