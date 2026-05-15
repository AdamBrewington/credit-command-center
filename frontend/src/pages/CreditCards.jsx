import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'

const EMPTY_CARD_FORM = {
  card_name: '',
  issuer: '',
  credit_limit: '',
  current_balance: '0',
  annual_fee: '0',
  apr: '',
  statement_close_day: '',
  due_date_day: '',
  target_reported_balance_low: '0',
  target_reported_balance_high: '',
  autopay_enabled: false,
  rewards_categories: '',
  allowed_uses: '',
  forbidden_uses: '',
  notes: '',
}

function numberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value)
}

function numberOrZero(value) {
  return value === '' || value === null || value === undefined ? 0 : Number(value)
}

function dayOrNull(value) {
  return value === '' || value === null || value === undefined ? null : parseInt(value, 10)
}

function cardToForm(card) {
  return {
    card_name: card.card_name || '',
    issuer: card.issuer || '',
    credit_limit: card.credit_limit ?? '',
    current_balance: card.current_balance ?? '0',
    annual_fee: card.annual_fee ?? '0',
    apr: card.apr ?? '',
    statement_close_day: card.statement_close_day ?? '',
    due_date_day: card.due_date_day ?? '',
    target_reported_balance_low: card.target_reported_balance_low ?? '0',
    target_reported_balance_high: card.target_reported_balance_high ?? '',
    autopay_enabled: Boolean(card.autopay_enabled),
    rewards_categories: card.rewards_categories || '',
    allowed_uses: card.allowed_uses || '',
    forbidden_uses: card.forbidden_uses || '',
    notes: card.notes || '',
  }
}

function buildCardPayload(form) {
  return {
    card_name: form.card_name.trim(),
    issuer: form.issuer.trim() || null,
    credit_limit: Number(form.credit_limit),
    current_balance: numberOrZero(form.current_balance),
    annual_fee: numberOrZero(form.annual_fee),
    apr: numberOrNull(form.apr),
    statement_close_day: dayOrNull(form.statement_close_day),
    due_date_day: dayOrNull(form.due_date_day),
    target_reported_balance_low: numberOrZero(form.target_reported_balance_low),
    target_reported_balance_high: numberOrNull(form.target_reported_balance_high),
    autopay_enabled: form.autopay_enabled,
    rewards_categories: form.rewards_categories.trim() || null,
    allowed_uses: form.allowed_uses.trim() || null,
    forbidden_uses: form.forbidden_uses.trim() || null,
    notes: form.notes.trim() || null,
  }
}

function validateCard(form) {
  const closeDay = dayOrNull(form.statement_close_day)
  const dueDay = dayOrNull(form.due_date_day)

  if (!form.card_name.trim()) return 'Card name is required.'
  if (form.credit_limit === '' || Number(form.credit_limit) <= 0) return 'Credit limit must be greater than 0.'
  if (form.current_balance === '' || Number(form.current_balance) < 0) return 'Current balance must be 0 or more.'
  if (form.annual_fee !== '' && Number(form.annual_fee) < 0) return 'Annual fee must be 0 or more.'
  if (form.apr !== '' && Number(form.apr) < 0) return 'APR must be 0 or more.'
  if (!closeDay || closeDay < 1 || closeDay > 31) return 'Statement close day must be between 1 and 31.'
  if (!dueDay || dueDay < 1 || dueDay > 31) return 'Due date day must be between 1 and 31.'
  if (form.target_reported_balance_low !== '' && Number(form.target_reported_balance_low) < 0) return 'Target low balance must be 0 or more.'
  if (form.target_reported_balance_high !== '' && Number(form.target_reported_balance_high) < 0) return 'Target high balance must be 0 or more.'
  if (
    form.target_reported_balance_high !== '' &&
    Number(form.target_reported_balance_low || 0) > Number(form.target_reported_balance_high)
  ) {
    return 'Target low balance cannot be higher than target high balance.'
  }

  return null
}

