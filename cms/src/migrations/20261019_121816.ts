import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`created_at\` text,
    \`expires_at\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`email\` text NOT NULL,
    \`reset_password_token\` text,
    \`reset_password_expiration\` text,
    \`salt\` text,
    \`hash\` text,
    \`reset_password_requested_at\` text,
    \`login_attempts\` numeric DEFAULT 0,
    \`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text NOT NULL,
    \`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`global_slug\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text,
    \`value\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text,
    \`batch\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`landing_navigation_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_navigation_links_order_idx\` ON \`landing_navigation_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_navigation_links_parent_id_idx\` ON \`landing_navigation_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_workflow_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_workflow_items_order_idx\` ON \`landing_workflow_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_workflow_items_parent_id_idx\` ON \`landing_workflow_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_features_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`icon\` text,
    \`title\` text,
    \`description\` text,
    \`detail\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_features_items_order_idx\` ON \`landing_features_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_features_items_parent_id_idx\` ON \`landing_features_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_principles_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_principles_items_order_idx\` ON \`landing_principles_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_principles_items_parent_id_idx\` ON \`landing_principles_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_roadmap_items_points\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_roadmap_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_points_order_idx\` ON \`landing_roadmap_items_points\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_points_parent_id_idx\` ON \`landing_roadmap_items_points\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_roadmap_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase\` text,
    \`status\` text,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_order_idx\` ON \`landing_roadmap_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_parent_id_idx\` ON \`landing_roadmap_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_faq_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`question\` text,
    \`answer\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_faq_items_order_idx\` ON \`landing_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_faq_items_parent_id_idx\` ON \`landing_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_footer_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_footer_groups\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_links_order_idx\` ON \`landing_footer_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_links_parent_id_idx\` ON \`landing_footer_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_footer_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_order_idx\` ON \`landing_footer_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_parent_id_idx\` ON \`landing_footer_groups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`seo_title\` text,
    \`seo_description\` text,
    \`navigation_action_label\` text,
    \`hero_eyebrow\` text,
    \`hero_title\` text,
    \`hero_description\` text,
    \`hero_accent\` text,
    \`hero_primary_label\` text,
    \`hero_secondary_label\` text,
    \`hero_note\` text,
    \`hero_preview_caption\` text,
    \`hero_preview_alt\` text,
    \`workflow_eyebrow\` text,
    \`workflow_title\` text,
    \`workflow_description\` text,
    \`features_eyebrow\` text,
    \`features_title\` text,
    \`features_description\` text,
    \`features_accent\` text,
    \`principles_eyebrow\` text,
    \`principles_title\` text,
    \`principles_description\` text,
    \`roadmap_eyebrow\` text,
    \`roadmap_title\` text,
    \`roadmap_description\` text,
    \`roadmap_link_label\` text,
    \`faq_eyebrow\` text,
    \`faq_title\` text,
    \`download_eyebrow\` text,
    \`download_title\` text,
    \`download_description\` text,
    \`download_accent\` text,
    \`download_primary_label\` text,
    \`download_secondary_label\` text,
    \`download_note\` text,
    \`newsletter_eyebrow\` text,
    \`newsletter_title\` text,
    \`newsletter_description\` text,
    \`footer_tagline\` text,
    \`footer_github_label\` text,
    \`footer_signoff\` text,
    \`footer_back_to_top_label\` text,
    \`footer_license_label\` text,
    \`footer_colophon\` text,
    \`_status\` text DEFAULT 'draft',
    \`updated_at\` text,
    \`created_at\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`landing__status_idx\` ON \`landing\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_navigation_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_links_order_idx\` ON \`_landing_v_version_navigation_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_links_parent_id_idx\` ON \`_landing_v_version_navigation_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_workflow_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_workflow_items_order_idx\` ON \`_landing_v_version_workflow_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_workflow_items_parent_id_idx\` ON \`_landing_v_version_workflow_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_features_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`icon\` text,
    \`title\` text,
    \`description\` text,
    \`detail\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_order_idx\` ON \`_landing_v_version_features_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_parent_id_idx\` ON \`_landing_v_version_features_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_principles_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_principles_items_order_idx\` ON \`_landing_v_version_principles_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_principles_items_parent_id_idx\` ON \`_landing_v_version_principles_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_roadmap_items_points\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_roadmap_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_points_order_idx\` ON \`_landing_v_version_roadmap_items_points\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_points_parent_id_idx\` ON \`_landing_v_version_roadmap_items_points\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_roadmap_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`phase\` text,
    \`status\` text,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_order_idx\` ON \`_landing_v_version_roadmap_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_parent_id_idx\` ON \`_landing_v_version_roadmap_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_faq_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`question\` text,
    \`answer\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_faq_items_order_idx\` ON \`_landing_v_version_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_faq_items_parent_id_idx\` ON \`_landing_v_version_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_footer_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_footer_groups\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_links_order_idx\` ON \`_landing_v_version_footer_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_links_parent_id_idx\` ON \`_landing_v_version_footer_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_footer_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_order_idx\` ON \`_landing_v_version_footer_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_parent_id_idx\` ON \`_landing_v_version_footer_groups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`version_seo_title\` text,
    \`version_seo_description\` text,
    \`version_navigation_action_label\` text,
    \`version_hero_eyebrow\` text,
    \`version_hero_title\` text,
    \`version_hero_description\` text,
    \`version_hero_accent\` text,
    \`version_hero_primary_label\` text,
    \`version_hero_secondary_label\` text,
    \`version_hero_note\` text,
    \`version_hero_preview_caption\` text,
    \`version_hero_preview_alt\` text,
    \`version_workflow_eyebrow\` text,
    \`version_workflow_title\` text,
    \`version_workflow_description\` text,
    \`version_features_eyebrow\` text,
    \`version_features_title\` text,
    \`version_features_description\` text,
    \`version_features_accent\` text,
    \`version_principles_eyebrow\` text,
    \`version_principles_title\` text,
    \`version_principles_description\` text,
    \`version_roadmap_eyebrow\` text,
    \`version_roadmap_title\` text,
    \`version_roadmap_description\` text,
    \`version_roadmap_link_label\` text,
    \`version_faq_eyebrow\` text,
    \`version_faq_title\` text,
    \`version_download_eyebrow\` text,
    \`version_download_title\` text,
    \`version_download_description\` text,
    \`version_download_accent\` text,
    \`version_download_primary_label\` text,
    \`version_download_secondary_label\` text,
    \`version_download_note\` text,
    \`version_newsletter_eyebrow\` text,
    \`version_newsletter_title\` text,
    \`version_newsletter_description\` text,
    \`version_footer_tagline\` text,
    \`version_footer_github_label\` text,
    \`version_footer_signoff\` text,
    \`version_footer_back_to_top_label\` text,
    \`version_footer_license_label\` text,
    \`version_footer_colophon\` text,
    \`version__status\` text DEFAULT 'draft',
    \`version_updated_at\` text,
    \`version_created_at\` text,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`latest\` integer
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_version__status_idx\` ON \`_landing_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_created_at_idx\` ON \`_landing_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_updated_at_idx\` ON \`_landing_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_latest_idx\` ON \`_landing_v\` (\`latest\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`landing_navigation_links\`;`)
  await db.run(sql`DROP TABLE \`landing_workflow_items\`;`)
  await db.run(sql`DROP TABLE \`landing_features_items\`;`)
  await db.run(sql`DROP TABLE \`landing_principles_items\`;`)
  await db.run(sql`DROP TABLE \`landing_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`landing_roadmap_items\`;`)
  await db.run(sql`DROP TABLE \`landing_faq_items\`;`)
  await db.run(sql`DROP TABLE \`landing_footer_groups_links\`;`)
  await db.run(sql`DROP TABLE \`landing_footer_groups\`;`)
  await db.run(sql`DROP TABLE \`landing\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_navigation_links\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_workflow_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_features_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_principles_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_roadmap_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_faq_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_footer_groups_links\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_footer_groups\`;`)
  await db.run(sql`DROP TABLE \`_landing_v\`;`)
}
