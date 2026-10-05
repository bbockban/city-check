import {
  AmbientLight,
  DirectionalLight,
  Matrix4,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  Map,
  MercatorCoordinate,
  NavigationControl,
} from 'mapbox-gl';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { FragmentModel } from './fragments';

import type { Disposable } from './types';

/*
  --- IFC en Mapbox (proyección) ---
  Cada cuadro de animación: se multiplica la matriz de cámara del mapa por mapCamera. mapCamera mueve el modelo
  al punto correcto en el mapa (coordenadas Mercator), lo escala para que un metro del IFC coincida con un metro
  en el terreno (usando meterInMercatorCoordinateUnits), aplica modelScaleMultiplier si hace falta, y rota π/2
  en X para “acostar” el edificio sobre el mapa.

  --- Cobertura y auto-escala respecto al padrón ---
  “Huella” = superficie que el edificio ocupa en el suelo (vista desde arriba), en las mismas unidades que el IFC
  (casi siempre metros cuadrados). Se compara con el área del polígono del padrón, también pasada a esas unidades:
  el área del padrón se calcula primero en el sistema del mapa (Mercator) y después se divide por s², donde s es
  “cuántas unidades Mercator miden un metro” en ese lugar (el mismo s que usa el modelo). Así ambas áreas son
  comparables. baseFootprint = ancho_en_suelo × fondo_en_suelo × (multiplicador)² (ver funciones más abajo).

  --- Por qué ANTES no andaba el tamaño / la auto-escala (cadena causa → efecto) ---

  1) ThatOpen dibuja el IFC con “malla instanciada” (InstancedMesh): hay UNA geometría repetida (ej. un muro) y
     docenas o miles de matrices que dicen “esta copia va acá, esta allá…”.

  2) El código viejo medía el tamaño así: recorría cada mesh, leía el buffer de vértices “position” (solo la
     forma base, sin repetir) y aplicaba mesh.matrixWorld a cada vértice. Eso equivale a preguntar: “¿cuánto
     ocupa esta plantilla en el mundo?”. NO aplicaba la matriz de cada instancia (instanceMatrix), o sea: ignoraba
     que el edificio real está formado por muchas copias repartidas en el espacio.

  3) Resultado de esa medición: la “caja envolvente” del modelo quedaba casi solo alrededor de UNA copia local
     del prototipo (en la práctica, minúscula respecto al edificio completo). La huella en planta calculada
     (ancho × fondo de esa caja) era entonces casi cero.

  4) La auto-escala hace: “quiero que huella = (área del padrón × %) / 100”. Si el programa cree que la huella
     actual es casi 0, despeja un multiplicador m muy grande (porque divide por baseFootprint casi nulo:
     m ≈ sqrt(constante / número_chiquito)). Ese m agranda el modelo en el mapa → edificio descomunal, o % de
     cobertura que no cierra con lo que ves.

  5) Por eso “no andaba”: no era que Mapbox o Mercator estuvieran mal; era que la ENTRADA al cálculo (tamaño del
     edificio medido mal) estaba mal por no contar las instancias.

  6) Ahora: getWorldBbox() usa Box3.setFromObject(raíz del fragmento). Three.js calcula la caja teniendo en
     cuenta cada instancia de InstancedMesh. La huella es realista → baseFootprint razonable → m razonable.

  Qué eje es “arriba” en el modelo antes de acostarlo en el mapa: Y. Por eso el tamaño en planta se mide en el
  piso XZ (ancho en X por fondo en Z), no X×Y: si usás X×Y estarías mezclando la altura del edificio con el
  tamaño en planta.

  --- Fórmula del multiplicador (un paso) ---
  Queremos: huella_final = (área_padrón × targetPercent / 100), con huella_final = baseFootprint × m².
  Despejando: m = raíz de ((área_padrón × targetPercent) / (100 × baseFootprint)).
  Código: autoScaleToTargetCoveragePercent().
*/

const PARCEL_CLIP_SOURCE_ID = 'parcel-clip-source';
const PARCEL_CLIP_LAYER_ID = 'parcel-clip-layer';
const PARCEL_CLIP_OUTLINE_ID = 'parcel-clip-outline';
const MIN_SCALE_MULTIPLIER = 0.0001;
const MAX_SCALE_MULTIPLIER = 10000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const defaultInitialState = {
  antialias: true,
  bearing: -300,
  center: [-56.164532, -34.901112] as [number, number],
  maxZoom: 60,
  minZoom: 3,
  pitch: 60,
  style: 'mapbox://styles/mapbox/streets-v12',
  zoom: 18,
};

