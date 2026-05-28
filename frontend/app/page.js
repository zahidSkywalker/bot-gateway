'use client';
import { useState, useEffect } from 'react';
import './globals.css';

const API_URL = typeof window !== 'undefined' 
  ? (window.location.origin + '/api/v1')
  : '/api/v1';

// Get admin password from localStorage or prompt
function getAdminPassword() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('bg_admin_pass') || '';
}

function setAdminPassword(pass) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('bg_admin_pass', pass);
}

// API helper with admin auth
async function api(endpoint, options = {}) {
  const pass = getAdminPassword();
  if (!pass && !options.noAuth) {
    const entered = prompt('Enter admin password:');
    if (!entered) throw new Error('Authentication required');
    setAdminPassword(entered);
    return api(endpoint, options);
  }
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (pass) {
    headers['x-admin-password'] = pass;
  }
  
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  
  if (res.status === 401) {
    sessionStorage.removeItem('bg_admin_pass');
    const entered = prompt('Admin password incorrect. Try again:');
    if (!entered) throw new Error('Authentication failed');
    setAdminPassword(entered);
    return api(endpoint, options);
  }
  
  return res;
}

// ============================================
// Sidebar Component
// ============================================
function Sidebar({ activePage, setActivePage }) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'tokens', label: 'Token Manager', icon: '🔑' },
    { id: 'bots', label: 'Bot Monitor', icon: '🤖' },
    { id: 'channels', label: 'Channels', icon: '💬' },
    { id: 'messages', label: 'Messages', icon: '📨' },
    { id: 'audit', label: 'Audit Log', icon: '📋' },
  ];
  
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ Bot Gateway</h1>
        <span>v1.0.0 — Control Panel</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <a 
            key={item.id}
            href={`#${item.id}`}
            className={activePage === item.id ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); setActivePage(item.id); }}
          >
            <span>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

