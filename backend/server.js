const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'EdgeVaultSuperSecretKey2026';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-db-0.postgres-headless.edgevault.svc.cluster.local',
  user: process.env.DB_USER || 'vaultmaster',
  password: process.env.DB_PASSWORD || 'VaultProductionKey2026!',
  database: process.env.DB_NAME || 'edgevault',
  port: 5432,
});

// Database Schemas Initialization
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_phone VARCHAR(20) NOT NULL,
      receiver_phone VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      is_vault_link BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS secure_vault_v6 (
      id SERIAL PRIMARY KEY,
      vault_uuid VARCHAR(64) UNIQUE NOT NULL,
      filename VARCHAR(255) NOT NULL,
      filetype VARCHAR(100),
      filesize VARCHAR(50),
      filedata TEXT NOT NULL,
      password_hash VARCHAR(255),
      max_downloads INT DEFAULT 1,
      downloads_done INT DEFAULT 0,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ PostgreSQL Schema Initialized: Users, Messages & Vault v6');
}
initDB().catch(console.error);

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized. Please login.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid or expired.' });
    req.user = user;
    next();
  });
}

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- AUTHENTICATION APIS ---
app.post('/api/auth/signup', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'All fields are required.' });

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      'INSERT INTO users (name, phone, password_hash) VALUES ($1, $2, $3) RETURNING id, name, phone',
      [name.trim(), phone.trim(), hash]
    );
    const token = jwt.sign({ id: result.rows[0].id, phone: result.rows[0].phone, name: result.rows[0].name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: result.rows[0], token });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Phone number already registered.' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Phone & password required.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone.trim()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found with this phone number.' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid password.' });

    const token = jwt.sign({ id: user.id, phone: user.phone, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, name: user.name, phone: user.phone }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CHAT & CONTACTS APIS ---
app.get('/api/users/find/:phone', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT name, phone FROM users WHERE phone = $1', [req.params.phone.trim()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No user registered with this phone number.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:otherPhone', authenticateToken, async (req, res) => {
  const myPhone = req.user.phone;
  const otherPhone = req.params.otherPhone.trim();

  try {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE (sender_phone = $1 AND receiver_phone = $2) 
          OR (sender_phone = $2 AND receiver_phone = $1)
       ORDER BY created_at ASC`,
      [myPhone, otherPhone]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/send', authenticateToken, async (req, res) => {
  const { receiverPhone, content, isVaultLink } = req.body;
  const senderPhone = req.user.phone;

  if (!receiverPhone || !content) return res.status(400).json({ error: 'Message content and receiver needed.' });

  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_phone, receiver_phone, content, is_vault_link) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [senderPhone, receiverPhone.trim(), content, !!isVaultLink]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EPHEMERAL ZERO-TRUST VAULT APIS ---
app.post('/api/vault/encrypt-and-store', async (req, res) => {
  const { filename, filetype, filesize, filedata, password, expiryMinutes, maxDownloads } = req.body;
  if (!filename || !filedata) return res.status(400).json({ error: 'Payload missing file.' });

  const vaultUuid = crypto.randomBytes(8).toString('hex');
  const minutes = Math.max(1, parseInt(expiryMinutes) || 5);
  const downloads = Math.max(1, parseInt(maxDownloads) || 1);
  const passwordHash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;

  try {
    await pool.query(
      `INSERT INTO secure_vault_v6 
       (vault_uuid, filename, filetype, filesize, filedata, password_hash, max_downloads, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' minutes')::interval)`,
      [vaultUuid, filename, filetype, filesize, filedata, passwordHash, downloads, minutes.toString()]
    );

    res.status(201).json({
      success: true,
      vaultId: vaultUuid,
      expiresIn: `${minutes} minutes`,
      maxDownloads: downloads,
      protectedWithPassword: !!password
    });
  } catch (err) {
    res.status(500).json({ error: 'Storage cluster failure: ' + err.message });
  }
});

app.get('/api/vault/meta/:uuid', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT filename, filesize, filetype, (password_hash IS NOT NULL) as is_locked, expires_at, max_downloads, downloads_done 
       FROM secure_vault_v6 
       WHERE vault_uuid = $1`,
      [req.params.uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'This file never existed or has completely self-destructed.' });
    }

    const item = result.rows[0];
    const now = new Date();
    const expiry = new Date(item.expires_at);

    if (now > expiry || item.downloads_done >= item.max_downloads) {
      await pool.query('DELETE FROM secure_vault_v6 WHERE vault_uuid = $1', [req.params.uuid]);
      return res.status(410).json({ error: '⚡ Asset Burned! Time expired or download threshold reached.' });
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vault/unlock/:uuid', async (req, res) => {
  const { password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM secure_vault_v6 WHERE vault_uuid = $1', [req.params.uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset already self-destructed.' });

    const file = result.rows[0];
    const now = new Date();
    if (now > new Date(file.expires_at) || file.downloads_done >= file.max_downloads) {
      await pool.query('DELETE FROM secure_vault_v6 WHERE id = $1', [file.id]);
      return res.status(410).json({ error: 'Asset expired or burn threshold triggered.' });
    }

    if (file.password_hash) {
      const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
      if (inputHash !== file.password_hash) {
        return res.status(401).json({ error: 'Invalid Passphrase. Security validation failed.' });
      }
    }

    const nextDownloads = file.downloads_done + 1;
    if (nextDownloads >= file.max_downloads) {
      await pool.query('DELETE FROM secure_vault_v6 WHERE id = $1', [file.id]);
    } else {
      await pool.query('UPDATE secure_vault_v6 SET downloads_done = $1 WHERE id = $2', [nextDownloads, file.id]);
    }

    res.json({
      filename: file.filename,
      filedata: file.filedata,
      remainingDownloads: Math.max(0, file.max_downloads - nextDownloads)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`EdgeVault Backend v6 Enterprise on port ${PORT}`));
