import type { OrthographicCamera, PerspectiveCamera, Scene } from 'three';
import type { FragmentsModel } from '@thatopen/fragments';
import {
  Components,
  FragmentsManager,
  IfcLoader,
  OrthoPerspectiveCamera,
  SimpleRenderer,
  SimpleScene,
  SimpleWorld,
  Worlds,
} from '@thatopen/components';

// Runtime mínimo compartido por el visor 3D y el cargador del mapa (misma pila That Open).
export interface ThatOpenIFCRuntime {
  components: Components;
  dispose: () => Promise<void>;
  fragments: FragmentsManager;
  ifcLoader: IfcLoader;
  world: SimpleWorld<SimpleScene, OrthoPerspectiveCamera, SimpleRenderer>;
  worlds: Worlds;
}

// Contenedor 1×1px para SimpleRenderer cuando no hay superficie visible (mapa / headless).
export const createHiddenRenderContainer = (): HTMLDivElement => {
  const el = document.createElement('div');

  el.style.height = '1px';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  el.style.position = 'absolute';
  el.style.width = '1px';
  document.body.appendChild(el);

  return el;
};

export const createThatOpenIFCRuntime = async (
  renderContainer: HTMLElement,
): Promise<ThatOpenIFCRuntime> => {
  const components = new Components();
  const worlds = components.get(Worlds);

  const world = worlds.create<
    SimpleScene,
    OrthoPerspectiveCamera,
    SimpleRenderer
  >();

  world.scene = new SimpleScene(components);
  world.scene.setup();
  world.scene.three.background = null;
  world.renderer = new SimpleRenderer(components, renderContainer);
  world.camera = new OrthoPerspectiveCamera(components);

  components.init();

  const ifcLoader = components.get(IfcLoader);

  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: {
      absolute: true,
      path: '/web-ifc/',
    },
    // @thatopen/components fuerza COORDINATE_TO_ORIGIN=true por defecto: web-ifc recentra la
    // malla cargada (traslación interna para precisión de punto flotante en modelos con
    // coordenadas de proyecto muy grandes). Ese recentrado no queda registrado en ningún lado
    // accesible desde fuera de web-ifc (getCoordinationMatrix() de fragments no lo refleja,
    // solo cubre la coordinación por CRS/IfcMapConversion), así que el ancla de mapa (que lee
    // Eastings/Northings del IFC original vía readMapConversionState) terminaba pivoteando
    // sobre un origen que ya no correspondía al (0,0,0) declarado por el archivo — desplazando
    // el modelo varios metros respecto a su georreferencia real. Los IFC de este proyecto usan
    // coordenadas de proyecto chicas (escala edificio), así que no hace falta el recentrado.
    webIfc: { COORDINATE_TO_ORIGIN: false },
  });

  const fragments = components.get(FragmentsManager);

  const workerUrl = new URL(
    '@thatopen/fragments/worker',
    import.meta.url,
  ).href;

  fragments.init(workerUrl);

  world.camera.controls?.addEventListener('update', () => {
    fragments.core.update();
  });

  fragments.core.models.materials.list.onItemSet.add(({ value: material }: {
    value: {
      isLodMaterial?: boolean;
      polygonOffset?: boolean;
      polygonOffsetFactor?: number;
      polygonOffsetUnits?: number;
    };
  }) => {
    if (!('isLodMaterial' in material && material.isLodMaterial)) {
      material.polygonOffset = true;
      material.polygonOffsetUnits = 1;
      material.polygonOffsetFactor = Math.random();
    }
  });

  const dispose = async () => {
    await components.dispose();
  };

  return {
    components,
    dispose,
    fragments,
    ifcLoader,
    world,
    worlds,
  };
};

// Elimina IfcMapConversion e IfcProjectedCRS del buffer IFC antes de cargarlo en ThatOpen.
// Razón: web-ifc puede aplicar transformaciones CRS (rotación/traslación) al procesar IfcMapConversion,
// lo que desplaza la geometría en el espacio Three.js y produce un desfase visible al re-importar
// un IFC georeferenciado. El sistema de anclas de Mapbox (mapCamera) gestiona el posicionamiento
// geográfico por separado; las entidades CRS no deben afectar la geometría cargada.
const stripIfcCrsEntities = (buffer: Uint8Array): { buffer: Uint8Array; stripped: boolean } => {
  const text = new TextDecoder('utf-8').decode(buffer);
  const hasMc = /IFCMAPCONVERSION/i.test(text);
  const hasCrs = /IFCPROJECTEDCRS/i.test(text);

  if (!hasMc && !hasCrs) return { buffer, stripped: false };

  const stripped = text
    .replace(/#\d+\s*=\s*IFCMAPCONVERSION\s*\((?:[^)(]|\([^)(]*\))*\)\s*;/gi, '')
    .replace(/#\d+\s*=\s*IFCPROJECTEDCRS\s*\((?:[^)(]|\([^)(]*\))*\)\s*;/gi, '');

  return { buffer: new TextEncoder().encode(stripped), stripped: true };
};

// Carga IFC y añade el objeto del modelo a `scene`. Devuelve los FragmentsModel para acceder a .box.
export const loadIfcFileToScene = async (
  ifcLoader: IfcLoader,
  fragments: FragmentsManager,
  cameraThree: PerspectiveCamera | OrthographicCamera,
  scene: Scene,
  file: File,
): Promise<FragmentsModel[]> => {
  const rawBuffer = new Uint8Array(await file.arrayBuffer());
  const { buffer } = stripIfcCrsEntities(rawBuffer);

  const modelId = file.name.replace(/\.[^.]+$/, '') || 'model';

  const model = await ifcLoader.load(
    buffer,
    false,
    modelId,
    { processData: { progressCallback: () => {} } },
  );

  if (model?.object) {
    if (model.useCamera) model.useCamera(cameraThree);

    scene.add(model.object);
    fragments.core.update(true);

    return [model];
  }

  return [];
};
