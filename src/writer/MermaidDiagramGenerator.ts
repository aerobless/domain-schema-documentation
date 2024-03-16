import { type Input, type Module } from '../reader/input/Input.ts'
import { getModuleForSchema, getModuleId, getSchemasForModule } from '../reader/input/InputHelper.ts'
import { type Schema } from '../reader/input/Schema.ts'
import { type Dependency, type DependencyType, getDependencies } from '../reader/input/GetDependencies.ts'

export function applicationDiagram (input: Input): string | undefined {
  const dependencies = input.schemas
    .flatMap(s => getDependencies(input, s))
    .filter(d => getModuleId(d.fromSchema) !== getModuleId(d.toSchema))
    // IS_IMPLEMENTED_BY is a special case, because it is a dependency from the parent to the child. Therefore, reverse the direction
    .map(d => d.type === 'IS_IMPLEMENTED_BY'
      ? `${safeId(getModuleId(d.toSchema))} ..> ${safeId(getModuleId(d.fromSchema))}`
      : `${safeId(getModuleId(d.fromSchema))} ..> ${safeId(getModuleId(d.toSchema))}`)
  const moduleStrs = input.modules.map(m => `class ${safeId(m)}["${m.title}"]`)
  const lines = [...moduleStrs, ...unique(dependencies)]
  return lines.length === 0 ? undefined : lines.join('\n')
}

export function moduleDiagram (input: Input, module: Module): string | undefined {
  const dependenciesTo = input.schemas
    .filter(s => getModuleId(s) !== module.$id)
    .flatMap(s => getDependencies(input, s))
    .filter(d => getModuleId(d.toSchema) === module.$id)
  const dependenciesFrom = getSchemasForModule(input, module)
    .flatMap(s => getDependencies(input, s))
  const dependencies = [...dependenciesTo, ...dependenciesFrom]
  return toDiagram(dependencies, input)
}

export function schemaDiagramm (input: Input, schema: Schema): string | undefined {
  const dependenciesTo = input.schemas
    .filter(s => s !== schema)
    .flatMap(s => getDependencies(input, s))
    .filter(s => s.toSchema === schema)
  const dependenciesFrom = getDependencies(input, schema)
  const dependencies = [...dependenciesTo, ...dependenciesFrom]
  return toDiagram(dependencies, input)
}

function safeId (obj: string | Schema | Module): string {
  const id = typeof obj === 'string' ? obj : obj.$id
  return id.replace(/\//g, '_').replace(/\./g, '_')
}

function toDiagram (dependencies: Dependency[], input: Input): string | undefined {
  const endpoints = dependencies.flatMap(d => [
    { schema: d.fromSchema, name: d.fromDefinitionName },
    { schema: d.toSchema, name: d.toDefinitionName }
  ])
  const modules = unique(endpoints.map(s => getModuleForSchema(input, s.schema)))
  const namespaceStrs = modules.map(module => {
    const endpointsForModule = unique(endpoints.filter(e => getModuleId(e.schema) === module.$id))
    const classesStr = endpointsForModule.map(e => {
      if (e.name !== undefined) {
        return `  class ${e.name}["${e.name}"]`
      } else {
        return `  class ${safeId(e.schema)}["${e.schema.title}"]`
      }
    })
    return `namespace ${module.title} {\n${classesStr.join('\n')}\n}`
  })

  const dependenciesStr = dependencies.map(d => {
    const from = d.fromDefinitionName ?? safeId(d.fromSchema)
    const to = d.toDefinitionName ?? safeId(d.toSchema)
    return `${from} ${toMermaidType(d.type)} ${d.array ? '"N"' : ''} ${to} ${d.dependencyName !== undefined ? ':' + d.dependencyName : ''}\n`
  })
  const lines = [...namespaceStrs, ...dependenciesStr]
  return lines.length === 0 ? undefined : lines.join('\n')
}

function toMermaidType (type: DependencyType): string {
  switch (type) {
    case 'IS_IMPLEMENTED_BY': return '<|--'
    case 'CONTAINS': return 'o--'
    case 'REFERENCES': return '..>'
  }
}
function unique<T> (arr: T[]): T[] {
  return Array.from(new Set(arr))
}