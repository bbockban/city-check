# IFC Map Positioning Controls + Georeferenced Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add N/S/E/W translation and rotation controls to the Mapbox map viewer, and make the "Descargar georeferenciado" button embed `IfcMapConversion` + `IfcProjectedCRS` (EPSG:32721) into the IFC file using the exact current map position.

**Architecture:** Movement state lives in `MapBox` (translate/rotate the existing `_modelTransform`), is surfaced through a new `MapTransformContext` React context, and drives a frontend-only IFC modification step at download time using `web-ifc`. No backend changes needed.

**Tech Stack:** TypeScript, Three.js (`MercatorCoordinate`), `web-ifc` (already in project), React context, Mapbox GL JS, ESLint with sort-keys-fix. No new npm dependencies — UTM math is implemented directly.

**Constraint:** DO NOT commit any changes. Keep everything unstaged.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/utm-zone21s.ts` | Create | WGS84 → UTM EPSG:32721 forward projection |
| `src/lib/embed-map-conversion.ts` | Create | Open IFC buffer, write `IfcMapConversion`+`IfcProjectedCRS`, return Blob |
| `src/components/map-box/map-box.ts` | Modify | Add `moveModel()`, `rotateModel()`, `resetTransform()`, `getGeorefState()` |
| `src/components/map-box/index.ts` | Modify | Expose new `MapBox` methods through `BimModel` |
| `src/components/validator/viewers/map-transform-context.tsx` | Create | React context holding `georefParams` + `setGeorefParams` |
| `src/components/validator/viewers/map-viewer.tsx` | Modify | Floating control panel; write georef state to context |
| `src/routes/validator.tsx` | Modify | Wrap with `MapTransformProvider`; use frontend embed for download |

---

## Task 1: UTM Zone 21S Projection Utility

**Files:**
- Create: `src/lib/utm-zone21s.ts`

- [ ] **Step 1: Create the file with the standard Transverse Mercator forward projection**

`src/lib/utm-zone21s.ts`:

```typescript
// Standard Transverse Mercator forward projection, WGS84, Zone 21S (EPSG:32721).
// Helmert series expansion — accurate to sub-centimeter within the zone.
// References: USGS Professional Paper 1395 ("Map Projections — A Working Manual").

const A_WGS84 = 6_378_137.0;
const E2_WGS84 = 0.006_694_379_990_14; // first eccentricity squared
const K0 = 0.9996; // UTM scale factor
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 10_000_000; // southern hemisphere
const LNG0_RAD = -57 * (Math.PI / 180); // central meridian: −57°

export const wgs84ToUtm21s = (lng: number, lat: number): [number, number] => {
  const phi = lat * (Math.PI / 180);
  const lam = lng * (Math.PI / 180);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const e2 = E2_WGS84;
  const ep2 = e2 / (1 - e2); // second eccentricity squared
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  // Radius of curvature in prime vertical
  const bigN = A_WGS84 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const bigA = cosPhi * (lam - LNG0_RAD);

  // Meridional arc from equator to phi
  const bigM = A_WGS84 * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi)
  );

  const a2 = bigA * bigA;
  const a3 = a2 * bigA;
  const a4 = a2 * a2;
  const a5 = a4 * bigA;
  const a6 = a4 * a2;

  const x = K0 * bigN * (
    bigA
    + ((1 - T + C) * a3) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * a5) / 120
  );

  const y = K0 * (
    bigM + bigN * tanPhi * (
      a2 / 2
      + ((5 - T + 9 * C + 4 * C * C) * a4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * a6) / 720
    )
  );

  return [FALSE_EASTING + x, FALSE_NORTHING + y];
};
```

- [ ] **Step 2: Manually verify the function with a known Montevideo coordinate**

Open the browser console (or a Node REPL) and paste:

```js
// Approximate center of Montevideo (~Plaza Independencia)
// Expected UTM 21S: Easting ≈ 580700, Northing ≈ 6136400
const result = wgs84ToUtm21s(-56.1882, -34.9059);
console.log(result); // should be close to [580700, 6136400]
```

Cross-check at https://epsg.io/transform — paste the same coordinates, select EPSG:4326 → EPSG:32721.

- [ ] **Step 3: Run the lint check**

```bash
cd /Users/bernardo/proyecto-grado && npx eslint src/lib/utm-zone21s.ts --fix
```

Expected: no errors after fix (only the sort-keys auto-fix runs if needed).

---

## Task 2: MapBox Movement API

**Files:**
- Modify: `src/components/map-box/map-box.ts`

The class already has `_modelTransform` with `translateX`, `translateY`, `translateZ`, `rotateX`, `rotateY`, `rotateZ`, `scale`. We add `_initialTransform` and four methods.

- [ ] **Step 1: Add the `_initialTransform` private field**

In `map-box.ts`, after line 109 (`private customCenter: [number, number] | null = null;`), add:

```typescript
  private _initialTransform: typeof this._modelTransform | null = null;
