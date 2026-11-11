# Design reference

The examples are a full-page drone engineering sheet and the same treatment for
a real Tesla Model 3. This is the blueprint interaction designed by theageofadzz,
not a vehicle configurator or a recreation of Tesla's marketing site.

## Visual evidence

Open these images relative to the skill directory:

| Image | Reference |
| --- | --- |
| `assets/reference/car-blueprint-desktop.jpg` | Full blue sheet, grid hierarchy, light contours and small annotations |
| `assets/reference/car-hover-desktop.jpg` | Square-cell reveal, white body and dark glass, drawing/model alignment |
| `assets/reference/car-3d-desktop.jpg` | Continuous transition to an oblique solid model and receding grid |
| `assets/reference/car-rotated-desktop.jpg` | Rotation about the car's vertical axis with inspectable body details |
| `assets/reference/car-blueprint-mobile.jpg` | Full-height phone sheet with compact annotations |
| `assets/reference/car-3d-mobile.jpg` | A complete car inside a narrow inspection viewport |

## Proportions and timing

- Paper blue: approximately `#0d24ba`; line color: approximately `#e2e8ff`.
  Keep fine grid lines subtle, every fifth line stronger, silhouette contours
  brighter than secondary structure, and construction lines dim.
- In the car example, top-view length is about 67% of viewport height,
  constrained by narrow-screen width. Center it near 50% horizontally and 52%
  vertically. Minor grid size is roughly one-fifteenth of the displayed length.
- Technical text is typically 10-13 px, with sufficient contrast and room around
  the actual subject. Reduce annotation density on phones before shrinking text.
- Initial drawing: roughly 0.3 seconds of delay and 2.8 seconds of drawing.
  Inspection entry: roughly 1.5 seconds. Return: roughly 1.1 seconds.
  These are reference timings, adjustable for a different subject.
- The reference reveal grades exposed grid cells toward warm red. Full
  inspection inherits that red. A blue-only variant changes this grade while
  keeping the same geometry, mask, and reversible motion.

## States

| State | Appearance and behavior |
| --- | --- |
| Loading | Stable blue paper, no layout shift, visible retry on failure |
| Blueprint | Registered orthographic contours and small dimensions |
| Hover | Animated grid cells reveal solid material and hide matching lines |
| Entering | Reveal expands while the model moves continuously into inspection |
| Inspecting | An unframed solid object; dragging changes its real orientation |
| Returning | Orientation, projection, reveal, and paper tilt reverse to top view |

Use rotor spin, lift, and a coherent ground shadow for aircraft. Keep stationary
objects centered; remove bobbing, rotor effects, and lift inherited from an
aircraft example.

## Contextual controls

Use Liquid Glass only for requested controls: neutral translucent fill, backdrop
blur, a fine highlight, subtle shadow, legible icons, and hover tooltips.
Check contrast against both blue and warm red. Keep controls hidden before
selection unless the user explicitly asks for a persistent action such as
fullscreen.

Leave the surrounding sheet quiet. Do not fill it with instructional prose,
oversized headings, cards, permanent navigation, or decorative objects.
