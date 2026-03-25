-- Tabela de buffer de mensagens (agrupamento antes de enviar ao agente)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(100) NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);

-- Tabela de clientes (substitui Supabase)
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
