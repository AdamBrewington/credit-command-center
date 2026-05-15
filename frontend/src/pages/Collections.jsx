import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'
import DebtCard from '../components/DebtCard'

const COLLECTION_STATUS_OPTIONS = ['unpaid', 'active_plan', 'settled', 'paid', 'disputed', 'waiting']
const PAYMENT_FREQUENCY_OPTIONS = ['weekly', 'biweekly', 'monthly', 'one_time']
const MANUAL_PAYMENT_STATUS_OPTIONS = ['unpaid', 'late', 'skipped']

const EMPTY_COLLECTION_FORM = {
  account_name: '',
  original_creditor: '',
  collector: '',
  original_balance: '',
  current_balance: '',
  settlement_amount: '',
  discount_percent: '',
  payment_plan_length: '',
  payment_amount: '',
  payment_frequency: 'monthly',
  next_payment_date: '',
  status: 'unpaid',
  expected_report_behavior: '',
  notes: '',
  proof_uploaded: false,
  sort_order: '',
}

function moneyOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value)
}

function intOrNull(value) {
  return value === '' || value === null || value === undefined ? null : parseInt(value, 10)
}

function collectionToForm(collection) {
  return {
    account_name: collection.account_name || '',
    original_creditor: collection.original_creditor || '',
    collector: collection.collector || '',
    original_balance: collection.original_balance ?? '',
    current_balance: collection.current_balance ?? '',
    settlement_amount: collection.settlement_amount ?? '',
    discount_percent: collection.discount_percent ?? '',
    payment_plan_length: collection.payment_plan_length ?? '',
    payment_amount: collection.payment_amount ?? '',
    payment_frequency: collection.payment_frequency || 'monthly',
    next_payment_date: collection.next_payment_date || '',
    status: collection.status || 'unpaid',
    expected_report_behavior: collection.expected_report_behavior || '',
    notes: collection.notes || '',
    proof_uploaded: Boolean(collection.proof_uploaded),
    sort_order: collection.sort_order ?? '',
  }
}

function buildCollectionPayload(form) {
  return {
    account_name: form.account_name.trim(),
    original_creditor: form.original_creditor.trim() || null,
    collector: form.collector.trim() || null,
    original_balance: Number(form.original_balance),
    current_balance: Number(form.current_balance),
    settlement_amount: moneyOrNull(form.settlement_amount),
    discount_percent: moneyOrNull(form.discount_percent),
    payment_plan_length: intOrNull(form.payment_plan_length),
    payment_amount: moneyOrNull(form.payment_amount),
    payment_frequency: form.payment_frequency,
    next_payment_date: form.next_payment_date || null,
    status: form.status,
    expected_report_behavior: form.expected_report_behavior.trim() || null,
    notes: form.notes.trim() || null,
    proof_uploaded: form.proof_uploaded,
    sort_order: intOrNull(form.sort_order) ?? 0,
  }
}

function validateCollection(form) {
  if (!form.account_name.trim()) return 'Account name is required.'
  if (form.original_balance === '' || Number(form.original_balance) < 0) return 'Original balance must be 0 or more.'
  if (form.current_balance === '' || Number(form.current_balance) < 0) return 'Current balance must be 0 or more.'
  if (form.settlement_amount !== '' && Number(form.settlement_amount) < 0) return 'Settlement amount must be 0 or more.'
  if (form.discount_percent !== '' && (Number(form.discount_percent) < 0 || Number(form.discount_percent) > 100)) return 'Discount percent must be between 0 and 100.'
  if (form.payment_plan_length !== '' && Number(form.payment_plan_length) < 0) return 'Payment count must be 0 or more.'
  if (form.payment_amount !== '' && Number(form.payment_amount) < 0) return 'Payment amount must be 0 or more.'
  return null
}

