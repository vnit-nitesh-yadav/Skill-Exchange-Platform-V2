import { useEffect, useState } from 'react';
import axios from '../lib/http';
import API_URL from '../api';
import { socket } from '../socket';

// Live "total joined" and "online now" numbers.
// First paint comes from GET /api/metrics; afterwards the server pushes `metrics` events over Socket.IO.
export default function useMetrics() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/metrics`).then((r) => { if (!cancelled) setMetrics(r.data); }).catch(() => {});

    const onMetrics = (m) => setMetrics(m);
    socket.on('metrics', onMetrics);
    return () => { cancelled = true; socket.off('metrics', onMetrics); };
  }, []);

  return metrics;
}
