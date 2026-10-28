export type Scene =
  | 'tavern'
  | 'campfire'
  | 'forest'
  | 'country'
  | 'party'
  | 'library'
  | 'battle'
  | 'boss'
  | 'victory'
  | 'pondering'

export type QuestStatus = { scene: Scene; caption: string }
export type QuestSize = 'small' | 'medium' | 'large'
export type QuestPrefs = { size: QuestSize; align: 'left' | 'right' }
export type QuestStats = { xp: number; slain: number; quests: number; hp: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-quest': {
      status: Shaped<QuestStatus>
      stats: Shaped<QuestStats>
      prefs: Shaped<QuestPrefs>
    }
  }
}
