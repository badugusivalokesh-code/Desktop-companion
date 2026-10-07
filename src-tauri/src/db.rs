use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub category: String,
    pub content: String,
    pub importance: u8,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub expires_at: Option<i64>,
}

pub struct DatabaseState {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

const VALID_CATEGORIES: &[&str] = &["fact", "preference", "routine", "goal", "temporary"];

pub fn init_database(app: &AppHandle) -> Result<DatabaseState, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let db_path = app_dir.join("memory.db");

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database at {:?}: {}", db_path, e))?;

    // Optimize performance and concurrency
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| format!("Failed to configure SQLite pragmas: {}", e))?;

    // Run migrations
    run_migrations(&conn)?;

    // Cleanup expired temporary memories on startup
    let now = Utc::now().timestamp_millis();
    let _ = conn.execute(
        "DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?1",
        params![now],
    );

    Ok(DatabaseState {
        conn: Mutex::new(conn),
        db_path,
    })
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create schema_migrations table: {}", e))?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL CHECK(category IN ('fact', 'preference', 'routine', 'goal', 'temporary')),
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 1,
                source TEXT NOT NULL DEFAULT 'explicit',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                expires_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
            CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);
            CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);",
        )
        .map_err(|e| format!("Failed to execute migration 1: {}", e))?;

        let now = Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            params![now],
        )
        .map_err(|e| format!("Failed to record migration 1: {}", e))?;
    }

    Ok(())
}

impl DatabaseState {
    pub fn create_memory(
        &self,
        category: &str,
        content: &str,
        importance: Option<u8>,
        expires_at: Option<i64>,
    ) -> Result<Memory, String> {
        let trimmed_content = content.trim();
        if trimmed_content.is_empty() {
            return Err("Memory content cannot be empty".to_string());
        }

        let cat_lower = category.trim().to_lowercase();
        if !VALID_CATEGORIES.contains(&cat_lower.as_str()) {
            return Err(format!(
                "Invalid category '{}'. Must be one of: {:?}",
                category, VALID_CATEGORIES
            ));
        }

        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let importance_val = importance.unwrap_or(1).clamp(1, 5);

        // If category is temporary and no expires_at specified, default to 24 hours
        let calculated_expires_at = if cat_lower == "temporary" {
            Some(expires_at.unwrap_or(now + 24 * 60 * 60 * 1000))
        } else {
            None
        };

        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        conn.execute(
            "INSERT INTO memories (id, category, content, importance, source, created_at, updated_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, 'explicit', ?5, ?6, ?7)",
            params![
                id,
                cat_lower,
                trimmed_content,
                importance_val,
                now,
                now,
                calculated_expires_at
            ],
        )
        .map_err(|e| format!("Failed to insert memory: {}", e))?;

        Ok(Memory {
            id,
            category: cat_lower,
            content: trimmed_content.to_string(),
            importance: importance_val,
            source: "explicit".to_string(),
            created_at: now,
            updated_at: now,
            expires_at: calculated_expires_at,
        })
    }

    pub fn list_memories(
        &self,
        category: Option<String>,
        include_expired: Option<bool>,
    ) -> Result<Vec<Memory>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let now = Utc::now().timestamp_millis();
        let allow_expired = include_expired.unwrap_or(false);

        let mut query = "SELECT id, category, content, importance, source, created_at, updated_at, expires_at 
                         FROM memories WHERE 1=1".to_string();

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if !allow_expired {
            query.push_str(" AND (expires_at IS NULL OR expires_at > ?)");
            params_vec.push(Box::new(now));
        }

        if let Some(ref cat) = category {
            let cat_lower = cat.trim().to_lowercase();
            query.push_str(" AND category = ?");
            params_vec.push(Box::new(cat_lower));
        }

        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(params_slice.as_slice(), |row| {
                Ok(Memory {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    content: row.get(2)?,
                    importance: row.get(3)?,
                    source: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    expires_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;

        let mut memories = Vec::new();
        for r in rows {
            if let Ok(m) = r {
                memories.push(m);
            }
        }

        Ok(memories)
    }

    pub fn update_memory(
        &self,
        id: &str,
        content: Option<String>,
        category: Option<String>,
        importance: Option<u8>,
    ) -> Result<Memory, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        // Retrieve existing
        let mut existing: Memory = conn
            .query_row(
                "SELECT id, category, content, importance, source, created_at, updated_at, expires_at 
                 FROM memories WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Memory {
                        id: row.get(0)?,
                        category: row.get(1)?,
                        content: row.get(2)?,
                        importance: row.get(3)?,
                        source: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                        expires_at: row.get(7)?,
                    })
                },
            )
            .map_err(|_| format!("Memory with id '{}' not found", id))?;

        let now = Utc::now().timestamp_millis();

        if let Some(c) = content {
            let trimmed = c.trim();
            if !trimmed.is_empty() {
                existing.content = trimmed.to_string();
            }
        }

        if let Some(cat) = category {
            let cat_lower = cat.trim().to_lowercase();
            if VALID_CATEGORIES.contains(&cat_lower.as_str()) {
                existing.category = cat_lower;
            }
        }

        if let Some(imp) = importance {
            existing.importance = imp.clamp(1, 5);
        }

        existing.updated_at = now;

        conn.execute(
            "UPDATE memories SET category = ?1, content = ?2, importance = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                existing.category,
                existing.content,
                existing.importance,
                existing.updated_at,
                existing.id,
            ],
        )
        .map_err(|e| format!("Failed to update memory: {}", e))?;

