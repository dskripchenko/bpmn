<script setup lang="ts">
/** A read-only diagram: pan, zoom, highlighted elements and clicks. */
import { ref } from 'vue'
import type { BpmnLabels } from './labels'
import BpmnEditor from './BpmnEditor.vue'

defineProps<{ xml?: string | null; diagram?: string | number; highlight?: string[]; locale?: string; labels?: Partial<BpmnLabels> }>()
const emit = defineEmits<{ elementClick: [id: string]; error: [error: Error] }>()
const editor = ref<InstanceType<typeof BpmnEditor> | null>(null)
defineExpose({ fit: () => editor.value?.fit() })
</script>

<template>
  <BpmnEditor
    ref="editor"
    :model-value="xml ?? null"
    readonly
    :diagram="diagram"
    :highlight="highlight ?? []"
    :locale="locale"
    :labels="labels"
    @element-click="(id: string) => emit('elementClick', id)"
    @error="(e: Error) => emit('error', e)"
  />
</template>