export default function CreditCards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [cardForm, setCardForm] = useState(EMPTY_CARD_FORM)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    loadCards()
  }, [])

  async function loadCards() {
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setCards([])
      setLoading(false)
      setError('You must be signed in to manage credit cards.')
      return
    }

    const { data, error: loadError } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      setCards([])
    } else {
      setCards(data || [])
    }

    setLoading(false)
  }

  function getLastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate()
  }

  function getNextDayOfMonth(dayOfMonth, fromDate = new Date()) {
    const requestedDay = Number(dayOfMonth)
    const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
    const thisMonthDay = Math.min(requestedDay, getLastDayOfMonth(today.getFullYear(), today.getMonth()))
    const thisMonthDate = new Date(today.getFullYear(), today.getMonth(), thisMonthDay)

    if (thisMonthDate >= today) return thisMonthDate

    const nextMonth = today.getMonth() + 1
    const nextMonthYear = today.getFullYear() + Math.floor(nextMonth / 12)
    const nextMonthIndex = nextMonth % 12
    const nextMonthDay = Math.min(requestedDay, getLastDayOfMonth(nextMonthYear, nextMonthIndex))
    return new Date(nextMonthYear, nextMonthIndex, nextMonthDay)
  }

  function getDaysUntil(dayOfMonth) {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const nextDate = getNextDayOfMonth(dayOfMonth, startOfToday)
    return Math.ceil((nextDate - startOfToday) / (1000 * 60 * 60 * 24))
  }

  function updateCardForm(field, value) {
    setCardForm(current => ({ ...current, [field]: value }))
  }

  function resetCardForm() {
    setCardForm(EMPTY_CARD_FORM)
    setEditingCard(null)
    setShowForm(false)
  }

  function startAddCard() {
    setError(null)
    setNotice(null)
    setConfirmDeleteId(null)
    setEditingCard(null)
    setCardForm(EMPTY_CARD_FORM)
    setShowForm(true)
  }

  function startEditCard(card) {
    setError(null)
    setNotice(null)
    setConfirmDeleteId(null)
    setEditingCard(card)
    setCardForm(cardToForm(card))
    setShowForm(true)
  }

  async function handleSaveCard(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const validationError = validateCard(cardForm)
    if (validationError) {
      setError(validationError)
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save credit cards.')
      setSaving(false)
      return
    }

    const payload = buildCardPayload(cardForm)
    const result = editingCard
      ? await supabase
        .from('credit_cards')
        .update(payload)
        .eq('id', editingCard.id)
        .eq('user_id', user.id)
      : await supabase
        .from('credit_cards')
        .insert({ ...payload, user_id: user.id })

    if (result.error) {
      setError(result.error.message)
    } else {
      setNotice(editingCard ? 'Credit card updated.' : 'Credit card added.')
      resetCardForm()
      await loadCards()
    }

    setSaving(false)
  }

  async function handleDeleteCard(cardId) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to delete credit cards.')
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('credit_cards')
      .delete()
      .eq('id', cardId)
      .eq('user_id', user.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setNotice('Credit card deleted.')
      setConfirmDeleteId(null)
      await loadCards()
    }

    setSaving(false)
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <h1>💳 Credit Cards</h1>
          <button className="btn btn-primary" type="button" onClick={startAddCard} disabled={saving}>
            Add
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="card" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: '0.85rem' }}>
          {notice}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">{editingCard ? 'Edit Credit Card' : 'Add Credit Card'}</div>
              <div className="card-subtitle">Limit, balance, dates, targets, and usage rules</div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={resetCardForm} disabled={saving}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleSaveCard}>
            <div className="form-group">
              <label>Card name</label>
              <input
                value={cardForm.card_name}
                onChange={(event) => updateCardForm('card_name', event.target.value)}
                placeholder="Credit One X5"
                required
              />
            </div>

            <div className="form-group">
              <label>Issuer</label>
              <input
                value={cardForm.issuer}
                onChange={(event) => updateCardForm('issuer', event.target.value)}
                placeholder="Credit One"
              />
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Credit limit</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cardForm.credit_limit}
                  onChange={(event) => updateCardForm('credit_limit', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Current balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.current_balance}
                  onChange={(event) => updateCardForm('current_balance', event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Annual fee</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.annual_fee}
                  onChange={(event) => updateCardForm('annual_fee', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>APR</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.apr}
                  onChange={(event) => updateCardForm('apr', event.target.value)}
                  placeholder="29.99"
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Statement close day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={cardForm.statement_close_day}
                  onChange={(event) => updateCardForm('statement_close_day', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Due date day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={cardForm.due_date_day}
                  onChange={(event) => updateCardForm('due_date_day', event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Target low</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.target_reported_balance_low}
                  onChange={(event) => updateCardForm('target_reported_balance_low', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Target high</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.target_reported_balance_high}
                  onChange={(event) => updateCardForm('target_reported_balance_high', event.target.value)}
                  placeholder="Defaults to 9%"
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={cardForm.autopay_enabled}
                onChange={(event) => updateCardForm('autopay_enabled', event.target.checked)}
                style={{ width: 'auto' }}
              />
              Autopay enabled
            </label>

            <div className="form-group">
              <label>Rewards categories</label>
              <input
                value={cardForm.rewards_categories}
                onChange={(event) => updateCardForm('rewards_categories', event.target.value)}
                placeholder="Gas, groceries, streaming"
              />
            </div>

            <div className="form-group">
              <label>Allowed uses</label>
              <textarea
                rows="2"
                value={cardForm.allowed_uses}
                onChange={(event) => updateCardForm('allowed_uses', event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Forbidden uses</label>
              <textarea
                rows="2"
                value={cardForm.forbidden_uses}
                onChange={(event) => updateCardForm('forbidden_uses', event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows="3"
                value={cardForm.notes}
                onChange={(event) => updateCardForm('notes', event.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editingCard ? 'Save Credit Card' : 'Add Credit Card')}
            </button>
          </form>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="empty-state">
          <h3>No cards tracked yet</h3>
          <p>Add your credit cards to track utilization.</p>
        </div>
      ) : (
        cards.map(card => {
          const creditLimit = Number(card.credit_limit) || 0
          const currentBalance = Number(card.current_balance) || 0
          const util = creditLimit > 0
            ? ((currentBalance / creditLimit) * 100).toFixed(1)
            : 0
          const targetHigh = card.target_reported_balance_high || creditLimit * 0.09
          const payDown = Math.max(0, currentBalance - targetHigh)
          const daysToClose = getDaysUntil(card.statement_close_day)
          const daysToDue = getDaysUntil(card.due_date_day)

          return (
            <div className="card" key={card.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{card.card_name}</div>
                  <div className="card-subtitle">{card.issuer || 'No issuer set'}</div>
                </div>
                <span className={`mono ${parseFloat(util) > 9 ? 'text-danger' : 'text-accent'}`} style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {util}%
                </span>
              </div>

              <div className="flex-gap mb-16">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => startEditCard(card)}
                  disabled={saving}
                  style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => setConfirmDeleteId(card.id)}
                  disabled={saving}
                  style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                >
                  Delete
                </button>
              </div>

              {confirmDeleteId === card.id && (
                <div style={{
                  padding: '10px',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '12px',
                  fontSize: '0.85rem',
                }}>
                  <p style={{ color: 'var(--danger)', marginBottom: '10px' }}>
                    Delete this credit card?
                  </p>
                  <div className="flex-gap">
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => handleDeleteCard(card.id)}
                      disabled={saving}
                      style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                    >
                      Confirm Delete
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={saving}
                      style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Utilization bar */}
              <ProgressBar
                percent={Math.min(parseFloat(util), 100)}
                variant={parseFloat(util) > 30 ? 'danger' : parseFloat(util) > 9 ? 'warning' : 'default'}
              />

              <div className="flex-between mt-8" style={{ fontSize: '0.85rem' }}>
                <span className="amount">${currentBalance.toFixed(2)}</span>
                <span className="text-muted">/ ${creditLimit.toFixed(2)} limit</span>
              </div>

              {/* Key dates */}
              <div className="stats-row mt-16">
                <div className="stat-box">
                  <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                    <span className={daysToClose <= 5 ? 'text-warning' : ''}>{daysToClose}d</span>
                  </div>
                  <div className="stat-label">Statement Close</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                    <span className={daysToDue <= 3 ? 'text-danger' : ''}>{daysToDue}d</span>
                  </div>
                  <div className="stat-label">Due Date</div>
                </div>
              </div>

              {/* Target balance & pay-down */}
              <div style={{
                padding: '10px',
                background: payDown > 0 ? '#ff9f1c11' : 'var(--accent-dim)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
              }}>
                {payDown > 0 ? (
                  <span className="text-warning">
                    Pay <span className="amount">${payDown.toFixed(2)}</span> before statement closes to hit target
                  </span>
                ) : (
                  <span className="text-accent">
                    Target balance: ${card.target_reported_balance_low || 0}–${Number(targetHigh).toFixed(0)} ✓ On track
                  </span>
                )}
              </div>

              {/* Allowed / forbidden */}
              {(card.rewards_categories || card.allowed_uses || card.forbidden_uses || card.notes) && (
                <div style={{ marginTop: '10px', fontSize: '0.78rem' }}>
                  {card.rewards_categories && (
                    <p style={{ color: 'var(--info)', marginBottom: '4px' }}>
                      Rewards: {card.rewards_categories}
                    </p>
                  )}
                  {card.allowed_uses && (
                    <p style={{ color: 'var(--accent)', marginBottom: '4px' }}>
                      ✓ Use for: {card.allowed_uses}
                    </p>
                  )}
                  {card.forbidden_uses && (
                    <p style={{ color: 'var(--danger)', marginBottom: '4px' }}>
                      ✗ Never: {card.forbidden_uses}
                    </p>
                  )}
                  {card.notes && (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {card.notes}
                    </p>
                  )}
                </div>
              )}

              {(card.annual_fee > 0 || card.apr || card.autopay_enabled) && (
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {card.annual_fee > 0 && <span>Annual fee: ${card.annual_fee} </span>}
                  {card.apr && <span>APR: {card.apr}% </span>}
                  {card.autopay_enabled && <span className="text-accent">Autopay on</span>}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
