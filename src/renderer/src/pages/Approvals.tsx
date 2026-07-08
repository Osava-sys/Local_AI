import React from 'react'
import { ApprovalQueue } from '../components/agent/ApprovalQueue'

/** Full-page view of the sandbox approval queue. */
export default function Approvals(): React.ReactElement {
  return (
    <div className="page">
      <section className="panel">
        <ApprovalQueue />
      </section>
    </div>
  )
}
