import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_pause_previews_label\` text;`)
  await db.run(sql`ALTER TABLE \`landing\` ADD \`features_controls_resume_previews_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_pause_previews_label\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` ADD \`version_features_controls_resume_previews_label\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`features_controls_pause_previews_label\`;`)
  await db.run(sql`ALTER TABLE \`landing\` DROP COLUMN \`features_controls_resume_previews_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_features_controls_pause_previews_label\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v\` DROP COLUMN \`version_features_controls_resume_previews_label\`;`)
}
