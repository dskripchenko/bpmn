export interface DmnLabels {
  diagram: string; undo: string; redo: string; zoomIn: string; zoomOut: string; fit: string; download: string; downloadXml: string; downloadSvg: string
  delete: string; connect: string; color: string; noColor: string; open: string; back: string
  palette: Record<string, string>
  types: Record<string, string>
  hitPolicy: string; aggregation: string; none: string; logic: string; logics: Record<string, string>
  addRule: string; deleteRule: string; moveUp: string; moveDown: string; addInput: string; addOutput: string; deleteColumn: string
  input: string; output: string; label: string; expression: string; name: string; type: string; annotation: string; resultType: string; literal: string
  emptyTable: string; otherLogic: string; notAllowed: string
}

const en: DmnLabels = {
  diagram: 'Diagram', undo: 'Undo', redo: 'Redo', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to screen', download: 'Download', downloadXml: 'DMN file (.dmn)', downloadSvg: 'Picture (.svg)',
  delete: 'Delete', connect: 'Connect', color: 'Colour', noColor: 'No colour', open: 'Open the logic', back: 'Back to the diagram',
  palette: { decision: 'Decision', inputData: 'Input data', businessKnowledgeModel: 'Business knowledge model', knowledgeSource: 'Knowledge source', textAnnotation: 'Text annotation' },
  types: { decision: 'Decision', inputData: 'Input data', businessKnowledgeModel: 'Business knowledge model', knowledgeSource: 'Knowledge source', textAnnotation: 'Text annotation', decisionService: 'Decision service' },
  hitPolicy: 'Hit policy', aggregation: 'Aggregation', none: 'None', logic: 'Logic', logics: { table: 'Decision table', literal: 'Literal expression', none: 'None' },
  addRule: 'Add rule', deleteRule: 'Delete rule', moveUp: 'Move up', moveDown: 'Move down', addInput: 'Add input', addOutput: 'Add output', deleteColumn: 'Delete column',
  input: 'Input', output: 'Output', label: 'Label', expression: 'Expression', name: 'Name', type: 'Type', annotation: 'Annotation', resultType: 'Result type', literal: 'Expression',
  emptyTable: 'No rules yet', otherLogic: 'This decision uses a boxed expression that is shown but not edited here', notAllowed: 'These elements cannot be connected',
}

const ru: DmnLabels = {
  diagram: 'Диаграмма', undo: 'Отменить', redo: 'Повторить', zoomIn: 'Приблизить', zoomOut: 'Отдалить', fit: 'Показать всё', download: 'Скачать', downloadXml: 'Файл DMN (.dmn)', downloadSvg: 'Картинка (.svg)',
  delete: 'Удалить', connect: 'Соединить', color: 'Цвет', noColor: 'Без цвета', open: 'Открыть логику', back: 'К диаграмме',
  palette: { decision: 'Решение', inputData: 'Входные данные', businessKnowledgeModel: 'Модель бизнес-знаний', knowledgeSource: 'Источник знаний', textAnnotation: 'Аннотация' },
  types: { decision: 'Решение', inputData: 'Входные данные', businessKnowledgeModel: 'Модель бизнес-знаний', knowledgeSource: 'Источник знаний', textAnnotation: 'Аннотация', decisionService: 'Сервис решений' },
  hitPolicy: 'Политика', aggregation: 'Агрегация', none: 'Нет', logic: 'Логика', logics: { table: 'Таблица решений', literal: 'Литеральное выражение', none: 'Нет' },
  addRule: 'Добавить правило', deleteRule: 'Удалить правило', moveUp: 'Выше', moveDown: 'Ниже', addInput: 'Добавить вход', addOutput: 'Добавить выход', deleteColumn: 'Удалить столбец',
  input: 'Вход', output: 'Выход', label: 'Подпись', expression: 'Выражение', name: 'Имя', type: 'Тип', annotation: 'Аннотация', resultType: 'Тип результата', literal: 'Выражение',
  emptyTable: 'Правил пока нет', otherLogic: 'У решения другое выражение: оно показано, но здесь не редактируется', notAllowed: 'Эти элементы нельзя соединить',
}

export function resolveDmnLabels(locale: string | undefined, overrides?: Partial<DmnLabels>): DmnLabels {
  const lang = (locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '').toLowerCase()
  return { ...(lang.startsWith('ru') ? ru : en), ...overrides }
}
