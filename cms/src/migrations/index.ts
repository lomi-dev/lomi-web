import * as migration_20261019_121816 from './20261019_121816';
import * as migration_20261020_120000 from './20261020_120000';

export const migrations = [
  {
    up: migration_20261019_121816.up,
    down: migration_20261019_121816.down,
    name: '20261019_121816',
  },
  {
    up: migration_20261020_120000.up,
    down: migration_20261020_120000.down,
    name: '20261020_120000'
  },
];
