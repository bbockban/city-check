import type { Scene } from 'three';
import type { FragmentsModel } from '@thatopen/fragments';

import {
  createHiddenRenderContainer,
  createThatOpenIFCRuntime,
  loadIfcFileToScene,
} from '@/lib/thatopen-ifc-runtime';

// API del cargador IFC That Open: carga a una escena, update por frame y dispose.
export interface ThatOpenIFCLoaderAPI {
  dispose: () => Promise<void>;
  loadToScene: (file: File, scene: Scene) => Promise<FragmentsModel[]>;
  update: VoidFunction;
}

/*
  Crea un cargador IFC con la misma pila que el visor 3D vía `createThatOpenIFCRuntime`.
  El World usa un renderer en un div oculto; los modelos se añaden a la escena que pase el mapa.
*/
export const createThatOpenIFCLoader = async (): Promise<ThatOpenIFCLoaderAPI> => {
  const renderContainer = createHiddenRenderContainer();

  const {
    dispose: disposeRuntime,
    fragments,
    ifcLoader,
    world,
  } = await createThatOpenIFCRuntime(renderContainer);

  const loadedModels: FragmentsModel[] = [];

  const loadToScene = async (file: File, scene: Scene): Promise<FragmentsModel[]> => {
    const models = await loadIfcFileToScene(
      ifcLoader,
      fragments,
      world.camera.three,
      scene,
      file,
    );

    loadedModels.push(...models);

    return models;
  };

  const update = () => {
    fragments.core.update();
  };

  const dispose = async () => {
    loadedModels.forEach((model) => model.object.removeFromParent());
    loadedModels.length = 0;
    renderContainer.remove();

    await disposeRuntime();
  };

  return { dispose, loadToScene, update };
};
