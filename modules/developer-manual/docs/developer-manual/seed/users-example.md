## Users (EXAMPLE — replace with your real domains)

This is a sample domain page showing the expected shape. Delete it and generate real pages for your schema.

### users

User accounts and their access level. One row per person who can log in.

| Field | Type | Nullable | Meaning | Relationships | Allowed values | Notes |
|---|---|---|---|---|---|---|
| id | varchar (uuid) | no | Primary key | referenced by most `*_created_by` columns | — | DB-generated UUID |
| username | varchar(50) | no | Login handle | — | unique | |
| role | varchar(20) | no | Access level (what the user may do) | — | `admin`, `supervisor`, `user` | gates RBAC checks |
| created_at | timestamp | yes | When the account was created | — | — | defaults to now() |

**Foreign keys:** none (referenced by many tables' `created_by`).

**Data flow:** created at onboarding; `role` drives every authorization check.

**Sample queries:**
- All admins: `SELECT id, username FROM users WHERE role = 'admin';`
- Count by role: `SELECT role, count(*) FROM users GROUP BY role;`
