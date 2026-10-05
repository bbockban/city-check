# IFC Map Positioning Controls + Georeferenced Download

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Add directional/rotation movement controls to the Mapbox map viewer, and make the "Descargar georeferenciado" button embed the current map position as `IfcMapConversion` + `IfcProjectedCRS` into the IFC file.

---

## Problem

The IFC is placed on the map automatically (from IfcSite coordinates or parcel centroid), but users have no way to fine-tune its position. The download button calls a backend georeference endpoint that doesn't reflect any manual adjustment, and doesn't embed standard IFC georeferencing entities (`IfcMapConversion`/`IfcProjectedCRS`).

---

## Goals

1. Let users nudge the IFC model left/right/forward/back (in meters) and rotate it within the parcel.
2. The "Descargar georeferenciado" button produces an IFC with `IfcMapConversion` + `IfcProjectedCRS` (EPSG:32721) reflecting the exact current map position.
3. No backend changes required.

---

## Approach: Fully Frontend

`web-ifc` (already in the project) supports writing IFC entities and saving a modified buffer. The UTM zone 21S projection formula is implemented directly (no new npm dependency). Movement state is shared via a React context.

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/lib/utm-zone21s.ts` | New — WGS84 → UTM EPSG:32721 forward projection (~40 lines) |
| `src/lib/embed-map-conversion.ts` | New — writes `IfcMapConversion`+`IfcProjectedCRS` into IFC buffer |
| `src/components/map-box/map-box.ts` | Add `moveModel()`, `rotateModel()`, `resetTransform()`, `getGeorefState()` |
| `src/components/map-box/index.ts` | Expose new MapBox methods through BimModel |
| `src/components/validator/viewers/map-transform-context.tsx` | New — React context for current lngLat + rotateZ |
| `src/components/validator/viewers/map-viewer.tsx` | Add floating movement control panel; write to context |
| `src/routes/validator.tsx` | Modified download handler: use frontend embed when georef params available |

---

## MapBox Movement API (`map-box.ts`)

Four new public methods added to the `MapBox` class.

### State

`_initialTransform` (private, `typeof _modelTransform | null`) is set at the end of `handleModelLoaded()` after `initialModelTransform()` resolves. It stores the transform as it existed when the IFC first loaded (for reset).

### Methods

**`moveModel(deltaE: number, deltaN: number): void`**

Shifts the anchor in Mercator space. `deltaE` is meters east (positive) or west (negative). `deltaN` is meters north (positive) or south (negative).

```
s = _modelTransform.scale  // Mercator units per meter (from meterInMercatorCoordinateUnits())
translateX += deltaE * s
translateY -= deltaN * s   // Mercator Y is south-positive, so north = subtract
triggerRepaint()
```

**`rotateModel(alpha: number): void`**

Adds `alpha` radians to `_modelTransform.rotateZ`. Positive = counter-clockwise when viewed from above (IFC X-axis rotates toward north from east). Calls `triggerRepaint()`.

**`resetTransform(): void`**

Restores `_modelTransform` to `_initialTransform` if available. Calls `triggerRepaint()`.

**`getGeorefState(): { lngLat: [number, number]; rotateZ: number } | null`**

Reconstructs geographic coordinates from the current Mercator translate using `MercatorCoordinate.toLngLat()`. Returns `null` if `_modelTransform` is not initialized.

---

## BimModel Proxy (`index.ts`)

Adds four pass-through methods following the existing pattern of `setModelScaleMultiplier`:

- `moveModel(deltaE, deltaN)` → `this.mapBox?.moveModel(deltaE, deltaN)`
- `rotateModel(alpha)` → `this.mapBox?.rotateModel(alpha)`
- `resetTransform()` → `this.mapBox?.resetTransform()`
- `getGeorefState()` → `this.mapBox?.getGeorefState() ?? null`

---

## UTM Projection (`utm-zone21s.ts`)

Exports one function:

```ts
export function wgs84ToUtm21s(lng: number, lat: number): [easting: number, northing: number]
```

Uses the standard Transverse Mercator forward projection with WGS84 ellipsoid parameters and zone 21S constants:
- Central meridian λ₀ = −57°
- Scale factor k₀ = 0.9996
- False easting E₀ = 500,000 m
- False northing N₀ = 10,000,000 m (southern hemisphere)

This is closed-form math (no iteration), accurate to sub-centimeter for points in zone 21.

---

## Embed Map Conversion (`embed-map-conversion.ts`)

```ts
export async function embedMapConversion(
  file: File,
  lngLat: [number, number],
  rotateZ: number,
): Promise<Blob>
```

Sequence:
1. `new IfcAPI()`, `SetWasmPath('/web-ifc/')`, `Init()`
2. `OpenModel(uint8Array)` — fresh instance, independent of ThatOpen loader
3. Delete any existing `IFCMAPCONVERSION` and `IFCPROJECTEDCRS` line IDs (to avoid duplicates)
4. Write `IfcProjectedCRS { Name: 'EPSG:32721' }` via `CreateIfcEntity` + `WriteLine`
5. Get `IfcProject` express ID (for `SourceCRS` reference)
6. Compute `[easting, northing] = wgs84ToUtm21s(lng, lat)`
7. Write `IfcMapConversion { SourceCRS: projectRef, TargetCRS: crsRef, Eastings: easting, Northings: northing, OrthogonalHeight: 0, XAxisAbscissa: cos(rotateZ), XAxisOrdinate: sin(rotateZ), Scale: 1.0 }`
8. `SaveModel()` → `Uint8Array`
9. `CloseModel()` + `Dispose()`
10. Return `new Blob([buffer], { type: 'application/octet-stream' })`

**Correctness:**
- `Eastings/Northings` in meters (UTM, EPSG:32721) — matches `IfcLengthMeasure` in meter units
- `XAxisAbscissa = cos(rotateZ)`, `XAxisOrdinate = sin(rotateZ)` — IFC X-axis direction in easting/northing space
- `Scale = 1.0` because IFC is in meters and UTM is in meters
- `SourceCRS` references `IfcProject` (standard IFC4.3 pattern for `IfcMapConversion`)

---

## MapTransformContext (`map-transform-context.tsx`)

```ts
type MapTransformState = { lngLat: [number, number]; rotateZ: number } | null;

