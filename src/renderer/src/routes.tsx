export type AppRouteId =
  | 'dashboard'
  | 'agent-runs'
  | 'approvals'
  | 'models'
  | 'sandbox'
  | 'audit-log'
  | 'risk-reports'
  | 'settings'

export interface AppRoute {
  id: AppRouteId
  label: string
  description: string
  section: AppRouteSectionId
}

export type AppRouteSectionId = 'supervision' | 'control' | 'governance' | 'system'

export interface AppRouteSection {
  id: AppRouteSectionId
  label: string
}

export const appRouteSections: AppRouteSection[] = [
  { id: 'supervision', label: 'Supervision' },
  { id: 'control', label: 'Contrôle' },
  { id: 'governance', label: 'Gouvernance' },
  { id: 'system', label: 'Système' },
]

export const appRoutes: AppRoute[] = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    description: 'Vue synthétique de la posture et des exécutions',
    section: 'supervision',
  },
  {
    id: 'agent-runs',
    label: 'Graphe agent',
    description: 'Mission, raisonnement et preuves en temps réel',
    section: 'supervision',
  },
  {
    id: 'approvals',
    label: 'Approbations',
    description: 'Décisions humaines et actions sensibles',
    section: 'control',
  },
  {
    id: 'models',
    label: 'Modèles',
    description: 'Runtime, catalogue et chargement local',
    section: 'control',
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    description: 'Exécutions isolées et périmètres autorisés',
    section: 'control',
  },
  {
    id: 'audit-log',
    label: 'Journal d’audit',
    description: 'Traçabilité chronologique des décisions',
    section: 'governance',
  },
  {
    id: 'risk-reports',
    label: 'Rapports de risque',
    description: 'Findings priorisés et recommandations',
    section: 'governance',
  },
  {
    id: 'settings',
    label: 'Paramètres',
    description: 'Préférences locales de la console',
    section: 'system',
  },
]

export function getAppRoute(id: AppRouteId): AppRoute {
  return appRoutes.find((route) => route.id === id) ?? appRoutes[0]
}
