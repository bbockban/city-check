import { Scene } from 'three';
import type { FragmentsModel } from '@thatopen/fragments';

import { createThatOpenIFCLoader, type ThatOpenIFCLoaderAPI } from '@/lib/ifc-loader-thatopen';

import type { Disposable } from './types';

/*
 Carga IFC en la escena del mapa usando la misma pila que el visor 3D
 (IfcLoader + FragmentsManager de @thatopen/components), para que el modelo
 se vea igual en mapa y en visor 3D.
*/
export class FragmentModel implements Disposable {
  // Callback que MapBox usa para centrar el mapa cuando termina de cargar el IFC.
  onLoadFinish!: VoidFunction;

  // Modelos cargados y añadidos a la escena.
  readonly models: FragmentsModel[] = [];

  private scene: Scene;
  private thatOpenLoader: ThatOpenIFCLoaderAPI | null = null;

  constructor (scene: Scene) {
    this.scene = scene;
  }

  // Saca modelos de la escena, los dispone y libera el cargador That Open.
  async dispose () {
    for (const model of this.models) {
      this.scene.remove(model.object);
      await model.dispose();
    }

    this.models.length = 0;

    if (this.thatOpenLoader) {
      await this.thatOpenLoader.dispose();

      this.thatOpenLoader = null;
    }
  }

  /*
   Carga un archivo IFC y añade el modelo a la escena.
   La primera vez crea el cargador That Open y despues reutiliza el mismo.
   Al terminar llama a onLoadFinish (p. ej. para centrar el mapa).
  */
  async loadModel (file: File) {
    for (const model of this.models) {
      this.scene.remove(model.object);
      await model.dispose();
    }

    this.models.length = 0;

    if (!this.thatOpenLoader) {
      this.thatOpenLoader = await createThatOpenIFCLoader();
    }

    const loaded = await this.thatOpenLoader.loadToScene(file, this.scene);

    this.models.push(...loaded);

    if (this.onLoadFinish) this.onLoadFinish();
  }

  /*
   Actualiza el núcleo de fragmentos (LOD, etc.).
   Debe llamarse cada frame desde el render del mapa (MapBox.render).
  */
  update () {
    this.thatOpenLoader?.update();
  }
}
