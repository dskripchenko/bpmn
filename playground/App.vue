<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { BpmnEditor } from '../src/vue'
import order from '../tests/fixtures/order.bpmn?raw'

const params = new URLSearchParams(location.search)
const xml = ref<string | null>(params.get('empty') ? null : order)
const errors = ref<string[]>([])
const selection = ref<string[]>([])
// For the browser check.
watchEffect(() => {
  ;(window as unknown as { __bpmn: unknown }).__bpmn = { xml: xml.value, errors: errors.value, selection: selection.value }
})
</script>

<template>
  <BpmnEditor
    v-model="xml"
    :properties="params.has('props')"
    style="height: 100%"
    @select="(ids) => (selection = ids)"
    @error="(e) => errors.push(e.message)"
  />
</template>
