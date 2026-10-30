export interface BpmnLabels {
  undo: string; redo: string; zoomIn: string; zoomOut: string; fit: string; properties: string; download: string; downloadXml: string; downloadSvg: string
  delete: string; connect: string; changeType: string; color: string; noColor: string; addLane: string; annotate: string
  appendTask: string; appendGateway: string; appendIntermediate: string; appendEnd: string
  palette: Record<string, string>
  types: Record<string, string>
  definitions: Record<string, string>
  plain: string
  id: string; name: string; documentation: string; type: string; eventDefinition: string; loop: string; loops: Record<string, string>
  condition: string; defaultFlow: string; interrupting: string; executable: string; process: string; nothingSelected: string; selectedCount: (n: number) => string
  placeInPool: string; notAllowed: string; emptyHint: string
}

const types = {
  en: {
    startEvent: 'Start event', intermediateCatchEvent: 'Intermediate catch event', intermediateThrowEvent: 'Intermediate throw event', endEvent: 'End event', boundaryEvent: 'Boundary event',
    task: 'Task', userTask: 'User task', serviceTask: 'Service task', scriptTask: 'Script task', sendTask: 'Send task', receiveTask: 'Receive task', manualTask: 'Manual task', businessRuleTask: 'Business rule task',
    callActivity: 'Call activity', subProcess: 'Sub-process', transaction: 'Transaction', adHocSubProcess: 'Ad hoc sub-process',
    exclusiveGateway: 'Exclusive gateway', parallelGateway: 'Parallel gateway', inclusiveGateway: 'Inclusive gateway', complexGateway: 'Complex gateway', eventBasedGateway: 'Event-based gateway',
    dataObjectReference: 'Data object', dataStoreReference: 'Data store', textAnnotation: 'Text annotation', group: 'Group', participant: 'Pool', lane: 'Lane',
    sequenceFlow: 'Sequence flow', messageFlow: 'Message flow', association: 'Association', dataInputAssociation: 'Data input', dataOutputAssociation: 'Data output',
  },
  ru: {
    startEvent: 'Начальное событие', intermediateCatchEvent: 'Промежуточное событие (ожидание)', intermediateThrowEvent: 'Промежуточное событие (отправка)', endEvent: 'Конечное событие', boundaryEvent: 'Граничное событие',
    task: 'Задача', userTask: 'Пользовательская задача', serviceTask: 'Сервисная задача', scriptTask: 'Задача-сценарий', sendTask: 'Отправка', receiveTask: 'Получение', manualTask: 'Ручная задача', businessRuleTask: 'Бизнес-правило',
    callActivity: 'Вызов процесса', subProcess: 'Подпроцесс', transaction: 'Транзакция', adHocSubProcess: 'Подпроцесс ad hoc',
    exclusiveGateway: 'Исключающий шлюз', parallelGateway: 'Параллельный шлюз', inclusiveGateway: 'Включающий шлюз', complexGateway: 'Сложный шлюз', eventBasedGateway: 'Шлюз по событиям',
    dataObjectReference: 'Объект данных', dataStoreReference: 'Хранилище данных', textAnnotation: 'Аннотация', group: 'Группа', participant: 'Пул', lane: 'Дорожка',
    sequenceFlow: 'Поток управления', messageFlow: 'Поток сообщений', association: 'Ассоциация', dataInputAssociation: 'Входные данные', dataOutputAssociation: 'Выходные данные',
  },
}

const definitions = {
  en: { message: 'Message', timer: 'Timer', error: 'Error', escalation: 'Escalation', signal: 'Signal', conditional: 'Conditional', link: 'Link', compensate: 'Compensation', cancel: 'Cancel', terminate: 'Terminate' },
  ru: { message: 'Сообщение', timer: 'Таймер', error: 'Ошибка', escalation: 'Эскалация', signal: 'Сигнал', conditional: 'Условие', link: 'Ссылка', compensate: 'Компенсация', cancel: 'Отмена', terminate: 'Завершение' },
}

