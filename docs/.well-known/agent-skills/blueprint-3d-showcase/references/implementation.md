# Rendering and interaction

Implement these invariants in the destination project's existing 3D stack.
Use Three.js and its supported loaders and controls for a new web project.
The package provides visual targets and implementation guidance, not a
dependency on a particular minified reference renderer.

## One coordinate system

Normalize the source model once: apply its scene graph transforms, determine
world bounds and ground plane, center the subject, and retain one scale factor.
Put its inspection rotation on a group whose axis matches the object's world
up direction.

Use the same transformed geometry and orthographic top camera to derive visible
contours. A top-view height buffer or depth test removes hidden surfaces before
edge extraction. Keep silhouette, glazing, mirrors, wheel boundaries, rotor
hubs, and structural features; discard interior triangles and coplanar edges.
Do not treat every triangle edge as engineering linework.

For a conventional Y-up object, paper X maps to world X and paper Y maps to
negative world Z. The top camera looks down world Y. A car rotates around
world Y during inspection. Rotating only a screen-facing group around Z makes
it spin like a flat drawing and fails the intended interaction.

## Shared reveal mask

Render a grid-cell mask in paper coordinates. Pointer input activates cells
only inside the projected subject footprint. Give each cell activation, trail,
and decay values, with a smooth easing at the transition boundary.

Use the mask's alpha for the solid render and its inverse for blueprint
strokes. Both passes use the same mask coordinates, viewport origin, scale,
device pixel ratio, and camera. Applying a mask only to the solid model leaves
blueprint lines visible through it and breaks the reveal.

Keep the model, blueprint, and mask registered during resizing. Hover should
not change camera or model scale. Check that glass, mirrors, the nose, and
rotor centers emerge exactly where the corresponding contours were drawn.

## Reversible inspection

Maintain an explicit state and one normalized transition progress:

`loading -> blueprint <-> hover -> entering -> inspecting -> returning`

Interpolate the top camera or pose into a three-quarter inspection, expanding
the mask while the paper recedes. Reverse from the current progress if the
user returns during entry; avoid resetting to a disconnected pose.

Enable drag rotation only during inspection. Distinguish a drag from a click
with a movement threshold, so releasing a drag does not also close the model.
OrbitControls can provide the pointer and touch mechanics; restrict pan,
distance, and axes to keep the product centered and fully visible.

Keep paper tilt, background grading, model pose, and shadow on the same
transition clock. A drone additionally spins its named rotor nodes and lifts
from the paper. A car has no lift or rotor state.

## Responsive input and lifecycle

- Size the canvas from its real container, not a fixed page size. Recompute
  projection and render targets with ResizeObserver, including fullscreen.
- Preserve the loaded scene and current orientation when moving between inline
  and fullscreen sizes. Reframe using projected bounds with room for rotation.
- Mouse: hover reveal, click inspect, drag rotate, click or Escape return.
  Touch: tap inspect, drag rotate, tap return. Keep article scrolling available
  before selection when the scene is embedded in a page.
- Add Enter/Space entry and Escape return to a focusable artwork surface.
  Keep a visible keyboard focus state.
- With reduced motion, shorten or remove nonessential drawing, spin, and camera
  motion while retaining a clear reveal and accessible inspection.
- Show loading failure and retry. Dispose renderers, controls, observers, and
  animation frames when the component is removed.

## Browser evidence

Verify at desktop and phone sizes, including rotation near the frame edges.
Capture blueprint, reveal, inspection, and rotated screenshots. Confirm
non-background pixels, a real solid material render, and changed orientation
after dragging. Check missing assets, WebGL errors, annotation bounds, empty
paper clicks, repeated entry/return, and keyboard operation.
