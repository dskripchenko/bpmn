// Styles are bundled by Vite.
declare module '*.css'
declare module "*.bpmn?raw" {
  const source: string
  export default source
}
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
declare module '*.dmn?raw' {
  const source: string
  export default source
}
