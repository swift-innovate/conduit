import { useAppStore } from "../../stores/app-store";
import { Wifi, WifiOff, DollarSign } from "lucide-react";
import { formatCost } from "../../lib/utils";

export function Header() {
  const { health, sessions } = useAppStore();

  // Aggregate cost across all sessions in current project
  const totalCost = sessions.reduce((sum, s) => sum + (s.total_cost_usd || 0), 0);
  const totalTokens = sessions.reduce((sum, s) => sum + (s.total_input_tokens || 0) + (s.total_output_tokens || 0), 0);

  return (
    <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {health ? (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <Wifi className="w-3.5 h-3.5" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <WifiOff className="w-3.5 h-3.5" />
            Disconnected
          </span>
        )}

        {health && (
          <span className="text-xs text-muted-foreground">
            {health.checks.active_sessions} active session{health.checks.active_sessions !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Cost visibility */}
        {sessions.length > 0 && totalCost > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" title="Total project cost">
              <DollarSign className="w-3 h-3" />
              {formatCost(totalCost)}
            </span>
            <span title="Total tokens">
              {totalTokens.toLocaleString()} tok
            </span>
          </div>
        )}

      </div>
    </header>
  );
}
