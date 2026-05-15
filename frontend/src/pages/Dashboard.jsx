import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [cards, setCards] = useState([])
  const [nextPayments, setNextPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Collections summary
    const { data: summaryData } = await supabase
      .from('collections_summary')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Credit card utilization
    const { data: cardData } = await supabase
      .from('card_utilization')
      .select('*')
      .eq('user_id', user.id)

    // Next 3 upcoming payments
    const today = new Date().toISOString().split('T')[0]
    const { data: paymentData } = await supabase
      .from('payments')
      .select('*, collections(account_name)')
      .eq('user_id', user.id)
      .eq('status', 'unpaid')
      .gte('due_date', today)
      .order('due_date')
      .limit(3)

    setSummary(summaryData)
    setCards(cardData || [])
    setNextPayments(paymentData || [])
    setLoading(false)
  }

  if (loading) return <div className="loading">Loading...</div>

  const pct = summary?.percent_complete || 0

  return (
    <div>
      <div className="page-header">
        <h1><span className="text-accent">⚡</span> Command Center</h1>
      </div>

      {/* Progress Overview */}
      <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: '1px' }}>
        <div className="flex-between mb-8">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Debt Cleanup Progress
          </span>
          <span className="mono text-accent" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {pct}%
          </span>
        </div>
        <ProgressBar percent={pct} />
        <div className="stats-row mt-16">
          <div className="stat-box">
            <div className="stat-value text-danger">${summary?.total_remaining?.toFixed(2) || '0.00'}</div>
            <div className="stat-label">Remaining</div>
          </div>
          <div className="stat-box">
            <div className="stat-value text-accent">${summary?.total_paid?.toFixed(2) || '0.00'}</div>
            <div className="stat-label">Paid Off</div>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-value">{summary?.accounts_cleared || 0}/{summary?.total_accounts || 0}</div>
            <div className="stat-label">Accounts Cleared</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">${summary?.smallest_remaining?.toFixed(2) || '—'}</div>
            <div className="stat-label">Smallest Win</div>
          </div>
        </div>
      </div>

      {/* Next Actions */}
      <h2 className="mb-8" style={{ marginTop: '24px' }}>Next Up</h2>
      {nextPayments.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)' }}>No upcoming payments. You're clear.</p>
        </div>
      ) : (
        nextPayments.map(payment => (
          <div className="card" key={payment.id}>
            <div className="flex-between">
              <div>
                <div className="card-title">{payment.collections?.account_name}</div>
                <div className="card-subtitle">Due {payment.due_date}</div>
              </div>
              <div className="amount text-warning">${payment.amount}</div>
            </div>
          </div>
        ))
      )}

      {/* Card Status */}
      {cards.length > 0 && (
        <>
          <h2 className="mb-8" style={{ marginTop: '24px' }}>Card Utilization</h2>
          {cards.map(card => (
            <div className="card" key={card.id}>
              <div className="flex-between mb-8">
                <div className="card-title">{card.card_name}</div>
                <span className={`mono ${card.utilization_percent > 9 ? 'text-danger' : 'text-accent'}`} style={{ fontWeight: 600 }}>
                  {card.utilization_percent}%
                </span>
              </div>
              <ProgressBar
                percent={Math.min(card.utilization_percent, 100)}
                variant={card.utilization_percent > 30 ? 'danger' : card.utilization_percent > 9 ? 'warning' : 'default'}
              />
              <div className="flex-between mt-8" style={{ fontSize: '0.8rem' }}>
                <span className="text-muted">${card.current_balance} / ${card.credit_limit}</span>
                {card.amount_to_pay_down > 0 && (
                  <span className="text-warning">Pay down ${card.amount_to_pay_down}</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
