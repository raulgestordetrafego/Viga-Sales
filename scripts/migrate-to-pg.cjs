// Migra dados do SQLite para Postgres
const Database = require("better-sqlite3");
const { Client } = require("pg");
const path = require("path");

const sqlitePath = process.env.DB_PATH || "./db/crm.sqlite";
const pgCrm = process.env.DATABASE_URL || "postgresql://vigasales:VigaSales2024!@postgres-crm:5432/vigasales";
const pgLeads = process.env.DATABASE_LEADS_URL || "postgresql://vigasales_leads:VigaSalesLeads2024!@postgres-leads:5432/vigasales_leads";

// Tabelas que vao para cada banco
const CRM_TABLES = [
  "users", "contacts", "conversations", "messages", "funnels", "pipeline_stages",
  "broadcasts", "broadcast_logs", "activities", "raw_webhooks", "reminders",
  "audit_log", "custom_fields", "contact_custom_values", "whatsapp_instances",
  "user_instance_permissions", "system_config", "tenants",
  "email_templates", "email_campaigns", "email_send_logs"
];

const LEADS_TABLES = [
  "prospects", "prospecting_campaigns", "prospecting_logs",
  "email_lists", "email_recipients"
];

const SQLITE_TO_PG = {
  "TIMESTAMP": "TIMESTAMPTZ",
  "datetime('now')": "NOW()",
  "CURRENT_TIMESTAMP": "NOW()"
};

async function migrate() {
  console.log("Opening SQLite...");
  const sqlite = new Database(sqlitePath, { readonly: true });

  console.log("Connecting to Postgres CRM...");
  const crm = new Client({ connectionString: pgCrm });
  await crm.connect();

  console.log("Connecting to Postgres Leads...");
  const leads = new Client({ connectionString: pgLeads });
  await leads.connect();

  // Migrar tabelas do CRM
  for (const table of CRM_TABLES) {
    try {
      const count = sqlite.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
      if (count === 0) {
        console.log(`  ${table}: empty, skipping`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) continue;

      // Pega colunas da primeira linha
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = columns.map(c => `"${c}"`).join(", ");

      // Limpa tabela de destino
      await crm.query(`TRUNCATE "${table}" CASCADE`);

      // Insere em lotes
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const values = batch.map(row => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ");
        const flatParams = batch.flatMap(row => columns.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return null;
          if (typeof v === 'object') return JSON.stringify(v);
          return v;
        }));

        if (flatParams.length > 0) {
          await crm.query(
            `INSERT INTO "${table}" (${colNames}) VALUES ${values} ON CONFLICT DO NOTHING`,
            flatParams
          );
        }
      }
      console.log(`  ${table}: ${rows.length} rows migrated`);
    } catch (err) {
      console.error(`  ${table}: ERROR - ${err.message}`);
    }
  }

  // Migrar tabelas dos Leads
  for (const table of LEADS_TABLES) {
    try {
      const count = sqlite.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
      if (count === 0) {
        console.log(`  ${table}: empty, skipping`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(", ");

      await leads.query(`TRUNCATE "${table}" CASCADE`);

      // Para prospects, insere em lotes menores (92k linhas)
      const batchSize = table === 'prospects' ? 100 : 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          const vals = columns.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (typeof v === 'object') return JSON.stringify(v);
            return v;
          });
          const placeholders = vals.map((_, j) => `$${j + 1}`).join(", ");
          try {
            await leads.query(
              `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
              vals
            );
          } catch (e) {
            // skip individual row errors
          }
        }
        if ((i % 5000) === 0) console.log(`  ${table}: ${i}/${rows.length}...`);
      }
      console.log(`  ${table}: ${rows.length} rows migrated`);
    } catch (err) {
      console.error(`  ${table}: ERROR - ${err.message}`);
    }
  }

  await crm.end();
  await leads.end();
  sqlite.close();
  console.log("\nMigration complete!");
}

migrate().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