export default function Collections() {
  const [collections, setCollections] = useState([])
  const [payments, setPayments] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCollection, setEditingCollection] = useState(null)
  const [collectionForm, setCollectionForm] = useState(EMPTY_COLLECTION_FORM)

  useEffect(() => {
    loadCollections()
  }, [])

  async function loadCollections() {
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      setError('You must be signed in to manage collections.')
      return
    }

    const { data: collData, error: collError } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const { data: payData, error: payError } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: true })

    // Group payments by collection_id
    const grouped = {}
    for (const p of (payData || [])) {
      if (!grouped[p.collection_id]) grouped[p.collection_id] = []
      grouped[p.collection_id].push(p)
    }

    setCollections(collData || [])
    setPayments(grouped)
    if (collError || payError) {
      setError(collError?.message || payError?.message || 'Failed to load collections.')
    }
    setLoading(false)
  }

  function resetCollectionForm() {
    setCollectionForm(EMPTY_COLLECTION_FORM)
    setEditingCollection(null)
    setShowForm(false)
  }

  function startAddCollection() {
    setError(null)
    setNotice(null)
    setEditingCollection(null)
    setCollectionForm(EMPTY_COLLECTION_FORM)
    setShowForm(true)
  }

  function startEditCollection(collection) {
    setError(null)
    setNotice(null)
    setEditingCollection(collection)
    setCollectionForm(collectionToForm(collection))
    setShowForm(true)
  }

  function updateCollectionForm(field, value) {
    setCollectionForm(current => ({ ...current, [field]: value }))
  }

  async function handleSaveCollection(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const validationError = validateCollection(collectionForm)
    if (validationError) {
      setError(validationError)
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save collections.')
      setSaving(false)
      return
    }

    const payload = buildCollectionPayload(collectionForm)

    const result = editingCollection
      ? await supabase
        .from('collections')
        .update(payload)
        .eq('id', editingCollection.id)
        .eq('user_id', user.id)
      : await supabase
        .from('collections')
        .insert({ ...payload, user_id: user.id })

    if (result.error) {
      setError(result.error.message)
    } else {
      setNotice(editingCollection ? 'Collection updated.' : 'Collection added.')
      resetCollectionForm()
      await loadCollections()
    }

    setSaving(false)
  }

  async function handleDeleteCollection(collectionId) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to delete collections.')
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('collections')
      .delete()
      .eq('id', collectionId)
      .eq('user_id', user.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setNotice('Collection deleted.')
      await loadCollections()
    }

    setSaving(false)
  }

  async function handleSavePayment(collectionId, paymentId, paymentForm) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save payments.')
      setSaving(false)
      return { error: 'Not signed in.' }
    }

    const collection = collections.find(item => item.id === collectionId)
    if (!collection || collection.user_id !== user.id) {
      setError('Collection not found for your account.')
      setSaving(false)
      return { error: 'Collection not found.' }
    }

    if (paymentForm.amount === '' || Number(paymentForm.amount) <= 0) {
      setError('Payment amount must be greater than 0.')
      setSaving(false)
      return { error: 'Payment amount must be greater than 0.' }
    }

    if (!paymentForm.due_date) {
      setError('Payment due date is required.')
      setSaving(false)
      return { error: 'Payment due date is required.' }
    }

    const paymentStatus = MANUAL_PAYMENT_STATUS_OPTIONS.includes(paymentForm.status) ? paymentForm.status : 'unpaid'
    const payload = {
      amount: Number(paymentForm.amount),
      due_date: paymentForm.due_date,
      status: paymentStatus,
      paid_date: null,
      confirmation_number: paymentForm.confirmation_number?.trim() || null,
      notes: paymentForm.notes?.trim() || null,
    }

    const result = paymentId
      ? await supabase
        .from('payments')
        .update(payload)
        .eq('id', paymentId)
        .eq('user_id', user.id)
        .eq('collection_id', collectionId)
      : await supabase
        .from('payments')
        .insert({
          ...payload,
          user_id: user.id,
          collection_id: collectionId,
        })

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return { error: result.error.message }
    }

    setNotice(paymentId ? 'Payment updated.' : 'Payment added.')
    await loadCollections()
    setSaving(false)
    return { error: null }
  }

  async function handleDeletePayment(collectionId, paymentId) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to delete payments.')
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
      .eq('collection_id', collectionId)
      .eq('user_id', user.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setNotice('Payment deleted.')
      await loadCollections()
    }

    setSaving(false)
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
        setNotice('Payment marked paid.')
        await loadCollections()
      } else {
        const details = await res.json().catch(() => ({}))
        setError(details.error || 'Failed to mark payment paid.')
      }
    } catch (err) {
      console.error('Failed to mark paid:', err)
      setError('Failed to mark payment paid.')
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
        <div className="flex-between">
          <h1>📋 Collections</h1>
          <button className="btn btn-primary" onClick={startAddCollection} disabled={saving}>
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
              <div className="card-title">{editingCollection ? 'Edit Collection' : 'Add Collection'}</div>
              <div className="card-subtitle">Balances, settlement terms, and reporting notes</div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={resetCollectionForm} disabled={saving}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleSaveCollection}>
            <div className="form-group">
              <label>Account name</label>
              <input
                value={collectionForm.account_name}
                onChange={(event) => updateCollectionForm('account_name', event.target.value)}
                placeholder="Resurgent 3956"
                required
              />
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Original balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.original_balance}
                  onChange={(event) => updateCollectionForm('original_balance', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Current balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.current_balance}
                  onChange={(event) => updateCollectionForm('current_balance', event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Collector</label>
                <input
                  value={collectionForm.collector}
                  onChange={(event) => updateCollectionForm('collector', event.target.value)}
                  placeholder="Collector name"
                />
              </div>
              <div className="form-group">
                <label>Original creditor</label>
                <input
                  value={collectionForm.original_creditor}
                  onChange={(event) => updateCollectionForm('original_creditor', event.target.value)}
                  placeholder="Original creditor"
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Settlement amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.settlement_amount}
                  onChange={(event) => updateCollectionForm('settlement_amount', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Discount percent</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={collectionForm.discount_percent}
                  onChange={(event) => updateCollectionForm('discount_percent', event.target.value)}
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Payment count</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={collectionForm.payment_plan_length}
                  onChange={(event) => updateCollectionForm('payment_plan_length', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Payment amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectionForm.payment_amount}
                  onChange={(event) => updateCollectionForm('payment_amount', event.target.value)}
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Frequency</label>
                <select
                  value={collectionForm.payment_frequency}
                  onChange={(event) => updateCollectionForm('payment_frequency', event.target.value)}
                >
                  {PAYMENT_FREQUENCY_OPTIONS.map(option => (
                    <option key={option} value={option}>{option.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Next payment date</label>
                <input
                  type="date"
                  value={collectionForm.next_payment_date}
                  onChange={(event) => updateCollectionForm('next_payment_date', event.target.value)}
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Status</label>
                <select
                  value={collectionForm.status}
                  onChange={(event) => updateCollectionForm('status', event.target.value)}
                >
                  {COLLECTION_STATUS_OPTIONS.map(option => (
                    <option key={option} value={option}>{option.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Sort order</label>
                <input
                  type="number"
                  step="1"
                  value={collectionForm.sort_order}
                  onChange={(event) => updateCollectionForm('sort_order', event.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Expected report behavior</label>
              <input
                value={collectionForm.expected_report_behavior}
                onChange={(event) => updateCollectionForm('expected_report_behavior', event.target.value)}
                placeholder="Should be removed after paid"
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows="3"
                value={collectionForm.notes}
                onChange={(event) => updateCollectionForm('notes', event.target.value)}
                placeholder="Negotiation notes, proof details, payoff plan"
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={collectionForm.proof_uploaded}
                onChange={(event) => updateCollectionForm('proof_uploaded', event.target.checked)}
                style={{ width: 'auto' }}
              />
              Proof uploaded
            </label>

            <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editingCollection ? 'Save Collection' : 'Add Collection')}
            </button>
          </form>
        </div>
      )}

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
            onEditCollection={startEditCollection}
            onDeleteCollection={handleDeleteCollection}
            onSavePayment={handleSavePayment}
            onDeletePayment={handleDeletePayment}
            saving={saving}
          />
        ))
      )}
    </div>
  )
}
