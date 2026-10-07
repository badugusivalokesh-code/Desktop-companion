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

const VALID_TASK_STATUSES: &[&str] = &["pending", "completed", "cancelled"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub due_at: Option<i64>,
    pub reminder_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub source: String,
}

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

    if current_version < 2 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending','completed','cancelled')),
                due_at INTEGER,
                reminder_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'explicit'
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_reminder_at ON tasks(reminder_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);",
        )
        .map_err(|e| format!("Failed to execute migration 2: {}", e))?;

        let now = Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            params![now],
        )
        .map_err(|e| format!("Failed to record migration 2: {}", e))?;
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

    // ── Task operations ──────────────────────────────────────────────────────

    pub fn create_task(
        &self,
        title: &str,
        due_at: Option<i64>,
        reminder_at: Option<i64>,
    ) -> Result<Task, String> {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return Err("Task title cannot be empty".to_string());
        }

        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        conn.execute(
            "INSERT INTO tasks (id, title, status, due_at, reminder_at, created_at, updated_at, source)
             VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, 'explicit')",
            params![id, trimmed, due_at, reminder_at, now, now],
        )
        .map_err(|e| format!("Failed to insert task: {}", e))?;

        Ok(Task {
            id,
            title: trimmed.to_string(),
            status: "pending".to_string(),
            due_at,
            reminder_at,
            created_at: now,
            updated_at: now,
            source: "explicit".to_string(),
        })
    }

    pub fn list_tasks(&self, status_filter: Option<String>) -> Result<Vec<Task>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let mut query = "SELECT id, title, status, due_at, reminder_at, created_at, updated_at, source \
                         FROM tasks WHERE 1=1"
            .to_string();

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref status) = status_filter {
            let s = status.trim().to_lowercase();
            if VALID_TASK_STATUSES.contains(&s.as_str()) {
                query.push_str(" AND status = ?");
                params_vec.push(Box::new(s));
            }
        }

        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare task query: {}", e))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(params_slice.as_slice(), |row| {
                Ok(Task {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    due_at: row.get(3)?,
                    reminder_at: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    source: row.get(7)?,
                })
            })
            .map_err(|e| format!("Task query failed: {}", e))?;

        let mut tasks = Vec::new();
        for r in rows {
            if let Ok(t) = r {
                tasks.push(t);
            }
        }
        Ok(tasks)
    }

    pub fn update_task(
        &self,
        id: &str,
        title: Option<String>,
        status: Option<String>,
        due_at: Option<Option<i64>>,
        reminder_at: Option<Option<i64>>,
    ) -> Result<Task, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let mut existing: Task = conn
            .query_row(
                "SELECT id, title, status, due_at, reminder_at, created_at, updated_at, source \
                 FROM tasks WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Task {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        due_at: row.get(3)?,
                        reminder_at: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                        source: row.get(7)?,
                    })
                },
            )
            .map_err(|_| format!("Task with id '{}' not found", id))?;

        let now = Utc::now().timestamp_millis();

        if let Some(t) = title {
            let trimmed = t.trim().to_string();
            if !trimmed.is_empty() {
                existing.title = trimmed;
            }
        }

        if let Some(s) = status {
            let s_lower = s.trim().to_lowercase();
            if VALID_TASK_STATUSES.contains(&s_lower.as_str()) {
                existing.status = s_lower;
            }
        }

        if let Some(d) = due_at {
            existing.due_at = d;
        }

        if let Some(r) = reminder_at {
            existing.reminder_at = r;
        }

        existing.updated_at = now;

        conn.execute(
            "UPDATE tasks SET title = ?1, status = ?2, due_at = ?3, reminder_at = ?4, updated_at = ?5 WHERE id = ?6",
            params![
                existing.title,
                existing.status,
                existing.due_at,
                existing.reminder_at,
                existing.updated_at,
                existing.id,
            ],
        )
        .map_err(|e| format!("Failed to update task: {}", e))?;

        Ok(existing)
    }

    pub fn delete_task(&self, id: &str) -> Result<bool, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let rows = conn
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete task: {}", e))?;

        Ok(rows > 0)
    }

    pub fn clear_tasks(&self, status_filter: Option<String>) -> Result<usize, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let deleted = if let Some(ref s) = status_filter {
            let s_lower = s.trim().to_lowercase();
            conn.execute(
                "DELETE FROM tasks WHERE status = ?1",
                params![s_lower],
            )
            .map_err(|e| format!("Failed to clear tasks: {}", e))?
        } else {
            conn.execute("DELETE FROM tasks", [])
                .map_err(|e| format!("Failed to clear all tasks: {}", e))?
        };

        Ok(deleted)
    }

    pub fn complete_task(&self, id: &str) -> Result<Task, String> {
        self.update_task(id, None, Some("completed".to_string()), None, None)
    }

    pub fn cancel_task(&self, id: &str) -> Result<Task, String> {
        self.update_task(id, None, Some("cancelled".to_string()), None, None)
    }

    /// Returns pending tasks whose reminder_at <= now (due for reminder)
    pub fn get_due_reminders(&self) -> Result<Vec<Task>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let now = Utc::now().timestamp_millis();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, status, due_at, reminder_at, created_at, updated_at, source \
                 FROM tasks WHERE status = 'pending' AND reminder_at IS NOT NULL AND reminder_at <= ?1 \
                 ORDER BY reminder_at ASC",
            )
            .map_err(|e| format!("Failed to prepare reminder query: {}", e))?;

        let rows = stmt
            .query_map(params![now], |row| {
                Ok(Task {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    due_at: row.get(3)?,
                    reminder_at: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    source: row.get(7)?,
                })
            })
            .map_err(|e| format!("Reminder query failed: {}", e))?;

        let mut tasks = Vec::new();
        for r in rows {
            if let Ok(t) = r {
                tasks.push(t);
            }
        }
        Ok(tasks)
    }

    /// Returns pending tasks whose due_at <= now (overdue)
    pub fn get_overdue_tasks(&self) -> Result<Vec<Task>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;

        let now = Utc::now().timestamp_millis();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, status, due_at, reminder_at, created_at, updated_at, source \
                 FROM tasks WHERE status = 'pending' AND due_at IS NOT NULL AND due_at <= ?1 \
                 ORDER BY due_at ASC",
            )
            .map_err(|e| format!("Failed to prepare overdue query: {}", e))?;

        let rows = stmt
            .query_map(params![now], |row| {
                Ok(Task {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    due_at: row.get(3)?,
                    reminder_at: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    source: row.get(7)?,
                })
            })
            .map_err(|e| format!("Overdue query failed: {}", e))?;

        let mut tasks = Vec::new();
        for r in rows {
            if let Ok(t) = r {
                tasks.push(t);
            }
        }
        Ok(tasks)
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

    // ── Task tests ──────────────────────────────────────────────────────────

    #[test]
    fn test_create_and_list_task() {
        let db = create_test_db();
        let task = db.create_task("Call my friend", None, None).unwrap();

        assert_eq!(task.title, "Call my friend");
        assert_eq!(task.status, "pending");
        assert!(task.due_at.is_none());
        assert!(task.reminder_at.is_none());

        let list = db.list_tasks(None).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, task.id);
    }

    #[test]
    fn test_task_with_timestamps() {
        let db = create_test_db();
        let due = Utc::now().timestamp_millis() + 3_600_000; // 1h from now
        let reminder = Utc::now().timestamp_millis() + 1_800_000; // 30m from now
        let task = db.create_task("Meeting", Some(due), Some(reminder)).unwrap();

        assert_eq!(task.due_at, Some(due));
        assert_eq!(task.reminder_at, Some(reminder));
    }

    #[test]
    fn test_task_complete_and_cancel() {
        let db = create_test_db();
        let t1 = db.create_task("Task A", None, None).unwrap();
        let t2 = db.create_task("Task B", None, None).unwrap();

        let done = db.complete_task(&t1.id).unwrap();
        assert_eq!(done.status, "completed");

        let cancelled = db.cancel_task(&t2.id).unwrap();
        assert_eq!(cancelled.status, "cancelled");

        let pending = db.list_tasks(Some("pending".to_string())).unwrap();
        assert_eq!(pending.len(), 0);

        let completed = db.list_tasks(Some("completed".to_string())).unwrap();
        assert_eq!(completed.len(), 1);

        let cancelled_list = db.list_tasks(Some("cancelled".to_string())).unwrap();
        assert_eq!(cancelled_list.len(), 1);
    }

    #[test]
    fn test_task_update() {
        let db = create_test_db();
        let task = db.create_task("Old title", None, None).unwrap();

        let updated = db
            .update_task(
                &task.id,
                Some("New title".to_string()),
                None,
                None,
                None,
            )
            .unwrap();

        assert_eq!(updated.title, "New title");
        assert_eq!(updated.status, "pending");
    }

    #[test]
    fn test_task_delete() {
        let db = create_test_db();
        let task = db.create_task("To delete", None, None).unwrap();
        assert_eq!(db.list_tasks(None).unwrap().len(), 1);

        let ok = db.delete_task(&task.id).unwrap();
        assert!(ok);
        assert_eq!(db.list_tasks(None).unwrap().len(), 0);
    }

    #[test]
    fn test_task_clear_by_status() {
        let db = create_test_db();
        let t1 = db.create_task("Pending", None, None).unwrap();
        let t2 = db.create_task("To complete", None, None).unwrap();
        db.complete_task(&t2.id).unwrap();
        let _ = t1;

        let deleted = db.clear_tasks(Some("completed".to_string())).unwrap();
        assert_eq!(deleted, 1);
        assert_eq!(db.list_tasks(None).unwrap().len(), 1);
    }

    #[test]
    fn test_task_clear_all() {
        let db = create_test_db();
        db.create_task("Task 1", None, None).unwrap();
        db.create_task("Task 2", None, None).unwrap();
        assert_eq!(db.list_tasks(None).unwrap().len(), 2);

        db.clear_tasks(None).unwrap();
        assert_eq!(db.list_tasks(None).unwrap().len(), 0);
    }

    #[test]
    fn test_due_reminders_and_overdue() {
        let db = create_test_db();
        let past = Utc::now().timestamp_millis() - 1_000; // 1s ago
        let future = Utc::now().timestamp_millis() + 3_600_000; // 1h from now

        db.create_task("Past reminder", None, Some(past)).unwrap();
        db.create_task("Future reminder", None, Some(future)).unwrap();
        db.create_task("Overdue task", Some(past), None).unwrap();

        let due_reminders = db.get_due_reminders().unwrap();
        assert_eq!(due_reminders.len(), 1);
        assert_eq!(due_reminders[0].title, "Past reminder");

        let overdue = db.get_overdue_tasks().unwrap();
        assert_eq!(overdue.len(), 1);
        assert_eq!(overdue[0].title, "Overdue task");
    }

    #[test]
    fn test_task_migration_does_not_break_memories() {
        let db = create_test_db();
        // Memories still work after v2 migration
        let mem = db
            .create_memory("fact", "Migration safe", None, None)
            .unwrap();
        assert_eq!(mem.content, "Migration safe");
        // Tasks also work
        let task = db.create_task("Coexist", None, None).unwrap();
        assert_eq!(task.title, "Coexist");
    }
}
