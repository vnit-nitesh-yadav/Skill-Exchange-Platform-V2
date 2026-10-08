import React from 'react';
import useMetrics from '../hooks/useMetrics';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

const LiveMetrics = () => {
  const m = useMetrics();
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 max-w-md" aria-live="polite">
      <style>{`
        .live-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#34d399; margin-right:6px; box-shadow:0 0 0 0 rgba(52,211,153,.7); animation: live-pulse 1.8s infinite; }
        @keyframes live-pulse { 70% { box-shadow:0 0 0 8px rgba(52,211,153,0); } 100% { box-shadow:0 0 0 0 rgba(52,211,153,0); } }
      `}</style>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color: 'var(--mint-500)' }}>{fmt(m?.totalUsers)}</div>
        <div className="text-xs feature-sub">Members joined</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color: 'var(--mint-500)' }}>{fmt(m?.onlineUsers)}</div>
        <div className="text-xs feature-sub"><span className="live-dot" />Online now</div>
      </div>
    </div>
  );
};

export default LiveMetrics;
