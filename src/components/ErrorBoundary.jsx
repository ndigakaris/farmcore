// src/components/ErrorBoundary.jsx
// ─────────────────────────────────────────────────────────────
// Catches a render error in one feature screen.
//
// Without this, a single thrown exception unmounts the whole React tree
// and the farmer is left staring at a white page with no way back — and,
// because the app is a full-screen PWA, no browser chrome to recover
// with either. Their data is safe in IndexedDB; the UI just needs to say
// so and offer a way out.
// ─────────────────────────────────────────────────────────────

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[FarmCore] Screen crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-center justify-center p-6 min-h-[60vh]">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e0d0] p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-3">🌾</div>
          <h2 className="text-lg font-semibold text-[#2D5016] mb-1">
            This screen ran into a problem
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            Nothing has been lost — your records are saved on this device and
            will still sync.
          </p>
          <p className="text-xs text-gray-400 mb-6 font-mono break-words">
            {error.message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="btn btn-primary flex-1 justify-center"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-secondary flex-1 justify-center"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
