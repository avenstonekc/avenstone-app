import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        padding: 24, fontFamily: 'monospace', maxWidth: 800, margin: '40px auto',
        background: '#FEF2F2', border: '2px solid #EF4444', borderRadius: 8,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#991B1B', marginBottom: 12 }}>
          React crash caught — copy this and paste it to Claude
        </div>
        <div style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 16, fontWeight: 600 }}>
          {error.toString()}
        </div>
        <pre style={{
          fontSize: 11, color: '#374151', background: '#fff',
          border: '1px solid #FECACA', borderRadius: 4,
          padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: 400, overflowY: 'auto',
        }}>
          {info?.componentStack || 'No component stack available'}
        </pre>
        <button
          onClick={() => this.setState({ error: null, info: null })}
          style={{
            marginTop: 16, padding: '8px 18px', background: '#0A1F44', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          Dismiss and retry
        </button>
      </div>
    );
  }
}
