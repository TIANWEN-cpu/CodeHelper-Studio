export type ViewType =
  | 'home'
  | 'learn'
  | 'practice'
  | 'workspace'
  | 'ai-tutor'
  | 'review'
  | 'knowledge'
  | 'settings'
  | 'profile'

export interface NavItem {
  id: ViewType
  label: string
  icon: string
}
