// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { BpmnEditor, BpmnView } from '../../src/vue'
import { fixture } from '../fixtures'

describe('BpmnEditor', () => {
  it('draws the file and reports changes through v-model', async () => {
    const wrapper = mount(BpmnEditor, { props: { modelValue: fixture('order.bpmn'), locale: 'en' }, attachTo: document.body })
    expect(wrapper.find('[data-element-id="Task_Check"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-palette]')).toHaveLength(11)
    const doc = (wrapper.vm as unknown as { document: { rename(id: string, name: string): void } }).document
    doc.rename('Task_Check', 'Renamed')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as string[][]
    expect(emitted.at(-1)![0]).toContain('name="Renamed"')
    wrapper.unmount()
  })

  it('starts a new diagram without a file', () => {
    const wrapper = mount(BpmnEditor, { props: { modelValue: null } })
    expect(wrapper.find('[data-element-id="StartEvent_1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('reports a file it cannot read and opens a blank one', () => {
    const wrapper = mount(BpmnEditor, { props: { modelValue: '<not-bpmn/>' } })
    expect((wrapper.emitted('error') as Error[][])[0]![0]!.message).toMatch(/not a BPMN 2.0 file/)
    expect(wrapper.find('[data-element-id="StartEvent_1"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('BpmnView', () => {
  it('has no editing tools', () => {
    const wrapper = mount(BpmnView, { props: { xml: fixture('order.bpmn'), highlight: ['Task_Check'] } })
    expect(wrapper.find('[data-palette]').exists()).toBe(false)
    expect(wrapper.find('[data-control="undo"]').exists()).toBe(false)
    expect(wrapper.find('.bpmn-ed-highlight').exists()).toBe(true)
    wrapper.unmount()
  })
})
