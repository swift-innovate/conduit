import { useAppStore } from "../../stores/app-store";
import {
  Activity,
  Server,
  Layers,
  Shield,
  Clock,
  Database,
  Terminal,
  Tag,
} from "lucide-react";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const statusConfig = {
  healthy: { label: "System Healthy", dotClass: "bg-green-400", bgClass: "bg-green-400/10 border-green-400/20 text-green-300" },
  degraded: { label: "System Degraded", dotClass: "bg-yellow-400", bgClass: "bg-yellow-400/10 border-yellow-400/20 text-yellow-300" },
  unhealthy: { label: "System Unhealthy", dotClass: "bg-red-400", bgClass: "bg-red-400/10 border-red-400/20 text-red-300" },
};

export function SystemHealth() {
  const { health } = useAppStore();

  if (!health) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Unable to connect to Conduit server
      </div>
    );
  }

  const checks = health.checks;
  const cfg = statusConfig[health.status] ?? statusConfig.unhealthy;

  const cards = [
    { label: "Projects", value: checks.projects, icon: Layers, color: "text-blue-400" },
    { label: "Active Sessions", value: checks.active_sessions, icon: Activity, color: "text-green-400" },
    { label: "Max Sessions", value: checks.max_sessions, icon: Server, color: "text-yellow-400" },
    { label: "Event Subscribers", value: checks.event_subscribers, icon: Shield, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${cfg.bgClass}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.dotClass} animate-pulse`} />
          <span className="font-medium">{cfg.label}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {/* Uptime */}
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatUptime(checks.uptime_seconds)}
          </span>
          {/* Version */}
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            v{checks.version}
          </span>
        </div>
      </div>

      {/* Infrastructure indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CLI status */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">CLI Status</span>
            <Terminal className={`w-4 h-4 ${checks.cli_available ? "text-green-400" : "text-red-400"}`} />
          </div>
          <p className={`text-lg font-bold mt-2 ${checks.cli_available ? "text-green-400" : "text-red-400"}`}>
            {checks.cli_available ? "Available" : "Unavailable"}
          </p>
        </div>

        {/* DB status */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Database</span>
            <Database className={`w-4 h-4 ${checks.database_ok ? "text-green-400" : "text-red-400"}`} />
          </div>
          <p className={`text-lg font-bold mt-2 ${checks.database_ok ? "text-green-400" : "text-red-400"}`}>
            {checks.database_ok ? "OK" : "Error"}
          </p>
        </div>

        {/* Session capacity */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Session Capacity</span>
            <Server className={`w-4 h-4 ${checks.session_capacity_pct > 80 ? "text-yellow-400" : "text-green-400"}`} />
          </div>
          <div className="mt-2">
            <p className="text-lg font-bold">{checks.session_capacity_pct}%</p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  checks.session_capacity_pct > 80
                    ? "bg-yellow-400"
                    : checks.session_capacity_pct > 50
                      ? "bg-blue-400"
                      : "bg-green-400"
                }`}
                style={{ width: `${Math.min(checks.session_capacity_pct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Permission mode */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Permissions</span>
            <Shield className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-lg font-bold mt-2 text-green-400">Auto-allow</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
