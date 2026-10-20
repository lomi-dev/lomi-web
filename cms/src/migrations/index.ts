import * as migration_20261019_121816 from './20261019_121816';
import * as migration_20261020_120000 from './20261020_120000';
import * as migration_20261020_130000_website_editor from './20261020_130000_website_editor';
import * as migration_20261020_140000_hero_player_controls from './20261020_140000_hero_player_controls';
import * as migration_20261020_150000_devlogs from './20261020_150000_devlogs';

import * as migration_20261020_160000_feature_previews from './20261020_160000_feature_previews';

export const migrations = [
  { up: migration_20261019_121816.up, down: migration_20261019_121816.down, name: '20261019_121816' },
  { up: migration_20261020_120000.up, down: migration_20261020_120000.down, name: '20261020_120000' },
  { up: migration_20261020_130000_website_editor.up, down: migration_20261020_130000_website_editor.down, name: '20261020_130000_website_editor' },
  { up: migration_20261020_140000_hero_player_controls.up, down: migration_20261020_140000_hero_player_controls.down, name: '20261020_140000_hero_player_controls' },
  { up: migration_20261020_150000_devlogs.up, down: migration_20261020_150000_devlogs.down, name: '20261020_150000_devlogs' },
  { up: migration_20261020_160000_feature_previews.up, down: migration_20261020_160000_feature_previews.down, name: '20261020_160000_feature_previews' },
];
