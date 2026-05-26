import db from './schema.js';

const today = new Date().toISOString().split('T')[0];
const d = (offset) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split('T')[0];
};

export async function seedDemoData() {
  const existing = await db.animals.count();
  if (existing > 0) return; // already seeded

  await db.transaction('rw', [
    db.animals, db.milkLogs, db.eggLogs, db.weightLogs, db.treatments,
    db.vaccinations, db.employees, db.attendance, db.tasks, db.feedInventory,
    db.transactions, db.purchaseOrders, db.suppliers, db.assets, db.maintenance,
    db.plots, db.cropPlans, db.harvests, db.notifications, db.calendarEvents,
    db.heatLogs, db.breedingLogs, db.pregnancyChecks, db.births, db.mortality,
    db.payroll, db.grns, db.settings,
  ], async () => {

    // ── SETTINGS ──────────────────────────────────────────
    await db.settings.bulkAdd([
      { key: 'farmName',   value: 'Kilima Fresh Farms' },
      { key: 'currency',   value: 'KES' },
      { key: 'language',   value: 'en' },
      { key: 'fontSize',   value: 'medium' },
      { key: 'theme',      value: 'light' },
      { key: 'activeSpecies', value: JSON.stringify(['cattle','pigs','goats','sheep','poultry']) },
      { key: 'currentUser', value: JSON.stringify({ name: 'James Mwangi', role: 'manager' }) },
    ]);

    // ── ANIMALS ───────────────────────────────────────────
    const animals = await db.animals.bulkAdd([
      // CATTLE
      { species:'cattle', name:'Daisy',  tag:'#045', breed:'Friesian', color:'Black & White', sex:'F', dob:'2020-03-12', stage:'Mature Cow',    pen:'Barn A', origin:'born',      dam:'Bella #012',  sire:'External AI', milkLock:true,  lockExpiry:d(6),  lockReason:'Mastitis – Amoxicillin', notes:'High producer, prefers morning milking. Slightly nervous disposition.',         syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Bella',  tag:'#012', breed:'Jersey',   color:'Brown',         sex:'F', dob:'2018-07-04', stage:'Mature Cow',    pen:'Barn A', origin:'purchased', dam:'',            sire:'',            milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'Dam to Daisy and Star. Oldest cow on farm.',                                  syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Star',   tag:'#067', breed:'Ayrshire', color:'Red & White',   sex:'F', dob:'2022-05-20', stage:'First Lactation', pen:'Barn B', origin:'born',   dam:'Bella #012',  sire:'External AI', milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'First calf born Jan 2025. Good temperament.',                                 syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Luna',   tag:'#088', breed:'Friesian', color:'Black & White', sex:'F', dob:'2021-11-03', stage:'Mature Cow',    pen:'Barn B', origin:'purchased', dam:'',           sire:'',            milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'Purchased from Eldoret. Excellent milk fat %.',                               syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Rose',   tag:'#091', breed:'Jersey',   color:'Light Brown',   sex:'F', dob:'2021-08-15', stage:'Dry Cow',       pen:'Dry Pen',origin:'purchased', dam:'',           sire:'',            milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'Due to calve in 45 days. Dry-off initiated.',                                 syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Bruno',  tag:'#031', breed:'Friesian', color:'Black & White', sex:'M', dob:'2025-01-15', stage:'Calf',          pen:'Calf Pen',origin:'born',     dam:'Daisy #045', sire:'External AI', milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'Strong healthy calf. Dam: Daisy.',                                            syncStatus:'synced', updatedAt:new Date() },
      { species:'cattle', name:'Macho',  tag:'#002', breed:'Sahiwal',  color:'Red-Brown',     sex:'M', dob:'2019-03-22', stage:'Mature Cow',    pen:'Barn C', origin:'purchased', dam:'',           sire:'',            milkLock:false, lockExpiry:null,  lockReason:'',                          notes:'Resident bull. Used for natural service.',                                    syncStatus:'synced', updatedAt:new Date() },

      // PIGS
      { species:'pigs', name:'Mama',  tag:'#P01', breed:'Large White', color:'Pink',      sex:'F', dob:'2021-09-10', stage:'Sow',    pen:'Pig Unit A', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'Excellent mothering instincts. Litter 5 expected soon. Avg 11 piglets/litter.', syncStatus:'synced', updatedAt:new Date() },
      { species:'pigs', name:'Grunt', tag:'#P02', breed:'Duroc',       color:'Red-Brown', sex:'M', dob:'2020-06-15', stage:'Boar',   pen:'Pig Unit B', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'Active boar. Covering 6 sows currently.', syncStatus:'synced', updatedAt:new Date() },
      { species:'pigs', name:'Pinky', tag:'#P03', breed:'Landrace',    color:'Pink',      sex:'F', dob:'2022-04-20', stage:'Sow',    pen:'Pig Unit A', origin:'born', dam:'Mama #P01', sire:'Grunt #P02', milkLock:false, lockExpiry:null, lockReason:'', notes:'Born on farm. 2nd litter.', syncStatus:'synced', updatedAt:new Date() },
      { species:'pigs', name:'Batch7A',tag:'#P10', breed:'Large White x Duroc', color:'Mixed', sex:'M', dob:d(-85), stage:'Finisher', pen:'Pig Unit C', origin:'born', dam:'Mama #P01', sire:'Grunt #P02', milkLock:false, lockExpiry:null, lockReason:'', notes:'Grower batch targeting 90kg by end of month.', syncStatus:'synced', updatedAt:new Date() },

      // GOATS
      { species:'goats', name:'Nanny',  tag:'#G01', breed:'Toggenburg', color:'Brown & White', sex:'F', dob:'2021-04-02', stage:'Doe', pen:'Goat Shed', origin:'born',      dam:'',            sire:'',           milkLock:false, lockExpiry:null, lockReason:'', notes:'Top milk producer. 3.2L/day average. Very docile.', syncStatus:'synced', updatedAt:new Date() },
      { species:'goats', name:'Billy',  tag:'#G02', breed:'Boer',        color:'White & Brown', sex:'M', dob:'2020-11-20', stage:'Buck', pen:'Goat Shed', origin:'purchased', dam:'',            sire:'',           milkLock:false, lockExpiry:null, lockReason:'', notes:'Used for meat breed crossing.', syncStatus:'synced', updatedAt:new Date() },
      { species:'goats', name:'Clover', tag:'#G03', breed:'Alpine',      color:'Grey & White',  sex:'F', dob:'2022-08-10', stage:'Doe', pen:'Goat Shed', origin:'purchased', dam:'',            sire:'',           milkLock:false, lockExpiry:null, lockReason:'', notes:'Good milk quality, high fat%.',  syncStatus:'synced', updatedAt:new Date() },
      { species:'goats', name:'Kiddo',  tag:'#G04', breed:'Toggenburg',  color:'Brown',         sex:'M', dob:d(-45), stage:'Kid', pen:'Kid Pen',   origin:'born',      dam:'Nanny #G01', sire:'Billy #G02', milkLock:false, lockExpiry:null, lockReason:'', notes:'Healthy kid born on farm.',       syncStatus:'synced', updatedAt:new Date() },

      // SHEEP
      { species:'sheep', name:'Woolly', tag:'#S01', breed:'Merino', color:'White',     sex:'F', dob:'2021-03-18', stage:'Ewe', pen:'Paddock C', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'Last shearing March 2025. Grade A fleece. 4.2kg yield.', syncStatus:'synced', updatedAt:new Date() },
      { species:'sheep', name:'Rocky',  tag:'#S02', breed:'Merino', color:'White',     sex:'M', dob:'2020-07-12', stage:'Ram', pen:'Paddock C', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'Used for breeding. Excellent wool quality.',             syncStatus:'synced', updatedAt:new Date() },
      { species:'sheep', name:'Dotty',  tag:'#S03', breed:'Dorper', color:'White/Black',sex:'F', dob:'2022-01-05', stage:'Ewe', pen:'Paddock C', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'Meat breed. Due to lamb next month.',                   syncStatus:'synced', updatedAt:new Date() },

      // POULTRY (flocks)
      { species:'poultry', name:'Layer House A', tag:'#FL01', breed:'ISA Brown',  color:'Brown',  sex:'F', dob:d(-234), stage:'Layer',   pen:'House A', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'500 birds. Day 234. Peak production. FCR: 1.8', syncStatus:'synced', updatedAt:new Date() },
      { species:'poultry', name:'Broiler Batch3',tag:'#FB03', breed:'Ross 308',   color:'White',  sex:'M', dob:d(-35),  stage:'Broiler', pen:'House B', origin:'purchased', dam:'', sire:'', milkLock:false, lockExpiry:null, lockReason:'', notes:'300 birds. Day 35. Target slaughter at day 42.',       syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });

    const animalIds = {};
    const allAnimals = await db.animals.toArray();
    allAnimals.forEach(a => { animalIds[a.tag] = a.id; });

    // ── MILK LOGS (30 days) ────────────────────────────────
    const cowTags = ['#045','#012','#067','#088'];
    const baseYields = { '#045':22,'#012':18,'#067':14,'#088':16 };
    const milkEntries = [];
    for (let day = 0; day < 30; day++) {
      const date = d(-day);
      for (const tag of cowTags) {
        const id = animalIds[tag];
        if (!id) continue;
        const base = baseYields[tag] * (tag === '#045' && day < 6 ? 0.78 : 1);
        milkEntries.push(
          { animalId:id, date, shift:'Morning', amount: +(base * 0.55 * (0.9+Math.random()*0.2)).toFixed(1), unit:'liters', status:'Sold', fat: +(3.5+Math.random()).toFixed(1), protein: +(3.1+Math.random()*0.5).toFixed(1), scc: Math.floor(180+Math.random()*120), syncStatus:'synced', updatedAt:new Date() },
          { animalId:id, date, shift:'Evening', amount: +(base * 0.45 * (0.9+Math.random()*0.2)).toFixed(1), unit:'liters', status:'Sold', fat: +(3.4+Math.random()).toFixed(1), protein: +(3.0+Math.random()*0.5).toFixed(1), scc: Math.floor(180+Math.random()*120), syncStatus:'synced', updatedAt:new Date() },
        );
      }
    }
    await db.milkLogs.bulkAdd(milkEntries);

    // ── EGG LOGS (30 days) ────────────────────────────────
    const flock1Id = animalIds['#FL01'];
    const eggEntries = [];
    for (let day = 0; day < 30; day++) {
      eggEntries.push({
        flockId: flock1Id, date: d(-day),
        total: Math.floor(430 + Math.random()*30 - 15),
        cracked: Math.floor(3+Math.random()*5),
        gradeA: Math.floor(390+Math.random()*30),
        gradeB: Math.floor(20+Math.random()*15),
        feedIntake: +(115+Math.random()*10).toFixed(1),
        feedUnit: 'kg',
        syncStatus:'synced', updatedAt:new Date()
      });
    }
    await db.eggLogs.bulkAdd(eggEntries);

    // ── WEIGHT LOGS ───────────────────────────────────────
    const weightEntries = [
      { animalId:animalIds['#P10'], date:d(-28), weight:45.2, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#P10'], date:d(-21), weight:52.8, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#P10'], date:d(-14), weight:61.1, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#P10'], date:d(-7),  weight:69.4, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#P10'], date:today,  weight:77.8, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#S01'], date:d(-180), weight:52.0, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#S01'], date:today,   weight:58.5, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#G04'], date:d(-30), weight:4.2, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#G04'], date:today,  weight:11.8, unit:'kg', syncStatus:'synced', updatedAt:new Date() },
    ];
    await db.weightLogs.bulkAdd(weightEntries);

    // ── TREATMENTS ────────────────────────────────────────
    await db.treatments.bulkAdd([
      { animalId:animalIds['#045'], date:d(-6),  diagnosis:'Mastitis - Right Rear Quarter', symptoms:'Swollen quarter, high SCC 450k', vet:'Dr. Kamau', treatment:'Amoxicillin 10mg/kg × 5 days IM', cost:2400, withdrawal:12, withdrawalEnd:d(6),  status:'Active',   notes:'Quarter responding well. Recheck in 3 days.', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#012'], date:d(-45), diagnosis:'Foot Rot',                       symptoms:'Lameness, foul smell between claws', vet:'Dr. Kamau', treatment:'Oxytetracycline spray + hoof trim', cost:800, withdrawal:0, withdrawalEnd:null, status:'Resolved', notes:'Fully recovered.',                           syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#P01'], date:d(-25), diagnosis:'MMA Syndrome',                    symptoms:'Off feed, fever 41°C, reduced milk', vet:'Dr. Njeri', treatment:'Oxytocin 20IU IM + Penicillin 5 days', cost:1500, withdrawal:7, withdrawalEnd:d(-18), status:'Resolved', notes:'Piglets survived.', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#G01'], date:d(-10), diagnosis:'Worms - High FEC',                symptoms:'Weight loss, bottle jaw', vet:'Dr. Kamau', treatment:'Albendazole 7.5mg/kg PO',            cost:350, withdrawal:3, withdrawalEnd:d(-7),  status:'Resolved', notes:'FAMACHA score improving.', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#067'], date:d(-90), diagnosis:'Respiratory Infection',            symptoms:'Coughing, nasal discharge', vet:'Dr. Njeri', treatment:'Florfenicol 20mg/kg SC',            cost:1200, withdrawal:0, withdrawalEnd:null, status:'Resolved', notes:'Full recovery.', syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── VACCINATIONS ──────────────────────────────────────
    await db.vaccinations.bulkAdd([
      { animalId:animalIds['#045'], date:d(-30),  vaccine:'FMD Vaccine', batchNo:'FMD2025A', dose:'2ml IM', vet:'Dr. Kamau', nextDue:d(150),  notes:'', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#012'], date:d(-30),  vaccine:'FMD Vaccine', batchNo:'FMD2025A', dose:'2ml IM', vet:'Dr. Kamau', nextDue:d(150),  notes:'', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#FL01'],date:d(-120), vaccine:'Newcastle + IB', batchNo:'NDV2024X', dose:'Eye drop', vet:'Dr. Njeri', nextDue:d(60), notes:'Entire flock.', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#FL01'],date:d(-60),  vaccine:'Gumboro (IBD)', batchNo:'IBD2025B', dose:'Drinking water', vet:'Dr. Njeri', nextDue:d(120), notes:'', syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── REPRODUCTION ──────────────────────────────────────
    await db.heatLogs.bulkAdd([
      { animalId:animalIds['#088'], date:d(-21), signs:['Standing heat','Mucus discharge'], intensity:'Strong', notes:'Clear standing heat observed 06:00', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#G03'], date:d(-18), signs:['Restless','Tail flagging'], intensity:'Mild', notes:'', syncStatus:'synced', updatedAt:new Date() },
    ]);
    await db.breedingLogs.bulkAdd([
      { animalId:animalIds['#088'], date:d(-21), method:'AI', sireId:'External – Tansen Komacho', strawBatch:'STR-2024-089', technician:'James AI Tech', cost:1500, notes:'', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#045'], date:d(-90), method:'AI', sireId:'External', strawBatch:'STR-2024-045', technician:'James AI Tech', cost:1500, notes:'', syncStatus:'synced', updatedAt:new Date() },
    ]);
    await db.pregnancyChecks.bulkAdd([
      { animalId:animalIds['#091'], date:d(-60), result:'Confirmed', method:'Ultrasound', vet:'Dr. Kamau', expectedDue:d(45), notes:'Single calf. Good size.', syncStatus:'synced', updatedAt:new Date() },
      { animalId:animalIds['#088'], date:d(-7),  result:'Too Early', method:'Manual', vet:'Dr. Kamau', expectedDue:null, notes:'Recheck in 3 weeks.', syncStatus:'synced', updatedAt:new Date() },
    ]);
    await db.births.bulkAdd([
      { damId:animalIds['#045'], date:'2025-01-15', calves:[{ tag:'#031', sex:'M', weight:38, vitality:'Strong', ease:1 }], notes:'Easy calving. Calf nursing well.', syncStatus:'synced', updatedAt:new Date() },
      { damId:animalIds['#G01'], date:d(-45), calves:[{ tag:'#G04', sex:'M', weight:3.2, vitality:'Good', ease:1 }], notes:'Single kid, healthy.', syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── FEED INVENTORY ────────────────────────────────────
    await db.feedInventory.bulkAdd([
      { feedType:'Dairy Meal', supplier:'Unga Feeds', quantity:850, unit:'kg', minStock:200, costPerUnit:19, species:'cattle', lastRestocked:d(-3), syncStatus:'synced', updatedAt:new Date() },
      { feedType:'Hay Bales',  supplier:'Local Farm',  quantity:45,  unit:'bales', minStock:20, costPerUnit:120, species:'cattle', lastRestocked:d(-7), syncStatus:'synced', updatedAt:new Date() },
      { feedType:'Silage',     supplier:'Own Farm',    quantity:4.2, unit:'tonnes', minStock:1, costPerUnit:8500, species:'cattle', lastRestocked:d(-14), syncStatus:'synced', updatedAt:new Date() },
      { feedType:'Layer Mash', supplier:'Unga Feeds',  quantity:180, unit:'kg', minStock:300, costPerUnit:48, species:'poultry', lastRestocked:d(-5), syncStatus:'synced', updatedAt:new Date() },
      { feedType:'Pig Grower', supplier:'Pembe Feeds', quantity:320, unit:'kg', minStock:100, costPerUnit:42, species:'pigs', lastRestocked:d(-2), syncStatus:'synced', updatedAt:new Date() },
      { feedType:'Goat Pellets',supplier:'Unga Feeds', quantity:95,  unit:'kg', minStock:50, costPerUnit:55, species:'goats', lastRestocked:d(-10), syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── FINANCES (3 months) ───────────────────────────────
    const finEntries = [];
    for (let m = 0; m < 90; m++) {
      const date = d(-m);
      if (m % 1 === 0) finEntries.push({ type:'income',  date, category:'Milk Sales',        species:'cattle',  amount: Math.floor(16000+Math.random()*5000), description:'Brookside Dairy – Daily collection', paymentMethod:'Mpesa', syncStatus:'synced', updatedAt:new Date() });
      if (m % 3 === 0) finEntries.push({ type:'income',  date, category:'Egg Sales',          species:'poultry', amount: Math.floor(5500+Math.random()*2000),  description:'Tuskys Supermarket – Weekly supply', paymentMethod:'Mpesa', syncStatus:'synced', updatedAt:new Date() });
      if (m % 7 === 0) finEntries.push({ type:'income',  date, category:'Goat Milk Sales',    species:'goats',   amount: Math.floor(900+Math.random()*400),    description:'Local market',                        paymentMethod:'Cash', syncStatus:'synced', updatedAt:new Date() });
      if (m % 14 === 0)finEntries.push({ type:'income',  date, category:'Piglet Sales',       species:'pigs',    amount: Math.floor(10000+Math.random()*5000), description:'Weaner piglets ×4',                  paymentMethod:'Mpesa', syncStatus:'synced', updatedAt:new Date() });
      if (m % 3 === 0) finEntries.push({ type:'expense', date, category:'Feed – Dairy Meal',  species:'cattle',  amount: Math.floor(9000+Math.random()*2000),  description:'50kg × 10 bags Unga',                paymentMethod:'Bank Transfer', syncStatus:'synced', updatedAt:new Date() });
      if (m % 5 === 0) finEntries.push({ type:'expense', date, category:'Feed – Layer Mash',  species:'poultry', amount: Math.floor(4500+Math.random()*1000),  description:'50kg × 6 bags',                      paymentMethod:'Mpesa', syncStatus:'synced', updatedAt:new Date() });
      if (m % 7 === 0) finEntries.push({ type:'expense', date, category:'Labour',             species:'overhead',amount: Math.floor(18000+Math.random()*2000), description:'Weekly wages',                        paymentMethod:'Mpesa', syncStatus:'synced', updatedAt:new Date() });
      if (m % 30 === 0)finEntries.push({ type:'expense', date, category:'Veterinary',         species:'cattle',  amount: Math.floor(2000+Math.random()*3000),  description:'Vet visit + medicines',               paymentMethod:'Cash', syncStatus:'synced', updatedAt:new Date() });
    }
    await db.transactions.bulkAdd(finEntries);

    // ── EMPLOYEES ─────────────────────────────────────────
    const empIds = await db.employees.bulkAdd([
      { name:'James Mwangi', role:'manager',  phone:'0712 345 678', nationalId:'12345678', hireDate:'2020-01-15', section:'All',     salary:28000, status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Grace Wanjiku',role:'worker',   phone:'0723 456 789', nationalId:'23456789', hireDate:'2021-03-01', section:'Cattle',  salary:18000, status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Peter Otieno', role:'worker',   phone:'0734 567 890', nationalId:'34567890', hireDate:'2022-06-15', section:'Pigs',    salary:18000, status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Mary Njeri',   role:'worker',   phone:'0745 678 901', nationalId:'45678901', hireDate:'2021-09-01', section:'Poultry', salary:18000, status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'David Kamau',  role:'worker',   phone:'0756 789 012', nationalId:'56789012', hireDate:'2023-01-10', section:'Crops',   salary:16000, status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Sarah Akinyi', role:'vet',      phone:'0767 890 123', nationalId:'67890123', hireDate:'2022-03-15', section:'Health',  salary:35000, status:'active', syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });

    // Attendance - last 7 days
    const attEntries = [];
    for (let d2 = 0; d2 < 7; d2++) {
      for (let i = 0; i < empIds.length; i++) {
        const roll = Math.random();
        attEntries.push({ employeeId:empIds[i], date:d(-d2), clockIn:'06:30', clockOut:'16:30', status: roll<0.85?'present':roll<0.92?'leave':'absent', syncStatus:'synced' });
      }
    }
    await db.attendance.bulkAdd(attEntries);

    // Tasks
    await db.tasks.bulkAdd([
      { title:'Morning milking – Barn A+B', assignedTo:empIds[1], dueDate:today, dueTime:'06:30', priority:'high',   status:'done',    species:'cattle',  notes:'', syncStatus:'synced' },
      { title:'Pig feeding – Unit A+B+C',  assignedTo:empIds[2], dueDate:today, dueTime:'07:00', priority:'high',   status:'pending', species:'pigs',    notes:'', syncStatus:'synced' },
      { title:'Egg collection – House A',   assignedTo:empIds[3], dueDate:today, dueTime:'07:30', priority:'high',   status:'done',    species:'poultry', notes:'', syncStatus:'synced' },
      { title:'Silage pit inspection',      assignedTo:empIds[0], dueDate:today, dueTime:'09:00', priority:'medium', status:'pending', species:'cattle',  notes:'', syncStatus:'synced' },
      { title:'Goat shed cleaning',         assignedTo:empIds[4], dueDate:today, dueTime:'10:00', priority:'low',    status:'pending', species:'goats',   notes:'', syncStatus:'synced' },
      { title:'Evening milking – all cows', assignedTo:empIds[1], dueDate:today, dueTime:'17:00', priority:'high',   status:'pending', species:'cattle',  notes:'', syncStatus:'synced' },
    ]);

    // Payroll
    await db.payroll.bulkAdd(empIds.map(id => ({ employeeId:id, month:today.slice(0,7), status:'pending', paidDate:null, mpesaRef:'', syncStatus:'synced' })));

    // ── SUPPLIERS & PROCUREMENT ───────────────────────────
    const supIds = await db.suppliers.bulkAdd([
      { name:'Unga Feeds Ltd', contact:'0722 111 222', location:'Nairobi', terms:'Net 30', mpesa:'522522', rating:4.5, syncStatus:'synced', updatedAt:new Date() },
      { name:'Pembe Feeds',    contact:'0733 222 333', location:'Nakuru',  terms:'Immediate', mpesa:'522523', rating:4.0, syncStatus:'synced', updatedAt:new Date() },
      { name:'Agri-Vet Kenya', contact:'0744 333 444', location:'Eldoret', terms:'Net 7', mpesa:'522524', rating:4.8, syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });
    const poIds = await db.purchaseOrders.bulkAdd([
      { supplierId:supIds[0], poNumber:'PO-2025-001', items:[{ name:'Dairy Meal 50kg', qty:20, unit:'bags', unitCost:950 }], totalCost:19000, status:'received',  raisedBy:'James Mwangi', date:d(-14), deliveryDate:d(-10), approvedBy:'Owner',      notes:'', syncStatus:'synced', updatedAt:new Date() },
      { supplierId:supIds[2], poNumber:'PO-2025-002', items:[{ name:'FMD Vaccine 100ml', qty:5, unit:'vials', unitCost:2200 }], totalCost:11000, status:'approved',  raisedBy:'James Mwangi', date:d(-5),  deliveryDate:d(2), approvedBy:'Owner',       notes:'Urgent – vaccination due.', syncStatus:'synced', updatedAt:new Date() },
      { supplierId:supIds[0], poNumber:'PO-2025-003', items:[{ name:'Layer Mash 50kg', qty:10, unit:'bags', unitCost:2400 }], totalCost:24000, status:'pending',    raisedBy:'Mary Njeri',  date:today,  deliveryDate:d(3),  approvedBy:'',           notes:'', syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });
    await db.grns.bulkAdd([
      { poId:poIds[0], date:d(-10), receivedBy:'Peter Otieno', items:[{ name:'Dairy Meal 50kg', qtyOrdered:20, qtyReceived:20, unit:'bags', qualityPass:true }], notes:'All bags intact.', syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── ASSETS ────────────────────────────────────────────
    const assetIds = await db.assets.bulkAdd([
      { name:'Milk Cooling Tank 2000L', type:'Equipment', make:'DeLaval', serial:'DL-2019-445', purchaseDate:'2019-06-01', purchaseCost:850000, condition:'Good',       nextService:d(30),  status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Tractor – New Holland T5', type:'Vehicle',   make:'New Holland', serial:'NH-T5-2021', purchaseDate:'2021-03-15', purchaseCost:3200000, condition:'Good',  nextService:d(60),  status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Feed Mixer 500kg',         type:'Equipment', make:'Skiold', serial:'SK-500-2020', purchaseDate:'2020-08-10', purchaseCost:480000, condition:'Fair',        nextService:d(-5),  status:'active', syncStatus:'synced', updatedAt:new Date() },
      { name:'Borehole Pump 3HP',        type:'Infrastructure', make:'Grundfos', serial:'GF-3HP-2018', purchaseDate:'2018-01-20', purchaseCost:180000, condition:'Good', nextService:d(90),  status:'active', syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });
    await db.maintenance.bulkAdd([
      { assetId:assetIds[0], date:d(-90), workDone:'Full service, replaced milk gaskets', technician:'DeLaval Service', parts:'Gasket set, cleaning agent', cost:18000, downtimeHours:4, syncStatus:'synced', updatedAt:new Date() },
      { assetId:assetIds[1], date:d(-45), workDone:'Oil change, filter replacement, greasing', technician:'NH Dealer Nairobi', parts:'Oil 10L, filters', cost:25000, downtimeHours:3, syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── CROPS ─────────────────────────────────────────────
    const plotIds = await db.plots.bulkAdd([
      { name:'Paddock A – Napier', size:2.5, unit:'acres', gps:'-0.3200,36.8800', soilType:'Loam', currentUse:'Fodder', syncStatus:'synced', updatedAt:new Date() },
      { name:'Plot B – Maize',     size:4.0, unit:'acres', gps:'-0.3210,36.8790', soilType:'Clay Loam', currentUse:'Crop', syncStatus:'synced', updatedAt:new Date() },
      { name:'Silage Pit',         size:0.5, unit:'acres', gps:'-0.3220,36.8810', soilType:'N/A', currentUse:'Storage', syncStatus:'synced', updatedAt:new Date() },
    ], { allKeys: true });
    await db.cropPlans.bulkAdd([
      { plotId:plotIds[1], cropType:'Maize (Silage)', plantingDate:d(-90), expectedHarvest:d(30), variety:'DK8031', seedRate:25, seedUnit:'kg', notes:'For silage pit.', syncStatus:'synced', updatedAt:new Date() },
    ]);
    await db.harvests.bulkAdd([
      { plotId:plotIds[0], date:d(-30), crop:'Napier Grass', quantity:2.8, unit:'tonnes', qualityGrade:'A', notes:'Good yield after rains.', syncStatus:'synced', updatedAt:new Date() },
    ]);

    // ── NOTIFICATIONS ─────────────────────────────────────
    await db.notifications.bulkAdd([
      { type:'health',     priority:'urgent',   title:'Withdrawal Lock Active',       body:'Daisy #045 milk cannot be sold until '+d(6)+'. Lock expires in 6 days.',           read:false, timestamp:new Date(Date.now()-600000) },
      { type:'production', priority:'urgent',   title:'Yield Drop Alert',              body:'Daisy #045 has dropped 23% vs her 7-day average – health check recommended.',      read:false, timestamp:new Date(Date.now()-900000) },
      { type:'feed',       priority:'warning',  title:'Low Feed Stock',                body:'Layer Mash below 7-day run rate (180kg left, need 250kg/week). Reorder now.',      read:false, timestamp:new Date(Date.now()-3600000) },
      { type:'breeding',   priority:'warning',  title:'Breeding Overdue – 3 Does',     body:'Nanny #G01, Clover #G03, and 1 other are overdue for breeding this cycle.',         read:false, timestamp:new Date(Date.now()-7200000) },
      { type:'finance',    priority:'info',     title:'PO Pending Approval',           body:'PO-2025-003 (Layer Mash KES 24,000) raised by Mary Njeri – awaiting approval.',    read:false, timestamp:new Date(Date.now()-10800000) },
      { type:'health',     priority:'info',     title:'Vaccination Due – Flock A',     body:'Layer House A Newcastle+IB booster due in '+60+' days. Schedule Dr. Njeri.',        read:true,  timestamp:new Date(Date.now()-86400000) },
      { type:'production', priority:'info',     title:'Feed Mixer Service Overdue',    body:'Feed Mixer SK-500-2020 service was due 5 days ago. Book technician.',               read:true,  timestamp:new Date(Date.now()-172800000) },
    ]);

    // ── CALENDAR EVENTS ───────────────────────────────────
    await db.calendarEvents.bulkAdd([
      { date:d(6),   type:'health',      title:'Daisy withdrawal lock expires', species:'cattle',  relatedId:animalIds['#045'], priority:'urgent', syncStatus:'synced' },
      { date:d(30),  type:'health',      title:'Vaccination – FMD booster all cattle', species:'cattle', relatedId:null, priority:'warning', syncStatus:'synced' },
      { date:d(45),  type:'reproduction',title:'Rose #091 expected calving date', species:'cattle',  relatedId:animalIds['#091'], priority:'high', syncStatus:'synced' },
      { date:d(60),  type:'health',      title:'Newcastle booster – House A (500 birds)', species:'poultry', relatedId:animalIds['#FL01'], priority:'warning', syncStatus:'synced' },
      { date:d(3),   type:'procurement', title:'PO-2025-002 expected delivery (FMD Vaccine)', species:'all', relatedId:null, priority:'info', syncStatus:'synced' },
      { date:d(30),  type:'crops',       title:'Maize silage harvest – Plot B', species:'all',   relatedId:plotIds[1], priority:'info', syncStatus:'synced' },
      { date:today,  type:'task',        title:'Evening milking – all cows', species:'cattle',   relatedId:null, priority:'high', syncStatus:'synced' },
      { date:d(-5),  type:'asset',       title:'Feed Mixer service overdue', species:'all',       relatedId:assetIds[2], priority:'warning', syncStatus:'synced' },
    ]);
  });
}

export async function clearDemoData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
}
