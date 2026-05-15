import ProgressBar from './ProgressBar'

const STATUS_BADGES = {
  paid: 'badge-paid',
  settled: 'badge-settled',
  active_plan: 'badge-active',
  unpaid: 'badge-unpaid',
  waiting: 'badge-waiting',
  disputed: 'badge-waiting',
}

export default function DebtCard({ collection, payments, onMarkPaid }) {
  const original = parseFloat(collection.original_balance)
  const current = parseFloat(collection.current_balance)
  const paid = original - current
  const pct = original > 0 ? ((paid / original) * 100).toFixed(0) : 100
  const settlement = collection.settlement_amount ? parseFloat(collection.settlement_amount) : null

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <div>
          <div className="card-title">{collection.account_name}</div>
          <div className="card-subtitle">
            {collection.collector && `${collection.collector}`}
            {collection.collector && collection.original_creditor && ' · '}
            {collection.original_creditor && `Originally: ${collection.original_creditor}`}
          </div>
        </div>
        <span className={`badge ${STATUS_BADGES[collection.status] || ''}`}>
          {collection.status.replace('_', ' ')}
        </span>
      </div>

      {/* Progress */}
      <div className="flex-between" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
        <span className="text-muted">{pct}% complete</span>
        <span className="amount">${current.toFixed(2)} left</span>
      </div>
      <ProgressBar percent={parseFloat(pct)} />

      {/* Settlement info */}
      {settlement && collection.discount_percent && (
        <div style={{
          marginTop: '10px',
          padding: '8px 10px',
          background: 'var(--accent-dim)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
        }}>
          <span className="text-accent">
            {collection.discount_percent}% discount → ${settlement.toFixed(2)} settlement
          </span>
          {collection.payment_plan_length && (
            <span className="text-muted">
              {' '}· {collection.payment_plan_length} payments of ${collection.payment_amount}
            </span>
          )}
        </div>
      )}

      {/* Payment schedule */}
      {payments.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Payments
          </div>
          {payments.map(payment => (
            <div
              key={payment.id}
              className="flex-between"
              style={{
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span className={payment.status === 'paid' ? 'text-accent' : ''}>
                  ${payment.amount}
                </span>
                <span className="text-muted"> · {payment.due_date}</span>
              </div>
              {payment.status === 'paid' ? (
                <span className="text-accent" style={{ fontSize: '0.8rem' }}>✓ Paid</span>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                  onClick={() => onMarkPaid(payment.id)}
                >
                  Mark Paid
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {collection.notes && (
        <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {collection.notes}
        </p>
      )}
    </div>
  )
}
