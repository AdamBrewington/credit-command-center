import { useState } from 'react'
import ProgressBar from './ProgressBar'

const STATUS_BADGES = {
  paid: 'badge-paid',
  settled: 'badge-settled',
  active_plan: 'badge-active',
  unpaid: 'badge-unpaid',
  waiting: 'badge-waiting',
  disputed: 'badge-waiting',
}

const EMPTY_PAYMENT_FORM = {
  amount: '',
  due_date: '',
  status: 'unpaid',
  paid_date: '',
  confirmation_number: '',
  notes: '',
}

const PAYMENT_STATUS_OPTIONS = ['unpaid', 'paid', 'late', 'skipped']

function paymentToForm(payment) {
  return {
    amount: payment.amount ?? '',
    due_date: payment.due_date || '',
    status: payment.status || 'unpaid',
    paid_date: payment.paid_date || '',
    confirmation_number: payment.confirmation_number || '',
    notes: payment.notes || '',
  }
}

export default function DebtCard({
  collection,
  payments,
  onMarkPaid,
  onEditCollection,
  onDeleteCollection,
  onSavePayment,
  onDeletePayment,
  saving = false,
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM)
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false)
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null)

  const original = parseFloat(collection.original_balance)
  const current = parseFloat(collection.current_balance)
  const paid = original - current
  const pct = original > 0 ? ((paid / original) * 100).toFixed(0) : 100
  const settlement = collection.settlement_amount ? parseFloat(collection.settlement_amount) : null

  function updatePaymentForm(field, value) {
    setPaymentForm(current => ({ ...current, [field]: value }))
  }

  function startAddPayment() {
    setEditingPayment(null)
    setPaymentForm(EMPTY_PAYMENT_FORM)
    setConfirmDeletePaymentId(null)
    setShowPaymentForm(true)
  }

  function startEditPayment(payment) {
    setEditingPayment(payment)
    setPaymentForm(paymentToForm(payment))
    setConfirmDeletePaymentId(null)
    setShowPaymentForm(true)
  }

  function closePaymentForm() {
    setShowPaymentForm(false)
    setEditingPayment(null)
    setPaymentForm(EMPTY_PAYMENT_FORM)
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault()
    const result = await onSavePayment(collection.id, editingPayment?.id, paymentForm)
    if (!result?.error) closePaymentForm()
  }

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

      <div className="flex-gap mb-16">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => onEditCollection(collection)}
          disabled={saving}
          style={{ padding: '8px 12px', fontSize: '0.78rem' }}
        >
          Edit
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={startAddPayment}
          disabled={saving}
          style={{ padding: '8px 12px', fontSize: '0.78rem' }}
        >
          Add Payment
        </button>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => setConfirmDeleteCollection(true)}
          disabled={saving}
          style={{ padding: '8px 12px', fontSize: '0.78rem', marginLeft: 'auto' }}
        >
          Delete
        </button>
      </div>

      {confirmDeleteCollection && (
        <div style={{
          padding: '10px',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '12px',
          fontSize: '0.85rem',
        }}>
          <p style={{ color: 'var(--danger)', marginBottom: '10px' }}>
            Delete this collection and its payment rows?
          </p>
          <div className="flex-gap">
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => onDeleteCollection(collection.id)}
              disabled={saving}
              style={{ padding: '8px 12px', fontSize: '0.78rem' }}
            >
              Confirm Delete
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setConfirmDeleteCollection(false)}
              disabled={saving}
              style={{ padding: '8px 12px', fontSize: '0.78rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

      {collection.expected_report_behavior && (
        <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Report behavior: {collection.expected_report_behavior}
        </p>
      )}

      {collection.proof_uploaded && (
        <p style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--accent)' }}>
          Proof uploaded
        </p>
      )}

      {showPaymentForm && (
        <form
          onSubmit={handlePaymentSubmit}
          style={{
            marginTop: '14px',
            padding: '12px',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="card-title" style={{ fontSize: '0.95rem', marginBottom: '10px' }}>
            {editingPayment ? 'Edit Payment' : 'Add Payment'}
          </div>

          <div className="stats-row">
            <div className="form-group">
              <label>Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) => updatePaymentForm('amount', event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Due date</label>
              <input
                type="date"
                value={paymentForm.due_date}
                onChange={(event) => updatePaymentForm('due_date', event.target.value)}
                required
              />
            </div>
          </div>

          <div className="stats-row">
            <div className="form-group">
              <label>Status</label>
              <select
                value={paymentForm.status}
                onChange={(event) => updatePaymentForm('status', event.target.value)}
              >
                {PAYMENT_STATUS_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Paid date</label>
              <input
                type="date"
                value={paymentForm.paid_date}
                onChange={(event) => updatePaymentForm('paid_date', event.target.value)}
                disabled={paymentForm.status !== 'paid'}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Confirmation number</label>
            <input
              value={paymentForm.confirmation_number}
              onChange={(event) => updatePaymentForm('confirmation_number', event.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              rows="2"
              value={paymentForm.notes}
              onChange={(event) => updatePaymentForm('notes', event.target.value)}
            />
          </div>

          <div className="flex-gap">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editingPayment ? 'Save Payment' : 'Add Payment')}
            </button>
            <button className="btn btn-secondary" type="button" onClick={closePaymentForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Payment schedule */}
      {payments.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Payments
          </div>
          {payments.map(payment => (
            <div key={payment.id} style={{ borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
              <div
                className="flex-between"
                style={{
                  padding: '8px 0',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span className={payment.status === 'paid' ? 'text-accent' : ''}>
                    ${payment.amount}
                  </span>
                  <span className="text-muted"> · {payment.due_date}</span>
                  <span className="text-muted"> · {payment.status}</span>
                </div>
                {payment.status === 'paid' ? (
                  <span className="text-accent" style={{ fontSize: '0.8rem' }}>✓ Paid</span>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => onMarkPaid(payment.id)}
                    disabled={saving}
                  >
                    Mark Paid
                  </button>
                )}
              </div>
              <div className="flex-gap" style={{ marginBottom: '8px' }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => startEditPayment(payment)}
                  disabled={saving}
                  style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                >
                  Edit Payment
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => setConfirmDeletePaymentId(payment.id)}
                  disabled={saving}
                  style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                >
                  Delete Payment
                </button>
              </div>
              {confirmDeletePaymentId === payment.id && (
                <div style={{
                  padding: '8px',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '8px',
                  fontSize: '0.8rem',
                }}>
                  <p style={{ color: 'var(--danger)', marginBottom: '8px' }}>Delete this scheduled payment?</p>
                  <div className="flex-gap">
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => onDeletePayment(collection.id, payment.id)}
                      disabled={saving}
                      style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                    >
                      Confirm
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setConfirmDeletePaymentId(null)}
                      disabled={saving}
                      style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
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
