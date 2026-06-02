import { ProblemList } from './ProblemList'
import { ProblemDetail } from './ProblemDetail'
import { AISidebar } from './AISidebar'
import { useProblemStore } from '../../stores/problemStore'

export function ProblemsView() {
  const listCollapsed = useProblemStore((s) => s.listCollapsed)
  const aiPanelOpen = useProblemStore((s) => s.aiPanelOpen)

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {!listCollapsed && <ProblemList />}
      <ProblemDetail />
      {aiPanelOpen && <AISidebar />}
    </div>
  )
}
