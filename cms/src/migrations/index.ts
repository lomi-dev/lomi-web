import * as migration_20261019_121816 from './20261019_121816';
import * as migration_20261020_120000 from './20261020_120000';
import * as migration_20261020_130000_website_editor from './20261020_130000_website_editor';

export const migrations = [
  { up: migration_20261019_121816.up, down: migration_20261019_121816.down, name: '20261019_121816' },
  { up: migration_20261020_120000.up, down: migration_20261020_120000.down, name: '20261020_120000' },
  { up: migration_20261020_130000_website_editor.up, down: migration_20261020_130000_website_editor.down, name: '20261020_130000_website_editor' },
];
