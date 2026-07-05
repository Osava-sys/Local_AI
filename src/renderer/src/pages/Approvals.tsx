import React from 'react'
import { ApprovalQueue } from '../components/agent/ApprovalQueue'

/** Full-page view of the sandbox approval queue. */
export default function Approvals(): React.ReactElement {
  return (
    <div style={{ padding: '2rem', maxWidth: 920 }}>
      <ApprovalQueue />
    </div>
  )
}