const en: BpmnLabels = {
  undo: 'Undo', redo: 'Redo', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to screen', properties: 'Properties', download: 'Download', downloadXml: 'BPMN file (.bpmn)', downloadSvg: 'Picture (.svg)',
  delete: 'Delete', connect: 'Connect', changeType: 'Change type', color: 'Colour', noColor: 'No colour', addLane: 'Add lane', annotate: 'Add annotation',
  appendTask: 'Append task', appendGateway: 'Append gateway', appendIntermediate: 'Append intermediate event', appendEnd: 'Append end event',
  palette: { startEvent: 'Start event', intermediateThrowEvent: 'Intermediate event', endEvent: 'End event', exclusiveGateway: 'Gateway', task: 'Task', subProcess: 'Sub-process', dataObjectReference: 'Data object', dataStoreReference: 'Data store', participant: 'Pool', group: 'Group', textAnnotation: 'Text annotation' },
  types: types.en,
  definitions: definitions.en,
  plain: 'None',
  id: 'Id', name: 'Name', documentation: 'Documentation', type: 'Type', eventDefinition: 'Event', loop: 'Loop', loops: { none: 'None', standard: 'Loop', parallel: 'Parallel multi-instance', sequential: 'Sequential multi-instance' },
  condition: 'Condition', defaultFlow: 'Default flow', interrupting: 'Interrupting', executable: 'Executable', process: 'Process', nothingSelected: 'Select an element to see its properties', selectedCount: (n) => `${n} elements selected`,
  placeInPool: 'Place it inside a pool', notAllowed: 'These elements cannot be connected', emptyHint: 'Pick an element on the left and click on the canvas',
}

const ru: BpmnLabels = {
  undo: 'Отменить', redo: 'Повторить', zoomIn: 'Приблизить', zoomOut: 'Отдалить', fit: 'Показать всё', properties: 'Свойства', download: 'Скачать', downloadXml: 'Файл BPMN (.bpmn)', downloadSvg: 'Картинка (.svg)',
  delete: 'Удалить', connect: 'Соединить', changeType: 'Изменить тип', color: 'Цвет', noColor: 'Без цвета', addLane: 'Добавить дорожку', annotate: 'Добавить аннотацию',
  appendTask: 'Добавить задачу', appendGateway: 'Добавить шлюз', appendIntermediate: 'Добавить промежуточное событие', appendEnd: 'Добавить конечное событие',
  palette: { startEvent: 'Начальное событие', intermediateThrowEvent: 'Промежуточное событие', endEvent: 'Конечное событие', exclusiveGateway: 'Шлюз', task: 'Задача', subProcess: 'Подпроцесс', dataObjectReference: 'Объект данных', dataStoreReference: 'Хранилище данных', participant: 'Пул', group: 'Группа', textAnnotation: 'Аннотация' },
  types: types.ru,
  definitions: definitions.ru,
  plain: 'Нет',
  id: 'Идентификатор', name: 'Название', documentation: 'Описание', type: 'Тип', eventDefinition: 'Событие', loop: 'Повторение', loops: { none: 'Нет', standard: 'Цикл', parallel: 'Параллельно, много экземпляров', sequential: 'Последовательно, много экземпляров' },
  condition: 'Условие', defaultFlow: 'Поток по умолчанию', interrupting: 'Прерывающее', executable: 'Исполняемый', process: 'Процесс', nothingSelected: 'Выберите элемент, чтобы увидеть его свойства', selectedCount: (n) => `Выбрано элементов: ${n}`,
  placeInPool: 'Поместите элемент внутрь пула', notAllowed: 'Эти элементы нельзя соединить', emptyHint: 'Выберите элемент слева и щёлкните по холсту',
}

export function resolveLabels(locale: string | undefined, overrides?: Partial<BpmnLabels>): BpmnLabels {
  const lang = (locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '').toLowerCase()
  return { ...(lang.startsWith('ru') ? ru : en), ...overrides }
}
