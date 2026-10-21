import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('ev_user') || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('ev_token') || '');

  // Auth States
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' or 'chat'

  // Vault States
  const [selectedFile, setSelectedFile] = useState(null);
  const [vaultPassword, setVaultPassword] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState('5');
  const [maxDownloads, setMaxDownloads] = useState('1');
  const [generatedLink, setGeneratedLink] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [vaultMsg, setVaultMsg] = useState('');

  // Recipient / Unlock States
  const [meta, setMeta] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Chat States
  const [searchPhone, setSearchPhone] = useState('');
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [chatSearchError, setChatSearchError] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    const handleHash = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const vaultId = currentHash.startsWith('#/v/') ? currentHash.replace('#/v/', '') : null;

  // Metadata check for shared link
  useEffect(() => {
    if (vaultId) {
      setUnlockError('');
      setMeta(null);
      fetch(`/api/vault/meta/${vaultId}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to resolve asset.');
          setMeta(data);
        })
        .catch((err) => setUnlockError(err.message));
    }
  }, [vaultId]);

  // Chat Auto-Refresh
  useEffect(() => {
    if (!token || !activeChatUser) return;
    const loadMsgs = () => {
      fetch(`/api/messages/${activeChatUser.phone}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setChatMessages(data); })
        .catch(console.error);
    };
    loadMsgs();
    const interval = setInterval(loadMsgs, 3000);
    return () => clearInterval(interval);
  }, [token, activeChatUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cross-browser Copy Helper
  const copyToClipboard = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => alert('Link copied to clipboard!'));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        alert('Link copied to clipboard!');
      } catch (err) {
        alert('Failed to copy. Please manually select the URL.');
      }
      textArea.remove();
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const payload = authMode === 'signup' 
      ? { name: authName, phone: authPhone, password: authPassword }
      : { phone: authPhone, password: authPassword };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('ev_user', JSON.stringify(data.user));
      localStorage.setItem('ev_token', data.token);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('ev_user');
    localStorage.removeItem('ev_token');
  };

  const handleVaultUpload = (e) => {
    e.preventDefault();
    if (!selectedFile) return alert('Select a file or image first!');

    setUploadLoading(true);
    setVaultMsg('Hardware-encrypting and mounting to AWS EBS Persistent Volume...');

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const payload = {
        filename: selectedFile.name,
        filetype: selectedFile.type,
        filesize: (selectedFile.size / 1024).toFixed(1) + ' KB',
        filedata: reader.result,
        password: vaultPassword,
        expiryMinutes,
        maxDownloads
      };

      try {
        const res = await fetch('/api/vault/encrypt-and-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        const fullLink = `${window.location.origin}${window.location.pathname}#/v/${data.vaultId}`;
        setGeneratedLink(fullLink);
        setVaultMsg('✅ Encrypted Ephemeral Vault Created!');
        setSelectedFile(null);
        setVaultPassword('');
      } catch (err) {
        setVaultMsg('❌ ' + err.message);
      } finally {
        setUploadLoading(false);
      }
    };
  };

  const handleUnlock = async () => {
    setUnlockLoading(true);
    setUnlockError('');
    try {
      const res = await fetch(`/api/vault/unlock/${vaultId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: unlockPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Access Denied');

      const a = document.createElement('a');
      a.href = data.filedata;
      a.download = data.filename;
      a.click();
      alert(`Asset unlocked and downloaded! (${data.remainingDownloads} downloads left before permanent deletion)`);
      window.location.hash = '';
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleFindFriend = async (e) => {
    e.preventDefault();
    setChatSearchError('');
    if (searchPhone === user.phone) return setChatSearchError('You cannot chat with yourself.');

    try {
      const res = await fetch(`/api/users/find/${searchPhone}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Contact not found.');

      setActiveChatUser(data);
      setSearchPhone('');
    } catch (err) {
      setChatSearchError(err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgInput.trim() || !activeChatUser) return;

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverPhone: activeChatUser.phone,
          content: msgInput,
          isVaultLink: msgInput.includes('#/v/')
        })
      });
      if (res.ok) {
        setMsgInput('');
        const fresh = await fetch(`/api/messages/${activeChatUser.phone}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const freshData = await fresh.json();
        setChatMessages(freshData);
      }
    } catch (err) {
      alert('Error sending message: ' + err.message);
    }
  };

  // --- VIEW 1: RECIPIENT FILE UNLOCK SCREEN (#/v/<id>) ---
  if (vaultId) {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% 0%, #0f172a, #020617)', color: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: '440px', width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '30px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '42px' }}>🔐</div>
            <h2 style={{ color: '#38bdf8', margin: '8px 0 4px 0', fontSize: '22px' }}>EdgeVault Ephemeral Asset</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Self-destructing payload hosted on AWS EKS</p>
          </div>

          {unlockError ? (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '16px', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }}>
              <div>⚠️ {unlockError}</div>
              <button onClick={() => window.location.hash = ''} style={{ marginTop: '12px', background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Go to Main Dashboard</button>
            </div>
          ) : meta ? (
            <div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '14px', borderRadius: '10px', marginBottom: '18px' }}>
                <div style={{ fontWeight: '600', color: '#e2e8f0', wordBreak: 'break-all' }}>📄 {meta.filename}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '12px' }}>
                  <span style={{ background: '#1e293b', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px' }}>{meta.filesize}</span>
                  <span style={{ background: '#1e293b', color: '#f43f5e', padding: '2px 8px', borderRadius: '4px' }}>🔥 Burn: {meta.max_downloads} DL Limit</span>
                </div>
              </div>

              {meta.is_locked && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>Decryption Passphrase Required:</label>
                  <input
                    type="password"
                    placeholder="Enter Secret Key"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <button
                onClick={handleUnlock}
                disabled={unlockLoading}
                style={{ width: '100%', padding: '12px', background: 'linear-gradient(to right, #0284c7, #2563eb)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {unlockLoading ? 'Decrypting...' : '⚡ Decrypt & Download Asset'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>
              <div style={{ marginBottom: '8px' }}>⏳</div>
              Verifying payload lifecycle...
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- VIEW 2: AUTH SCREEN (If not logged in) ---
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% 0%, #0f172a, #020617)', color: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: '400px', width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '30px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ color: '#38bdf8', fontSize: '26px', margin: 0 }}>⚡ EdgeVault Core</h1>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Zero-Trust Authenticated Cloud Node</p>
          </div>

          <form onSubmit={handleAuth}>
            {authMode === 'signup' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '4px' }}>Your Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prem Dalvi"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '4px' }}>Phone Number:</label>
              <input
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={authPhone}
                onChange={(e) => setAuthPhone(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '4px' }}>Password:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            {authError && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>{authError}</div>}

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {authMode === 'login' ? 'Secure Log In' : 'Create Vault Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#94a3b8' }}>
            {authMode === 'login' ? "Don't have an account? " : "Already registered? "}
            <span
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
              style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {authMode === 'login' ? 'Sign Up' : 'Log In'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 3: MAIN AUTHENTICATED DASHBOARD (VAULT + CHAT) ---
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% 0%, #0f172a, #020617)', color: '#f8fafc', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        
        {/* Top Navbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <div style={{ fontWeight: '800', color: '#38bdf8', fontSize: '16px' }}>EdgeVault Workspace</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Logged in as: <strong>{user.name}</strong> ({user.phone})</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('vault')}
              style={{ padding: '8px 16px', background: activeTab === 'vault' ? '#0284c7' : '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
            >
              🔒 Ephemeral Vault
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              style={{ padding: '8px 16px', background: activeTab === 'chat' ? '#0284c7' : '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
            >
              💬 Private Chat
            </button>
            <button
              onClick={handleLogout}
              style={{ padding: '8px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* TAB 1: VAULT GENERATOR */}
        {activeTab === 'vault' && (
          <div>
            <form onSubmit={handleVaultUpload} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 16px 0', color: '#38bdf8', fontSize: '20px' }}>Create Self-Destructing Ephemeral Vault</h2>
              
              <div style={{ border: '2px dashed #0284c7', background: '#0f172a', borderRadius: '10px', padding: '24px', textAlign: 'center', cursor: 'pointer', marginBottom: '18px' }} onClick={() => document.getElementById('vault-file').click()}>
                <input id="vault-file" type="file" onChange={(e) => setSelectedFile(e.target.files[0])} style={{ display: 'none' }} />
                <div style={{ fontSize: '30px' }}>📁</div>
                <div style={{ color: '#38bdf8', fontWeight: '600', marginTop: '6px' }}>{selectedFile ? selectedFile.name : 'Choose File or Document'}</div>
                <div style={{ color: '#64748b', fontSize: '12px' }}>{selectedFile ? `Size: ${(selectedFile.size / 1024).toFixed(1)} KB` : 'Payloads are encrypted before storage'}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>Passphrase Lock (Optional):</label>
                  <input
                    type="password"
                    placeholder="Require password to unlock"
                    value={vaultPassword}
                    onChange={(e) => setVaultPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>⏳ Expiry Timeout:</label>
                  <select value={expiryMinutes} onChange={(e) => setExpiryMinutes(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}>
                    <option value="1">🔥 1 Minute</option>
                    <option value="5">5 Minutes</option>
                    <option value="60">1 Hour</option>
                    <option value="1440">24 Hours</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>🔥 Max Download Limit:</label>
                  <select value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}>
                    <option value="1">1 Download (Strict Burn)</option>
                    <option value="3">3 Downloads</option>
                    <option value="10">10 Downloads</option>
                  </select>
                </div>
              </div>

              <button type="submit" disabled={uploadLoading} style={{ width: '100%', padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                {uploadLoading ? 'Transmitting to EKS Pod...' : 'Generate Vault Link'}
              </button>
            </form>

            {vaultMsg && (
              <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: vaultMsg.includes('✅') ? '#064e3b' : '#7f1d1d', color: '#fff', textAlign: 'center' }}>
                {vaultMsg}
              </div>
            )}

            {generatedLink && (
              <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: '12px', padding: '18px' }}>
                <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>🎉 Secret Vault Link Generated:</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input readOnly value={generatedLink} style={{ width: '100%', padding: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }} />
                  <button onClick={() => copyToClipboard(generatedLink)} style={{ padding: '0 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Copy
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent('🔒 Confidential Vault Asset: ' + generatedLink)}`} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '10px', textAlign: 'center', background: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                    📲 Share on WhatsApp
                  </a>
                  <a href={generatedLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '10px', textAlign: 'center', background: '#334155', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                    👁️ Test Open Link
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRIVATE PHONE-NUMBER CHAT */}
        {activeTab === 'chat' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', height: '620px', overflow: 'hidden' }}>
            
            {/* Left Sidebar: Search Friend */}
            <div style={{ background: '#0f172a', borderRight: '1px solid #334155', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '12px', fontSize: '14px' }}>Find Friend by Phone</div>
              <form onSubmit={handleFindFriend} style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  type="tel"
                  placeholder="Friend's phone"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
                />
                <button type="submit" style={{ padding: '8px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Add</button>
              </form>

              {chatSearchError && <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '10px' }}>{chatSearchError}</div>}

              <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Active Conversation:</div>
              {activeChatUser ? (
                <div style={{ background: '#1e293b', border: '1px solid #0284c7', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 'bold', color: '#fff' }}>👤 {activeChatUser.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>{activeChatUser.phone}</div>
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Enter your friend's registered phone number above to start chatting.</div>
              )}
            </div>

            {/* Right Chat Area */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {activeChatUser ? (
                <>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid #334155', background: '#1e293b', fontWeight: 'bold', color: '#38bdf8' }}>
                    Chat with {activeChatUser.name} ({activeChatUser.phone})
                  </div>

                  <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>No messages yet. Send a greeting or paste a vault link!</div>
                    ) : (
                      chatMessages.map((m) => {
                        const isMe = m.sender_phone === user.phone;
                        return (
                          <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '75%', background: isMe ? '#0284c7' : '#334155', padding: '10px 14px', borderRadius: '12px', color: '#fff' }}>
                            {m.is_vault_link ? (
                              <div>
                                <div style={{ fontSize: '12px', color: '#fef08a', fontWeight: 'bold', marginBottom: '4px' }}>🔒 Secret Vault Link:</div>
                                <a href={m.content} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline', wordBreak: 'break-all' }}>{m.content}</a>
                              </div>
                            ) : (
                              <div style={{ wordBreak: 'break-word' }}>{m.content}</div>
                            )}
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textAlign: 'right', marginTop: '4px' }}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} style={{ padding: '12px', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Type a message or paste vault link..."
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      style={{ flex: 1, padding: '10px 14px', background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff', outline: 'none' }}
                    />
                    <button type="submit" style={{ padding: '10px 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      Send
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                  👈 Select or add a friend via phone number to chat.
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
