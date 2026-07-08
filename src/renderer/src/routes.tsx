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
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agent-runs', label: 'Agent Graph' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'models', label: 'Models' },
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'audit-log', label: 'Audit' },
  { id: 'risk-reports', label: 'Risk Reports' },
  { id: 'settings', label: 'Settings' },
]
