export const SPECIES = {
  all:     { emoji: '🌾', label: 'All',     color: '#2D5016' },
  cattle:  { emoji: '🐄', label: 'Cattle',  color: '#2D5016' },
  pigs:    { emoji: '🐖', label: 'Pigs',    color: '#8B6340' },
  goats:   { emoji: '🐐', label: 'Goats',   color: '#C9A84C' },
  sheep:   { emoji: '🐑', label: 'Sheep',   color: '#4e8628' },
  poultry: { emoji: '🐔', label: 'Poultry', color: '#d97706' },
};

export const STAGES = {
  cattle:  ['Calf','Heifer','First Lactation','Mature Cow','Dry Cow','Culled','Sold','Deceased'],
  pigs:    ['Piglet','Weaner','Grower','Finisher','Sow','Boar','Culled','Sold','Deceased'],
  goats:   ['Kid','Doeling','Buckling','Doe','Buck','Wether','Culled','Sold','Deceased'],
  sheep:   ['Lamb','Ewe Lamb','Ram Lamb','Ewe','Ram','Wether','Culled','Sold','Deceased'],
  poultry: ['Chick','Grower','Layer','Broiler','Breeder','Culled','Sold','Deceased'],
};

export const UNITS = {
  weight:   ['kg','g','mg','tonnes','lbs'],
  volume:   ['liters','ml'],
  count:    ['pcs','trays','boxes','units'],
  area:     ['acres','hectares'],
  feed:     ['kg','g','bags','bales','tonnes'],
  all:      ['kg','g','mg','tonnes','liters','ml','pcs','units','bags','bales','trays','boxes','acres','hectares'],
};

export const ROLES = {
  admin:    { label: 'System Admin',   color: 'badge-purple' },
  owner:    { label: 'Farm Owner',     color: 'badge-blue' },
  manager:  { label: 'Farm Manager',   color: 'badge-green' },
  worker:   { label: 'Farm Worker',    color: 'badge-gray' },
  vet:      { label: 'Vet/Consultant', color: 'badge-amber' },
};

export const SHIFTS = ['Morning','Afternoon','Evening'];

export const ALERT_TYPES = {
  health:      { label: 'Health',      color: 'badge-red'    },
  production:  { label: 'Production',  color: 'badge-amber'  },
  breeding:    { label: 'Breeding',    color: 'badge-purple' },
  feed:        { label: 'Feed',        color: 'badge-blue'   },
  finance:     { label: 'Finance',     color: 'badge-green'  },
  sync:        { label: 'Sync',        color: 'badge-gray'   },
};

export const DIAGNOSES = {
  cattle:  ['Mastitis','Foot Rot','Respiratory Infection','Ketosis','LDA','Milk Fever','Bloat','Brucellosis','FMD','BVD'],
  pigs:    ['PRRS','Swine Flu','Erysipelas','PED','ASF','Mange','Ringworm','Worms'],
  goats:   ['PPR','Foot Rot','Enterotoxemia','Liver Fluke','Worms','CAE','Mastitis'],
  sheep:   ['OPP','Foot Rot','Enterotoxemia','Liver Fluke','Worms','Scrapie','Mastitis'],
  poultry: ['Newcastle Disease','Gumboro','Marek\'s','Coccidiosis','Fowl Typhoid','Infectious Bronchitis','Aspergillosis'],
};

export const CURRENCIES = { KES: 'KES', USD: 'USD' };
export const LANGUAGES  = { en: 'English', sw: 'Swahili' };

// Mirrors the states emitted by services/sync.js. Every state the engine
// can emit must appear here — an unmapped one falls back to "Synced",
// which would tell a farmer their records are safe when they are not.
export const SYNC_STATUS = {
  idle:     { label: 'Not synced yet', color: '#94a3b8', dot: '⚪' },
  syncing:  { label: 'Syncing…',       color: '#38bdf8', dot: '🔄' },
  synced:   { label: 'Synced',         color: '#4ade80', dot: '🟢' },
  pending:  { label: 'Pending Sync',   color: '#fbbf24', dot: '🟡' },
  offline:  { label: 'Offline',        color: '#ef4444', dot: '🔴' },
  conflict: { label: 'Conflicts',      color: '#f97316', dot: '⚠️' },
  error:    { label: 'Sync problem',   color: '#f97316', dot: '⚠️' },
};