export class MapBox implements Disposable {
  map: Map | null = null;
  camera: PerspectiveCamera = new PerspectiveCamera();
  renderer!: WebGLRenderer;
  labelRenderer = new CSS2DRenderer();
  fragmentModel!: FragmentModel;

  private _modelAsMercatorCoordinate!: MercatorCoordinate;
  private _modelRotate: [number, number, number] = [Math.PI / 2, 0, 0];
  private _modelTransform!: {
    translateX: number;
    translateY: number;
    translateZ: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
    scale: number;
  };
  private customCenter: [number, number] | null = null;
  private _initialTransform: typeof this._modelTransform | null = null;
  private parcelClipRing: [number, number][] | null = null;
  /**
   * Número por el que se multiplica la escala del modelo en el mapa (además de la conversión metros↔Mapbox).
   * Si es 1, el IFC respeta escala “real” en metros. autoScaleToTargetCoveragePercent lo cambia para acercar la
   * huella al % de padrón pedido.
   */
  private modelScaleMultiplier = 1;
  private readonly accessToken: string;
  private readonly scene = new Scene();
  private container: HTMLDivElement;

  // Ajusta el tamaño del renderer de etiquetas CSS2D al canvas del mapa.
  private updateLabelRendererSize = () => {
    if (this.renderer?.domElement) {
      this.labelRenderer.setSize(
        this.renderer.domElement.clientWidth,
        this.renderer.domElement.clientHeight,
      );
    }
  };

  // Crea el mapa Mapbox, capa 3D por defecto, escena de fragmentos y callback cuando termina la carga del IFC.
  constructor (
    container: HTMLDivElement,
    initialState: Record<string, unknown> = defaultInitialState,
  ) {
    this.container = container;
    this.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

    this.map = new Map({
      accessToken: this.accessToken,
      container: this.container,
      ...(initialState as Record<string, unknown>),
    });

    this.map.rotateTo(Math.PI / 2);
    this.addDefaultLayer();
    this.initialModelTransform((initialState.center as number[]) ?? defaultInitialState.center);
    this.setupMap();

    this.fragmentModel = new FragmentModel(this.scene);
    this.fragmentModel.onLoadFinish = () => this.handleModelLoaded();
  }

  // Guarda el centro explícito, mueve el mapa y recalcula la transformación Mercator del modelo en ese punto.
  setCustomCenter (center: [number, number]) {
    this.customCenter = center;
    if (this.map?.setCenter) this.map.setCenter(center);
    this.initialModelTransform(center);
  }

  // Mueve solo la cámara del mapa al centro indicado sin tocar la posición del modelo.
  setMapViewCenter (center: [number, number]) {
    this.map?.setCenter(center);
  }

