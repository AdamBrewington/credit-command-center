export default function ProgressBar({ percent = 0, variant = 'default' }) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100)

  const variantClass = variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : ''

  return (
    <div className="progress-container">
      <div
        className={`progress-bar ${variantClass}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  )
}
