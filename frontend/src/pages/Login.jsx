import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email for a confirmation link.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 24px',
      maxWidth: '400px',
      margin: '0 auto',
    }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
          <span className="text-accent">⚡</span> Credit Command
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          {isSignUp ? 'Create your account' : 'Sign in to your dashboard'}
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#ff475722',
          border: '1px solid #ff475744',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--danger)',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {message && (
        <div style={{
          padding: '12px',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--accent)',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          {message}
        </div>
      )}

      <div>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={handleSubmit}
          disabled={loading}
          style={{ marginTop: '8px' }}
        >
          {loading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Sign In')}
        </button>

        <button
          className="btn btn-secondary btn-full"
          onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
          style={{ marginTop: '10px' }}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
    </div>
  )
}
