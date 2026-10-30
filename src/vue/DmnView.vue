<script setup lang="ts">
/** A read-only DMN file: the diagram, and a decision's logic on double-click. */
import { ref } from 'vue'
import type { DmnLabels } from './dmnLabels'
import DmnEditor from './DmnEditor.vue'

defineProps<{ xml?: string | null; decision?: string; highlight?: string[]; locale?: string; labels?: Partial<DmnLabels> }>()
const emit = defineEmits<{ elementClick: [id: string]; open: [decision: string | null]; error: [error: Error] }>()
const editor = ref<InstanceType<typeof DmnEditor> | null>(null)
defineExpose({ fit: () => editor.value?.fit() })
</script>

<template>
  <DmnEditor
    ref="editor"
    :model-value="xml ?? null"
    readonly
    :decision="decision"
    :highlight="highlight ?? []"
    :locale="locale"
    :labels="labels"
    @element-click="(id: string) => emit('elementClick', id)"
    @open="(d: string | null) => emit('open', d)"
    @error="(e: Error) => emit('error', e)"
  />
</template>
