import Dexie from 'dexie';

export const db = new Dexie('FarmCoreDB');

db.version(1).stores({
  // Meta
  settings:       '++id, key',
  users:          '++id, role, email',
  auditLog:       '++id, userId, action, table, recordId, timestamp',

  // Animals
  animals:        '++id, species, tag, name, stage, sex, penId, dam, syncStatus, updatedAt',
  pens:           '++id, name, species, capacity',

  // Production
  milkLogs:       '++id, animalId, date, shift, syncStatus, updatedAt',
  eggLogs:        '++id, flockId, date, syncStatus, updatedAt',
  weightLogs:     '++id, animalId, date, syncStatus, updatedAt',
  shearingLogs:   '++id, animalId, date, syncStatus, updatedAt',

  // Health
  treatments:     '++id, animalId, date, vet, syncStatus, updatedAt',
  vaccinations:   '++id, animalId, date, vaccine, syncStatus, updatedAt',
  mortality:      '++id, animalId, date, cause, syncStatus, updatedAt',

  // Reproduction
  heatLogs:       '++id, animalId, date, syncStatus, updatedAt',
  breedingLogs:   '++id, animalId, date, method, syncStatus, updatedAt',
  pregnancyChecks:'++id, animalId, date, result, syncStatus, updatedAt',
  births:         '++id, damId, date, syncStatus, updatedAt',

  // Feed & Inventory
  feedInventory:  '++id, feedType, syncStatus, updatedAt',
  feedLogs:       '++id, animalId, date, feedId, syncStatus, updatedAt',
  feedFormulas:   '++id, species, name, syncStatus',

  // Finance
  transactions:   '++id, type, date, category, species, syncStatus, updatedAt',
  invoices:       '++id, buyerId, date, status, syncStatus, updatedAt',

  // Employees
  employees:      '++id, role, section, syncStatus, updatedAt',
  attendance:     '++id, employeeId, date, status, syncStatus',
  tasks:          '++id, assignedTo, dueDate, status, priority, syncStatus',
  payroll:        '++id, employeeId, month, status, syncStatus',

  // Procurement
  suppliers:      '++id, name, syncStatus, updatedAt',
  purchaseOrders: '++id, supplierId, status, date, syncStatus, updatedAt',
  grns:           '++id, poId, date, syncStatus, updatedAt',

  // Assets
  assets:         '++id, type, status, syncStatus, updatedAt',
  maintenance:    '++id, assetId, date, syncStatus, updatedAt',
  fuelLogs:       '++id, assetId, date, syncStatus',

  // Crops
  plots:          '++id, name, syncStatus, updatedAt',
  cropPlans:      '++id, plotId, cropType, syncStatus, updatedAt',
  harvests:       '++id, plotId, date, syncStatus, updatedAt',
  agrochemicals:  '++id, plotId, date, syncStatus, updatedAt',

  // Lab
  labTests:       '++id, animalId, testType, date, syncStatus',

  // Notifications
  notifications:  '++id, type, priority, read, timestamp',

  // Calendar Events
  calendarEvents: '++id, date, type, relatedId, species, syncStatus',
});

export default db;
