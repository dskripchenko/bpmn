<script setup lang="ts">
/**
 * The properties of the selected element: id, name, type, event, loop,
 * condition, documentation. Text is written to the file when the field
 * loses focus (or on Enter), so typing is one step of history, not one per
 * key.
 */
import { computed, ref, watch } from 'vue'
import { UidButton, UidFormField, UidInput, UidSelect, UidSwitch, UidTextarea } from '@dskripchenko/ui'
import { Trash2 } from 'lucide-vue-next'
import {
  EVENT_DEFINITIONS,
  EVENT_TYPES,
  GATEWAY_TYPES,
  TASK_TYPES,
  isActivity,
  isEvent,
  isGateway,
  NS,
  type BpmnDocument,
  type EventDefinitionKind,
  type LoopType,
} from '../index'
import type { BpmnLabels } from './labels'

const props = defineProps<{ document: BpmnDocument; version: number; selection: string[]; labels: BpmnLabels }>()
const emit = defineEmits<{ error: [error: Error] }>()

const L = computed(() => props.labels)
const element = computed(() => (props.version, props.selection.length === 1 ? props.document.element(props.selection[0]!) : undefined))
const type = computed(() => element.value?.type ?? '')

function childText(local: string): string {
  const e = element.value
  const c = e?.xml.children.find((x) => x.kind === 'element' && x.ns === NS.bpmn && x.local === local)
  if (!c || c.kind !== 'element') return ''
  return c.children.map((x) => (x.kind === 'text' || x.kind === 'cdata' ? x.value : '')).join('')
}

const attrOf = (name: string) => element.value?.xml.attributes.find((a) => a.name === name)?.value

// Drafts of the text fields, reset whenever the element or the file changes.
const draft = ref({ id: '', name: '', documentation: '', condition: '' })
watch(
  element,
  (e) => {
    draft.value = { id: e?.id ?? '', name: e?.name ?? '', documentation: childText('documentation'), condition: childText('conditionExpression') }
  },
  { immediate: true },
)

function run(fn: () => void): void {
  try {
    fn()
  } catch (e) {
    emit('error', e as Error)
    const el = element.value
    draft.value = { id: el?.id ?? '', name: el?.name ?? '', documentation: childText('documentation'), condition: childText('conditionExpression') }
  }
}

function commit(field: 'id' | 'name' | 'documentation' | 'condition'): void {
  const e = element.value
  if (!e) return
  const value = draft.value[field]
  if (field === 'id' && value !== e.id) run(() => props.document.setId(e.id, value))
  if (field === 'name' && value !== (e.name ?? '')) run(() => props.document.rename(e.id, value))
  if (field === 'documentation' && value !== childText('documentation')) run(() => props.document.setDocumentation(e.id, value))
  if (field === 'condition' && value !== childText('conditionExpression')) run(() => props.document.setCondition(e.id, value))
}

const typeOptions = computed(() => {
  const t = type.value
  const list = isEvent(t) && t !== 'boundaryEvent' ? EVENT_TYPES.filter((x) => x !== 'boundaryEvent') : isGateway(t) ? [...GATEWAY_TYPES] : isActivity(t) ? [...TASK_TYPES, 'callActivity', 'subProcess', 'transaction', 'adHocSubProcess'] : []
  return list.map((value) => ({ value, label: L.value.types[value] ?? value }))
})

const definitionOptions = computed(() => [{ value: '', label: L.value.plain }, ...EVENT_DEFINITIONS.map((value) => ({ value, label: L.value.definitions[value] ?? value }))])
const definition = computed(() => element.value?.eventDefinitions[0] ?? '')
const loopOptions = computed(() => (['none', 'standard', 'parallel', 'sequential'] as const).map((value) => ({ value, label: L.value.loops[value] ?? value })))
const loop = computed(() => element.value?.loop ?? 'none')

const isDefault = computed(() => {
  const e = element.value
  if (e?.type !== 'sequenceFlow') return false
  const source = props.document.element(e.xml.attributes.find((a) => a.name === 'sourceRef')?.value ?? '')
  return source?.xml.attributes.some((a) => a.name === 'default' && a.value === e.id) ?? false
})
const canBeDefault = computed(() => {
  const e = element.value
  if (e?.type !== 'sequenceFlow') return false
  const source = props.document.element(e.xml.attributes.find((a) => a.name === 'sourceRef')?.value ?? '')
  return !!source && (isActivity(source.type) || (isGateway(source.type) && source.type !== 'parallelGateway' && source.type !== 'eventBasedGateway'))
})

