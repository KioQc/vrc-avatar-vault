CREATE TABLE IF NOT EXISTS unity_projects(avatar_id TEXT PRIMARY KEY REFERENCES avatars(id) ON DELETE CASCADE, path TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)), last_opened TEXT);
CREATE TABLE IF NOT EXISTS unity_dependency_snapshots(id TEXT PRIMARY KEY, avatar_id TEXT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE, data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_unity_snapshots ON unity_dependency_snapshots(avatar_id,created_at DESC);
PRAGMA user_version=2;
