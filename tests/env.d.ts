/// <reference types="vite/client" />
// Fixtures are imported as text through Vite's `?raw` suffix.
declare module '*.bpmn?raw' {
  const source: string
  export default source
}
declare module '*.dmn?raw' {
  const source: string
  export default source
}