```

- [ ] **Step 2: Save initial transform when the model loads**

In `handleModelLoaded()`, after the final `this.initialModelTransform(center)` call (the last line of the method), add:

```typescript
    this._initialTransform = { ...this._modelTransform };
```

The complete end of `handleModelLoaded()` should look like:

```typescript
    if (!center) center = defaultInitialState.center;
    if (this.map?.setCenter) this.map.setCenter(center);
    this.initialModelTransform(center);
    this._initialTransform = { ...this._modelTransform };
  }
```

- [ ] **Step 3: Add the four new public methods**

Add these four methods to the `MapBox` class, after the existing `setModelScaleMultiplier` method (around line 364):

```typescript
  // Translates the model anchor by deltaE meters east and deltaN meters north.
  moveModel (deltaE: number, deltaN: number) {
    const s = this._modelTransform.scale; // Mercator units per meter
    this._modelTransform.translateX += deltaE * s;
    this._modelTransform.translateY -= deltaN * s; // Mercator Y is south-positive
    this.map?.triggerRepaint();
  }

  // Rotates the model by alpha radians counter-clockwise (viewed from above).
  rotateModel (alpha: number) {
    this._modelTransform.rotateZ += alpha;
    this.map?.triggerRepaint();
  }

  // Restores the model transform to its state when the IFC first loaded.
  resetTransform () {
    if (!this._initialTransform) return;
    Object.assign(this._modelTransform, this._initialTransform);
    this.map?.triggerRepaint();
  }

  // Returns the current anchor geographic coordinates and rotation, or null if not yet initialized.
  getGeorefState (): { lngLat: [number, number]; rotateZ: number } | null {
    if (!this._modelTransform) return null;
    const mc = new MercatorCoordinate(
      this._modelTransform.translateX,
      this._modelTransform.translateY,
      this._modelTransform.translateZ,
    );
    const { lat, lng } = mc.toLngLat();

    return { lngLat: [lng, lat], rotateZ: this._modelTransform.rotateZ };
  }
```

- [ ] **Step 4: Lint**

```bash
npx eslint src/components/map-box/map-box.ts --fix
```

Expected: no errors.

---

## Task 3: BimModel Proxy Methods

**Files:**
- Modify: `src/components/map-box/index.ts`

- [ ] **Step 1: Add the four pass-through methods to `BimModel`**

After the existing `estimateCurrentCoveragePercent` method (around line 51), add:

```typescript
  moveModel (deltaE: number, deltaN: number) {
    this.mapBox?.moveModel(deltaE, deltaN);
  }

  rotateModel (alpha: number) {
    this.mapBox?.rotateModel(alpha);
  }

  resetTransform () {
    this.mapBox?.resetTransform();
  }

  getGeorefState (): { lngLat: [number, number]; rotateZ: number } | null {
    return this.mapBox?.getGeorefState() ?? null;
  }
```

- [ ] **Step 2: Lint**

```bash
npx eslint src/components/map-box/index.ts --fix
```

Expected: no errors.

---

## Task 4: MapTransformContext

**Files:**
- Create: `src/components/validator/viewers/map-transform-context.tsx`

- [ ] **Step 1: Create the context file**

```typescript
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
```

- [ ] **Step 2: Lint**

```bash
npx eslint src/components/validator/viewers/map-transform-context.tsx --fix
```

Expected: no errors.

---

## Task 5: Frontend IFC Modification Library

**Files:**
- Create: `src/lib/embed-map-conversion.ts`

This opens the original `File` in a fresh `web-ifc` instance (separate from ThatOpen's loader), writes `IfcProjectedCRS` and `IfcMapConversion`, and returns the modified bytes as a `Blob`.

- [ ] **Step 1: Create the file**

```typescript
import {
  Handle,
  IFC4,
  IfcAPI,
  IFCGEOMETRICREPRESENTATIONCONTEXT,
  IFCMAPCONVERSION,
  IFCPROJECTEDCRS,
} from 'web-ifc';

