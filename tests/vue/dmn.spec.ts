// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DmnEditor, DmnView } from '../../src/vue'
import { fixture } from '../fixtures'

describe('DmnEditor', () => {
  it('draws the diagram and opens a decision table', async () => {
    const wrapper = mount(DmnEditor, { props: { modelValue: fixture('loan.dmn'), locale: 'en' }, attachTo: document.body })
    expect(wrapper.find('[data-element-id="Decision_Risk"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-palette]')).toHaveLength(5)
    await wrapper.setProps({ decision: 'Decision_Risk' })
    expect(wrapper.find('[data-decision="Decision_Risk"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-rule]')).toHaveLength(3)
    await wrapper.find('[data-dmn="add-rule"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('[data-rule]')).toHaveLength(4)
    const emitted = wrapper.emitted('update:modelValue') as string[][]
    expect((emitted.at(-1)![0]!.match(/<rule id=/g) ?? []).length).toBe(5)
    wrapper.unmount()
  })

  it('starts a new file with one decision', () => {
    const wrapper = mount(DmnEditor, { props: { modelValue: null } })
    expect(wrapper.find('[data-element-id="Decision_1"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('DmnView', () => {
  it('shows a decision read-only', () => {
    const wrapper = mount(DmnView, { props: { xml: fixture('loan.dmn'), decision: 'Decision_Risk' } })
    expect(wrapper.find('[data-dmn="add-rule"]').exists()).toBe(false)
    expect(wrapper.find('textarea[readonly]').exists()).toBe(true)
    wrapper.unmount()
  })
})
