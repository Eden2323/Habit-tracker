import { useStore } from '../../lib/store'
import type { DateKey } from '../../lib/types'
import { DayGrid } from './DayGrid'
import { StatsDashboard } from './StatsDashboard'
import './progress.css'

export default function ProgressView({ onSelectDate }: { onSelectDate: (date: DateKey) => void }) {
  const { state, today } = useStore()
  const attempt = state.current

  return (
    <div className="pg">
      <DayGrid attempt={attempt} today={today} onSelectDate={onSelectDate} />
      <StatsDashboard attempt={attempt} today={today} />
    </div>
  )
}
