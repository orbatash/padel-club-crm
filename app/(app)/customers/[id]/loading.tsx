import { Panel, PanelGrid } from '@/components/ui/primitives'
import { CustomerResultsSkeleton } from '@/components/customers/customer-results'

export default function CustomerLoading() {
  return (
    <PanelGrid>
      <Panel title="פרטי קשר" span={6}>
        <CustomerResultsSkeleton />
      </Panel>
      <Panel title="פרופיל" span={6}>
        <CustomerResultsSkeleton />
      </Panel>
    </PanelGrid>
  )
}