  // Elimina la capa y la fuente GeoJSON del recorte por padrón (clip + contorno).
  clearParcelClip () {
    const map = this.map;

    if (!map?.isStyleLoaded()) return;

    [PARCEL_CLIP_OUTLINE_ID, PARCEL_CLIP_LAYER_ID].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });

    if (map.getSource(PARCEL_CLIP_SOURCE_ID)) map.removeSource(PARCEL_CLIP_SOURCE_ID);
    this.parcelClipRing = null;
  }

  // Registra el polígono del padrón: fuente GeoJSON, capa `clip` (oculta símbolos bajo el polígono) y línea de contorno.
  applyParcelClipRing (ring: number[][]): Promise<void> {
    const map = this.map;

    if (!map || ring.length < 4) return Promise.resolve();

    const ringCopy = ring.map(([lng, lat]) => [lng, lat]) as [number, number][];

    this.parcelClipRing = ringCopy;

    return new Promise((resolve) => {
      const install = () => {
        if (!map.isStyleLoaded()) {
          this.parcelClipRing = ringCopy;
          resolve();

          return;
        }

        this.clearParcelClip();

        map.addSource(PARCEL_CLIP_SOURCE_ID, {
          data: {
            features: [
              {
                geometry: { coordinates: [ring], type: 'Polygon' },
                properties: {},
                type: 'Feature',
              },
            ],
            type: 'FeatureCollection',
          },
          type: 'geojson',
        });

        const beforeId = map.getLayer('3d-model') ? '3d-model' : undefined;

        map.addLayer(
          {
            id: PARCEL_CLIP_LAYER_ID,
            layout: { 'clip-layer-types': ['model', 'symbol'] },
            source: PARCEL_CLIP_SOURCE_ID,
            type: 'clip',
          } as Parameters<Map['addLayer']>[0],
          beforeId,
        );

        map.addLayer(
          {
            id: PARCEL_CLIP_OUTLINE_ID,
            paint: {
              'line-color': 'rgba(255, 0, 0, 0.85)',
              'line-dasharray': [0, 4, 3],
              'line-width': 3,
            },
            source: PARCEL_CLIP_SOURCE_ID,
            type: 'line',
          },
          beforeId,
        );

        this.parcelClipRing = ringCopy;
        resolve();
      };

      if (map.isStyleLoaded() && map.getLayer('3d-model')) {
        install();
      } else {
        map.once('idle', install);
      }
    });
  }

  // Matriz 4×4 del IFC en espacio Mapbox. El vector scale incorpora modelScaleMultiplier (uniforme en X/Y/Z salvo signo Y).
  private get mapCamera () {
    const rotationX = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), this._modelTransform.rotateX);
    const rotationY = new Matrix4().makeRotationAxis(new Vector3(0, 1, 0), this._modelTransform.rotateY);
    const rotationZ = new Matrix4().makeRotationAxis(new Vector3(0, 0, 1), this._modelTransform.rotateZ);

    return new Matrix4()
      .makeTranslation(
        this._modelTransform.translateX,
        this._modelTransform.translateY,
        this._modelTransform.translateZ,
      )
      .scale(new Vector3(
        this._modelTransform.scale * this.modelScaleMultiplier,
        -this._modelTransform.scale * this.modelScaleMultiplier,
        this._modelTransform.scale * this.modelScaleMultiplier,
      ))
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);
  }

  /**
   * Área del polígono del padrón en unidades Mercator² (proyección del anillo y fórmula del cordón / shoelace).
   */
  private getParcelAreaMercator (): number | null {
    if (!this.parcelClipRing || this.parcelClipRing.length < 4) return null;

    const points = this.parcelClipRing.map(([lng, lat]) => {
      const c = MercatorCoordinate.fromLngLat({ lat, lng }, 0);

      return [c.x, c.y] as [number, number];
    });

    let sum = 0;

    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      sum += x1 * y2 - x2 * y1;
    }

    const area = Math.abs(sum) / 2;

    return area > 0 ? area : null;
  }

  /**
   * Devuelve los bordes de la “caja envolvente” del modelo en coordenadas mundiales: xMin/xMax, yMin/yMax, zMin/zMax.
   * Es el paralelepípedo más chico con caras paralelas a los ejes que contiene todo el IFC (incluidas todas las
   * copias instanciadas). ThatOpen dibuja con InstancedMesh; por eso no alcanza con recorrer vértices a mano:
   * Box3.setFromObject le pide a Three.js que calcule esa caja bien.
   * Para el % de cobertura en suelo usamos solo el ancho en X y el fondo en Z (Y es altura antes de rotar el mapa).
   */
  private getWorldBbox (): {
    xMin: number; xMax: number;
    yMin: number; yMax: number;
    zMin: number; zMax: number;
  } | null {
    const model = this.fragmentModel?.models?.[0];

    if (!model) return null;

    this.scene.updateMatrixWorld(true);
    model.object.updateMatrixWorld(true);

    // model.box usa _bbox pre-computado por _boxManager.setup() al cargar el IFC;
    // no depende de qué tiles LOD estén activos en el frame actual.
    const box = model.box;

    if (box.isEmpty()) return null;

    const { min, max } = box;

    if (
      !Number.isFinite(min.x) || !Number.isFinite(max.x) ||
      !Number.isFinite(min.y) || !Number.isFinite(max.y) ||
      !Number.isFinite(min.z) || !Number.isFinite(max.z)
    ) {
      return null;
    }

    return {
      xMax: max.x,
      xMin: min.x,
      yMax: max.y,
      yMin: min.y,
      zMax: max.z,
      zMin: min.z,
    };
  }

  // Estima qué % del área del padrón cubre la huella horizontal del modelo (X×Z × multiplicador²), en las mismas unidades IFC que el polígono.
  estimateCurrentCoveragePercent (): number | null {
    const bbox = this.getWorldBbox();

    if (!bbox) return null;

    const s = this._modelTransform.scale;
    const parcelMercator = this.getParcelAreaMercator();

    if (!parcelMercator) return null;

    const parcelIfcUnits = parcelMercator / (s * s);
    // Huella en plano XZ (Y = altura en espacio del fragmento).
    const w = bbox.xMax - bbox.xMin;
    const d = bbox.zMax - bbox.zMin;
    const footprint = w * d * this.modelScaleMultiplier * this.modelScaleMultiplier;
    const pct = (footprint / parcelIfcUnits) * 100;

    return Number.isFinite(pct) && pct > 0 ? pct : null;
  }

  // Escala uniforme extra del IFC sobre el mapa (acotada entre mínimo y máximo); pide repintado.
  setModelScaleMultiplier (multiplier: number) {
    this.modelScaleMultiplier = clamp(multiplier, MIN_SCALE_MULTIPLIER, MAX_SCALE_MULTIPLIER);
    this.map?.triggerRepaint();
  }

  // Traslada el ancla del modelo (deltaScreenRight, deltaScreenUp) metros en espacio de pantalla.
  // Compensa el bearing del mapa para que ↑ siempre mueva hacia arriba en pantalla sin importar la rotación.
  moveModel (deltaScreenRight: number, deltaScreenUp: number) {
    const s = this._modelTransform.scale;
    const bearing = (this.map?.getBearing() ?? 0) * (Math.PI / 180);
    const cosB = Math.cos(bearing);
    const sinB = Math.sin(bearing);

    // Pantalla (derecha, arriba) → geográfico (Este, Norte)
    const deltaE = deltaScreenRight * cosB + deltaScreenUp * sinB;
    const deltaN = -deltaScreenRight * sinB + deltaScreenUp * cosB;

    this._modelTransform.translateX += deltaE * s;
    this._modelTransform.translateY -= deltaN * s; // en Mercator Y positivo es hacia el sur
    this.map?.triggerRepaint();
  }

  // Rota el modelo alpha radianes en sentido antihorario (visto desde arriba).
  // En espacio fragment Y es arriba; el rumbo usa rotateY (pasa por rotateX al vertical del mapa).
  rotateModel (alpha: number) {
    this._modelTransform.rotateY += alpha;
    this.map?.triggerRepaint();
  }

  // Fija el rumbo inicial (rotateY radianes) para la visualización al cargar el archivo.
  // NO modifica _initialTransform: Reset restaura heading=0° + posición fijada por
  // setResetBboxCenterAt(), independientemente del ángulo en IfcMapConversion.
  setInitialHeading (heading: number) {
    if (!this._modelTransform) return;
    this._modelTransform.rotateY = heading;
    this.map?.triggerRepaint();
  }

  // Ajusta SOLO el baseline de Reset: con heading=0°, el centro del bbox queda en parcelLngLat.
  // No modifica la vista actual (_modelTransform). Llamar tras setInitialHeading y setFile.
  setResetBboxCenterAt (parcelLngLat: [number, number]) {
    const bbox = this.getWorldBbox();
    if (!bbox || !this._initialTransform) return;

    const cx = (bbox.xMin + bbox.xMax) / 2;
    const cz = (bbox.zMin + bbox.zMax) / 2;
    // Escala efectiva (incluye modelScaleMultiplier para coincidir con el renderizado).
    const s = this._modelTransform.scale * this.modelScaleMultiplier;

    const pcMc = MercatorCoordinate.fromLngLat({ lat: parcelLngLat[1], lng: parcelLngLat[0] }, 0);

    // Con h=0: mercX_bbox = tx + s*cx, mercY_bbox = ty + s*cz → despejamos tx, ty.
    this._initialTransform.translateX = pcMc.x - s * cx;
    this._initialTransform.translateY = pcMc.y - s * cz;
  }

  // Repositiona el ancla del modelo a lngLat sin mover la vista del mapa.
  // Llamar tras resolver setFile para restaurar una posición guardada de IfcMapConversion sin
  // cambiar el centro del mapa (lo que desplazaría el contorno del padrón en perspectiva).
  setInitialPosition (lngLat: [number, number]) {
    if (!this._modelTransform) return;

    const mc = MercatorCoordinate.fromLngLat({ lat: lngLat[1], lng: lngLat[0] }, 0);

    const patch = {
      scale: mc.meterInMercatorCoordinateUnits(),
      translateX: mc.x,
      translateY: mc.y,
      translateZ: mc.z,
    };

    Object.assign(this._modelTransform, patch);

    if (this._initialTransform) Object.assign(this._initialTransform, patch);
    this.map?.triggerRepaint();
  }

  // Restaura la transformación del modelo al estado en que se cargó el IFC por primera vez.
  resetTransform () {
    if (!this._initialTransform) return;
    Object.assign(this._modelTransform, this._initialTransform);
    this.map?.triggerRepaint();
  }

  // Devuelve coordenadas geográficas y rotación del ancla actual, o null si aún no se inicializó.
  getGeorefState (): { lngLat: [number, number]; rotateZ: number } | null {
    if (!this._modelTransform) return null;

    const mc = new MercatorCoordinate(
      this._modelTransform.translateX,
      this._modelTransform.translateY,
      this._modelTransform.translateZ,
    );
    const { lat, lng } = mc.toLngLat();

    return { lngLat: [lng, lat], rotateZ: this._modelTransform.rotateY };
  }

  /**
   * Calcula de una sola vez el factor de escala extra para que la superficie del edificio en planta (huella)
   * sea aproximadamente targetPercent % del área del polígono del padrón. La huella se mide como
   * (máx X − mín X) × (máx Z − mín Z) en el espacio del modelo (suelo XZ, no mezclar altura Y).
   * Devuelve el factor aplicado o null si no hay modelo/padrón listos.
   */
  autoScaleToTargetCoveragePercent (targetPercent: number): number | null {
    if (!Number.isFinite(targetPercent) || targetPercent <= 0) return null;

    const parcelMercator = this.getParcelAreaMercator();
    if (!parcelMercator) return null;

    // Medir con escala “neutra” para que el tamaño en planta sea el del archivo, antes de aplicar el nuevo factor.
    this.modelScaleMultiplier = 1;

    const bbox = this.getWorldBbox();
    if (!bbox) return null;

    const s = this._modelTransform.scale;
    const parcelIfcUnits = parcelMercator / (s * s);

    const w = bbox.xMax - bbox.xMin;
    const d = bbox.zMax - bbox.zMin;
    const baseFootprint = w * d;

    if (!Number.isFinite(baseFootprint) || baseFootprint <= 0) return null;

    // Área objetivo en suelo = parcelIfcUnits × targetPercent/100. Eso debe ser baseFootprint × m² → despejar m.
    const multiplier = Math.sqrt((parcelIfcUnits * targetPercent) / (100 * baseFootprint));

    if (!Number.isFinite(multiplier) || multiplier <= 0) return null;

    const clamped = clamp(multiplier, MIN_SCALE_MULTIPLIER, MAX_SCALE_MULTIPLIER);
    this.setModelScaleMultiplier(clamped);

    return clamped;
  }

  // A partir de lng/lat del centro: Mercator de anclaje, escala metros↔unidades Mercator y traslación del layer custom.
  private initialModelTransform (center: number[]) {
    this._modelAsMercatorCoordinate = MercatorCoordinate.fromLngLat(
      { lat: center[1], lng: center[0] },
      0,
    );
    this._modelTransform = {
      rotateX: this._modelRotate[0],
      rotateY: this._modelRotate[1],
      rotateZ: this._modelRotate[2],
      scale: this._modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
      translateX: this._modelAsMercatorCoordinate.x,
      translateY: this._modelAsMercatorCoordinate.y,
      translateZ: this._modelAsMercatorCoordinate.z,
    };
  }

  // Al terminar de cargar el IFC: elige centro (custom, IfcSite RefLat/Long o default), centra el mapa y actualiza la transform del modelo.
  private handleModelLoaded () {
    let center: [number, number] | null = this.customCenter;

    if (!center && this.fragmentModel.models.length) {
      const model = this.fragmentModel.models[0];

      try {
        const props = (model as unknown as { properties?: Record<string, unknown> }).properties;

        if (props) {
          const siteEntry = Object.values(props).find(
            (p: unknown) =>
              (p as { typeName?: string })?.typeName === 'IFCSITE' ||
              (p as { type?: number })?.type === 4097777520,
          ) as
            | {
              RefLatitude?: { value?: number[] } | number[];
              RefLongitude?: { value?: number[] } | number[];
            }
            | undefined;

          if (siteEntry) {
            const rawLat = siteEntry.RefLatitude;
            const rawLng = siteEntry.RefLongitude;

            const refLat: number[] | undefined = Array.isArray(rawLat)
              ? rawLat
              : rawLat && 'value' in rawLat
                ? rawLat.value
                : undefined;

            const refLng: number[] | undefined = Array.isArray(rawLng)
              ? rawLng
              : rawLng && 'value' in rawLng
                ? rawLng.value
                : undefined;

            if (refLat && refLng) {
              const dmsToDec = (arr: number[]) => {
                const [deg, min = 0, sec = 0, mil = 0] = arr;
                const sign = deg < 0 ? -1 : 1;

                return sign * (Math.abs(deg) + min / 60 + sec / 3600 + mil / 3600000);
              };

              center = [dmsToDec(refLng), dmsToDec(refLat)];
            }
          }
        }
      } catch {
        // ignorar
      }
    }

    if (!center) center = defaultInitialState.center;
    if (this.map?.setCenter) this.map.setCenter(center);

    this.initialModelTransform(center);
    this._initialTransform = { ...this._modelTransform };
  }

  // Añade la capa de edificios 3D (fill-extrusion) encima del estilo.
  private addDefaultLayer () {
    this.map?.on('load', () => {
      const layers = (this.map!.getStyle().layers ?? []) as {
        type: string;
        layout?: Record<string, unknown>;
        id: string;
      }[];

      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout?.['text-field'],
      )?.id;

      if (!labelLayerId) return;

      this.map!.addLayer(
        {
          filter: ['==', 'extrude', 'true'],
          id: 'add-3d-buildings',
          minzoom: 15,
          paint: {
            'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
            'fill-extrusion-opacity': 0.6,
          },
          source: 'composite',
          'source-layer': 'building',
          type: 'fill-extrusion',
        },
        labelLayerId,
      );
    });
  }

  // Callback de la capa custom: crea escena Three (luces, renderer), reutiliza el canvas/context
  private onAdd = (map: Map, gl: WebGL2RenderingContext) => {
    // Luz ambiental base para que el IFC en mapa no quede totalmente negro.
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff);
    directionalLight.position.set(0, -70, 100).normalize();

    this.scene.add(directionalLight);

    const directionalLight2 = new DirectionalLight(0xffffff);
    directionalLight2.position.set(0, 70, 100).normalize();
    this.scene.add(directionalLight2);

    const canvas = map.getCanvas() as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '2';

    this.renderer = new WebGLRenderer({
      antialias: true,
      canvas: map.getCanvas(),
      context: gl,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = 'srgb';
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    // Mismo criterio que el visor IFC standalone: sin pass de sombras en el mapa.
    this.renderer.shadowMap.enabled = false;
    this.renderer.autoClearStencil = false;

    this.updateLabelRendererSize();

    window.addEventListener('resize', this.updateLabelRendererSize);

    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.zIndex = '1';
    this.labelRenderer.setSize(
      this.renderer.domElement.clientWidth,
      this.renderer.domElement.clientHeight,
    );
    this.renderer.domElement.parentElement?.appendChild(this.labelRenderer.domElement);
  };

  // Dibuja la escena Three (modelo IFC) con la proyección del mapa; dispara triggerRepaint.
  private render = (_gl: WebGL2RenderingContext, matrix: number[]) => {
    this.fragmentModel.update();

    const m = new Matrix4().fromArray(matrix);

    this.camera.projectionMatrix = m.multiply(this.mapCamera);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.map?.triggerRepaint();
  };

  // Registra la capa custom 3D y el control de navegación.
  private setupMap () {
    const customLayer: import('mapbox-gl').CustomLayerInterface = {
      id: '3d-model',
      onAdd: this.onAdd,
      render: this.render,
      renderingMode: '3d',
      type: 'custom',
    };

    this.map?.on('style.load', () => {
      this.map!.addLayer(customLayer, 'waterway-label');
    });

    this.map?.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
  }

  // Quita listeners, dispose del renderer, fragmentModel y mapa.
  async dispose () {
    window.removeEventListener('resize', this.updateLabelRendererSize);

    this.clearParcelClip();
    this.renderer?.dispose();
    this.labelRenderer.domElement.remove();

    await this.fragmentModel?.dispose();

    this.map?.remove();
    this.map = null;
  }
}
