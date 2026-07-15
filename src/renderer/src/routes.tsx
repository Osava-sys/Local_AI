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
}

export const appRoutes: AppRoute[] = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'agent-runs', label: 'Graphe agent' },
  { id: 'approvals', label: 'Approbations' },
  { id: 'models', label: 'Modèles' },
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'audit-log', label: 'Audit' },
  { id: 'risk-reports', label: 'Rapports de risque' },
  { id: 'settings', label: 'Paramètres' },
]
