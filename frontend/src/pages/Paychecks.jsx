import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const EMPTY_PAYCHECK_FORM = {
  paycheck_label: '',
  pay_date: '',
  expected_amount: '',
  actual_amount: '',
  is_recurring: true,
  recurrence_rule: '',
  notes: '',
}

const EMPTY_BILL_FORM = {
  bill_name: '',
  amount: '',
  due_day: '',
  due_date: '',
  is_recurring: true,
  autopay: false,
  pay_method: '',
  category: '',
  priority: '5',
  assigned_paycheck_label: '',
  notes: '',
}

function numberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value)
}

function numberOrZero(value) {
  return value === '' || value === null || value === undefined ? 0 : Number(value)
}

function intOrNull(value) {
  return value === '' || value === null || value === undefined ? null : parseInt(value, 10)
}

function isValidDate(value) {
  if (!value) return false
  const [year, month, day] = value.split('-').map(part => parseInt(part, 10))
  const date = new Date(`${value}T00:00:00`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function paycheckToForm(paycheck) {
  return {
    paycheck_label: paycheck.paycheck_label || '',
    pay_date: paycheck.pay_date || '',
    expected_amount: paycheck.expected_amount ?? '',
    actual_amount: paycheck.actual_amount ?? '',
    is_recurring: Boolean(paycheck.is_recurring),
    recurrence_rule: paycheck.recurrence_rule || '',
    notes: paycheck.notes || '',
  }
}

function billToForm(bill) {
  return {
    bill_name: bill.bill_name || '',
    amount: bill.amount ?? '',
    due_day: bill.due_day ?? '',
    due_date: bill.due_date || '',
    is_recurring: Boolean(bill.is_recurring),
    autopay: Boolean(bill.autopay),
    pay_method: bill.pay_method || '',
    category: bill.category || '',
    priority: bill.priority ?? '5',
    assigned_paycheck_label: bill.assigned_paycheck_label || '',
    notes: bill.notes || '',
  }
}

function buildPaycheckPayload(form) {
  return {
    paycheck_label: form.paycheck_label.trim(),
    pay_date: form.pay_date,
    expected_amount: numberOrNull(form.expected_amount),
    actual_amount: numberOrNull(form.actual_amount),
    is_recurring: form.is_recurring,
    recurrence_rule: form.recurrence_rule.trim() || null,
    notes: form.notes.trim() || null,
  }
}

function buildBillPayload(form) {
  return {
    bill_name: form.bill_name.trim(),
    amount: numberOrZero(form.amount),
    due_day: intOrNull(form.due_day),
    due_date: form.due_date || null,
    is_recurring: form.is_recurring,
    autopay: form.autopay,
    pay_method: form.pay_method.trim() || null,
    category: form.category.trim() || null,
    priority: intOrNull(form.priority) ?? 5,
    assigned_paycheck_label: form.assigned_paycheck_label.trim() || null,
    notes: form.notes.trim() || null,
  }
}

function validatePaycheck(form) {
  if (!form.paycheck_label.trim()) return 'Paycheck label is required.'
  if (!isValidDate(form.pay_date)) return 'Pay date is required and must be valid.'
  if (form.expected_amount !== '' && Number(form.expected_amount) < 0) return 'Expected amount must be 0 or more.'
  if (form.actual_amount !== '' && Number(form.actual_amount) < 0) return 'Actual amount must be 0 or more.'
  return null
}

function validateBill(form) {
  const dueDay = intOrNull(form.due_day)

  if (!form.bill_name.trim()) return 'Bill name is required.'
  if (form.amount === '' || Number(form.amount) < 0) return 'Bill amount must be 0 or more.'
  if (form.due_day !== '' && (!dueDay || dueDay < 1 || dueDay > 31)) return 'Due day must be between 1 and 31.'
  if (form.due_date && !isValidDate(form.due_date)) return 'Due date must be valid.'
  if (form.priority !== '' && Number(form.priority) < 0) return 'Priority must be 0 or more.'
  return null
}

export default function Paychecks() {
  const [paychecks, setPaychecks] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [formType, setFormType] = useState(null)
  const [editingPaycheck, setEditingPaycheck] = useState(null)
  const [editingBill, setEditingBill] = useState(null)
  const [paycheckForm, setPaycheckForm] = useState(EMPTY_PAYCHECK_FORM)
  const [billForm, setBillForm] = useState(EMPTY_BILL_FORM)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPaychecks([])
      setBills([])
      setLoading(false)
      setError('You must be signed in to manage paychecks and bills.')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const sixtyDaysOut = new Date()
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60)

    const { data: payData, error: payError } = await supabase
      .from('paychecks')
      .select('*')
      .eq('user_id', user.id)
      .gte('pay_date', today)
      .lte('pay_date', sixtyDaysOut.toISOString().split('T')[0])
      .order('pay_date')

    const { data: billData, error: billError } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .order('priority')
      .order('bill_name')

    setPaychecks(payData || [])
    setBills(billData || [])
    if (payError || billError) {
      setError(payError?.message || billError?.message || 'Failed to load paycheck data.')
    }
    setLoading(false)
  }

  function getBillsForPaycheck(paycheckLabel) {
    return bills.filter(b => b.assigned_paycheck_label === paycheckLabel)
  }

  function daysFromNow(dateStr) {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const targetDate = new Date(`${dateStr}T00:00:00`)
    const diff = Math.ceil((targetDate - startOfToday) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    if (diff < 0) return `${Math.abs(diff)} days ago`
    return `${diff} days`
  }

  function updatePaycheckForm(field, value) {
    setPaycheckForm(current => ({ ...current, [field]: value }))
  }

  function updateBillForm(field, value) {
    setBillForm(current => ({ ...current, [field]: value }))
  }

  function resetForms() {
    setFormType(null)
    setEditingPaycheck(null)
    setEditingBill(null)
    setPaycheckForm(EMPTY_PAYCHECK_FORM)
    setBillForm(EMPTY_BILL_FORM)
  }

  function startAddPaycheck() {
    setError(null)
    setNotice(null)
    setConfirmDelete(null)
    setEditingPaycheck(null)
    setPaycheckForm(EMPTY_PAYCHECK_FORM)
    setFormType('paycheck')
  }

  function startEditPaycheck(paycheck) {
    setError(null)
    setNotice(null)
    setConfirmDelete(null)
    setEditingPaycheck(paycheck)
    setPaycheckForm(paycheckToForm(paycheck))
    setFormType('paycheck')
  }

  function startAddBill(assignedPaycheckLabel = '') {
    setError(null)
    setNotice(null)
    setConfirmDelete(null)
    setEditingBill(null)
    setBillForm({ ...EMPTY_BILL_FORM, assigned_paycheck_label: assignedPaycheckLabel })
    setFormType('bill')
  }

  function startEditBill(bill) {
    setError(null)
    setNotice(null)
    setConfirmDelete(null)
    setEditingBill(bill)
    setBillForm(billToForm(bill))
    setFormType('bill')
  }

  async function handleSavePaycheck(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const validationError = validatePaycheck(paycheckForm)
    if (validationError) {
      setError(validationError)
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save paychecks.')
      setSaving(false)
      return
    }

    const payload = buildPaycheckPayload(paycheckForm)
    const result = editingPaycheck
      ? await supabase
        .from('paychecks')
        .update(payload)
        .eq('id', editingPaycheck.id)
        .eq('user_id', user.id)
      : await supabase
        .from('paychecks')
        .insert({ ...payload, user_id: user.id })

    if (result.error) {
      setError(result.error.message)
    } else {
      setNotice(editingPaycheck ? 'Paycheck updated.' : 'Paycheck added.')
      resetForms()
      await loadData()
    }

    setSaving(false)
  }

  async function handleSaveBill(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const validationError = validateBill(billForm)
    if (validationError) {
      setError(validationError)
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save bills.')
      setSaving(false)
      return
    }

    const payload = buildBillPayload(billForm)
    const result = editingBill
      ? await supabase
        .from('bills')
        .update(payload)
        .eq('id', editingBill.id)
        .eq('user_id', user.id)
      : await supabase
        .from('bills')
        .insert({ ...payload, user_id: user.id })

    if (result.error) {
      setError(result.error.message)
    } else {
      setNotice(editingBill ? 'Bill updated.' : 'Bill added.')
      resetForms()
      await loadData()
    }

    setSaving(false)
  }

  async function handleDeletePaycheck(paycheckId) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to delete paychecks.')
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('paychecks')
      .delete()
      .eq('id', paycheckId)
      .eq('user_id', user.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setNotice('Paycheck deleted. Bills assigned by label were not changed.')
      setConfirmDelete(null)
      await loadData()
    }

    setSaving(false)
  }

  async function handleDeleteBill(billId) {
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to delete bills.')
      setSaving(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('bills')
      .delete()
      .eq('id', billId)
      .eq('user_id', user.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setNotice('Bill deleted.')
      setConfirmDelete(null)
      await loadData()
    }

    setSaving(false)
  }

  function renderBillRow(bill) {
    return (
      <div key={bill.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
        <div className="flex-between" style={{ fontSize: '0.85rem' }}>
          <div>
            <span>{bill.bill_name}</span>
            {bill.autopay && <span className="text-muted" style={{ fontSize: '0.75rem' }}> (autopay)</span>}
            {bill.pay_method && (
              <span className="text-muted" style={{ fontSize: '0.75rem' }}> via {bill.pay_method}</span>
            )}
            {(bill.category || bill.due_day || bill.due_date) && (
              <div className="card-subtitle">
                {bill.category || 'Uncategorized'}
                {bill.due_day && ` · Due day ${bill.due_day}`}
                {bill.due_date && ` · ${bill.due_date}`}
              </div>
            )}
          </div>
          <span className="amount">${Number(bill.amount).toFixed(2)}</span>
        </div>
        <div className="flex-gap" style={{ marginTop: '8px' }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => startEditBill(bill)}
            disabled={saving}
            style={{ padding: '6px 10px', fontSize: '0.72rem' }}
          >
            Edit Bill
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => setConfirmDelete({ type: 'bill', id: bill.id })}
            disabled={saving}
            style={{ padding: '6px 10px', fontSize: '0.72rem' }}
          >
            Delete Bill
          </button>
        </div>
        {confirmDelete?.type === 'bill' && confirmDelete.id === bill.id && (
          <div style={{
            padding: '8px',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            marginTop: '8px',
            fontSize: '0.8rem',
          }}>
            <p style={{ color: 'var(--danger)', marginBottom: '8px' }}>Delete this bill?</p>
            <div className="flex-gap">
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => handleDeleteBill(bill.id)}
                disabled={saving}
                style={{ padding: '6px 10px', fontSize: '0.72rem' }}
              >
                Confirm
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={saving}
                style={{ padding: '6px 10px', fontSize: '0.72rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="loading">Loading...</div>

  const unassignedBills = bills.filter(b => !b.assigned_paycheck_label)

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <h1>💰 Paychecks</h1>
          <div className="flex-gap">
            <button className="btn btn-secondary" type="button" onClick={() => startAddBill()} disabled={saving}>
              Bill
            </button>
            <button className="btn btn-primary" type="button" onClick={startAddPaycheck} disabled={saving}>
              Paycheck
            </button>
          </div>
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

      {formType === 'paycheck' && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">{editingPaycheck ? 'Edit Paycheck' : 'Add Paycheck'}</div>
              <div className="card-subtitle">Label, date, expected amount, and recurrence notes</div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={resetForms} disabled={saving}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleSavePaycheck}>
            <div className="form-group">
              <label>Paycheck label</label>
              <input
                value={paycheckForm.paycheck_label}
                onChange={(event) => updatePaycheckForm('paycheck_label', event.target.value)}
                placeholder="Payday A"
                required
              />
            </div>

            <div className="form-group">
              <label>Pay date</label>
              <input
                type="date"
                value={paycheckForm.pay_date}
                onChange={(event) => updatePaycheckForm('pay_date', event.target.value)}
                required
              />
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Expected amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paycheckForm.expected_amount}
                  onChange={(event) => updatePaycheckForm('expected_amount', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Actual amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paycheckForm.actual_amount}
                  onChange={(event) => updatePaycheckForm('actual_amount', event.target.value)}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={paycheckForm.is_recurring}
                onChange={(event) => updatePaycheckForm('is_recurring', event.target.checked)}
                style={{ width: 'auto' }}
              />
              Recurring paycheck
            </label>

            <div className="form-group">
              <label>Recurrence rule</label>
              <input
                value={paycheckForm.recurrence_rule}
                onChange={(event) => updatePaycheckForm('recurrence_rule', event.target.value)}
                placeholder="biweekly_friday"
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows="3"
                value={paycheckForm.notes}
                onChange={(event) => updatePaycheckForm('notes', event.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editingPaycheck ? 'Save Paycheck' : 'Add Paycheck')}
            </button>
          </form>
        </div>
      )}

      {formType === 'bill' && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">{editingBill ? 'Edit Bill' : 'Add Bill'}</div>
              <div className="card-subtitle">Amount, due timing, payment method, and paycheck assignment</div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={resetForms} disabled={saving}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleSaveBill}>
            <div className="form-group">
              <label>Bill name</label>
              <input
                value={billForm.bill_name}
                onChange={(event) => updateBillForm('bill_name', event.target.value)}
                placeholder="Internet"
                required
              />
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={billForm.amount}
                  onChange={(event) => updateBillForm('amount', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={billForm.priority}
                  onChange={(event) => updateBillForm('priority', event.target.value)}
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Due day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={billForm.due_day}
                  onChange={(event) => updateBillForm('due_day', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label>One-time due date</label>
                <input
                  type="date"
                  value={billForm.due_date}
                  onChange={(event) => updateBillForm('due_date', event.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Assigned paycheck label</label>
              <input
                list="paycheck-labels"
                value={billForm.assigned_paycheck_label}
                onChange={(event) => updateBillForm('assigned_paycheck_label', event.target.value)}
                placeholder="Payday A"
              />
              <datalist id="paycheck-labels">
                {paychecks.map(paycheck => (
                  <option key={paycheck.id} value={paycheck.paycheck_label} />
                ))}
              </datalist>
              <p style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Current schema assigns bills by matching this label to a paycheck label.
              </p>
            </div>

            <div className="stats-row">
              <div className="form-group">
                <label>Pay method</label>
                <input
                  value={billForm.pay_method}
                  onChange={(event) => updateBillForm('pay_method', event.target.value)}
                  placeholder="bank"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  value={billForm.category}
                  onChange={(event) => updateBillForm('category', event.target.value)}
                  placeholder="utilities"
                />
              </div>
            </div>

            <div className="stats-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  checked={billForm.is_recurring}
                  onChange={(event) => updateBillForm('is_recurring', event.target.checked)}
                  style={{ width: 'auto' }}
                />
                Recurring
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  checked={billForm.autopay}
                  onChange={(event) => updateBillForm('autopay', event.target.checked)}
                  style={{ width: 'auto' }}
                />
                Autopay
              </label>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows="3"
                value={billForm.notes}
                onChange={(event) => updateBillForm('notes', event.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editingBill ? 'Save Bill' : 'Add Bill')}
            </button>
          </form>
        </div>
      )}

      {paychecks.length === 0 ? (
        <div className="empty-state">
          <h3>No upcoming paychecks</h3>
          <p>Add your paycheck schedule to see checklists here.</p>
        </div>
      ) : (
        paychecks.map(paycheck => {
          const assignedBills = getBillsForPaycheck(paycheck.paycheck_label)
          const totalBills = assignedBills.reduce((s, b) => s + parseFloat(b.amount), 0)
          const expectedAmount = paycheck.expected_amount === null || paycheck.expected_amount === undefined
            ? null
            : Number(paycheck.expected_amount)
          const leftover = expectedAmount !== null ? expectedAmount - totalBills : null

          return (
            <div className="card" key={paycheck.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{paycheck.paycheck_label}</div>
                  <div className="card-subtitle">{paycheck.pay_date} · {daysFromNow(paycheck.pay_date)}</div>
                </div>
                {paycheck.expected_amount !== null && paycheck.expected_amount !== undefined && (
                  <div className="amount-large text-accent" style={{ fontSize: '1.3rem' }}>
                    ${Number(paycheck.expected_amount).toFixed(2)}
                  </div>
                )}
              </div>

              <div className="flex-gap mb-16">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => startEditPaycheck(paycheck)}
                  disabled={saving}
                  style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => startAddBill(paycheck.paycheck_label)}
                  disabled={saving}
                  style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                >
                  Add Bill
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => setConfirmDelete({ type: 'paycheck', id: paycheck.id })}
                  disabled={saving}
                  style={{ padding: '8px 12px', fontSize: '0.78rem', marginLeft: 'auto' }}
                >
                  Delete
                </button>
              </div>

              {confirmDelete?.type === 'paycheck' && confirmDelete.id === paycheck.id && (
                <div style={{
                  padding: '10px',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '12px',
                  fontSize: '0.85rem',
                }}>
                  <p style={{ color: 'var(--danger)', marginBottom: '10px' }}>
                    Delete this paycheck? Bills assigned by label will remain.
                  </p>
                  <div className="flex-gap">
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => handleDeletePaycheck(paycheck.id)}
                      disabled={saving}
                      style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                    >
                      Confirm Delete
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      disabled={saving}
                      style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Bills assigned to this paycheck */}
              {assignedBills.length > 0 ? (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Bills & Obligations
                  </div>
                  {assignedBills.map(bill => renderBillRow(bill))}

                  {/* Totals */}
                  <div style={{ marginTop: '12px', paddingTop: '8px' }}>
                    <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span className="text-muted">Total obligations</span>
                      <span className="amount">${totalBills.toFixed(2)}</span>
                    </div>
                    {leftover !== null && (
                      <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                        <span className="text-muted">Remaining</span>
                        <span className={`amount ${leftover >= 0 ? 'text-accent' : 'text-danger'}`}>
                          ${leftover.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                  No bills assigned to this paycheck yet.
                </p>
              )}

              {paycheck.actual_amount !== null && paycheck.actual_amount !== undefined && (
                <p style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Actual amount: ${Number(paycheck.actual_amount).toFixed(2)}
                </p>
              )}

              {paycheck.recurrence_rule && (
                <p style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Recurrence: {paycheck.recurrence_rule}
                </p>
              )}

              {paycheck.notes && (
                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {paycheck.notes}
                </p>
              )}
            </div>
          )
        })
      )}

      {/* Unassigned bills */}
      {unassignedBills.length > 0 && (
        <>
          <h2 className="mb-8" style={{ marginTop: '24px' }}>Unassigned Bills</h2>
          {unassignedBills.map(bill => (
            <div className="card" key={bill.id}>
              {renderBillRow(bill)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
