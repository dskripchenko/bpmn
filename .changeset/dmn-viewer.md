---
'@dskripchenko/bpmn': minor
---

DMN: `parseDmn` reads DMN 1.1 to 1.5 (DMNDI, and bpmn.io's `biodi` layout in 1.1); `renderDmn` draws decision requirements diagrams to SVG — decisions, input data, business knowledge models, knowledge sources, decision services, annotations, every requirement kind — computing a layout for files without one; `renderDecision` renders decision tables (hit policies, typed inputs and outputs, rules, annotation columns) and literal expressions as escaped HTML with their own scoped stylesheet.
