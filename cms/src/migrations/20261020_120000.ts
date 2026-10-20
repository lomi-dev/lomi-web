import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`landing_roadmap_items_points\` ADD \`status\` text;`)
  await db.run(sql`ALTER TABLE \`_landing_v_version_roadmap_items_points\` ADD \`status\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`landing_roadmap_items_points\` DROP COLUMN \`status\`;`)
  await db.run(sql`ALTER TABLE \`_landing_v_version_roadmap_items_points\` DROP COLUMN \`status\`;`)
}
