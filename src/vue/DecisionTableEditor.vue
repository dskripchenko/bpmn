<script setup lang="ts">
/**
 * A decision's logic, edited in place: a decision table (hit policy,
 * columns, rules, cells) or a literal expression. Cells are written to the
 * file when they lose focus, so typing is one step of history.
 */
import { computed, ref } from 'vue'
import { UidButton, UidFormField, UidInput, UidSelect, UidTextarea } from '@dskripchenko/ui'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-vue-next'
import { hitPolicyCode, type DecisionTable, type DmnDocument, type HitPolicy } from '../index'
import type { DmnLabels } from './dmnLabels'

const props = defineProps<{ document: DmnDocument; version: number; decision: string; labels: DmnLabels; readonly?: boolean }>()
const emit = defineEmits<{ error: [error: Error] }>()

const L = computed(() => props.labels)
const d = computed(() => (props.version, props.document.decision(props.decision)))
const table = computed<DecisionTable | undefined>(() => (d.value?.logic?.kind === 'table' ? d.value.logic : undefined))

function run(fn: () => void): void {
  try {
    fn()
  } catch (e) {
    emit('error', e as Error)
  }
}

const HIT: HitPolicy[] = ['UNIQUE', 'FIRST', 'PRIORITY', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER']
const hitOptions = HIT.map((value) => ({ value, label: `${hitPolicyCode({ hitPolicy: value })} — ${value}` }))
const aggregationOptions = computed(() => [{ value: '', label: L.value.none }, ...['SUM', 'MIN', 'MAX', 'COUNT'].map((value) => ({ value, label: value }))])
const logicOptions = computed(() => (['table', 'literal', 'none'] as const).map((value) => ({ value, label: L.value.logics[value] ?? value })))
const logicKind = computed(() => (d.value?.logic?.kind === 'table' ? 'table' : d.value?.logic?.kind === 'literal' ? 'literal' : d.value?.logic ? 'other' : 'none'))
const TYPES = ['string', 'number', 'boolean', 'date', 'time', 'dateTime', 'dayTimeDuration', 'yearMonthDuration', 'integer', 'long', 'double']
const typeOptions = computed(() => [{ value: '', label: L.value.none }, ...TYPES.map((value) => ({ value, label: value }))])

/** A cell's text, committed on blur when it changed. */
function commitCell(rule: number, kind: 'input' | 'output' | 'annotation', index: number, event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value
  const t = table.value
  if (!t) return
  const r = t.rules[rule]
  const current = kind === 'input' ? r?.inputs[index] : kind === 'output' ? r?.outputs[index] : t.annotations.length > 0 ? r?.annotations[index] : r?.description
  if ((current ?? '') === value) return
  run(() => props.document.setCell(props.decision, rule, { kind, index }, value))
}

const annotationColumns = computed(() => {
  const t = table.value
  if (!t) return []
  return t.annotations.length > 0 ? t.annotations : [L.value.annotation]
})
const annotationOf = (rule: number, index: number) => {
  const t = table.value!
  const r = t.rules[rule]!
  return t.annotations.length > 0 ? (r.annotations[index] ?? '') : (r.description ?? '')
}

// The column being edited in the header form.
const column = ref<{ kind: 'input' | 'output'; index: number } | null>(null)
const draft = ref({ label: '', expression: '', name: '', typeRef: '' })
function editColumn(kind: 'input' | 'output', index: number): void {
  if (props.readonly) return
  const t = table.value!
  if (kind === 'input') {
    const i = t.inputs[index]!
    draft.value = { label: i.label ?? '', expression: i.expression, name: '', typeRef: i.typeRef ?? '' }
  } else {
    const o = t.outputs[index]!
    draft.value = { label: o.label ?? '', expression: '', name: o.name ?? '', typeRef: o.typeRef ?? '' }
  }
  column.value = { kind, index }
}
function saveColumn(): void {
  const c = column.value
  if (!c) return
  const v = draft.value
  if (c.kind === 'input') run(() => props.document.updateInput(props.decision, c.index, { label: v.label, expression: v.expression, typeRef: v.typeRef }))
  else run(() => props.document.updateOutput(props.decision, c.index, { label: v.label, name: v.name, typeRef: v.typeRef }))
  column.value = null
}

const literalText = computed(() => (d.value?.logic?.kind === 'literal' ? d.value.logic.text : ''))
function commitLiteral(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value
  if (value !== literalText.value) run(() => props.document.setLiteral(props.decision, value))
}
</script>

<template>
  <div
    v-if="d"
    class="dmn-ed-logic"
    :data-decision="decision"
  >
    <div class="dmn-ed-logic__head">
      <h3 class="dmn-ed-logic__name">
        {{ d.name ?? d.id }}
      </h3>
      <UidFormField
        v-if="!readonly && logicKind !== 'other'"
        :label="L.logic"
      >
        <UidSelect
          :options="logicOptions"
          :model-value="logicKind"
          data-dmn="logic"
          @update:model-value="(v) => run(() => document.setLogic(decision, v as 'table' | 'literal' | 'none'))"
        />
      </UidFormField>
      <UidFormField
        v-if="table"
        :label="L.hitPolicy"
      >
        <UidSelect
          :options="hitOptions"
          :model-value="table.hitPolicy"
          :disabled="readonly"
          data-dmn="hit-policy"
          @update:model-value="(v) => run(() => document.setHitPolicy(decision, v as HitPolicy, table!.aggregation))"
        />
      </UidFormField>
      <UidFormField
        v-if="table?.hitPolicy === 'COLLECT'"
        :label="L.aggregation"
      >
        <UidSelect
          :options="aggregationOptions"
          :model-value="table.aggregation ?? ''"
          :disabled="readonly"
          data-dmn="aggregation"
          @update:model-value="(v) => run(() => document.setHitPolicy(decision, 'COLLECT', (v || undefined) as DecisionTable['aggregation']))"
        />
      </UidFormField>
    </div>

    <!-- Decision table -->
    <div
      v-if="table"
      class="dmn-ed-table-wrap"
    >
      <table class="dmn-ed-table">
        <thead>
          <tr>
            <th class="dmn-ed-hit">
              {{ hitPolicyCode(table) }}
            </th>
            <th
              v-for="(i, n) in table.inputs"
              :key="`i${n}`"
              class="dmn-ed-col dmn-ed-col--input"
              :data-column="`input-${n}`"
              @click="editColumn('input', n)"
            >
              <div class="dmn-ed-col__label">
                {{ i.label || i.expression || L.input }}
              </div>
              <div
                v-if="i.label && i.expression"
                class="dmn-ed-col__sub"
              >
                {{ i.expression }}
              </div>
              <div class="dmn-ed-col__type">
                {{ i.typeRef }}
              </div>
            </th>
            <th
              v-for="(o, n) in table.outputs"
              :key="`o${n}`"
              class="dmn-ed-col dmn-ed-col--output"
              :class="{ 'dmn-ed-first-output': n === 0 }"
              :data-column="`output-${n}`"
              @click="editColumn('output', n)"
            >
              <div class="dmn-ed-col__label">
                {{ o.label || o.name || L.output }}
              </div>
              <div
                v-if="o.label && o.name"
                class="dmn-ed-col__sub"
              >
                {{ o.name }}
              </div>
              <div class="dmn-ed-col__type">
                {{ o.typeRef }}
              </div>
            </th>
            <th
              v-for="(a, n) in annotationColumns"
              :key="`a${n}`"
              class="dmn-ed-col dmn-ed-col--annotation"
              :class="{ 'dmn-ed-first-annotation': n === 0 }"
            >
              {{ a }}
            </th>
            <th
              v-if="!readonly"
              class="dmn-ed-actions"
            />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(rule, r) in table.rules"
            :key="rule.id ?? r"
            :data-rule="r"
          >
            <td class="dmn-ed-index">
              {{ r + 1 }}
            </td>
            <td
              v-for="(_, n) in table.inputs"
              :key="`i${n}`"
              class="dmn-ed-cell"
            >
              <textarea
                :value="rule.inputs[n] ?? ''"
                :readonly="readonly"
                rows="1"
                placeholder="-"
                spellcheck="false"
                :data-cell="`${r}-input-${n}`"
                @blur="commitCell(r, 'input', n, $event)"
              />
            </td>
            <td
              v-for="(_, n) in table.outputs"
              :key="`o${n}`"
              class="dmn-ed-cell"
              :class="{ 'dmn-ed-first-output': n === 0 }"
            >
              <textarea
                :value="rule.outputs[n] ?? ''"
                :readonly="readonly"
                rows="1"
                spellcheck="false"
                :data-cell="`${r}-output-${n}`"
                @blur="commitCell(r, 'output', n, $event)"
              />
            </td>
            <td
              v-for="(_, n) in annotationColumns"
              :key="`a${n}`"
              class="dmn-ed-cell dmn-ed-cell--note"
              :class="{ 'dmn-ed-first-annotation': n === 0 }"
            >
              <textarea
                :value="annotationOf(r, n)"
                :readonly="readonly"
                rows="1"
                :data-cell="`${r}-annotation-${n}`"
                @blur="commitCell(r, 'annotation', n, $event)"
              />
            </td>
            <td
              v-if="!readonly"
              class="dmn-ed-actions"
            >
              <UidButton
                size="sm"
                variant="ghost"
                :icon="ArrowUp"
                :aria-label="L.moveUp"
                :disabled="r === 0"
                @click="run(() => document.moveRule(decision, r, r - 1))"
              />
              <UidButton
                size="sm"
                variant="ghost"
                :icon="ArrowDown"
                :aria-label="L.moveDown"
                :disabled="r === table.rules.length - 1"
                @click="run(() => document.moveRule(decision, r, r + 1))"
              />
              <UidButton
                size="sm"
                variant="ghost"
                :icon="Trash2"
                :aria-label="L.deleteRule"
                data-dmn="delete-rule"
                @click="run(() => document.removeRule(decision, r))"
              />
            </td>
          </tr>
          <tr v-if="table.rules.length === 0">
            <td
              class="dmn-ed-empty"
              :colspan="2 + table.inputs.length + table.outputs.length + annotationColumns.length"
            >
              {{ L.emptyTable }}
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!readonly"
        class="dmn-ed-table-tools"
      >
        <UidButton
          size="sm"
          variant="secondary"
          :icon="Plus"
          data-dmn="add-rule"
          @click="run(() => document.addRule(decision))"
        >
          {{ L.addRule }}
        </UidButton>
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Plus"
          data-dmn="add-input"
          @click="run(() => document.addInput(decision))"
        >
          {{ L.addInput }}
        </UidButton>
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Plus"
          data-dmn="add-output"
          @click="run(() => document.addOutput(decision))"
        >
          {{ L.addOutput }}
        </UidButton>
      </div>

      <!-- Column form -->
      <div
        v-if="column"
        class="dmn-ed-column-form"
        :data-dmn-column-form="`${column.kind}-${column.index}`"
      >
        <div class="dmn-ed-column-form__head">
          <strong>{{ column.kind === 'input' ? L.input : L.output }} {{ column.index + 1 }}</strong>
          <UidButton
            size="sm"
            variant="ghost"
            :icon="X"
            :aria-label="L.back"
            @click="column = null"
          />
        </div>
        <UidInput
          :label="L.label"
          :model-value="draft.label"
          data-dmn="column-label"
          @update:model-value="(v: string) => (draft.label = v)"
        />
        <UidInput
          v-if="column.kind === 'input'"
          :label="L.expression"
          :model-value="draft.expression"
          data-dmn="column-expression"
          @update:model-value="(v: string) => (draft.expression = v)"
        />
        <UidInput
          v-else
          :label="L.name"
          :model-value="draft.name"
          data-dmn="column-name"
          @update:model-value="(v: string) => (draft.name = v)"
        />
        <UidFormField :label="L.type">
          <UidSelect
            :options="typeOptions"
            :model-value="draft.typeRef"
            @update:model-value="(v) => (draft.typeRef = String(v ?? ''))"
          />
        </UidFormField>
        <div class="dmn-ed-column-form__actions">
          <UidButton
            size="sm"
            variant="danger"
            :icon="Trash2"
            :disabled="(column.kind === 'input' ? table.inputs.length : table.outputs.length) <= 1"
            data-dmn="delete-column"
            @click="(run(() => document.removeColumn(decision, column!.kind, column!.index)), (column = null))"
          >
            {{ L.deleteColumn }}
          </UidButton>
          <UidButton
            size="sm"
            variant="primary"
            data-dmn="save-column"
            @click="saveColumn"
          >
            OK
          </UidButton>
        </div>
      </div>
    </div>

    <!-- Literal expression -->
    <div
      v-else-if="d.logic?.kind === 'literal'"
      class="dmn-ed-literal"
    >
      <UidTextarea
        :label="L.literal"
        :rows="4"
        auto-grow
        :max-rows="16"
        :model-value="literalText"
        :readonly="readonly"
        data-dmn="literal"
        @blur="commitLiteral"
      />
      <UidFormField :label="L.resultType">
        <UidSelect
          :options="typeOptions"
          :model-value="d.variable?.typeRef ?? d.logic.typeRef ?? ''"
          :disabled="readonly"
          @update:model-value="(v) => run(() => document.setResultType(decision, String(v ?? '') || undefined))"
        />
      </UidFormField>
    </div>

    <p
      v-else-if="logicKind === 'other'"
      class="dmn-ed-hint"
    >
      {{ L.otherLogic }}
    </p>
  </div>
</template>
