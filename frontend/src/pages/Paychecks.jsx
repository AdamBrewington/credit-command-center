import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Paychecks() {
  const [paychecks, setPaychecks] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const sixtyDaysOut = new Date()
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60)

    const { data: payData } = await supabase
      .from('paychecks')
      .select('*')
      .eq('user_id', user.id)
      .gte('pay_date', today)
      .lte('pay_date', sixtyDaysOut.toISOString().split('T')[0])
      .order('pay_date')

    const { data: billData } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .order('priority')

    setPaychecks(payData || [])
    setBills(billData || [])
    setLoading(false)
  }

  function getBillsForPaycheck(paycheckLabel) {
    return bills.filter(b => b.assigned_paycheck_label === paycheckLabel)
  }

  function daysFromNow(dateStr) {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    return `${diff} days`
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <h1>💰 Paychecks</h1>
      </div>

      {paychecks.length === 0 ? (
        <div className="empty-state">
          <h3>No upcoming paychecks</h3>
          <p>Add your paycheck schedule to see checklists here.</p>
        </div>
      ) : (
        paychecks.map(paycheck => {
          const assignedBills = getBillsForPaycheck(paycheck.paycheck_label)
          const totalBills = assignedBills.reduce((s, b) => s + parseFloat(b.amount), 0)
          const leftover = paycheck.expected_amount ? paycheck.expected_amount - totalBills : null

          return (
            <div className="card" key={paycheck.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{paycheck.paycheck_label}</div>
                  <div className="card-subtitle">{paycheck.pay_date} · {daysFromNow(paycheck.pay_date)}</div>
                </div>
                {paycheck.expected_amount && (
                  <div className="amount-large text-accent" style={{ fontSize: '1.3rem' }}>
                    ${paycheck.expected_amount}
                  </div>
                )}
              </div>

              {/* Bills assigned to this paycheck */}
              {assignedBills.length > 0 ? (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Bills & Obligations
                  </div>
                  {assignedBills.map(bill => (
                    <div
                      key={bill.id}
                      className="flex-between"
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <span>{bill.bill_name}</span>
                        {bill.autopay && <span className="text-muted" style={{ fontSize: '0.75rem' }}> (autopay)</span>}
                        {bill.pay_method && (
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}> via {bill.pay_method}</span>
                        )}
                      </div>
                      <span className="amount">${bill.amount}</span>
                    </div>
                  ))}

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
      {bills.filter(b => !b.assigned_paycheck_label).length > 0 && (
        <>
          <h2 className="mb-8" style={{ marginTop: '24px' }}>Unassigned Bills</h2>
          {bills.filter(b => !b.assigned_paycheck_label).map(bill => (
            <div className="card" key={bill.id}>
              <div className="flex-between">
                <div>
                  <div className="card-title">{bill.bill_name}</div>
                  <div className="card-subtitle">{bill.category} · Due day {bill.due_day}</div>
                </div>
                <span className="amount">${bill.amount}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