const interruptingAttr = computed(() => (type.value === 'boundaryEvent' ? 'cancelActivity' : type.value === 'startEvent' ? 'isInterrupting' : undefined))
const inEventSubProcess = computed(() => {
  const parent = element.value?.parent ? props.document.element(element.value.parent) : undefined
  return parent?.xml.attributes.some((a) => a.name === 'triggeredByEvent' && a.value === 'true') ?? false
})

const plane = computed(() => (props.version, props.document.diagram.plane ? props.document.element(props.document.diagram.plane) : undefined))
const hasName = computed(() => !['dataInputAssociation', 'dataOutputAssociation', 'association'].includes(type.value))
</script>

<template>
  <aside
    class="bpmn-props"
    :aria-label="L.properties"
  >
    <template v-if="selection.length > 1">
      <p class="bpmn-props__hint">
        {{ L.selectedCount(selection.length) }}
      </p>
      <UidButton
        size="sm"
        variant="danger"
        :icon="Trash2"
        @click="run(() => document.remove(selection))"
      >
        {{ L.delete }}
      </UidButton>
    </template>

    <template v-else-if="element">
      <div class="bpmn-props__head">
        <span class="bpmn-props__kind">{{ L.types[type] ?? type }}</span>
      </div>
      <UidInput
        :label="L.id"
        :model-value="draft.id"
        data-prop="id"
        @update:model-value="(v: string) => (draft.id = v)"
        @blur="commit('id')"
        @keydown.enter="commit('id')"
      />
      <UidTextarea
        v-if="hasName"
        :label="L.name"
        :rows="2"
        auto-grow
        :max-rows="5"
        :model-value="draft.name"
        data-prop="name"
        @update:model-value="(v: string) => (draft.name = v)"
        @blur="commit('name')"
      />
      <UidFormField
        v-if="typeOptions.length > 1"
        :label="L.type"
      >
        <UidSelect
          :options="typeOptions"
          :model-value="type"
          data-prop="type"
          @update:model-value="(v) => run(() => document.setType(element!.id, String(v)))"
        />
      </UidFormField>
      <UidFormField
        v-if="type.endsWith('Event')"
        :label="L.eventDefinition"
      >
        <UidSelect
          :options="definitionOptions"
          :model-value="definition"
          data-prop="definition"
          @update:model-value="(v) => run(() => document.setEventDefinition(element!.id, (v || undefined) as EventDefinitionKind | undefined))"
        />
      </UidFormField>
      <UidSwitch
        v-if="interruptingAttr && (type === 'boundaryEvent' || inEventSubProcess)"
        :label="L.interrupting"
        :model-value="attrOf(interruptingAttr) !== 'false'"
        data-prop="interrupting"
        @update:model-value="(v: boolean) => run(() => document.setAttribute(element!.id, interruptingAttr!, v ? undefined : 'false'))"
      />
      <UidFormField
        v-if="isActivity(type)"
        :label="L.loop"
      >
        <UidSelect
          :options="loopOptions"
          :model-value="loop"
          data-prop="loop"
          @update:model-value="(v) => run(() => document.setLoop(element!.id, v as LoopType))"
        />
      </UidFormField>
      <template v-if="type === 'sequenceFlow'">
        <UidInput
          :label="L.condition"
          :model-value="draft.condition"
          data-prop="condition"
          @update:model-value="(v: string) => (draft.condition = v)"
          @blur="commit('condition')"
          @keydown.enter="commit('condition')"
        />
        <UidSwitch
          v-if="canBeDefault"
          :label="L.defaultFlow"
          :model-value="isDefault"
          data-prop="default"
          @update:model-value="(v: boolean) => run(() => document.setDefaultFlow(element!.id, v))"
        />
      </template>
      <UidTextarea
        :label="L.documentation"
        :rows="3"
        auto-grow
        :max-rows="10"
        :model-value="draft.documentation"
        data-prop="documentation"
        @update:model-value="(v: string) => (draft.documentation = v)"
        @blur="commit('documentation')"
      />
    </template>

    <template v-else>
      <template v-if="plane?.type === 'process'">
        <div class="bpmn-props__head">
          <span class="bpmn-props__kind">{{ L.process }}</span>
        </div>
        <UidSwitch
          :label="L.executable"
          :model-value="plane.xml.attributes.some((a) => a.name === 'isExecutable' && a.value === 'true')"
          data-prop="executable"
          @update:model-value="(v: boolean) => run(() => document.setAttribute(plane!.id, 'isExecutable', v ? 'true' : 'false'))"
        />
      </template>
      <p class="bpmn-props__hint">
        {{ L.nothingSelected }}
      </p>
    </template>
  </aside>
</template>
