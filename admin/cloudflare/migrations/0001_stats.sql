CREATE TABLE reports (
 installation TEXT NOT NULL, session TEXT NOT NULL, day INTEGER NOT NULL,
 version TEXT NOT NULL, metrics TEXT NOT NULL CHECK(json_valid(metrics)),
 total INTEGER NOT NULL, last_seen INTEGER NOT NULL,
 PRIMARY KEY(installation,session,day)
);
CREATE INDEX reports_day ON reports(day);
CREATE TABLE withdrawn(installation TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE INDEX withdrawn_expiry ON withdrawn(expires);
CREATE TABLE owner_sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL, key_hash TEXT NOT NULL);
CREATE INDEX owner_sessions_expiry ON owner_sessions(expires);