// ============================================
// Overview Page
// ============================================
function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    async function load() {
      try {
        const [statsRes, healthRes] = await Promise.all([
          api('/stats'),
          fetch(`${API_URL}/health`).then(r => r.json())
        ]);
        setStats(await statsRes.json());
        setHealth(healthRes);
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);
  
  if (!stats) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  
  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.stats.totalTokens}</div>
          <div className="stat-label">Total Tokens</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color: 'var(--success)'}}>{stats.stats.onlineBots}</div>
          <div className="stat-label">Online Bots</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color: 'var(--info)'}}>{stats.stats.activeChannels}</div>
          <div className="stat-label">Active Channels</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.stats.totalMessages}</div>
          <div className="stat-label">Total Messages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color: 'var(--warning)'}}>{stats.stats.websocketConnections}</div>
          <div className="stat-label">WS Connections</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.stats.totalActions}</div>
          <div className="stat-label">Audit Actions</div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h2>Server Health</h2>
          <span className="badge badge-success">
            {health?.status === 'ok' ? 'Healthy' : 'Unknown'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <span className="stat-label">Version</span>
            <div style={{fontSize: '14px'}}>{health?.version}</div>
          </div>
          <div>
            <span className="stat-label">Uptime</span>
            <div style={{fontSize: '14px'}} className="mono">{Math.floor(health?.uptime || 0)}s</div>
          </div>
          <div>
            <span className="stat-label">Last Check</span>
            <div style={{fontSize: '14px'}} className="mono">{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '-'}</div>
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h2>Quick Start</h2>
        </div>
        <div style={{fontSize: '14px', lineHeight: '1.8'}}>
          <p style={{color: 'var(--text-secondary)', marginBottom: '12px'}}>Connect a bot using WebSocket:</p>
          <div className="token-display mono" style={{fontSize: '12px'}}>
            wss://your-domain.com/gateway?token=bg_YOUR_TOKEN_HERE
          </div>
          <p style={{color: 'var(--text-secondary)', marginTop: '16px', marginBottom: '8px'}}>Or send messages via REST:</p>
          <div className="token-display mono" style={{fontSize: '12px'}}>
            POST /api/v1/messages{'\n'}
            Authorization: Bearer bg_YOUR_TOKEN_HERE{'\n'}
            {'{'}&quot;channel&quot;: &quot;general&quot;, &quot;content&quot;: &quot;Hello!&quot;{'}'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Token Manager Page
// ============================================
function TokensPage() {
  const [tokens, setTokens] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [form, setForm] = useState({ name: '', permissions: { read: true, write: false, admin: false }, expires_in_days: '' });
  
  async function loadTokens() {
    try {
      const res = await api('/tokens');
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err) {
      console.error(err);
    }
  }
  
  useEffect(() => { loadTokens(); }, []);
  
  async function createToken() {
    try {
      const body = { name: form.name, permissions: form.permissions };
      if (form.expires_in_days) body.expires_in_days = parseInt(form.expires_in_days);
      
      const res = await api('/tokens/generate', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      
      if (data.success) {
        setNewToken(data.token);
        setTokens(prev => [data.token_data, ...prev]);
        setShowCreate(false);
        setForm({ name: '', permissions: { read: true, write: false, admin: false }, expires_in_days: '' });
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to create token: ' + err.message);
    }
  }
  
  async function revokeToken(id) {
    if (!confirm('Revoke this token? Connected bots will be disconnected.')) return;
    try {
      await api(`/tokens/${id}`, { method: 'DELETE' });
      setTokens(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }
  
  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>API Tokens</h2>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Generate Token</button>
        </div>
        
        {newToken && (
          <div className="token-display" style={{marginBottom: '20px'}}>
            {newToken}
            <div className="warning">⚠ Copy this token NOW. It will never be shown again.</div>
            <button className="btn btn-ghost" style={{marginTop: '8px'}} onClick={() => {
              navigator.clipboard.writeText(newToken);
            }}>Copy to Clipboard</button>
            <button className="btn btn-ghost" style={{marginTop: '8px', marginLeft: '8px'}} onClick={() => setNewToken(null)}>Dismiss</button>
          </div>
        )}
        
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id}>
                  <td style={{fontWeight: 500}}>{t.name}</td>
                  <td className="mono" style={{fontSize: '12px'}}>{t.key_prefix}</td>
                  <td>
                    <span className={`badge ${t.permissions.admin ? 'badge-danger' : t.permissions.write ? 'badge-warning' : 'badge-info'}`}>
                      {t.permissions.admin ? 'admin' : t.permissions.write ? 'read+write' : 'read'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${t.is_active ? 'badge-success' : 'badge-muted'}`}>
                      {t.is_active ? 'active' : 'revoked'}
                    </span>
                  </td>
                  <td style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                    {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'never'}
                  </td>
                  <td style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    {t.is_active && (
                      <button className="btn btn-danger" style={{padding: '4px 10px', fontSize: '11px'}} onClick={() => revokeToken(t.id)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {tokens.length === 0 && (
                <tr><td colSpan={7}><div className="empty-state">No tokens generated yet</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Generate New Token</h3>
            <div className="form-group">
              <label>Token Name</label>
              <input className="input" placeholder="e.g., My Chat Bot" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="checkbox-group">
                <label><input type="checkbox" checked={form.permissions.read} disabled /> Read</label>
                <label><input type="checkbox" checked={form.permissions.write} onChange={e => setForm({...form, permissions: {...form.permissions, write: e.target.checked}})} /> Write</label>
                <label><input type="checkbox" checked={form.permissions.admin} onChange={e => setForm({...form, permissions: {...form.permissions, admin: e.target.checked}})} /> Admin</label>
              </div>
            </div>
            <div className="form-group">
              <label>Expires In (days, optional)</label>
              <input className="input" type="number" placeholder="Leave blank for no expiry" value={form.expires_in_days} onChange={e => setForm({...form, expires_in_days: e.target.value})} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createToken}>Generate Token</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Bots Page (simplified — same pattern)
// ============================================
function BotsPage() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      try {
        const res = await api('/bots');
        const data = await res.json();
        setBots(data.bots || []);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, []);
  
  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  
  return (
    <div className="card">
      <div className="card-header"><h2>Connected Bots</h2></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Token</th><th>Messages</th><th>Last Seen</th></tr></thead>
          <tbody>
            {bots.map(b => (
              <tr key={b.id}>
                <td style={{fontWeight: 500}}>{b.name}</td>
                <td><span className={`badge ${b.status === 'online' ? 'badge-success' : 'badge-muted'}`}>{b.status}</span></td>
                <td className="mono" style={{fontSize: '12px'}}>{b.tokens?.key_prefix || '-'}</td>
                <td>{b.message_count || 0}</td>
                <td style={{fontSize: '12px', color: 'var(--text-muted)'}}>{b.last_seen_at ? new Date(b.last_seen_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {bots.length === 0 && <tr><td colSpan={5}><div className="empty-state">No bots registered yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// Channels Page
// ============================================
function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  
  async function load() {
    try {
      // Use admin endpoint
      const res = await api('/channels');
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (err) { console.error(err); }
  }
  
  useEffect(() => { load(); }, []);
  
  async function createChannel() {
    try {
      const res = await api('/channels', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setForm({ name: '', description: '' });
        load();
      } else alert(data.error);
    } catch (err) { alert('Failed: ' + err.message); }
  }
  
  async function deleteChannel(id) {
    if (!confirm('Delete this channel and all its messages?')) return;
    try {
      await api(`/channels/${id}`, { method: 'DELETE' });
      setChannels(prev => prev.filter(c => c.id !== id));
    } catch (err) { alert('Failed: ' + err.message); }
  }
  
  return (
    <div className="card">
      <div className="card-header"><h2>Channels</h2><button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Channel</button></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Description</th><th>Messages</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {channels.map(c => (
              <tr key={c.id}>
                <td style={{fontWeight: 500}}>#{c.name}</td>
                <td style={{color: 'var(--text-secondary)'}}>{c.description || '-'}</td>
                <td>{c.message_count || 0}</td>
                <td style={{fontSize: '12px', color: 'var(--text-muted)'}}>{new Date(c.created_at).toLocaleDateString()}</td>
                <td>{c.name !== 'general' && <button className="btn btn-danger" style={{padding: '4px 10px', fontSize: '11px'}} onClick={() => deleteChannel(c.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Channel</h3>
            <div className="form-group"><label>Channel Name</label><input className="input" placeholder="e.g., random" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="form-group"><label>Description</label><input className="input" placeholder="Optional description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createChannel}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Messages Page
// ============================================
function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      try {
        // Get messages from general channel
        const res = await api('/channels');
        const data = await res.json();
        const channels = data.channels || [];
        
        if (channels.length > 0) {
          const msgRes = await api(`/messages/${channels[0].id}`);
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);
  
  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  
  return (
    <div className="card">
      <div className="card-header"><h2>Message Feed</h2><span className="badge badge-muted">Auto-refreshing every 5s</span></div>
      {messages.length === 0 ? (
        <div className="empty-state">No messages yet. Connect a bot to start receiving messages.</div>
      ) : (
        messages.map(m => (
          <div className="message-item" key={m.id}>
            <div className="message-meta">
              <span className="bot-name">{m.bot_name}</span>
              <span className="badge badge-muted">{m.source}</span>
              <span className="timestamp">{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <div className="message-content">{m.content}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================
// Audit Log Page
// ============================================
function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      try {
        const supaUrl = 'https://iprzxslxipmkivhxupce.supabase.co';
        const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwcnp4c2x4aXBta2l2aHh1cGNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ1NDY3MywiZXhwIjoyMDk1MDMwNjczfQ.uQ43loTJ1oQhKqty735v-v0HehGehc0_CoMHxTcozHg';
        const res = await fetch(`${supaUrl}/rest/v1/audit_log?select=*&order=created_at.desc&limit=100`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
        });
        const data = await res.json();
        setLogs(data || []);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, []);
  
  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;
  
  return (
    <div className="card">
      <div className="card-header"><h2>Audit Log</h2></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td className="mono" style={{fontSize: '11px'}}>{new Date(l.created_at).toLocaleString()}</td>
                <td><span className="badge badge-info">{l.action}</span></td>
                <td>{l.actor}</td>
                <td className="mono" style={{fontSize: '11px', color: 'var(--text-muted)'}}>{l.detail ? JSON.stringify(l.detail) : '-'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4}><div className="empty-state">No audit events yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// Main App
// ============================================
export default function Home() {
  const [activePage, setActivePage] = useState('overview');
  
  const pages = {
    overview: OverviewPage,
    tokens: TokensPage,
    bots: BotsPage,
    channels: ChannelsPage,
    messages: MessagesPage,
    audit: AuditPage
  };
  
  const Page = pages[activePage] || OverviewPage;
  
  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <main className="main-content">
        <Page />
      </main>
    </div>
  );
}
