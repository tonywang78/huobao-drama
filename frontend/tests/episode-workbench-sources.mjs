import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 读取剧集工作台相关源码（页面壳 + composable + 子组件），供结构测试使用 */
export function readEpisodeWorkbenchSources() {
  const parts = [
    readFileSync(join(frontendRoot, 'app/views/drama/episode.vue'), 'utf8'),
    readFileSync(join(frontendRoot, 'app/composables/useEpisodeWorkbench.ts'), 'utf8'),
  ]
  const episodeComponentsDir = join(frontendRoot, 'app/components/episode')
  for (const name of readdirSync(episodeComponentsDir).sort()) {
    if (name.endsWith('.vue')) {
      parts.push(readFileSync(join(episodeComponentsDir, name), 'utf8'))
    }
  }
  return parts.join('\n')
}

export function readEpisodeWorkbenchFromMeta(metaUrl) {
  return readEpisodeWorkbenchSources()
}