// Context value
type MapTransformContextValue = {
  georefParams: MapTransformState;
  setGeorefParams: (params: MapTransformState) => void;
};
```

Provider wraps the top of `ValidationPage` in `validator.tsx`, outside `IfcParcelProvider` and `ZoningValidationProvider`, so both `ValidatorChrome` (reads params for download) and `MapViewer` (writes params on move) can access it. The context resets to `null` whenever `bimSessionKey` changes (new file/parcel).

`MapViewer` calls `setGeorefParams()`:
- After `handleModelLoaded` fires (via the existing `onLoadFinish` callback chain), once `getGeorefState()` returns non-null
- After each user movement control interaction

---

## Movement Control UI (in `MapViewer`)

A floating panel, absolutely positioned bottom-left (Mapbox nav controls are bottom-right — no conflict). Only rendered when `file` is loaded.

### Layout

```
┌──────────────────────────────────────┐
│        ↑                             │
│   ← W  [↺] [↻]  E →                 │
│        ↓                             │
│  trans: [0.5m ▾]   rot: [5° ▾]      │
│                         [Reset]      │
└──────────────────────────────────────┘
```

- `↑ ↓ ← →` — translate N/S/W/E by `translationStep` meters
- `↺ ↻` — rotate CCW/CW by `rotationStep` radians
- Translation step dropdown: 0.1m, 0.5m, 1m, 5m (default 0.5m)
- Rotation step dropdown: 1°, 5°, 15°, 45° (default 5°)
- Reset button: calls `bimModelRef.current.resetTransform()`, then updates context to the initial state

Each button click:
1. Calls `bimModelRef.current.moveModel(...)` or `rotateModel(...)`
2. Calls `setGeorefParams(bimModelRef.current.getGeorefState())`

Controls use the existing `Button` component with `variant="ghost"` and `size="sm"`. The panel uses the existing design system colors (`bg-primary/90`, `text-light-blue`, `border-medium-blue`).

---

## Download Handler (`validator.tsx`)

```ts
const handleDownload = async () => {
  if (!ifcSession) return;

  if (georefParams) {
    setDownloading(true);
    try {
      const blob = await embedMapConversion(
        ifcSession.file,
        georefParams.lngLat,
        georefParams.rotateZ,
      );
      // trigger <a> download
      triggerBlobDownload(blob, ifcSession.file.name.replace('.ifc', '_georef.ifc'));
    } finally {
      setDownloading(false);
    }
  } else {
    // Fallback: existing backend call (no map loaded yet)
    georeference(ifcSession, { onSuccess: (blob) => triggerBlobDownload(blob, ...) });
  }
};
```

`setDownloading` is local state replacing the existing `downloading` from `useGeoreferenceIfc`. A `triggerBlobDownload` helper extracts the existing anchor-click logic.

The button label stays "Descargar georeferenciado" in both cases; a spinner shows while loading.

---

## Correctness / Edge Cases

| Case | Behavior |
|------|----------|
| User moves model before parcel loads | Context accumulates moves; download uses them |
| Model reset after movement | Context updated to initial state |
| No file loaded | Controls hidden; download button disabled |
| Existing `IfcMapConversion` in file | Deleted before writing new one (no duplicates) |
| `IfcProject` not found in file | `embedMapConversion` throws; caller shows error toast |
| lat/lng at poles or outside UTM 21 | `wgs84ToUtm21s` produces inaccurate output but still a number; acceptable for Montevideo context |

---

## Out of Scope

- Backend changes
- Non-UTM CRS options
- Elevation / OrthogonalHeight from DEM
- Drag-to-move (click+drag on model)
- Snap-to-parcel-edge
