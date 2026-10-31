---
'@dskripchenko/bpmn': patch
---

DMN auto layout (files without DMNDI): a requirement that has to go around something now runs through the gaps between layers — up out of the source, along the gap to a lane clear of every element in between, into the target from below — instead of leaving the source sideways along its row, where it could run under a neighbouring input. It leaves and enters on the lane's side, so it no longer shares a segment with the requirements that go straight up.
