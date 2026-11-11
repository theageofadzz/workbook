---
name: blueprint-3d-showcase
description: "Build immersive engineering-blueprint websites with progressive line drawing, grid-cell hover reveals of aligned 3D models, and click-to-inspect transitions. Use for drone, car, camera, or other product showcases in the blueprint style by theageofadzz; not for dashboards or video renders."
metadata:
  author: theageofadzz
  version: "1.0"
---

# Blueprint 3D Showcase

Create the blueprint interaction developed by theageofadzz for a drone and a
Tesla Model 3. Change the subject while preserving the engineering sheet,
registered reveal, and continuous transition into an inspectable solid model.
Explicit user directions override these defaults.

## Read the visual references

Read [references/design.md](references/design.md) and inspect the images in
`assets/reference/` before deciding the framing, line hierarchy, or controls.
Read [references/implementation.md](references/implementation.md) when building
or adapting the rendering. Both references are local to this skill.

## Experience contract

- Fill the viewport with cobalt-blue engineering paper, approximately `#0d24ba`.
  Use subtle minor squares and a stronger grid every five cells. Keep the object
  centered with restrained dimension lines and compact technical annotations.
- Start with an orthographic top-view drawing. Draw the silhouette first, then
  secondary contours, dimensions, and annotations. The unselected scene has no
  toolbar, sidebar, model catalog, specification cards, or marketing layout.
- Hovering the object's footprint reveals the actual solid model through
  animated square cells aligned to the paper grid. Hide the corresponding
  blueprint strokes with the inverse of the same reveal mask. Let cells trail
  and decay as the pointer moves away.
- Drawing and solid model must share normalization, orientation, projection,
  center, and scale. Verify alignment at rotor hubs, glazing, mirrors, the hood,
  or equivalent landmarks.
- Clicking the object expands the reveal and continuously transitions to a
  three-quarter 3D inspection. Drag rotates the object around its meaningful
  world-space axis. Click again or Escape reverses the transition.
- Use motion appropriate to the subject. A drone spins its rotors and lifts;
  a car stays centered and rotates about its vertical axis. Do not give every
  subject a drone's flight behavior.
- Match the examples' blue-to-warm-red transition during inspection unless the
  user requests blue throughout. Change the color grade without changing the
  registered geometry or the layout.
- Add controls only when requested or needed for inspection. Use sparse
  Liquid Glass icon buttons with translucent fill, blur, fine highlights,
  readable contrast, and tooltips. Do not turn the page into a workbench.

## Build in the user's project

Inspect the existing repository and reuse its framework, components, and 3D
stack. For a new web scene, use Three.js with its standard GLTFLoader and
OrbitControls or the project's equivalent supported controls. Use a real,
appropriately sourced GLB/glTF supplied by the user or selected for the subject.
Keep its attribution with the delivered work.

Establish the model's world-space bounds, ground plane, forward direction, and
top projection before generating the drawing. Derive visible contours from
the same transformed geometry, or register a supplied engineering drawing to
that model. Cull hidden interior edges; a raw triangle wireframe is not a clean
blueprint.

Implement loading, blueprint, hover, entering, inspecting, and returning as
reversible states. Retain model state across resizing or fullscreen changes.
Support touch tap/drag/tap, Enter/Space entry, Escape return, reduced motion,
and a visible retry state when loading fails. Clicking empty paper must leave
the object unselected.

The archive contains instructions and visual references. It requires no files
on the author's computer and does not depend on the original experiment's
bundled renderer. Build the interaction in the destination project. See
[references/provenance.md](references/provenance.md) for the examples and their
model sources.

## Verify the experience

Run the project's build and relevant checks, then inspect actual browser renders
at desktop and phone sizes. Confirm a nonblank scene, a fully framed subject,
readable annotations, and no page overflow.

Exercise progressive drawing, hover reveal, click entry, drag rotation, return,
keyboard entry, and empty-paper hit testing. Capture blueprint, hover,
inspection, and rotated states. Compare actual pixels and orientation after
dragging; canvas dimensions alone do not prove that the model rendered.

Leave a usable preview and report the checks actually performed.