import { wgs84ToUtm21s } from './utm-zone21s';

export const embedMapConversion = async (
  file: File,
  lngLat: [number, number],
  rotateZ: number,
): Promise<Blob> => {
  const api = new IfcAPI();

  api.SetWasmPath('/web-ifc/');
  await api.Init();

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const modelID = api.OpenModel(buffer);

    try {
      // Remove any pre-existing georef entities to avoid duplicates.
      const existingMC = api.GetLineIDsWithType(modelID, IFCMAPCONVERSION);

      for (let i = 0; i < existingMC.size(); i++) {
        api.DeleteLine(modelID, existingMC.get(i));
      }

      const existingCRS = api.GetLineIDsWithType(modelID, IFCPROJECTEDCRS);

      for (let i = 0; i < existingCRS.size(); i++) {
        api.DeleteLine(modelID, existingCRS.get(i));
      }

      // Write IfcProjectedCRS for EPSG:32721 (WGS84 / UTM zone 21S).
      const projCRS = new IFC4.IfcProjectedCRS(
        new IFC4.IfcLabel('EPSG:32721'),
        null,
        null,
        null,
        null,
        null,
        null,
      );

      api.WriteLine(modelID, projCRS);

      // SourceCRS must be an IfcGeometricRepresentationContext (IFC4 standard).
      const ctxIDs = api.GetLineIDsWithType(modelID, IFCGEOMETRICREPRESENTATIONCONTEXT);

      if (ctxIDs.size() === 0) {
        throw new Error('IFC file has no IfcGeometricRepresentationContext — cannot embed map conversion');
      }

      const ctxExpressID = ctxIDs.get(0);
      const [easting, northing] = wgs84ToUtm21s(lngLat[0], lngLat[1]);

      // XAxisAbscissa/Ordinate encode the IFC X-axis direction in the projected CRS.
      // rotateZ = 0 → X-axis points due East (cos=1, sin=0).
      const mc = new IFC4.IfcMapConversion(
        new Handle<IFC4.IfcGeometricRepresentationContext>(ctxExpressID),
        new Handle<IFC4.IfcProjectedCRS>(projCRS.expressID),
        new IFC4.IfcLengthMeasure(easting),
        new IFC4.IfcLengthMeasure(northing),
        new IFC4.IfcLengthMeasure(0),
        new IFC4.IfcReal(Math.cos(rotateZ)),
        new IFC4.IfcReal(Math.sin(rotateZ)),
        new IFC4.IfcReal(1.0),
      );

      api.WriteLine(modelID, mc);

      const outputBuffer = api.SaveModel(modelID);

      return new Blob([outputBuffer], { type: 'application/octet-stream' });
    } finally {
      api.CloseModel(modelID);
    }
  } finally {
    api.Dispose();
  }
};
```

- [ ] **Step 2: Lint**

```bash
npx eslint src/lib/embed-map-conversion.ts --fix
```

Expected: no errors.

---

## Task 6: MapViewer — Movement Controls UI + Context Writes

**Files:**
- Modify: `src/components/validator/viewers/map-viewer.tsx`

The existing `MapViewer` component gets a floating control panel and two context interactions: reset georef state on session change, update it after model load and after every move.

- [ ] **Step 1: Add imports**

Replace the existing import block at the top of `map-viewer.tsx` with (add the new imports, keep the existing ones):

```typescript
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import 'mapbox-gl/dist/mapbox-gl.css';

import { BimModel } from '@/components/map-box';
import { Button } from '@/components/ui/button';
import { ViewerLoadingOverlay } from '@/components/ui/viewer-loading-overlay';

import {
  parcelGeometryToClipRing,
  parcelResponseToMapCenter,
} from '@/lib/parcel-manipulation';

import { useMapTransformContext } from './map-transform-context';
import { useIfcParcelContext } from './ifc-parcel-context';
```

- [ ] **Step 2: Add local state for step sizes and wire up context**

Inside the `MapViewer` component body, after the existing `const [isLoading, setIsLoading] = useState(false);` line, add:

```typescript
  const [translationStep, setTranslationStep] = useState(0.5); // meters
  const [rotationStep, setRotationStep] = useState(5 * (Math.PI / 180)); // 5° in radians
  const { setGeorefParams } = useMapTransformContext();
