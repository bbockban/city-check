import type { FragmentsModel, MaterialDefinition } from '@thatopen/fragments';
import { Grids, ModelIdMapUtils } from '@thatopen/components';
import CameraControls from 'camera-controls';

import {
  createThatOpenIFCRuntime,
  loadIfcFileToScene,
} from '@/lib/thatopen-ifc-runtime';

export interface IFCViewerAPI {
  cleanup: VoidFunction;
  clearScene: () => Promise<void>;
  getPrimaryFragmentsModel: () => FragmentsModel | null;
  highlightLocalIds: (
    localIds: number[],
    material: MaterialDefinition,
  ) => Promise<void>;
  loadIfcFromFile: (file: File) => Promise<void>;
  resetHighlightLocalIds: (localIds: number[]) => Promise<void>;
  updateFragmentsView: () => void;
}

export const setupIFCViewer = async (
  container: HTMLDivElement,
): Promise<IFCViewerAPI> => {
  const {
    components,
    dispose,
    fragments,
    ifcLoader,
    world,
  } = await createThatOpenIFCRuntime(container);

  world.camera.controls?.setLookAt(78, 20, -2.2, 26, -4, 25);

  if (world.camera.controls) {
    world.camera.controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
    world.camera.controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
  }

  components.get(Grids).create(world);

  const renderer = world.renderer;

  const resizeObserver = new ResizeObserver(() => {
    if (renderer) {
      const size = renderer.getSize();

      renderer.resize(size);
    }
  });

  resizeObserver.observe(container);

  const loadIfcFromFile = async (file: File) => {
    await loadIfcFileToScene(
      ifcLoader,
      fragments,
      world.camera.three,
      world.scene.three,
      file,
    );
  };

  const clearScene = async () => {
    const modelIds = [...fragments.list.keys()];

    modelIds.forEach((modelId) => {
      const model = fragments.list.get(modelId);

      if (model?.object) {
        world.scene.three.remove(model.object);
      }
    });

    await Promise.allSettled(
      modelIds.map((id) => fragments.core.disposeModel(id)),
    );
  };

  const getPrimaryFragmentsModel = (): FragmentsModel | null => {
    const first = fragments.list.values().next().value;

    return first ?? null;
  };

  const updateFragmentsView = () => {
    fragments.core.update(true);
  };

  const highlightLocalIds = async (
    localIds: number[],
    material: MaterialDefinition,
  ) => {
    const model = getPrimaryFragmentsModel();

    if (!model || localIds.length === 0) return;

    const map = ModelIdMapUtils.fromRaw({ [model.modelId]: localIds });

    await fragments.highlight(material, map);

    fragments.core.update(true);
  };

  const resetHighlightLocalIds = async (localIds: number[]) => {
    const model = getPrimaryFragmentsModel();

    if (!model) return;

    const map = localIds.length === 0
      ? undefined
      : ModelIdMapUtils.fromRaw({ [model.modelId]: localIds });

    await fragments.resetHighlight(map);

    fragments.core.update(true);
  };

  return {
    cleanup: () => {
      resizeObserver.disconnect();
      dispose();
    },
    clearScene,
    getPrimaryFragmentsModel,
    highlightLocalIds,
    loadIfcFromFile,
    resetHighlightLocalIds,
    updateFragmentsView,
  };
};
