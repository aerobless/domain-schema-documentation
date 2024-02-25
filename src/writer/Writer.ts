import path from 'path'
import fs from 'fs'
import Handlebars from 'handlebars'
import { type Input } from '../reader/input/Input.ts'

export type Writer = (input: Input) => Promise<void>

export async function writeOutput (output: string, relativeFilename: string, outputFolder: string): Promise<void> {
  const outputFileName = path.join(outputFolder, relativeFilename)
  const outputDir = path.dirname(outputFileName)
  await fs.promises.mkdir(outputDir, { recursive: true })
  await fs.promises.writeFile(outputFileName, output, 'utf8')
}

export function loadTemplate (path: string): HandlebarsTemplateDelegate {
  const templateString = fs.readFileSync(path).toString()
  return Handlebars.compile(templateString)
}