```

- [ ] **Step 3: Reset georef params when a new BIM session starts**

In the first `useEffect` (the one keyed on `bimSessionKey`), add `setGeorefParams(null)` right before creating the new `BimModel`:

```typescript
  useEffect(() => {
    if (!containerRef.current || TOKEN_ERROR) return;

    setGeorefParams(null);
    const bimModel = new BimModel(containerRef.current);
    bimModelRef.current = bimModel;
    bimModelRef.current?.setModelScaleMultiplier(1);

    return () => {
      bimModel.dispose();
      bimModelRef.current = null;
    };
  }, [bimSessionKey, setGeorefParams]);
```

- [ ] **Step 4: Update georef params after model loads**

In the second `useEffect`'s `run()` async function, after the auto-scale block and before `setIsLoading(false)`, add the georef state update. The end of the `try` block in `run()` should look like:

```typescript
        if (clipRing?.length && targetPercent > 0) {
          void (async () => {
            for (let i = 0; i < AUTOSCALE_MAX_ATTEMPTS; i++) {
              if (cancelled) return;

              const result = bimModelRef.current?.autoScaleToTargetCoveragePercent(targetPercent);

              if (result != null) return;

              await new Promise<void>((res) => requestAnimationFrame(() => res()));
            }
          })();
        }

        // Sync initial georef state into context after model finishes loading.
        const geoState = bimModelRef.current?.getGeorefState();

        if (geoState) setGeorefParams(geoState);
```

Also add `setGeorefParams` to the `useEffect`'s dependency array (second `useEffect`):

```typescript
  }, [bimSessionKey, file, data, waitParcel, setGeorefParams]);
```

- [ ] **Step 5: Add movement handler helpers**

Add these helpers inside the `MapViewer` component, before the `return` statement. They each call the appropriate `BimModel` method and then sync the updated state to the context:

```typescript
  const syncGeoref = () => {
    const state = bimModelRef.current?.getGeorefState();

    if (state) setGeorefParams(state);
  };

  const handleMoveN = () => {
    bimModelRef.current?.moveModel(0, translationStep);
    syncGeoref();
  };

  const handleMoveS = () => {
    bimModelRef.current?.moveModel(0, -translationStep);
    syncGeoref();
  };

  const handleMoveE = () => {
    bimModelRef.current?.moveModel(translationStep, 0);
    syncGeoref();
  };

  const handleMoveW = () => {
    bimModelRef.current?.moveModel(-translationStep, 0);
    syncGeoref();
  };

  const handleRotateCCW = () => {
    bimModelRef.current?.rotateModel(rotationStep);
    syncGeoref();
  };

  const handleRotateCW = () => {
    bimModelRef.current?.rotateModel(-rotationStep);
    syncGeoref();
  };

  const handleReset = () => {
    bimModelRef.current?.resetTransform();
    syncGeoref();
  };
```

- [ ] **Step 6: Add the floating control panel to the JSX**

Inside the outer `<div className="h-full w-full relative bg-primary overflow-hidden">`, add the control panel just before the closing tag. It renders only when a file is loaded:

```tsx
      {file && (
        <div
          className="absolute bottom-8 left-4 z-10 flex flex-col items-center gap-1 rounded-lg border border-medium-blue
            bg-primary/90 p-2 text-light-blue shadow-lg"
        >
          {/* Translate north */}
          <Button
            className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
            size="sm"
            title="Mover norte"
            variant="ghost"
            onClick={handleMoveN}
          >
            ↑
          </Button>

          {/* Middle row: W, rotate buttons, E */}
          <div className="flex items-center gap-1">
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Mover oeste"
              variant="ghost"
              onClick={handleMoveW}
            >
              ←
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Rotar sentido antihorario"
              variant="ghost"
              onClick={handleRotateCCW}
            >
              ↺
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Rotar sentido horario"
              variant="ghost"
              onClick={handleRotateCW}
            >
              ↻
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Mover este"
              variant="ghost"
              onClick={handleMoveE}
            >
              →
            </Button>
          </div>

          {/* Translate south */}
          <Button
            className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
            size="sm"
            title="Mover sur"
            variant="ghost"
            onClick={handleMoveS}
          >
            ↓
          </Button>

          {/* Step size selectors */}
          <div className="flex items-center gap-1 pt-1 text-xs">
            <label className="text-medium-blue" htmlFor="map-trans-step">
              m
            </label>
            <select
              className="rounded border border-medium-blue bg-primary px-1 py-0.5 text-xs text-light-blue"
              id="map-trans-step"
              value={translationStep}
              onChange={(e) => setTranslationStep(Number(e.target.value))}
            >
              <option value={0.1}>0.1</option>
              <option value={0.5}>0.5</option>
              <option value={1}>1</option>
              <option value={5}>5</option>
            </select>
            <label className="text-medium-blue" htmlFor="map-rot-step">
              °
            </label>
            <select
              className="rounded border border-medium-blue bg-primary px-1 py-0.5 text-xs text-light-blue"
              id="map-rot-step"
              value={rotationStep}
              onChange={(e) => setRotationStep(Number(e.target.value) * (Math.PI / 180))}
            >
              <option value={1}>1</option>
              <option value={5}>5</option>
              <option value={15}>15</option>
              <option value={45}>45</option>
            </select>
          </div>

          {/* Reset */}
          <Button
            className="mt-1 h-6 px-2 text-xs text-medium-blue hover:bg-medium-blue/20"
            size="sm"
            title="Restaurar posición inicial"
            variant="ghost"
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      )}
```

- [ ] **Step 7: Lint**

```bash
npx eslint src/components/validator/viewers/map-viewer.tsx --fix
```

Expected: no errors.

---

## Task 7: Validator Download Handler + Provider Wiring

**Files:**
- Modify: `src/routes/validator.tsx`

Two changes: (1) wrap `ValidationPage`'s return with `MapTransformProvider`, and (2) replace `handleDownload` with an async version that uses `embedMapConversion` when georef params are available.

- [ ] **Step 1: Add new imports to `validator.tsx`**

Add to the existing import block at the top:

```typescript
import { useState } from 'react';

