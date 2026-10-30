// Drives the editor in a real browser as a person would — palette, context
// pad, typing a name, dragging, connecting, deleting, undo, the properties
// panel — and checks the file after each step. Screenshots land in
// tests/browser/output.
//
//   node scripts/editor-check.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })

const server = await createServer({ configFile: join(root, 'playground/vite.config.ts'), server: { port: 0 }, logLevel: 'error' })
await server.listen()
const base = server.resolvedUrls.local[0]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const failures = []
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name} ${detail}`)
    failures.push(name)
  }
}
const state = () => page.evaluate(() => window.__bpmn)
const xml = async () => (await state()).xml ?? ''
const count = (text, re) => (text.match(re) ?? []).length
const box = async (id) => page.locator(`.bpmn-ed-canvas [data-element-id="${id}"]`).first().boundingBox()
const centre = async (id) => {
  const b = await box(id)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const clickOn = async (id) => {
  const c = await centre(id)
  await page.mouse.click(c.x, c.y)
}
const newest = async (tag) => {
  const ids = [...(await xml()).matchAll(new RegExp(`<bpmn:${tag} id="([^"]+)"`, 'g'))].map((m) => m[1])
  return ids[ids.length - 1]
}

try {
  // A new diagram: one start event.
  await page.goto(`${base}?empty=1&lang=en`)
  await page.waitForSelector('.bpmn-ed-canvas [data-element-id="StartEvent_1"]')

  // Append a task from the context pad and name it.
  await clickOn('StartEvent_1')
  await page.click('[data-action="task"]')
  await page.waitForSelector('.bpmn-ed-text')
  await page.keyboard.type('Check order')
  await page.keyboard.press('Enter')
  let file = await xml()
  const task = await newest('task')
  check('append a task and name it', !!task && file.includes('name="Check order"') && count(file, /<bpmn:sequenceFlow /g) === 1, file.slice(0, 0))

  // Append a gateway and an end event after it.
  await clickOn(task)
  await page.click('[data-action="gateway"]')
  const gateway = await newest('exclusiveGateway')
  await clickOn(gateway)
  await page.click('[data-action="end"]')
  file = await xml()
  check('append a gateway and an end event', !!gateway && count(file, /<bpmn:endEvent /g) === 1 && count(file, /<bpmn:sequenceFlow /g) === 3)

  // Drag the task down; its flows follow.
  const before = await box(task)
  await page.mouse.move(before.x + 20, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 20, before.y + 80, { steps: 6 })
  await page.mouse.up()
  const after = await box(task)
  check('drag a task', Math.abs(after.y - before.y - 60) < 8, `${before.y} → ${after.y}`)

  // Delete the gateway with the keyboard, then undo.
  await clickOn(gateway)
  await page.keyboard.press('Delete')
  file = await xml()
  check('delete removes the element and its flows', !file.includes(gateway) && count(file, /<bpmn:sequenceFlow /g) === 1)
  await page.keyboard.press('Control+z')
  file = await xml()
  check('undo brings them back', file.includes(gateway) && count(file, /<bpmn:sequenceFlow /g) === 3)

  // Place a task from the palette on an empty spot.
  await page.click('[data-palette="task"]')
  const end = await newest('endEvent')
  const ec = await centre(end)
  await page.mouse.move(ec.x, ec.y + 160)
  await page.mouse.click(ec.x, ec.y + 160)
  await page.waitForSelector('.bpmn-ed-text')
  const placed = (await state()).selection[0]
  await page.keyboard.press('Escape')
  check('place a task from the palette', !!placed && count(await xml(), /<bpmn:task /g) === 2)

  // Connect it to the end event.
  await clickOn(placed)
  await page.click('[data-action="connect"]')
  await page.mouse.move(ec.x, ec.y, { steps: 4 })
  await page.mouse.click(ec.x, ec.y)
  file = await xml()
  check('connect two elements', count(file, /<bpmn:sequenceFlow /g) === 4)

  // Change its type through the context pad.
  await clickOn(placed)
  await page.click('[data-action="type"]')
  await page.click('[data-type="userTask"]')
  check('change the type', (await xml()).includes(`<bpmn:userTask id="${placed}"`))

  // Rename in the properties panel.
  await page.click('[data-control="properties"]')
  await clickOn(placed)
  const name = page.locator('textarea[data-prop="name"], [data-prop="name"] textarea').first()
  await name.fill('Review')
  await name.blur()
  check('rename in the properties panel', (await xml()).includes(`<bpmn:userTask id="${placed}" name="Review"`))
  await page.screenshot({ path: join(out, 'editor--new.png') })

  // A collaboration: add a lane, move a task into the other lane.
  await page.goto(`${base}?lang=en`)
  await page.waitForSelector('.bpmn-ed-canvas [data-element-id="Task_Reject"]')
  const pool = await box('Participant_Shop')
  await page.mouse.click(pool.x + 8, pool.y + pool.height / 2)
  await page.click('[data-action="lane"]')
  check('add a lane', count(await xml(), /<bpmn:lane /g) === 3)
  const reject = await box('Task_Reject')
  await page.mouse.move(reject.x + 30, reject.y + 30)
  await page.mouse.down()
  await page.mouse.move(reject.x + 30, reject.y + 30 + 200 * (reject.height / 80), { steps: 8 })
  await page.mouse.up()
  file = await xml()
  const warehouse = file.slice(file.indexOf('<bpmn:lane id="Lane_Warehouse"'), file.indexOf('</bpmn:lane>', file.indexOf('<bpmn:lane id="Lane_Warehouse"')))
  check('move a task to another lane', warehouse.includes('<bpmn:flowNodeRef>Task_Reject</bpmn:flowNodeRef>'))
  check('vendor extensions survive editing', file.includes('camunda:assignee="${initiator}"'))
  await page.screenshot({ path: join(out, 'editor--collaboration.png') })

  // DMN: the diagram and a decision table.
  await page.goto(`${base}?dmn=1&lang=en`)
  await page.waitForSelector('.bpmn-ed-canvas [data-element-id="Decision_Risk"]')
  const age = await box('Input_Age')
  await page.click('[data-palette="inputData"]')
  await page.mouse.move(age.x + age.width + 120, age.y + 20)
  await page.mouse.click(age.x + age.width + 120, age.y + 20)
  await page.waitForSelector('.bpmn-ed-text')
  await page.keyboard.type('Income')
  await page.keyboard.press('Enter')
  file = await xml()
  const income = [...file.matchAll(/<inputData id="([^"]+)" name="Income"/g)][0]?.[1]
  check('dmn: place and name input data', !!income)
  await clickOn(income)
  await page.click('[data-action="connect"]')
  const elig = await centre('Decision_Eligibility')
  await page.mouse.move(elig.x, elig.y, { steps: 4 })
  await page.mouse.click(elig.x, elig.y)
  check('dmn: connect with an information requirement', (await xml()).includes(`<requiredInput href="#${income}" />`))

  await clickOn('Decision_Risk')
  await page.click('[data-action="open"]')
  await page.waitForSelector('[data-decision="Decision_Risk"]')
  await page.click('[data-dmn="add-rule"]')
  const cell = page.locator('[data-cell="3-input-0"]')
  await cell.fill('> 800')
  await cell.blur()
  file = await xml()
  // Four rules in the file before: three in this table, one in another.
  check('dmn: add a rule and fill a cell', (file.match(/<rule id=/g) ?? []).length === 5 && file.includes('<text>&gt; 800</text>'))
  await page.click('[data-column="input-1"]')
  const label = page.locator('input[data-dmn="column-label"], [data-dmn="column-label"] input').first()
  await label.fill('Loan amount')
  await page.click('[data-dmn="save-column"]')
  check('dmn: rename a column', (await xml()).includes('<input id="Input_2" label="Loan amount">'))
  await page.click('[data-dmn="add-input"]')
  check('dmn: add an input column', ((await xml()).match(/<input id=/g) ?? []).length === 4)
  await page.locator('[data-dmn="delete-rule"]').first().click()
  check('dmn: delete a rule', ((await xml()).match(/<rule id=/g) ?? []).length === 4)
  await page.screenshot({ path: join(out, 'dmn--table.png') })
  await page.click('[data-control="back"]')
  await page.waitForSelector('.bpmn-ed-canvas [data-element-id="Decision_Risk"]')
  await clickOn(income)
  await page.keyboard.press('Delete')
  const left = await xml()
  check('dmn: delete an element with its requirement', !left.includes(income), JSON.stringify((await state()).selection) + ' ' + (left.match(new RegExp(`.{0,80}${income}.{0,40}`, 'g')) ?? []).join(' | '))
  await page.keyboard.press('Control+z')
  check('dmn: undo', (await xml()).includes(income))
  await page.screenshot({ path: join(out, 'dmn--diagram.png') })

  await page.goto(`${base}?lang=ru&theme=dark&props=1`)
  await page.waitForSelector('.bpmn-ed-canvas [data-element-id="Task_Check"]')
  await clickOn('Task_Check')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, 'editor--dark.png') })
  check('no page errors', errors.length === 0, errors.join('\n'))
} catch (e) {
  failures.push(String(e))
  console.error(e)
} finally {
  await browser.close()
  await server.close()
}
process.exit(failures.length > 0 ? 1 : 0)
