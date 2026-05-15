import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'

export default function CreditCards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCards()
  }, [])

  async function loadCards() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', user.id)

    setCards(data || [])
    setLoading(false)
  }

  function getDaysUntil(dayOfMonth) {
    const today = new Date()
    const currentDay = today.getDate()
    let diff = dayOfMonth - currentDay
    if (diff < 0) diff += 30
    return diff
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <h1>💳 Credit Cards</h1>
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <h3>No cards tracked yet</h3>
          <p>Add your credit cards to track utilization.</p>
        </div>
      ) : (
        cards.map(card => {
          const util = card.credit_limit > 0
            ? ((card.current_balance / card.credit_limit) * 100).toFixed(1)
            : 0
          const targetHigh = card.target_reported_balance_high || card.credit_limit * 0.09
          const payDown = Math.max(0, card.current_balance - targetHigh)
          const daysToClose = getDaysUntil(card.statement_close_day)
          const daysToDue = getDaysUntil(card.due_date_day)

          return (
            <div className="card" key={card.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{card.card_name}</div>
                  <div className="card-subtitle">{card.issuer}</div>
                </div>
                <span className={`mono ${parseFloat(util) > 9 ? 'text-danger' : 'text-accent'}`} style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {util}%
                </span>
              </div>

              {/* Utilization bar */}
              <ProgressBar
                percent={Math.min(parseFloat(util), 100)}
                variant={parseFloat(util) > 30 ? 'danger' : parseFloat(util) > 9 ? 'warning' : 'default'}
              />

              <div className="flex-between mt-8" style={{ fontSize: '0.85rem' }}>
                <span className="amount">${card.current_balance}</span>
                <span className="text-muted">/ ${card.credit_limit} limit</span>
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
                    Target balance: ${card.target_reported_balance_low || 0}–${targetHigh.toFixed(0)} ✓ On track
                  </span>
                )}
              </div>

              {/* Allowed / forbidden */}
              {(card.allowed_uses || card.forbidden_uses) && (
                <div style={{ marginTop: '10px', fontSize: '0.78rem' }}>
                  {card.allowed_uses && (
                    <p style={{ color: 'var(--accent)', marginBottom: '4px' }}>
                      ✓ Use for: {card.allowed_uses}
                    </p>
                  )}
                  {card.forbidden_uses && (
                    <p style={{ color: 'var(--danger)' }}>
                      ✗ Never: {card.forbidden_uses}
                    </p>
                  )}
                </div>
              )}

              {/* Annual fee */}
              {card.annual_fee > 0 && (
                <p style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Annual fee: ${card.annual_fee}
                </p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
