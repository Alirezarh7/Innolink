import { useState } from "react";
import type { CostEntry } from "../types";

export default function CostTracker() {
  const [costs] = useState<CostEntry[]>([]);

  const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
  const freeCalls = costs.filter((c) => c.provider === "ollama").length;
  const paidCalls = costs.filter((c) => c.provider === "claude").length;

  return (
    <div className="cost-tracker">
      <h3>Cost Tracker</h3>
      <div className="cost-summary">
        <p>Total: ${totalCost.toFixed(4)}</p>
        <p>Free (Ollama): {freeCalls} calls</p>
        <p>Paid (Claude): {paidCalls} calls</p>
      </div>
    </div>
  );
}
