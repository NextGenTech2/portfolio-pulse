import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Bell, X, CheckCircle2, AlertTriangle, AlertCircle, Info, ExternalLink } from "lucide-react";

export default function NotificationCenter({ userId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL'); // ALL, UNREAD, HIGH

  useEffect(() => {
    if (!userId) return;
    
    fetchNotifications();
    
    // Subscribe to real-time notifications
    const channel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${userId}` 
      }, payload => {
        setNotifications(prev => [payload.new, ...prev]);
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      
      setNotifications(data || []);
      setUnreadCount(data ? data.filter(n => !n.is_read).length : 0);
    } catch (err) {
      console.error("Failed to fetch notifications:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      await supabase.from('notifications').update({ is_read: true, clicked_at: new Date().toISOString() }).eq('id', id);
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    try {
      const isUnread = notifications.find(n => n.id === id)?.is_read === false;
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (isUnread) setUnreadCount(prev => Math.max(0, prev - 1));
      await supabase.from('notifications').delete().eq('id', id);
    } catch (err) {
      console.error(err);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MEDIUM': return '#eab308';
      default: return '#94a3b8';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle size={16} color="#ef4444" />;
      case 'HIGH': return <AlertCircle size={16} color="#f97316" />;
      case 'MEDIUM': return <Info size={16} color="#eab308" />;
      default: return <Info size={16} color="#94a3b8" />;
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'UNREAD') return !n.is_read;
    if (filter === 'HIGH') return n.severity === 'CRITICAL' || n.severity === 'HIGH';
    return true;
  });

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="btn-signout" 
        style={{ padding: '0.4rem', position: 'relative' }}
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            borderRadius: '50%',
            padding: '2px 5px',
            border: '2px solid hsl(var(--bg-secondary))'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '120%',
          right: 0,
          width: '320px',
          maxHeight: '400px',
          backgroundColor: 'hsl(var(--bg-surface-elevated))',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid hsl(var(--border-color))',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border-color))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'hsl(var(--text-primary))' }}>Notifications</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: 'hsl(var(--accent-primary))', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', padding: 0 }}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ padding: '8px 16px', borderBottom: '1px solid hsl(var(--border-color))', display: 'flex', gap: '8px' }}>
            {['ALL', 'UNREAD', 'HIGH'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'hsl(var(--accent-primary))' : 'transparent',
                  color: filter === f ? 'white' : 'hsl(var(--text-secondary))',
                  border: `1px solid ${filter === f ? 'hsl(var(--accent-primary))' : 'hsl(var(--border-color))'}`,
                  borderRadius: '16px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Loading...</div>
            ) : filteredNotifications.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
                <CheckCircle2 size={32} style={{ opacity: 0.2, margin: '0 auto 10px auto' }} />
                You're all caught up!
              </div>
            ) : (
              filteredNotifications.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => {
                    markAsRead(n.id);
                    if (n.action_url) window.open(n.action_url, '_blank');
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid hsl(var(--border-color))',
                    backgroundColor: n.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ marginTop: '2px' }}>
                      {getSeverityIcon(n.severity)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: getSeverityColor(n.severity), textTransform: 'uppercase' }}>
                          {n.notification_type} {n.stock_symbol ? `• ${n.stock_symbol}` : ''}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: 'hsl(var(--text-primary))', fontWeight: n.is_read ? 'normal' : '600' }}>
                        {n.title}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.summary}
                      </p>
                      
                      {n.reasoning && n.reasoning.reason && (
                        <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'hsl(var(--accent-primary))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Info size={10} /> <i>Because {n.reasoning.reason}</i>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button 
                    onClick={(e) => deleteNotification(n.id, e)}
                    style={{ position: 'absolute', right: '10px', bottom: '10px', background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', opacity: 0.5 }}
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
