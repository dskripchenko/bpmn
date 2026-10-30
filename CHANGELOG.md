# @dskripchenko/bpmn

## 0.2.0

### Minor Changes

- a29edee: Editing: `BpmnDocument`, a framework-free core with undoable operations (create, move, resize, connect, remove, rename, change type, event definitions, loops, conditions, default flows, documentation, ids, colours, lanes and pools) that edits the XML in place so vendor extensions survive; and `@dskripchenko/bpmn/vue` with `BpmnEditor` (palette, context pad, label editing, properties panel, pan and zoom, download) and the read-only `BpmnView`. Hit-testing and viewport helpers are exported for interfaces of your own; `render` gains a `nested` option.

## 0.1.0

### Minor Changes

- 7b62b05: First release: BPMN 2.0 files to SVG as laid out by the modeler that saved them — every event, task, sub-process, gateway, data, artifact, pool, lane and flow of the notation; a safe lossless XML reader and writer; theming with CSS custom properties and the colours modelers store.