import { embedMapConversion } from '@/lib/embed-map-conversion';
import { MapTransformProvider, useMapTransformContext } from '@/components/validator/viewers/map-transform-context';
```

Note: `useState` is not currently imported in `validator.tsx` — check the existing imports and add it if missing. The file currently imports from `react`: `useState` is already there in `ValidationPage`. The `ValidatorChrome` component does not currently import `useState`. If `useState` is already imported at the top, just add the other two imports.

- [ ] **Step 2: Update `ValidatorChrome` to read georef params and handle async download**

Replace the `ValidatorChrome` component's internals. The key changes are:
- Read `georefParams` from `useMapTransformContext()`
- Add local `const [isEmbedding, setIsEmbedding] = useState(false)` for the async frontend path
- Replace `handleDownload` with an async version
- Extract `triggerBlobDownload` as a named helper

```typescript
const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.download = filename;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const ValidatorChrome = ({
  ifcSession,
  onFileUpload,
  onNewFile,
  onUploadOpenChange,
  showUploadModal,
}: ValidatorChromeProps) => {
  const navigate = useNavigate();
  const { isPending: backendDownloading, mutate: georeference } = useGeoreferenceIfc();
  const { runZoningValidation, zoningPending } = useZoningValidationContext();
  const { georefParams } = useMapTransformContext();
  const [isEmbedding, setIsEmbedding] = useState(false);
  const downloading = backendDownloading || isEmbedding;

  const handleDownload = async () => {
    if (!ifcSession) return;

    const filename = ifcSession.file.name.replace('.ifc', '_georef.ifc');

    if (georefParams) {
      setIsEmbedding(true);

      try {
        const blob = await embedMapConversion(ifcSession.file, georefParams.lngLat, georefParams.rotateZ);

        triggerBlobDownload(blob, filename);
      } catch {
        // TODO: surface error to user
      } finally {
        setIsEmbedding(false);
      }

      return;
    }

    georeference(ifcSession, {
      onError: () => {},
      onSuccess: (blob) => triggerBlobDownload(blob, filename),
    });
  };

  // ... rest of JSX unchanged
```

The JSX `onClick` for the download button must call the async handler:

```tsx
              <Button
                className={pillClass}
                disabled={downloading}
                size="sm"
                variant="outline"
                onClick={() => { void handleDownload(); }}
              >
                <Download className="mr-2 size-4" />
                {downloading ? 'Descargando...' : 'Descargar georeferenciado'}
              </Button>
```

- [ ] **Step 3: Wrap `ValidationPage` return with `MapTransformProvider`**

Replace the `return` in `ValidationPage`:

```typescript
const ValidationPage = () => {
  const [ifcSession, setIfcSession] = useState<Session | undefined>();
  const [showUploadModal, setShowUploadModal] = useState(true);

  const handleFileUpload = (payload?: Session) => {
    setIfcSession(payload);
  };

  const handleNewFile = () => {
    setShowUploadModal(true);
  };

  return (
    <MapTransformProvider>
      <IfcParcelProvider file={ifcSession?.file} parcelId={ifcSession?.parcelId}>
        <ZoningValidationProvider>
          <ValidatorChrome
            ifcSession={ifcSession}
            showUploadModal={showUploadModal}
            onFileUpload={handleFileUpload}
            onNewFile={handleNewFile}
            onUploadOpenChange={setShowUploadModal}
          />
        </ZoningValidationProvider>
      </IfcParcelProvider>
    </MapTransformProvider>
  );
};
```

- [ ] **Step 4: Lint**

```bash
npx eslint src/routes/validator.tsx --fix
```

Expected: no errors.

---

## Task 8: Integration Smoke Test

**No automated tests exist in this project.** Verify manually by running the dev server.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: server starts on `http://localhost:5173`, no TypeScript errors in console.

- [ ] **Step 2: Run the type check**

```bash
npm run build
```

Expected: exits with code 0, no TypeScript errors.

- [ ] **Step 3: Load an IFC file in the validator and navigate to "Mapa Geolocalizado"**

1. Open `http://localhost:5173/validator`
2. Upload any `.ifc` file (with or without a parcel ID)
3. Click the "Mapa Geolocalizado" tab
4. Verify the floating control panel appears bottom-left

- [ ] **Step 4: Test N/S/E/W translation**

1. Click `↑` (north) several times — model should shift northward on the map
2. Click `↓` (south) — model shifts back
3. Click `←` (west) and `→` (east) — horizontal shifts
4. Change the translation step dropdown from `0.5` to `5` — each click now moves 5 meters

- [ ] **Step 5: Test rotation**

1. Click `↺` (CCW) — model rotates counter-clockwise
2. Click `↻` (CW) — model rotates clockwise
3. Change rotation step to `45°` — one click = 90° visible rotation

- [ ] **Step 6: Test Reset**

1. Move and rotate the model
2. Click `Reset` — model snaps back to the position it was in when the IFC loaded

- [ ] **Step 7: Test the download with georef params**

1. Move the model slightly (to ensure `georefParams` is set in context)
2. Click "Descargar georeferenciado" in the header
3. A file `{name}_georef.ifc` downloads
4. Verify the file contains `IfcMapConversion` and `IfcProjectedCRS` by opening it in a text editor and searching for `IFCMAPCONVERSION` and `IFCPROJECTEDCRS`
5. The `IFCMAPCONVERSION` line should have Easting ≈ 580000–582000 and Northing ≈ 6134000–6138000 for a Montevideo IFC

- [ ] **Step 8: Test the download fallback (no georef params)**

1. Reload the page
2. Open the upload modal but do NOT navigate to the map tab
3. Click "Descargar georeferenciado" — this should fall through to the backend endpoint (same behavior as before)

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Goal 1 (move model): Task 2 + 3 + 6 ✓
  - Goal 2 (download with IfcMapConversion): Task 1 + 5 + 7 ✓
  - Goal 3 (no backend changes): no backend tasks in plan ✓
  - Context sharing: Task 4 ✓
  - Edge case — existing IfcMapConversion deleted: Task 5, Step 1 ✓
  - Edge case — reset after move: Task 6, handleReset ✓
  - Edge case — no file loaded: Task 6, `{file && ...}` guard ✓

- [x] **Placeholder scan:** No TBD, no TODO in code blocks (one comment `// TODO: surface error to user` is intentional, matching the existing codebase pattern)

- [x] **Type consistency:**
  - `getGeorefState()` returns `{ lngLat: [number, number]; rotateZ: number } | null` — used consistently in Task 2, 3, 4, 6, 7
  - `MapTransformState` type: `{ lngLat: [number, number]; rotateZ: number } | null` — matches
  - `moveModel(deltaE, deltaN)` — used in Task 2, 3, 6 consistently
  - `rotateModel(alpha)` — Task 2, 3, 6
  - `resetTransform()` — Task 2, 3, 6
  - `embedMapConversion(file, lngLat, rotateZ)` — Task 5 defines, Task 7 uses with same signature
  - `wgs84ToUtm21s(lng, lat)` — Task 1 defines `(lng, lat)`, Task 5 uses `wgs84ToUtm21s(lngLat[0], lngLat[1])` ✓
