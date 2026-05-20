import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configure agents, API keys, and notification preferences.
        </p>
      </div>

      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Account</h2>
        <p className="mt-2 text-sm text-text-secondary">Manage your Dark Recon account settings.</p>
        <Button variant="secondary" size="sm" className="mt-4" disabled>
          Edit Profile
        </Button>
      </Card>

      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Agent Configuration</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Configure scan intervals, risk thresholds, and alert rules.
        </p>
        <Button variant="secondary" size="sm" className="mt-4" disabled>
          Configure Agents
        </Button>
      </Card>

      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">API Integrations</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Polygon, EDGAR, and Anthropic API connections.
        </p>
        <Button variant="secondary" size="sm" className="mt-4" disabled>
          Manage API Keys
        </Button>
      </Card>
    </div>
  );
}
