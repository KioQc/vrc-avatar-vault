# Local integration protocol v1

Base `http://127.0.0.1:17861/api/v1`. Enabled explicitly in desktop Settings, disabled on startup. Every request needs `Authorization: Bearer <token>`; POST also needs `Content-Type: application/json` and Content-Length. Token stored in Windows credential vault. Browser Origin, duplicate headers, transfer encoding and nonlocal Host rejected. No cookies, CORS or external listening.

GET `/status` → protocolVersion, appVersion, capabilities.
GET `/avatars` → avatars array {id,name,version,vrchatId}.
GET `/avatars/{id}` → selected avatar data.
GET `/events?after=0` → incremental activity events. Poll using returned cursor. No WebSocket.
POST `/presence` → {protocolVersion:1,project,scene,avatar}; strings bounded and no absolute project path required.
POST `/avatars/{id}/changes` → {title,description,category}; creates Unreleased entry.
POST `/avatars/{id}/sessions` → {description}; starts one work session.
POST `/avatars/{id}/snapshots` → {label,releaseId?,data}; data {schemaVersion:1,source:"unity_editor_plugin",platform:"PC"|"Quest"|"iOS"|"Unknown",parameters?,menus?,hierarchy?,controllers?,descriptor?,materials?,textures?,metrics?}. Arrays contain objects with stable id/name when available; unknown values omitted or null. Body max 8 MiB.
POST `/avatars/{id}/baselines` → {label,releaseId?}; scan the already-linked local project and save filesystem baseline.
POST `/avatars/{id}/releases` → {title,version,description,includeUnreleased?}; version is exact SemVer, must increase. No remote upload or rename.
POST `/avatars/{id}/open` → {}; navigate desktop.

Errors return JSON {error} and non-2xx HTTP status. Snapshot release IDs must belong to the same avatar. Each write operation is atomic; release then snapshot are separate requests. A client must retain the created release id if a following snapshot fails.
