<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { BpmnEditor, DmnEditor } from '../src/vue'
import order from '../tests/fixtures/order.bpmn?raw'
import loan from '../tests/fixtures/loan.dmn?raw'

const params = new URLSearchParams(location.search)
const dmn = params.has('dmn')
const xml = ref<string | null>(params.get('empty') ? null : dmn ? loan : order)
const errors = ref<string[]>([])
const selection = ref<string[]>([])
// For the browser check.
watchEffect(() => {
  ;(window as unknown as { __bpmn: unknown }).__bpmn = { xml: xml.value, errors: errors.value, selection: selection.value }
})
</script>

<template>
  <DmnEditor
    v-if="dmn"
    v-model="xml"
    style="height: 100%"
    @select="(ids) => (selection = ids)"
    @error="(e) => errors.push(e.message)"
  />
  <BpmnEditor
    v-else
    v-model="xml"
    :properties="params.has('props')"
    style="height: 100%"
    @select="(ids) => (selection = ids)"
    @error="(e) => errors.push(e.message)"
  />
</template>
