'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  // Re-render token; bumping it forces React to mount a fresh subtree.
  recoveryKey: number
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Top-level error boundary for the app.
 *
 * Why this exists: when a screen crashes during a view transition (typical
 * symptom: a blank blue page that "fixes itself" on refresh), without a
 * boundary React unmounts the entire tree and leaves only the body
 * background colour visible. The boundary catches the crash, shows a
 * meaningful error UI, and lets the user recover without a full reload.
 *
 * It's a class component because that's still the only way to use
 * componentDidCatch — no functional alternative exists.
 */
export class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryKey: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log loudly so we can see the original stack trace in production browsers.
    console.error('[AppErrorBoundary] React tree crashed:', error)
    console.error('[AppErrorBoundary] Component stack:', errorInfo.componentStack)
    this.setState({ errorInfo })
  }

  handleRecover = () => {
    // Reset the error state and bump the recovery key so React re-mounts the
    // children fresh. If the underlying state still triggers the same crash
    // we'll just show the boundary again — no infinite loop because the user
    // has to click the button.
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryKey: prev.recoveryKey + 1,
    }))
  }

  handleHardReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const message = this.state.error.message || String(this.state.error)
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900/80 p-6 text-center shadow-xl backdrop-blur">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-2 ring-amber-500/40">
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              The app hit an unexpected error. Try reopening the screen — your data is safe.
            </p>

            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 text-left">
              <p className="font-mono text-[11px] leading-relaxed text-amber-300/90 break-words">
                {message}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleRecover}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-[#4338CA]"
              >
                <RefreshCw className="h-4 w-4" />
                Reload screen
              </button>
              <button
                type="button"
                onClick={this.handleHardReload}
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
              >
                Hard refresh
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Bumping recoveryKey on every recovery forces a fresh subtree mount, so
    // any stale state inside the previously-broken screen is discarded.
    return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>
  }
}
