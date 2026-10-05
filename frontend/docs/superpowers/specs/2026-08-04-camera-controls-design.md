# Diseño: unificar controles de cámara (orbitar / pan)

## Contexto

Feedback de una ronda de testing con arquitectos: en el visor 3D standalone, orbitar y desplazarse (pan) están en los botones "al revés" de lo esperado. El usuario prefiere click izquierdo = pan, click derecho = orbitar.

## Investigación

- **Visor IFC standalone** (`src/lib/ifc-viewer.ts`, vía `src/lib/thatopen-ifc-runtime.ts`): usa `OrthoPerspectiveCamera` de `@thatopen/components`, que envuelve la librería `camera-controls`. Nadie configura `mouseButtons`, así que aplican los defaults de la librería: **left = ROTATE (orbitar), right = TRUCK (pan)** — lo opuesto a lo pedido.
- **Mapa** (`src/components/map-box/`): usa Mapbox GL JS con sus defaults (**left = dragPan, right = dragRotate**), que ya coinciden con lo pedido. Confirmado con el usuario que el mapa no necesita cambios.
- El mapa también instancia un runtime `camera-controls` interno (para renderizar el IFC dentro de la capa Three.js), pero vía `createThatOpenIFCLoader` → `createHiddenRenderContainer()` (`pointerEvents: none`, 1×1px, fuera del DOM visible). Ese control nunca recibe eventos de mouse reales — es inerte. Confirma que tocar el runtime compartido no afecta al mapa.
- La app nunca cambia de modo de navegación (`Orbit`/`Plan`/`FirstPerson`) — siempre usa el modo `Orbit` default, que no toca `mouseButtons`. (Nota para el futuro: el modo `Plan` de `@thatopen/components` sí sobreescribe `mouseButtons.left`; si algún día se usa ese modo, habrá que reaplicar esta config al volver a `Orbit`.)
- `camera-controls` ya es dependencia directa (`package.json`), así que importar su `ACTION`/`CameraControls` es directo y tipado.

## Diseño

Cambio de un solo archivo: `src/lib/ifc-viewer.ts`, dentro de `setupIFCViewer`, inmediatamente después de crear el runtime (`createThatOpenIFCRuntime`):

```ts
import CameraControls from 'camera-controls';
// ...
if (world.camera.controls) {
  world.camera.controls.mouseButtons.left = CameraControls.ACTION.TRUCK;   // pan
  world.camera.controls.mouseButtons.right = CameraControls.ACTION.ROTATE; // orbitar
}
```

Se intercambian únicamente los botones izquierdo/derecho. Las acciones en sí (`TRUCK` para pan, `ROTATE` para orbitar) son las mismas que ya existían, solo cambia qué botón dispara cada una. Scroll (zoom) y click del medio (dolly) no se tocan — no fueron parte del feedback.

`thatopen-ifc-runtime.ts` (el runtime compartido con el mapa) no se modifica, para no mezclar una configuración de interacción específica del visor standalone con un módulo que se describe a sí mismo como "mínimo compartido".

## Fuera de alcance

- Comportamiento del mapa (ya correcto, confirmado con el usuario).
- Zoom con scroll, dolly con click del medio, gestos touch/trackpad — no reportados como problema.
- Cualquier mecanismo defensivo para modos de navegación (`Plan`/`FirstPerson`) que la app no usa hoy.

## Testing

No hay suite de tests en el proyecto (ver CLAUDE.md). Verificación manual: levantar `npm run dev`, abrir `/validator`, cargar un IFC, confirmar que click izquierdo arrastra (pan) y click derecho orbita en el visor standalone; confirmar que el mapa sigue comportándose igual que antes.
