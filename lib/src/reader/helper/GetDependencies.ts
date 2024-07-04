import { type Definition, type Property, type Schema, type Model } from '../Reader'
import { getSchema, resolveRelativeId } from './InputHelper'

/**
 * A dependency between two schemas
 */
export interface Dependency {
  /** The schema from where this dependency is comming from */
  fromSchema: Schema
  /** The definition in the fromSchema from where this dependency is comming from, undefined if from the "main" definition */
  fromDefinitionName?: string
  /** The schema where this dependency is going to */
  toSchema: Schema
  /** The definition in the toSchema where this dependency is going to, undefined if to the "main" definition */
  toDefinitionName?: string
  /** The type of the dependency */
  type: DependencyType
  /** The name of the property, if any. Usually the name of the property where the dependency is defined */
  dependencyName?: string
  /** If this is an array dependency */
  array: boolean
}

export type DependencyType = 'IS_IMPLEMENTED_BY' | 'CONTAINS' | 'REFERENCES' | 'ENUM'

/**
 * Get all dependencies for a schema
 * @param model The model to get the dependencies from
 * @param schema The schema to get the dependencies for
 * @returns All dependencies for the schema
 */
export function getDependencies (model: Model, schema: Schema): Dependency[] {
  const schemaDependencies = getDependenciesForDefinition(model, schema)
  const definitionDependencies = Object.keys(schema.definitions).flatMap(name => getDependenciesForDefinition(model, schema, name))
  return Array.from(new Set([...schemaDependencies, ...definitionDependencies]))
}

function getDependenciesForDefinition (model: Model, s: Schema, fromDefinitionName?: string): Dependency[] {
  const d: Definition = fromDefinitionName !== undefined ? s.definitions[fromDefinitionName] : s
  if ('oneOf' in d) {
    return d.oneOf
      .flatMap(oneOf => getDependenciesForProperty(model, s, oneOf, fromDefinitionName))
      .map(d => ({ ...d, type: 'IS_IMPLEMENTED_BY' }))
  }
  if ('properties' in d) {
    return Object.entries(d.properties)
      .flatMap(([name, p]) => getDependenciesForProperty(model, s, p, fromDefinitionName)
        .map(d => ({ ...d, dependencyName: name })))
  }
  return []
}

function getDependenciesForProperty (model: Model, fromSchema: Schema, p: Property, fromDefinitionName?: string): Dependency[] {
  if ('items' in p) {
    return getDependenciesForProperty(model, fromSchema, p.items, fromDefinitionName).map(d => ({ ...d, array: true }))
  }
  if ('x-references' in p) {
    const references = (typeof p['x-references'] === 'string') ? [p['x-references']] : p['x-references'] ?? []
    return references.map(r => {
      const { toSchema, toDefinitionName } = getTo(model, fromSchema, r)
      const dependency: Dependency = { toSchema, fromSchema, type: 'REFERENCES', array: false }
      if (toDefinitionName !== undefined) { dependency.toDefinitionName = toDefinitionName }
      if (fromDefinitionName !== undefined) { dependency.fromDefinitionName = fromDefinitionName }
      return dependency
    })
  }
  if ('$ref' in p) {
    const { toSchema, toDefinitionName } = getTo(model, fromSchema, p.$ref)
    const toDefinition: Definition = toDefinitionName !== undefined ? toSchema.definitions[toDefinitionName] : toSchema
    const type = getDependencyType(fromSchema, toSchema, toDefinition)
    const dependency: Dependency = { toSchema, fromSchema, type, array: false }
    if (toDefinitionName !== undefined) { dependency.toDefinitionName = toDefinitionName }
    if (fromDefinitionName !== undefined) { dependency.fromDefinitionName = fromDefinitionName }
    return [dependency]
  }
  return []
}

function getTo (model: Model, schema: Schema, refOrReference: string): { toSchema: Schema, toDefinitionName?: string } {
  if (refOrReference === '#') {
    return { toSchema: schema }
  }
  if (refOrReference.startsWith('#')) {
    return { toSchema: schema, toDefinitionName: refOrReference.substring('#/definitions/'.length) }
  }

  const otherId = resolveRelativeId(schema, refOrReference)
  const toSchema = getSchema(model, otherId)
  return { toSchema }
}

function getDependencyType (fromSchema: Schema, toSchema: Schema, toDefinition: Definition): DependencyType {
  // If this is to an enum, this is not a real reference but an enum reference
  if ('enum' in toDefinition) {
    return 'ENUM'
  }
  // If this is within the same schema, the type does not matter => always CONTAINS
  if (fromSchema === toSchema) {
    return 'CONTAINS'
  }

  const fromType = fromSchema['x-schema-type']
  const toType = toSchema['x-schema-type']

  // If type is other, we can't know and default is REFERENCES
  if (fromType === 'Other' || toType === 'Other') return 'REFERENCES'

  switch (toType) {
    case 'Aggregate':
      console.error(`Aggregate ${toSchema.$id} is included in ${fromSchema.$id} using $ref. This is unusual, normally you want to reference another aggregate using x-references`)
      return 'REFERENCES'
    case 'ReferenceData':
      console.error(`ReferenceData ${toSchema.$id} is included in ${fromSchema.$id} using $ref. This is unusual, normally you want to reference reference data using x-references`)
      return 'REFERENCES'
    case 'ValueObject':
      return 'CONTAINS'
    case 'Entity':
      if (fromType === 'ValueObject' || fromType === 'ReferenceData') {
        console.error(`Entity ${toSchema.$id} is included in ${fromSchema.$id} using $ref. This is unusual, normally you want to reference entities using x-references`)
        return 'REFERENCES'
      }
      return 'CONTAINS'
  }
}
