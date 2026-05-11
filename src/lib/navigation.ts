export const ALL_TABS = ['timers', 'history', 'analytics', 'settings'] as const

export const Tab = {
  Timers: 'timers',
  History: 'history',
  Analytics: 'analytics',
  Settings: 'settings',
} as const satisfies Record<string, typeof ALL_TABS[number]>
export type Tab = typeof Tab[keyof typeof Tab]

export const ALL_ACTIONS = ['none', 'create-edit'] as const

export const ActiveAction = {
  None: 'none',
  CreateEdit: 'create-edit',
} as const satisfies Record<string, typeof ALL_ACTIONS[number]>
export type ActiveAction = typeof ActiveAction[keyof typeof ActiveAction]
