import { createTwoFilesPatch } from 'diff'

export function unifiedDiff(before: string, after: string, filename = 'running-config'): string {
  return createTwoFilesPatch(
    `${filename}.before`,
    `${filename}.after`,
    before,
    after,
    undefined,
    undefined,
    { context: 3 },
  )
}
