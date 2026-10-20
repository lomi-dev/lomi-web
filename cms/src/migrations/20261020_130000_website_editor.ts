import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`media\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`alt\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`url\` text,
    \`thumbnail_u_r_l\` text,
    \`filename\` text,
    \`mime_type\` text,
    \`filesize\` numeric,
    \`width\` numeric,
    \`height\` numeric,
    \`focal_x\` numeric,
    \`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`landing_navigation_product_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_navigation_product_groups\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_navigation_product_groups_links_order_idx\` ON \`landing_navigation_product_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_navigation_product_groups_links_parent_id_idx\` ON \`landing_navigation_product_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_navigation_product_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_navigation_product_groups_order_idx\` ON \`landing_navigation_product_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_navigation_product_groups_parent_id_idx\` ON \`landing_navigation_product_groups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_footer_socials\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`icon\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_footer_socials_order_idx\` ON \`landing_footer_socials\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_footer_socials_parent_id_idx\` ON \`landing_footer_socials\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_layout\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`section\` text,
    \`enabled\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_layout_order_idx\` ON \`landing_layout\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_layout_parent_id_idx\` ON \`landing_layout\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_download_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_download_description_order_idx\` ON \`landing_pages_download_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_download_description_parent_id_idx\` ON \`landing_pages_download_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_remote_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_remote_description_order_idx\` ON \`landing_pages_remote_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_remote_description_parent_id_idx\` ON \`landing_pages_remote_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_devlog_title\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_devlog_title_order_idx\` ON \`landing_pages_devlog_title\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_devlog_title_parent_id_idx\` ON \`landing_pages_devlog_title\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_devlog_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_devlog_description_order_idx\` ON \`landing_pages_devlog_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_devlog_description_parent_id_idx\` ON \`landing_pages_devlog_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_cookies_sections_paragraphs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_pages_cookies_sections\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_sections_paragraphs_order_idx\` ON \`landing_pages_cookies_sections_paragraphs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_sections_paragraphs_parent_id_idx\` ON \`landing_pages_cookies_sections_paragraphs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_cookies_sections\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    \`show_settings\` integer DEFAULT true,
    \`show_storage\` integer DEFAULT false,
    \`show_noscript\` integer DEFAULT true,
    \`noscript\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_sections_order_idx\` ON \`landing_pages_cookies_sections\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_sections_parent_id_idx\` ON \`landing_pages_cookies_sections\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`landing_pages_cookies_storage\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`value\` text,
    \`code\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_storage_order_idx\` ON \`landing_pages_cookies_storage\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_cookies_storage_parent_id_idx\` ON \`landing_pages_cookies_storage\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_navigation_product_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_navigation_product_groups\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_product_groups_links_order_idx\` ON \`_landing_v_version_navigation_product_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_product_groups_links_parent_id_idx\` ON \`_landing_v_version_navigation_product_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_navigation_product_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_product_groups_order_idx\` ON \`_landing_v_version_navigation_product_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_product_groups_parent_id_idx\` ON \`_landing_v_version_navigation_product_groups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_footer_socials\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`icon\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_socials_order_idx\` ON \`_landing_v_version_footer_socials\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_socials_parent_id_idx\` ON \`_landing_v_version_footer_socials\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_layout\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`section\` text,
    \`enabled\` integer DEFAULT true,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_layout_order_idx\` ON \`_landing_v_version_layout\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_layout_parent_id_idx\` ON \`_landing_v_version_layout\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_download_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`text\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_download_description_order_idx\` ON \`_landing_v_version_pages_download_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_download_description_parent_id_idx\` ON \`_landing_v_version_pages_download_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_remote_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`text\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_remote_description_order_idx\` ON \`_landing_v_version_pages_remote_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_remote_description_parent_id_idx\` ON \`_landing_v_version_pages_remote_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_devlog_title\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`text\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_devlog_title_order_idx\` ON \`_landing_v_version_pages_devlog_title\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_devlog_title_parent_id_idx\` ON \`_landing_v_version_pages_devlog_title\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_devlog_description\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`text\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_devlog_description_order_idx\` ON \`_landing_v_version_pages_devlog_description\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_devlog_description_parent_id_idx\` ON \`_landing_v_version_pages_devlog_description\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_cookies_sections_paragraphs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`text\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_pages_cookies_sections\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_sections_paragraphs_order_idx\` ON \`_landing_v_version_pages_cookies_sections_paragraphs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_sections_paragraphs_parent_id_idx\` ON \`_landing_v_version_pages_cookies_sections_paragraphs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_cookies_sections\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`show_settings\` integer DEFAULT true,
    \`show_storage\` integer DEFAULT false,
    \`show_noscript\` integer DEFAULT true,
    \`noscript\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_sections_order_idx\` ON \`_landing_v_version_pages_cookies_sections\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_sections_parent_id_idx\` ON \`_landing_v_version_pages_cookies_sections\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_pages_cookies_storage\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`value\` text,
    \`code\` integer DEFAULT true,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_storage_order_idx\` ON \`_landing_v_version_pages_cookies_storage\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_cookies_storage_parent_id_idx\` ON \`_landing_v_version_pages_cookies_storage\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`media_id\` integer REFERENCES media(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`ALTER TABLE \`landing_features_items\` ADD \`image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing_features_items\` ADD \`video_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing_features_items\` ADD \`alt\` text;`)
  await db.run(sql`CREATE INDEX \`landing_features_items_image_idx\` ON \`landing_features_items\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_features_items_video_idx\` ON \`landing_features_items\` (\`video_id\`);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`editor_version\` numeric;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_product_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_menu_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_back_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_source_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_source_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_primary_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_mobile_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`navigation_action_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_license_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_copyright_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_cookie_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_content_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_navigation_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`footer_socials_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_brand_name\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_brand_logo_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_brand_logo_alt\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_brand_favicon_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_brand_social_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_accent\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_accent_hover\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_accent_pressed\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_ink\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_background\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_paper\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_muted\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_line\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_focus\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_dark\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_theme_dark_text\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_github_url\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_docs_url\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_language\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_skip_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_close_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_introduction\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_information_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_information_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_introduction_suffix\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_customize_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_accept_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_reject_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_necessary_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_always_on_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_necessary_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_media_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_media_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_retention\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_save_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_dismiss_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`site_cookie_storage_error\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_poster_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_video_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_media_mode\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_video_url\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_primary_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_secondary_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_video_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_privacy_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_watch_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_loading_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_ready_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`hero_player_error_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_close_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_previous_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_next_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_choose_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_show_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_legend_completed\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_legend_progress\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_legend_planned\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_legend_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_progress_template\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_progress_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_scroll_hint\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_previous_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_next_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_stages_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`roadmap_ui_explore_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_email_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_placeholder\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_submit_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_pending_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_success_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_unavailable_message\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_pending_message\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_success_message\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_rate_limit_message\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_error_message\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_note\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_form_noscript\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`newsletter_stamp_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_chooser_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_system_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_download_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_macos_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_macos_legend\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_windows_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_windows_legend\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_linux_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_platforms_linux_legend\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_apple_silicon_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_apple_silicon_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_apple_silicon_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_intel_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_intel_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_intel_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_exe_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_exe_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_exe_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_msi_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_msi_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_msi_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_appimage_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_appimage_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_appimage_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_deb_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_deb_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_deb_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_rpm_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_rpm_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_packages_rpm_detail\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_show_windows_help\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_windows_help_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_windows_help_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_noscript\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_retry_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_releases_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_package_error\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_package_ready\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_package_missing\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_package_fallback\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_release_ready\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_feedback_release_error\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_show_aur\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_link_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_command\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copy_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copy_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copied_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copy_fallback_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copied_status\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_aur_copy_error\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_show_screenshot\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_screenshot_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_screenshot_alt\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_screenshot_heading\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_screenshot_caption\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_show_help\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_help_text\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_help_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_download_help_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_installer_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_system_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_platforms_unix_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_platforms_unix_command\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_platforms_windows_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_platforms_windows_command\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_command_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_copy_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_manual_copy\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_feedback_waiting\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_feedback_copied\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_feedback_error\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_show_screenshot\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_screenshot_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_remote_screenshot_alt\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_label_accent\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_accent\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_cta_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_cta_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_footer_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_source_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_devlog_source_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_title\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_description\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_links_embedding_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_links_embedding_href\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_links_privacy_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`pages_cookies_links_privacy_href\` text;`)
  await db.run(sql`CREATE INDEX \`landing_site_brand_site_brand_logo_idx\` ON \`landing\` (\`site_brand_logo_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_site_brand_site_brand_favicon_idx\` ON \`landing\` (\`site_brand_favicon_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_site_brand_site_brand_social_image_idx\` ON \`landing\` (\`site_brand_social_image_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_hero_hero_poster_idx\` ON \`landing\` (\`hero_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_hero_hero_video_idx\` ON \`landing\` (\`hero_video_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_download_screenshot_pages_download_screens_idx\` ON \`landing\` (\`pages_download_screenshot_image_id\`);`)
  await db.run(sql`CREATE INDEX \`landing_pages_remote_screenshot_pages_remote_screenshot__idx\` ON \`landing\` (\`pages_remote_screenshot_image_id\`);`)
  await db.run(sql`ALTER TABLE \`_landing_v_version_features_items\` ADD \`image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v_version_features_items\` ADD \`video_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v_version_features_items\` ADD \`alt\` text;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_image_idx\` ON \`_landing_v_version_features_items\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_video_idx\` ON \`_landing_v_version_features_items\` (\`video_id\`);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_editor_version\` numeric;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_product_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_menu_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_back_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_source_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_source_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_primary_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_mobile_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_navigation_action_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_license_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_copyright_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_cookie_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_content_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_navigation_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_footer_socials_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_brand_name\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_brand_logo_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_brand_logo_alt\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_brand_favicon_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_brand_social_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_accent\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_accent_hover\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_accent_pressed\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_ink\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_background\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_paper\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_muted\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_line\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_focus\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_dark\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_theme_dark_text\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_github_url\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_docs_url\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_language\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_skip_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_close_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_introduction\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_information_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_information_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_introduction_suffix\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_customize_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_accept_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_reject_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_necessary_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_always_on_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_necessary_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_media_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_media_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_retention\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_save_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_dismiss_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_site_cookie_storage_error\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_poster_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_video_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_media_mode\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_video_url\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_primary_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_secondary_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_video_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_privacy_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_watch_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_loading_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_ready_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_hero_player_error_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_close_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_previous_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_next_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_choose_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_show_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_legend_completed\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_legend_progress\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_legend_planned\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_legend_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_progress_template\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_progress_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_scroll_hint\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_previous_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_next_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_stages_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_roadmap_ui_explore_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_email_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_placeholder\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_submit_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_pending_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_success_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_unavailable_message\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_pending_message\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_success_message\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_rate_limit_message\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_error_message\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_note\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_form_noscript\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_newsletter_stamp_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_chooser_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_system_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_download_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_macos_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_macos_legend\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_windows_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_windows_legend\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_linux_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_platforms_linux_legend\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_apple_silicon_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_apple_silicon_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_apple_silicon_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_intel_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_intel_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_intel_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_exe_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_exe_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_exe_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_msi_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_msi_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_msi_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_appimage_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_appimage_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_appimage_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_deb_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_deb_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_deb_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_rpm_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_rpm_status_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_packages_rpm_detail\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_show_windows_help\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_windows_help_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_windows_help_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_noscript\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_retry_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_releases_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_package_error\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_package_ready\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_package_missing\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_package_fallback\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_release_ready\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_feedback_release_error\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_show_aur\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_link_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_command\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copy_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copy_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copied_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copy_fallback_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copied_status\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_aur_copy_error\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_show_screenshot\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_screenshot_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_screenshot_alt\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_screenshot_heading\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_screenshot_caption\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_show_help\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_help_text\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_help_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_download_help_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_installer_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_system_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_platforms_unix_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_platforms_unix_command\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_platforms_windows_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_platforms_windows_command\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_command_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_copy_aria_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_manual_copy\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_feedback_waiting\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_feedback_copied\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_feedback_error\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_show_screenshot\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_screenshot_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_remote_screenshot_alt\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_label_accent\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_accent\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_cta_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_cta_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_footer_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_source_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_devlog_source_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_title\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_description\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_links_embedding_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_links_embedding_href\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_links_privacy_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_pages_cookies_links_privacy_href\` text;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_site_brand_version_site_brand_logo_idx\` ON \`_landing_v\` (\`version_site_brand_logo_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_site_brand_version_site_brand_favicon_idx\` ON \`_landing_v\` (\`version_site_brand_favicon_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_site_brand_version_site_brand_social__idx\` ON \`_landing_v\` (\`version_site_brand_social_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_hero_version_hero_poster_idx\` ON \`_landing_v\` (\`version_hero_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_hero_version_hero_video_idx\` ON \`_landing_v\` (\`version_hero_video_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_download_screenshot_version_pag_idx\` ON \`_landing_v\` (\`version_pages_download_screenshot_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_pages_remote_screenshot_version_pages_idx\` ON \`_landing_v\` (\`version_pages_remote_screenshot_image_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop relationship columns with table-level foreign keys.
  // Back up and restore the entire legacy tree in dependency order, including
  // nested published/version rows, so FK cascades never discard legacy content.
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v\` AS SELECT \`id\`, \`version_seo_title\`, \`version_seo_description\`, \`version_navigation_action_label\`, \`version_hero_eyebrow\`, \`version_hero_title\`, \`version_hero_description\`, \`version_hero_accent\`, \`version_hero_primary_label\`, \`version_hero_secondary_label\`, \`version_hero_note\`, \`version_hero_preview_caption\`, \`version_hero_preview_alt\`, \`version_workflow_eyebrow\`, \`version_workflow_title\`, \`version_workflow_description\`, \`version_features_eyebrow\`, \`version_features_title\`, \`version_features_description\`, \`version_features_accent\`, \`version_principles_eyebrow\`, \`version_principles_title\`, \`version_principles_description\`, \`version_roadmap_eyebrow\`, \`version_roadmap_title\`, \`version_roadmap_description\`, \`version_roadmap_link_label\`, \`version_faq_eyebrow\`, \`version_faq_title\`, \`version_download_eyebrow\`, \`version_download_title\`, \`version_download_description\`, \`version_download_accent\`, \`version_download_primary_label\`, \`version_download_secondary_label\`, \`version_download_note\`, \`version_newsletter_eyebrow\`, \`version_newsletter_title\`, \`version_newsletter_description\`, \`version_footer_tagline\`, \`version_footer_github_label\`, \`version_footer_signoff\`, \`version_footer_back_to_top_label\`, \`version_footer_license_label\`, \`version_footer_colophon\`, \`version__status\`, \`version_updated_at\`, \`version_created_at\`, \`created_at\`, \`updated_at\`, \`latest\` FROM \`_landing_v\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing\` AS SELECT \`id\`, \`seo_title\`, \`seo_description\`, \`navigation_action_label\`, \`hero_eyebrow\`, \`hero_title\`, \`hero_description\`, \`hero_accent\`, \`hero_primary_label\`, \`hero_secondary_label\`, \`hero_note\`, \`hero_preview_caption\`, \`hero_preview_alt\`, \`workflow_eyebrow\`, \`workflow_title\`, \`workflow_description\`, \`features_eyebrow\`, \`features_title\`, \`features_description\`, \`features_accent\`, \`principles_eyebrow\`, \`principles_title\`, \`principles_description\`, \`roadmap_eyebrow\`, \`roadmap_title\`, \`roadmap_description\`, \`roadmap_link_label\`, \`faq_eyebrow\`, \`faq_title\`, \`download_eyebrow\`, \`download_title\`, \`download_description\`, \`download_accent\`, \`download_primary_label\`, \`download_secondary_label\`, \`download_note\`, \`newsletter_eyebrow\`, \`newsletter_title\`, \`newsletter_description\`, \`footer_tagline\`, \`footer_github_label\`, \`footer_signoff\`, \`footer_back_to_top_label\`, \`footer_license_label\`, \`footer_colophon\`, \`_status\`, \`updated_at\`, \`created_at\` FROM \`landing\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_payload_locked_documents_rels\` AS SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\` FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_faq_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\`, \`_uuid\` FROM \`_landing_v_version_faq_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_features_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\`, \`_uuid\` FROM \`_landing_v_version_features_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_footer_groups\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`_uuid\` FROM \`_landing_v_version_footer_groups\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_navigation_links\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\` FROM \`_landing_v_version_navigation_links\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_principles_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\` FROM \`_landing_v_version_principles_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_roadmap_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\`, \`_uuid\` FROM \`_landing_v_version_roadmap_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_workflow_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\` FROM \`_landing_v_version_workflow_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_faq_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\` FROM \`landing_faq_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_features_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\` FROM \`landing_features_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_footer_groups\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\` FROM \`landing_footer_groups\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_navigation_links\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\` FROM \`landing_navigation_links\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_principles_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\` FROM \`landing_principles_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_roadmap_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\` FROM \`landing_roadmap_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_workflow_items\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\` FROM \`landing_workflow_items\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_footer_groups_links\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\` FROM \`_landing_v_version_footer_groups_links\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup__landing_v_version_roadmap_items_points\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\`, \`_uuid\` FROM \`_landing_v_version_roadmap_items_points\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_footer_groups_links\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\` FROM \`landing_footer_groups_links\`;`)
  await db.run(sql`CREATE TEMP TABLE \`__editor_backup_landing_roadmap_items_points\` AS SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\` FROM \`landing_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_cookies_sections_paragraphs\`;`)
  await db.run(sql`DROP TABLE \`landing_navigation_product_groups_links\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_cookies_sections_paragraphs\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_navigation_product_groups_links\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_remote_description\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_download_description\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_devlog_title\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_devlog_description\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_cookies_storage\`;`)
  await db.run(sql`DROP TABLE \`landing_pages_cookies_sections\`;`)
  await db.run(sql`DROP TABLE \`landing_navigation_product_groups\`;`)
  await db.run(sql`DROP TABLE \`landing_layout\`;`)
  await db.run(sql`DROP TABLE \`landing_footer_socials\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_remote_description\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_download_description\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_devlog_title\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_devlog_description\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_cookies_storage\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_pages_cookies_sections\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_navigation_product_groups\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_layout\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_footer_socials\`;`)
  await db.run(sql`DROP TABLE \`landing_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`landing_footer_groups_links\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_footer_groups_links\`;`)
  await db.run(sql`DROP TABLE \`landing_workflow_items\`;`)
  await db.run(sql`DROP TABLE \`landing_roadmap_items\`;`)
  await db.run(sql`DROP TABLE \`landing_principles_items\`;`)
  await db.run(sql`DROP TABLE \`landing_navigation_links\`;`)
  await db.run(sql`DROP TABLE \`landing_footer_groups\`;`)
  await db.run(sql`DROP TABLE \`landing_features_items\`;`)
  await db.run(sql`DROP TABLE \`landing_faq_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_workflow_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_roadmap_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_principles_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_navigation_links\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_footer_groups\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_features_items\`;`)
  await db.run(sql`DROP TABLE \`_landing_v_version_faq_items\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`landing\`;`)
  await db.run(sql`DROP TABLE \`_landing_v\`;`)
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
    \`created_at\` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    \`updated_at\` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    \`latest\` integer
  );`)
  await db.run(sql`INSERT INTO \`_landing_v\` (\`id\`, \`version_seo_title\`, \`version_seo_description\`, \`version_navigation_action_label\`, \`version_hero_eyebrow\`, \`version_hero_title\`, \`version_hero_description\`, \`version_hero_accent\`, \`version_hero_primary_label\`, \`version_hero_secondary_label\`, \`version_hero_note\`, \`version_hero_preview_caption\`, \`version_hero_preview_alt\`, \`version_workflow_eyebrow\`, \`version_workflow_title\`, \`version_workflow_description\`, \`version_features_eyebrow\`, \`version_features_title\`, \`version_features_description\`, \`version_features_accent\`, \`version_principles_eyebrow\`, \`version_principles_title\`, \`version_principles_description\`, \`version_roadmap_eyebrow\`, \`version_roadmap_title\`, \`version_roadmap_description\`, \`version_roadmap_link_label\`, \`version_faq_eyebrow\`, \`version_faq_title\`, \`version_download_eyebrow\`, \`version_download_title\`, \`version_download_description\`, \`version_download_accent\`, \`version_download_primary_label\`, \`version_download_secondary_label\`, \`version_download_note\`, \`version_newsletter_eyebrow\`, \`version_newsletter_title\`, \`version_newsletter_description\`, \`version_footer_tagline\`, \`version_footer_github_label\`, \`version_footer_signoff\`, \`version_footer_back_to_top_label\`, \`version_footer_license_label\`, \`version_footer_colophon\`, \`version__status\`, \`version_updated_at\`, \`version_created_at\`, \`created_at\`, \`updated_at\`, \`latest\`) SELECT \`id\`, \`version_seo_title\`, \`version_seo_description\`, \`version_navigation_action_label\`, \`version_hero_eyebrow\`, \`version_hero_title\`, \`version_hero_description\`, \`version_hero_accent\`, \`version_hero_primary_label\`, \`version_hero_secondary_label\`, \`version_hero_note\`, \`version_hero_preview_caption\`, \`version_hero_preview_alt\`, \`version_workflow_eyebrow\`, \`version_workflow_title\`, \`version_workflow_description\`, \`version_features_eyebrow\`, \`version_features_title\`, \`version_features_description\`, \`version_features_accent\`, \`version_principles_eyebrow\`, \`version_principles_title\`, \`version_principles_description\`, \`version_roadmap_eyebrow\`, \`version_roadmap_title\`, \`version_roadmap_description\`, \`version_roadmap_link_label\`, \`version_faq_eyebrow\`, \`version_faq_title\`, \`version_download_eyebrow\`, \`version_download_title\`, \`version_download_description\`, \`version_download_accent\`, \`version_download_primary_label\`, \`version_download_secondary_label\`, \`version_download_note\`, \`version_newsletter_eyebrow\`, \`version_newsletter_title\`, \`version_newsletter_description\`, \`version_footer_tagline\`, \`version_footer_github_label\`, \`version_footer_signoff\`, \`version_footer_back_to_top_label\`, \`version_footer_license_label\`, \`version_footer_colophon\`, \`version__status\`, \`version_updated_at\`, \`version_created_at\`, \`created_at\`, \`updated_at\`, \`latest\` FROM \`__editor_backup__landing_v\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_version__status_idx\` ON \`_landing_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_created_at_idx\` ON \`_landing_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_updated_at_idx\` ON \`_landing_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_latest_idx\` ON \`_landing_v\` (\`latest\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v\`;`)
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
  );`)
  await db.run(sql`INSERT INTO \`landing\` (\`id\`, \`seo_title\`, \`seo_description\`, \`navigation_action_label\`, \`hero_eyebrow\`, \`hero_title\`, \`hero_description\`, \`hero_accent\`, \`hero_primary_label\`, \`hero_secondary_label\`, \`hero_note\`, \`hero_preview_caption\`, \`hero_preview_alt\`, \`workflow_eyebrow\`, \`workflow_title\`, \`workflow_description\`, \`features_eyebrow\`, \`features_title\`, \`features_description\`, \`features_accent\`, \`principles_eyebrow\`, \`principles_title\`, \`principles_description\`, \`roadmap_eyebrow\`, \`roadmap_title\`, \`roadmap_description\`, \`roadmap_link_label\`, \`faq_eyebrow\`, \`faq_title\`, \`download_eyebrow\`, \`download_title\`, \`download_description\`, \`download_accent\`, \`download_primary_label\`, \`download_secondary_label\`, \`download_note\`, \`newsletter_eyebrow\`, \`newsletter_title\`, \`newsletter_description\`, \`footer_tagline\`, \`footer_github_label\`, \`footer_signoff\`, \`footer_back_to_top_label\`, \`footer_license_label\`, \`footer_colophon\`, \`_status\`, \`updated_at\`, \`created_at\`) SELECT \`id\`, \`seo_title\`, \`seo_description\`, \`navigation_action_label\`, \`hero_eyebrow\`, \`hero_title\`, \`hero_description\`, \`hero_accent\`, \`hero_primary_label\`, \`hero_secondary_label\`, \`hero_note\`, \`hero_preview_caption\`, \`hero_preview_alt\`, \`workflow_eyebrow\`, \`workflow_title\`, \`workflow_description\`, \`features_eyebrow\`, \`features_title\`, \`features_description\`, \`features_accent\`, \`principles_eyebrow\`, \`principles_title\`, \`principles_description\`, \`roadmap_eyebrow\`, \`roadmap_title\`, \`roadmap_description\`, \`roadmap_link_label\`, \`faq_eyebrow\`, \`faq_title\`, \`download_eyebrow\`, \`download_title\`, \`download_description\`, \`download_accent\`, \`download_primary_label\`, \`download_secondary_label\`, \`download_note\`, \`newsletter_eyebrow\`, \`newsletter_title\`, \`newsletter_description\`, \`footer_tagline\`, \`footer_github_label\`, \`footer_signoff\`, \`footer_back_to_top_label\`, \`footer_license_label\`, \`footer_colophon\`, \`_status\`, \`updated_at\`, \`created_at\` FROM \`__editor_backup_landing\`;`)
  await db.run(sql`CREATE INDEX \`landing__status_idx\` ON \`landing\` (\`_status\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing\`;`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\` (\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`payload_locked_documents_rels\` (\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\` FROM \`__editor_backup_payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_faq_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`question\` text,
    \`answer\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_faq_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_faq_items\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_faq_items_order_idx\` ON \`_landing_v_version_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_faq_items_parent_id_idx\` ON \`_landing_v_version_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_faq_items\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_features_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`icon\` text,
    \`title\` text,
    \`description\` text,
    \`detail\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_features_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_features_items\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_order_idx\` ON \`_landing_v_version_features_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_features_items_parent_id_idx\` ON \`_landing_v_version_features_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_features_items\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_footer_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_footer_groups\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_footer_groups\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_order_idx\` ON \`_landing_v_version_footer_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_parent_id_idx\` ON \`_landing_v_version_footer_groups\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_footer_groups\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_navigation_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_navigation_links\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_navigation_links\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_links_order_idx\` ON \`_landing_v_version_navigation_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_navigation_links_parent_id_idx\` ON \`_landing_v_version_navigation_links\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_navigation_links\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_principles_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_principles_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_principles_items\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_principles_items_order_idx\` ON \`_landing_v_version_principles_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_principles_items_parent_id_idx\` ON \`_landing_v_version_principles_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_principles_items\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_roadmap_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`phase\` text,
    \`status\` text,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_roadmap_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_roadmap_items\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_order_idx\` ON \`_landing_v_version_roadmap_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_parent_id_idx\` ON \`_landing_v_version_roadmap_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_roadmap_items\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_workflow_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_workflow_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_workflow_items\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_workflow_items_order_idx\` ON \`_landing_v_version_workflow_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_workflow_items_parent_id_idx\` ON \`_landing_v_version_workflow_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_workflow_items\`;`)
  await db.run(sql`CREATE TABLE \`landing_faq_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`question\` text,
    \`answer\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_faq_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`question\`, \`answer\` FROM \`__editor_backup_landing_faq_items\`;`)
  await db.run(sql`CREATE INDEX \`landing_faq_items_order_idx\` ON \`landing_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_faq_items_parent_id_idx\` ON \`landing_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_faq_items\`;`)
  await db.run(sql`CREATE TABLE \`landing_features_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`icon\` text,
    \`title\` text,
    \`description\` text,
    \`detail\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_features_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`icon\`, \`title\`, \`description\`, \`detail\` FROM \`__editor_backup_landing_features_items\`;`)
  await db.run(sql`CREATE INDEX \`landing_features_items_order_idx\` ON \`landing_features_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_features_items_parent_id_idx\` ON \`landing_features_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_features_items\`;`)
  await db.run(sql`CREATE TABLE \`landing_footer_groups\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_footer_groups\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\` FROM \`__editor_backup_landing_footer_groups\`;`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_order_idx\` ON \`landing_footer_groups\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_parent_id_idx\` ON \`landing_footer_groups\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_footer_groups\`;`)
  await db.run(sql`CREATE TABLE \`landing_navigation_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_navigation_links\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\` FROM \`__editor_backup_landing_navigation_links\`;`)
  await db.run(sql`CREATE INDEX \`landing_navigation_links_order_idx\` ON \`landing_navigation_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_navigation_links_parent_id_idx\` ON \`landing_navigation_links\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_navigation_links\`;`)
  await db.run(sql`CREATE TABLE \`landing_principles_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_principles_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\` FROM \`__editor_backup_landing_principles_items\`;`)
  await db.run(sql`CREATE INDEX \`landing_principles_items_order_idx\` ON \`landing_principles_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_principles_items_parent_id_idx\` ON \`landing_principles_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_principles_items\`;`)
  await db.run(sql`CREATE TABLE \`landing_roadmap_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase\` text,
    \`status\` text,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_roadmap_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`phase\`, \`status\`, \`title\`, \`description\` FROM \`__editor_backup_landing_roadmap_items\`;`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_order_idx\` ON \`landing_roadmap_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_parent_id_idx\` ON \`landing_roadmap_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_roadmap_items\`;`)
  await db.run(sql`CREATE TABLE \`landing_workflow_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text,
    \`description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_workflow_items\` (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`description\` FROM \`__editor_backup_landing_workflow_items\`;`)
  await db.run(sql`CREATE INDEX \`landing_workflow_items_order_idx\` ON \`landing_workflow_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_workflow_items_parent_id_idx\` ON \`landing_workflow_items\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_workflow_items\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_footer_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_footer_groups\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_footer_groups_links\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_footer_groups_links\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_links_order_idx\` ON \`_landing_v_version_footer_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_footer_groups_links_parent_id_idx\` ON \`_landing_v_version_footer_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_footer_groups_links\`;`)
  await db.run(sql`CREATE TABLE \`_landing_v_version_roadmap_items_points\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text,
    \`status\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_landing_v_version_roadmap_items\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`_landing_v_version_roadmap_items_points\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\`, \`_uuid\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\`, \`_uuid\` FROM \`__editor_backup__landing_v_version_roadmap_items_points\`;`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_points_order_idx\` ON \`_landing_v_version_roadmap_items_points\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_landing_v_version_roadmap_items_points_parent_id_idx\` ON \`_landing_v_version_roadmap_items_points\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup__landing_v_version_roadmap_items_points\`;`)
  await db.run(sql`CREATE TABLE \`landing_footer_groups_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`href\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_footer_groups\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_footer_groups_links\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`href\` FROM \`__editor_backup_landing_footer_groups_links\`;`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_links_order_idx\` ON \`landing_footer_groups_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_footer_groups_links_parent_id_idx\` ON \`landing_footer_groups_links\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_footer_groups_links\`;`)
  await db.run(sql`CREATE TABLE \`landing_roadmap_items_points\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`status\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_roadmap_items\` (\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`INSERT INTO \`landing_roadmap_items_points\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\`) SELECT \`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`status\` FROM \`__editor_backup_landing_roadmap_items_points\`;`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_points_order_idx\` ON \`landing_roadmap_items_points\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`landing_roadmap_items_points_parent_id_idx\` ON \`landing_roadmap_items_points\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`__editor_backup_landing_roadmap_items_points\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
}
