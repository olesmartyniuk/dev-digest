"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

/** Four-step indicator: completed steps show a check, the current one carries aria-current="step". */
export function Stepper({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol aria-label="Steps" style={s.stepperList}>
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <li style={s.stepItem} aria-current={i === step ? "step" : undefined}>
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                background: i < step ? "var(--ok)" : i === step ? "var(--accent)" : "var(--bg-elevated)",
                color: i <= step ? "#fff" : "var(--text-muted)",
                border: i > step ? "1px solid var(--border-strong)" : "none",
              }}
            >
              {i < step ? <Icon.Check size={13} /> : i + 1}
            </span>
            <span
              style={{
                ...s.stepLabel,
                fontWeight: i === step ? 600 : 500,
                color: i <= step ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {label}
            </span>
          </li>
          {i < labels.length - 1 && (
            <li aria-hidden="true" style={{ ...s.stepLine, background: i < step ? "var(--ok)" : "var(--border-strong)" }} />
          )}
        </React.Fragment>
      ))}
    </ol>
  );
}