        Ok(existing)
    }

    pub fn delete_memory(&self, id: &str) -> Result<bool, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let rows_affected = conn
            .execute("DELETE FROM memories WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete memory: {}", e))?;

        Ok(rows_affected > 0)
    }

    pub fn clear_memories(&self) -> Result<bool, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        conn.execute("DELETE FROM memories", [])
            .map_err(|e| format!("Failed to clear memories: {}", e))?;

        Ok(true)
    }

    pub fn cleanup_expired(&self) -> Result<usize, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let now = Utc::now().timestamp_millis();
        let deleted = conn
            .execute(
                "DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?1",
                params![now],
            )
            .map_err(|e| format!("Failed to cleanup expired memories: {}", e))?;

        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_db() -> DatabaseState {
        let conn = Connection::open_in_memory().expect("Failed to open test in-memory SQLite");
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
        .unwrap();
        run_migrations(&conn).expect("Failed to run migrations");
        DatabaseState {
            conn: Mutex::new(conn),
            db_path: PathBuf::from(":memory:"),
        }
    }

    #[test]
    fn test_create_and_list_permanent_memory() {
        let db = create_test_db();
        let mem = db
            .create_memory("preference", "I prefer dark mode.", Some(2), None)
            .unwrap();

        assert_eq!(mem.category, "preference");
        assert_eq!(mem.content, "I prefer dark mode.");
        assert_eq!(mem.importance, 2);
        assert_eq!(mem.expires_at, None);

        let list = db.list_memories(None, None).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, mem.id);
    }

    #[test]
    fn test_temporary_memory_default_expiration() {
        let db = create_test_db();
        let now = Utc::now().timestamp_millis();
        let mem = db
            .create_memory("temporary", "I am tired today.", None, None)
            .unwrap();

        assert_eq!(mem.category, "temporary");
        assert!(mem.expires_at.is_some());
        let expires = mem.expires_at.unwrap();
        // Should expire in approximately 24 hours (within 5 seconds tolerance)
        assert!(expires >= now + 24 * 60 * 60 * 1000 - 5000);
    }

    #[test]
    fn test_expired_memory_filtering_and_cleanup() {
        let db = create_test_db();
        let past = Utc::now().timestamp_millis() - 1000;
        let _mem = db
            .create_memory("temporary", "Old temporary memory", None, Some(past))
            .unwrap();

        // list_memories without include_expired should hide it
        let active = db.list_memories(None, Some(false)).unwrap();
        assert_eq!(active.len(), 0);

        // list_memories with include_expired should show it
        let all = db.list_memories(None, Some(true)).unwrap();
        assert_eq!(all.len(), 1);

        // Cleanup expired
        let deleted = db.cleanup_expired().unwrap();
        assert_eq!(deleted, 1);

        // Now completely gone
        let all_after = db.list_memories(None, Some(true)).unwrap();
        assert_eq!(all_after.len(), 0);
    }

    #[test]
    fn test_update_and_delete_memory() {
        let db = create_test_db();
        let mem = db
            .create_memory("fact", "I am a backend developer.", None, None)
            .unwrap();

        let updated = db
            .update_memory(
                &mem.id,
                Some("I am a fullstack developer.".to_string()),
                None,
                Some(3),
            )
            .unwrap();

        assert_eq!(updated.content, "I am a fullstack developer.");
        assert_eq!(updated.importance, 3);

        let deleted = db.delete_memory(&mem.id).unwrap();
        assert!(deleted);

        let list = db.list_memories(None, None).unwrap();
        assert_eq!(list.len(), 0);
    }

    #[test]
    fn test_clear_all_memories() {
        let db = create_test_db();
        db.create_memory("fact", "Fact 1", None, None).unwrap();
        db.create_memory("routine", "Routine 1", None, None).unwrap();

        assert_eq!(db.list_memories(None, None).unwrap().len(), 2);

        db.clear_memories().unwrap();
        assert_eq!(db.list_memories(None, None).unwrap().len(), 0);
    }
}
