import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'
import DebtCard from '../components/DebtCard'

export default function Collections() {
  const [collections, setCollections] = useState([])
  const [payments, setPayments] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCollections()
  }, [])

  async function loadCollections() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: collData } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')

    const { data: payData } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date')

    // Group payments by collection_id
    const grouped = {}
    for (const p of (payData || [])) {
      if (!grouped[p.collection_id]) grouped[p.collection_id] = []
      grouped[p.collection_id].push(p)
    }

    setCollections(collData || [])
    setPayments(grouped)
    setLoading(false)
  }

  async function handleMarkPaid(paymentId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get Supabase URL from the client
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const { data: { session } } = await supabase.auth.getSession()

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/mark-paid`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_id: paymentId,
          user_id: user.id,
        }),
      })

      if (res.ok) {
        // Reload data
        await loadCollections()
      }
    } catch (err) {
      console.error('Failed to mark paid:', err)
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  // Calculate totals
  const totalOriginal = collections.reduce((s, c) => s + parseFloat(c.original_balance), 0)
  const totalRemaining = collections.reduce((s, c) => s + parseFloat(c.current_balance), 0)
  const totalPaid = totalOriginal - totalRemaining
  const pct = totalOriginal > 0 ? ((totalPaid / totalOriginal) * 100).toFixed(1) : 0

  return (
    <div>
      <div className="page-header">
        <h1>📋 Collections</h1>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="flex-between mb-8">
          <span className="text-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Progress
          </span>
          <span className="mono text-accent" style={{ fontWeight: 700 }}>{pct}%</span>
        </div>
        <ProgressBar percent={parseFloat(pct)} />
        <div className="flex-between mt-8" style={{ fontSize: '0.85rem' }}>
          <span><span className="text-muted">Remaining:</span> <span className="amount text-danger">${totalRemaining.toFixed(2)}</span></span>
          <span><span className="text-muted">Paid:</span> <span className="amount text-accent">${totalPaid.toFixed(2)}</span></span>
        </div>
      </div>

      {/* Debt Cards */}
      {collections.length === 0 ? (
        <div className="empty-state">
          <h3>No collections tracked yet</h3>
          <p>Add your first debt to start tracking.</p>
        </div>
      ) : (
        collections.map(collection => (
          <DebtCard
            key={collection.id}
            collection={collection}
            payments={payments[collection.id] || []}
            onMarkPaid={handleMarkPaid}
          />
        ))
      )}
    </div>
  )
}
