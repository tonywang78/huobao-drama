import type { InjectionKey } from 'vue'
import type { useEpisodeWorkbench } from '~/composables/useEpisodeWorkbench'

export type EpisodeWorkbench = ReturnType<typeof useEpisodeWorkbench>

export const EPISODE_WORKBENCH_KEY: InjectionKey<EpisodeWorkbench> = Symbol('episodeWorkbench')

export function provideEpisodeWorkbench(wb: EpisodeWorkbench) {
  provide(EPISODE_WORKBENCH_KEY, wb)
}

export function useEpisodeWorkbenchInject(): EpisodeWorkbench {
  const wb = inject(EPISODE_WORKBENCH_KEY)
  if (!wb) throw new Error('Episode workbench context missing')
  return wb
}
