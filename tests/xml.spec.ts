import { fixture } from './fixtures'
import { BpmnError, parseXml, writeXml } from '../src'


describe('parseXml', () => {
  it('resolves namespaces of elements and prefixed attributes', () => {
    const doc = parseXml('<a xmlns="urn:a" xmlns:b="urn:b"><b:c b:d="1" e="2"/></a>')
    expect(doc.root.ns).toBe('urn:a')
    const c = doc.root.children[0]
    expect(c).toMatchObject({ kind: 'element', ns: 'urn:b', local: 'c' })
    if (c?.kind !== 'element') throw new Error()
    expect(c.attributes).toEqual([
      { name: 'b:d', value: '1', ns: 'urn:b', local: 'd' },
      { name: 'e', value: '2', ns: '', local: 'e' },
    ])
  })

  it('decodes the predefined entities and character references', () => {
    const doc = parseXml('<a t="&lt;&amp;&#10;&#x41;">&gt;&quot;&apos;&#169;</a>')
    expect(doc.root.attributes[0]!.value).toBe('<&\nA')
    expect(doc.root.children[0]).toEqual({ kind: 'text', value: '>"\'©' })
  })

  it('refuses a document type declaration', () => {
    const xxe = '<?xml version="1.0"?>\n<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<a>&x;</a>'
    expect(() => parseXml(xxe)).toThrow(BpmnError)
    expect(() => parseXml(xxe)).toThrow(/Document type declarations are not accepted \(line 2/)
  })

  it('refuses unknown entities', () => {
    expect(() => parseXml('<a>&nbsp;</a>')).toThrow(/"&nbsp;" is not a known reference/)
  })

  it('reports where the file is broken', () => {
    try {
      parseXml('<a>\n  <b>\n</a>')
      throw new Error('no error')
    } catch (e) {
      expect(e).toBeInstanceOf(BpmnError)
      expect((e as BpmnError).line).toBe(3)
      expect((e as BpmnError).message).toMatch('</a> closes <b>')
    }
    expect(() => parseXml('<x:a/>')).toThrow(/prefix "x" is not declared/)
    expect(() => parseXml('<a b="1" b="2"/>')).toThrow(/repeated/)
    expect(() => parseXml('<a/><b/>')).toThrow(/one root element/)
    expect(() => parseXml('')).toThrow(/no XML element/)
  })

  it('caps depth, element count and size', () => {
    expect(() => parseXml('<a>'.repeat(300) + '</a>'.repeat(300))).toThrow(/nested deeper/)
    expect(() => parseXml(`<a>${'<b/>'.repeat(20)}</a>`, { maxElements: 10 })).toThrow(/more than 10 elements/)
    expect(() => parseXml('<a/>', { maxLength: 3 })).toThrow(/limit is 3/)
  })

  it('keeps comments, CDATA and instructions', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- top --><a><![CDATA[x < y]]><!-- in --><?pi data?></a>')
    expect(doc.prolog).toEqual([
      { kind: 'instruction', target: 'xml', value: 'version="1.0"' },
      { kind: 'comment', value: ' top ' },
    ])
    expect(doc.root.children.map((c) => c.kind)).toEqual(['cdata', 'comment', 'instruction'])
  })
})

describe('writeXml', () => {
  it('round-trips a modeler file without losing extensions', () => {
    const source = fixture('order.bpmn')
    const once = writeXml(parseXml(source))
    expect(once).toContain('camunda:assignee="${initiator}"')
    expect(once).toContain('<camunda:inputParameter name="limit">1000</camunda:inputParameter>')
    expect(once).toContain('<![CDATA[execution.setVariable("reported", a < b && true);]]>')
    expect(once).toContain('bioc:fill="#bbdefb"')
    // Writing what was read gives the same text again.
    expect(writeXml(parseXml(once))).toBe(once)
  })

  it('escapes what it writes', () => {
    const doc = parseXml('<a t="&quot;&#10;">&lt;b&gt;</a>')
    expect(writeXml(doc)).toBe('<a t="&quot;&#10;">&lt;b&gt;</a>\n')
  })
})
