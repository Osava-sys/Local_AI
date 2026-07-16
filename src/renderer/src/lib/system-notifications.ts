import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'

export type SystemNotificationTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
export type SystemNotificationId = 'model' | 'agent' | 'approvals' | 'sandbox'

export interface SystemNotificationItem {
  id: SystemNotificationId
  title: string
  label: string
  description: string
  tone: SystemNotificationTone
}

export function buildSystemNotifications(input: {
  agentState: AgentState | 'starting'
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  sandboxActive: boolean
}): SystemNotificationItem[] {
  return [
    modelNotification(input.modelStatus),
    agentNotification(input.agentState),
    approvalNotification(input.pendingApprovals),
    sandboxNotification(input.sandboxActive),
  ]
}

function modelNotification(status: ModelRuntimeStatus | null): SystemNotificationItem {
  if (status?.state === 'running') {
    return {
      id: 'model',
      title: 'Modèle local',
      label: 'Modèle actif',
      description: status.modelName ?? 'Runtime local prêt à répondre.',
      tone: 'success',
    }
  }
  if (status?.state === 'starting') {
    return {
      id: 'model',
      title: 'Modèle local',
      label: 'Chargement du modèle',
      description: status.modelName ?? 'Initialisation du runtime local.',
      tone: 'warning',
    }
  }
  if (status?.state === 'error') {
    return {
      id: 'model',
      title: 'Modèle local',
      label: 'Erreur modèle',
      description: status.error ?? 'Le runtime local nécessite votre attention.',
      tone: 'danger',
    }
  }
  return {
    id: 'model',
    title: 'Modèle local',
    label: 'Modèle inactif',
    description: 'Aucun modèle n’est actuellement chargé.',
    tone: 'neutral',
  }
}

function agentNotification(state: AgentState | 'starting'): SystemNotificationItem {
  const states: Record<AgentState | 'starting', Omit<SystemNotificationItem, 'id' | 'title'>> = {
    idle: {
      label: 'Inactif',
      description: 'L’agent attend une nouvelle mission.',
      tone: 'neutral',
    },
    starting: {
      label: 'Démarrage',
      description: 'La session agent est en cours d’initialisation.',
      tone: 'accent',
    },
    planning: {
      label: 'Planification',
      description: 'L’agent construit son prochain plan d’action.',
      tone: 'accent',
    },
    awaiting_approval: {
      label: 'Approbation requise',
      description: 'Une décision humaine est nécessaire avant de poursuivre.',
      tone: 'warning',
    },
    running: {
      label: 'En cours',
      description: 'L’agent exécute la mission active.',
      tone: 'accent',
    },
    blocked: {
      label: 'Bloqué',
      description: 'La politique ou un prérequis empêche la poursuite du run.',
      tone: 'danger',
    },
    done: {
      label: 'Terminé',
      description: 'Le dernier run s’est terminé.',
      tone: 'success',
    },
    error: {
      label: 'Erreur agent',
      description: 'Le run nécessite une vérification.',
      tone: 'danger',
    },
    paused: {
      label: 'En pause',
      description: 'Le run est suspendu et peut être repris ou remplacé.',
      tone: 'warning',
    },
  }
  return { id: 'agent', title: 'Agent NEXUS', ...states[state] }
}

function approvalNotification(pending: number): SystemNotificationItem {
  if (pending > 0) {
    return {
      id: 'approvals',
      title: 'Approbations',
      label: `${pending} approbation${pending > 1 ? 's' : ''} en attente`,
      description: 'Vérifiez le périmètre et le niveau de risque avant de décider.',
      tone: 'warning',
    }
  }
  return {
    id: 'approvals',
    title: 'Approbations',
    label: 'Approbations à jour',
    description: 'Aucune décision humaine n’est actuellement requise.',
    tone: 'success',
  }
}

function sandboxNotification(active: boolean): SystemNotificationItem {
  return active
    ? {
        id: 'sandbox',
        title: 'Sandbox',
        label: 'Sandbox active',
        description: 'Une exécution isolée est en cours ou attend une décision.',
        tone: 'success',
      }
    : {
        id: 'sandbox',
        title: 'Sandbox',
        label: 'Sandbox inactive',
        description: 'Aucun outil isolé n’est en cours d’exécution.',
        tone: 'warning',
      }
}
