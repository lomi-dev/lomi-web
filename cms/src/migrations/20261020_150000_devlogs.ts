import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`devlogs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`video_url\` text,
  	\`published_at\` text,
  	\`description\` text,
  	\`duration\` text,
  	\`thumbnail_id\` integer,
  	\`thumbnail_alt\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`devlogs_thumbnail_idx\` ON \`devlogs\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`devlogs_updated_at_idx\` ON \`devlogs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`devlogs_created_at_idx\` ON \`devlogs\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`devlogs__status_idx\` ON \`devlogs\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`_devlogs_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_video_url\` text,
  	\`version_published_at\` text,
  	\`version_description\` text,
  	\`version_duration\` text,
  	\`version_thumbnail_id\` integer,
  	\`version_thumbnail_alt\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`devlogs\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_devlogs_v_parent_idx\` ON \`_devlogs_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_version_version_thumbnail_idx\` ON \`_devlogs_v\` (\`version_thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_version_version_updated_at_idx\` ON \`_devlogs_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_version_version_created_at_idx\` ON \`_devlogs_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_version_version__status_idx\` ON \`_devlogs_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_created_at_idx\` ON \`_devlogs_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_updated_at_idx\` ON \`_devlogs_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_devlogs_v_latest_idx\` ON \`_devlogs_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`devlogs_id\` integer REFERENCES devlogs(id) ON DELETE cascade;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_devlogs_id_idx\` ON \`payload_locked_documents_rels\` (\`devlogs_id\`);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_latest_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_archive_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_watch_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_empty_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_empty_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_empty_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_empty_preview_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_empty_preview_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_latest_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_archive_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_watch_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_empty_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_empty_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_empty_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_empty_preview_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_empty_preview_title\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`payload_locked_documents_rels_devlogs_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`devlogs_id\`;`)
  await db.run(sql`DROP TABLE \`_devlogs_v\`;`)
  await db.run(sql`DROP TABLE \`devlogs\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_latest_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_archive_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_watch_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_empty_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_empty_title\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_empty_description\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_empty_preview_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`pages_devlog_empty_preview_title\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_latest_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_archive_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_watch_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_empty_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_empty_title\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_empty_description\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_empty_preview_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_pages_devlog_empty_preview_title\`;`)
}
