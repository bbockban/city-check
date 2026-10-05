import { MapBox } from './map-box';

import type { Disposable } from './types';

/*
 Orquestador: crea el mapa Mapbox, enlaza el modelo IFC (FragmentModel) y expone setFile + dispose.

 Decisión: clase en lugar de funciones sueltas o hooks porque:
 - React guarda una única instancia en un ref (bimModelRef.current); hace falta un objeto con identidad.
 - Ciclo de vida claro: crear al montar → setFile(file) cuando cambia el archivo → dispose() al desmontar.
 - Una sola entrada de limpieza (dispose) evita fugas de mapa, WebGL, workers y listeners.
*/
export class BimModel implements Disposable {
  mapBox!: MapBox;

  private rootContainer: HTMLDivElement;

  constructor (rootContainer: HTMLDivElement) {
    this.rootContainer = rootContainer;
  }

  // Libera mapa, renderer, workers y escena.
  async dispose () {
    await this.mapBox?.dispose();
  }

  // Limpia el modelo IFC cargado. El mapa sigue vivo.
  async clearScene () {
    this.mapBox?.clearParcelClip();
    await this.mapBox?.fragmentModel.dispose();
  }

  // Aplica capa clip + contorno del padrón.
  async applyParcelClip (ring: number[][]) {
    await this.mapBox?.applyParcelClipRing(ring);
  }

  clearParcelClip () {
    this.mapBox?.clearParcelClip();
  }

  setModelScaleMultiplier (multiplier: number) {
    this.mapBox?.setModelScaleMultiplier(multiplier);
  }

  // Solución directa: multiplier = sqrt(targetM2 / baseFootprintM2). Sin iteración.
  autoScaleToTargetCoveragePercent (targetPercent: number): number | null {
    return this.mapBox?.autoScaleToTargetCoveragePercent(targetPercent) ?? null;
  }

  estimateCurrentCoveragePercent (): number | null {
    return this.mapBox?.estimateCurrentCoveragePercent() ?? null;
  }

  moveModel (deltaE: number, deltaN: number) {
    this.mapBox?.moveModel(deltaE, deltaN);
  }

  rotateModel (alpha: number) {
    this.mapBox?.rotateModel(alpha);
  }

  resetTransform () {
    this.mapBox?.resetTransform();
  }

  setInitialHeading (heading: number) {
    this.mapBox?.setInitialHeading(heading);
  }

  setResetBboxCenterAt (parcelLngLat: [number, number]) {
    this.mapBox?.setResetBboxCenterAt(parcelLngLat);
  }

  setInitialPosition (lngLat: [number, number]) {
    this.mapBox?.setInitialPosition(lngLat);
  }

  setMapViewCenter (center: [number, number]) {
    this.mapBox?.setMapViewCenter(center);
  }

  getGeorefState (): { lngLat: [number, number]; rotateZ: number } | null {
    return this.mapBox?.getGeorefState() ?? null;
  }

  // Crea MapBox la primera vez, luego reutiliza y carga el IFC.
  async setFile (file: File, center?: [number, number]) {
    if (!this.mapBox) {
      this.mapBox = new MapBox(this.rootContainer);

      if (center) this.mapBox.setCustomCenter(center);
    }

    await this.mapBox.fragmentModel.loadModel(file);
  }
}
