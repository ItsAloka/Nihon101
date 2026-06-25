// ErrorBoundary.jsx — per-island crash guard. A render error in one island used
// to white-screen just that island with no fallback; now it shows a small,
// theme-aware "couldn't load · reload" card and reports the crash. Wrap an
// island's default export with `withBoundary(Comp, "name")`.
import React from "react";
import { reportClientError } from "./report.js";

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    reportClientError(err, { boundary: this.props.name || "island", stack: info && info.componentStack });
  }
  render() {
    if (this.state.err) {
      const jp = this.props.locale === "ja";
      return (
        <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--fontBody)", color: "var(--inkSoft)",
          border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)" }}>
          <div style={{ fontSize: 13.5 }}>{jp ? "この部分を読み込めませんでした。" : "This part couldn’t load."}</div>
          <button onClick={() => location.reload()} style={{ marginTop: 12, appearance: "none", cursor: "pointer",
            border: "1px solid var(--line)", background: "var(--surface2)", borderRadius: 999, padding: "8px 18px",
            fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {jp ? "再読み込み" : "Reload"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function withBoundary(Comp, name) {
  function Bounded(props) {
    return (
      <ErrorBoundary name={name} locale={props.locale}>
        <Comp {...props} />
      </ErrorBoundary>
    );
  }
  Bounded.displayName = `Bounded(${name || Comp.displayName || Comp.name || "Island"})`;
  return Bounded;
}
