(function () {
  'use strict';

  const TABLES = [
    'clients', 'pets', 'vaccinations', 'appointments', 'service_history',
    'cash_transactions', 'inventory_items', 'inventory_movements',
    'grooming_workflows', 'grooming_workflow_stages', 'grooming_sessions',
    'grooming_stage_events', 'grooming_media', 'grooming_observations',
    'notification_events'
  ];
  let client;
  let business;
  let snapshot = {};
  let saveQueue = Promise.resolve();
  let realtimeChannel;
  let refreshTimer;

  const assertConfig = () => {
    const config = window.SCRAPPY_CONFIG || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('Falta configurar config/supabase-config.js.');
    }
    if (!window.supabase?.createClient) throw new Error('No se pudo cargar la biblioteca de Supabase.');
    return config;
  };

  function init() {
    if (client) return client;
    const config = assertConfig();
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  const uuid = () => crypto.randomUUID();
  const dateTime = (date, time = '00:00') => new Date(`${date}T${time}:00`).toISOString();
  const localParts = value => {
    const d = new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  const check = result => {
    if (result.error) throw result.error;
    return result.data;
  };
  const stripUndefined = row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function session() {
    init();
    return check(await client.auth.getSession())?.session || null;
  }
  async function signIn(email, password) {
    init();
    return check(await client.auth.signInWithPassword({ email, password }));
  }
  async function signUp(email, password, fullName) {
    init();
    return check(await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } }));
  }
  async function signOut() {
    if (realtimeChannel) await client.removeChannel(realtimeChannel);
    business = null;
    snapshot = {};
    return check(await client.auth.signOut());
  }
  function onAuthChange(callback) {
    init();
    return client.auth.onAuthStateChange((_event, currentSession) => callback(currentSession));
  }

  async function loadBusiness() {
    const rows = check(await client.from('business_members')
      .select('business_id,role,businesses(id,name,timezone,currency,settings)')
      .eq('active', true).limit(1));
    business = rows?.[0] ? { ...rows[0].businesses, role: rows[0].role } : null;
    return business;
  }
  async function createBusiness(name) {
    check(await client.rpc('create_business', { p_name: name }));
    return loadBusiness();
  }
  const currentBusiness = () => business;

  async function signedPhoto(bucket, path) {
    if (!path) return '';
    const result = await client.storage.from(bucket).createSignedUrl(path, 3600);
    return result.error ? '' : result.data.signedUrl;
  }

  async function loadAll() {
    if (!business) throw new Error('No hay un negocio seleccionado.');
    const bid = business.id;
    const queries = await Promise.all([
      client.from('clients').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('pets').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('vaccinations').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('appointments').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('service_history').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('cash_transactions').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('inventory_items').select('*').eq('business_id', bid).is('deleted_at', null),
      client.from('inventory_stock').select('*').eq('business_id', bid),
      client.from('grooming_workflows').select('*').eq('business_id', bid).eq('active', true).is('deleted_at', null),
      client.from('grooming_workflow_stages').select('*').eq('business_id', bid).eq('active', true).is('deleted_at', null).order('position'),
      client.from('grooming_sessions').select('*').eq('business_id', bid).is('deleted_at', null).order('created_at', { ascending: false }),
      client.from('grooming_stage_events').select('*').eq('business_id', bid).is('deleted_at', null).order('occurred_at')
    ]);
    const [clients, pets, vaccines, appointments, history, cash, inventory, stock, workflows, stages, grooming, stageEvents] = queries.map(check);
    const stockById = new Map(stock.map(x => [x.inventory_item_id, Number(x.quantity)]));
    const vaccinesByPet = new Map();
    vaccines.forEach(v => {
      if (!vaccinesByPet.has(v.pet_id)) vaccinesByPet.set(v.pet_id, []);
      vaccinesByPet.get(v.pet_id).push({ id: v.id, name: v.name, date: v.applied_on || '', expires: v.expires_on || '', vet: v.veterinary_name || '', notes: v.notes || '' });
    });
    const petRows = await Promise.all(pets.map(async p => ({
      id: p.id, clientId: p.client_id, name: p.name, species: p.species || '', breed: p.breed || '', color: p.color || '',
      sex: p.sex || '', birthDate: p.birth_date || '', weight: Number(p.weight_kg || 0), microchip: p.microchip || '',
      sterilized: p.sterilized == null ? '' : (p.sterilized ? 'Sí' : 'No'), allergies: p.allergies || '', behavior: p.behavior || '',
      groomingPreferences: p.grooming_preferences || '', notes: p.notes || '', photoPath: p.photo_path || '',
      photo: await signedPhoto('pet-photos', p.photo_path), vaccines: vaccinesByPet.get(p.id) || []
    })));
    const data = {
      settings: { business: business.name },
      clients: clients.map(x => ({ id: x.id, name: x.name, phone: x.phone || '', whatsapp: x.whatsapp || '', email: x.email || '', address: x.address || '', identification: x.identification || '', emergencyName: x.emergency_name || '', emergencyPhone: x.emergency_phone || '', notes: x.notes || '' })),
      pets: petRows,
      appointments: appointments.map(x => { const p = localParts(x.scheduled_at); return { id: x.id, clientId: x.client_id, petId: x.pet_id, date: p.date, time: p.time, service: x.service_name, status: x.status.toUpperCase(), price: Number(x.quoted_price || 0), notes: x.notes || '', assignedTo: x.assigned_to, version: x.version }; }),
      history: history.map(x => ({ id: x.id, appointmentId: x.appointment_id, clientId: x.client_id, petId: x.pet_id, date: localParts(x.performed_at).date, service: x.service_name, price: Number(x.price || 0), groomer: x.groomer_id || '', products: x.products_used_notes || '', notes: x.notes || '' })),
      cash: cash.map(x => ({ id: x.id, date: localParts(x.transaction_date).date, type: x.type === 'income' ? 'INGRESO' : 'GASTO', category: x.category || '', description: x.description, amount: Number(x.amount), method: x.payment_method || '', reference: x.reference || '' })),
      inventory: inventory.map(x => ({ id: x.id, name: x.name, sku: x.sku || '', category: x.category || '', quantity: stockById.get(x.id) || 0, minStock: Number(x.minimum_stock), cost: Number(x.cost), price: Number(x.sale_price), supplier: x.supplier || '', notes: x.notes || '' })),
      workflows, stages,
      grooming: grooming.map(x => ({ id: x.id, appointmentId: x.appointment_id, clientId: x.client_id, petId: x.pet_id, workflowId: x.workflow_id, currentStageId: x.current_stage_id, assignedTo: x.assigned_to, status: x.status, estimatedReadyAt: x.estimated_ready_at, readyAt: x.ready_at, pickedUpAt: x.picked_up_at, publicSummary: x.public_summary || '', internalNotes: x.internal_notes || '', version: x.version })),
      stageEvents
    };
    snapshot = structuredClone(data);
    return data;
  }

  const maps = {
    clients: x => stripUndefined({ id: x.id, business_id: business.id, name: x.name, phone: x.phone || null, whatsapp: x.whatsapp || null, email: x.email || null, address: x.address || null, identification: x.identification || null, emergency_name: x.emergencyName || null, emergency_phone: x.emergencyPhone || null, notes: x.notes || null, deleted_at: null }),
    pets: x => stripUndefined({ id: x.id, business_id: business.id, client_id: x.clientId, name: x.name, species: x.species || 'Perro', breed: x.breed || null, color: x.color || null, sex: x.sex || null, birth_date: x.birthDate || null, weight_kg: Number(x.weight || 0), microchip: x.microchip || null, sterilized: x.sterilized === '' ? null : x.sterilized === 'Sí', allergies: x.allergies || null, behavior: x.behavior || null, grooming_preferences: x.groomingPreferences || null, notes: x.notes || null, photo_path: x.photoPath || null, deleted_at: null }),
    appointments: x => ({ id: x.id, business_id: business.id, client_id: x.clientId, pet_id: x.petId, scheduled_at: dateTime(x.date, x.time), service_name: x.service, status: String(x.status).toLowerCase(), quoted_price: Number(x.price || 0), notes: x.notes || null, deleted_at: null }),
    history: x => ({ id: x.id, business_id: business.id, appointment_id: x.appointmentId || null, client_id: x.clientId || null, pet_id: x.petId, performed_at: dateTime(x.date), service_name: x.service, price: Number(x.price || 0), groomer_id: /^[0-9a-f-]{36}$/i.test(x.groomer || '') ? x.groomer : null, products_used_notes: x.products || null, notes: x.notes || null, deleted_at: null }),
    cash: x => ({ id: x.id, business_id: business.id, transaction_date: dateTime(x.date), type: x.type === 'INGRESO' ? 'income' : 'expense', category: x.category || null, description: x.description, amount: Number(x.amount), payment_method: x.method || null, reference: x.reference || null, deleted_at: null }),
    inventory: x => ({ id: x.id, business_id: business.id, name: x.name, sku: x.sku || null, category: x.category || null, minimum_stock: Number(x.minStock || 0), cost: Number(x.cost || 0), sale_price: Number(x.price || 0), supplier: x.supplier || null, notes: x.notes || null, active: true, deleted_at: null })
  };
  const tableFor = { history: 'service_history', cash: 'cash_transactions', inventory: 'inventory_items' };

  async function syncCollection(key, rows) {
    const table = tableFor[key] || key;
    const oldRows = snapshot[key] || [];
    const oldMap = new Map(oldRows.map(x => [x.id, x]));
    const changed = rows.filter(x => !oldMap.has(x.id) || !same(maps[key](x), maps[key](oldMap.get(x.id)))).map(maps[key]);
    if (changed.length) check(await client.from(table).upsert(changed, { onConflict: 'id' }));
    const currentIds = new Set(rows.map(x => x.id));
    const removed = oldRows.filter(x => !currentIds.has(x.id)).map(x => x.id);
    if (removed.length) check(await client.from(table).update({ deleted_at: new Date().toISOString() }).in('id', removed).eq('business_id', business.id));
  }

  async function syncVaccines(pets) {
    const now = pets.flatMap(p => (p.vaccines || []).map(v => ({ ...v, petId: p.id })));
    const old = (snapshot.pets || []).flatMap(p => (p.vaccines || []).map(v => ({ ...v, petId: p.id })));
    const oldMap = new Map(old.map(v => [v.id, v]));
    const map = v => ({ id: v.id, business_id: business.id, pet_id: v.petId, name: v.name, applied_on: v.date || null, expires_on: v.expires || null, veterinary_name: v.vet || null, notes: v.notes || null, deleted_at: null });
    const changed = now.filter(v => !oldMap.has(v.id) || !same(map(v), map(oldMap.get(v.id)))).map(map);
    if (changed.length) check(await client.from('vaccinations').upsert(changed, { onConflict: 'id' }));
    const ids = new Set(now.map(v => v.id));
    const removed = old.filter(v => !ids.has(v.id)).map(v => v.id);
    if (removed.length) check(await client.from('vaccinations').update({ deleted_at: new Date().toISOString() }).in('id', removed).eq('business_id', business.id));
  }

  async function syncInventoryMovements(rows) {
    const previous = new Map((snapshot.inventory || []).map(x => [x.id, Number(x.quantity || 0)]));
    const movements = rows.map(item => ({ item, delta: Number(item.quantity || 0) - (previous.get(item.id) || 0) })).filter(x => x.delta !== 0).map(({ item, delta }) => ({
      id: uuid(), business_id: business.id, inventory_item_id: item.id,
      movement_type: previous.has(item.id) ? 'adjustment' : 'purchase', quantity_delta: delta,
      unit_cost: Number(item.cost || 0), reason: previous.has(item.id) ? 'Ajuste desde la aplicación' : 'Existencia inicial',
      client_mutation_id: uuid()
    }));
    if (movements.length) check(await client.from('inventory_movements').insert(movements));
  }

  async function performSync(data) {
    for (const key of ['clients', 'pets', 'appointments', 'history', 'cash', 'inventory']) await syncCollection(key, data[key] || []);
    await syncVaccines(data.pets || []);
    await syncInventoryMovements(data.inventory || []);
    snapshot = structuredClone(data);
    return data;
  }
  function sync(data) {
    saveQueue = saveQueue.catch(() => {}).then(() => performSync(structuredClone(data)));
    return saveQueue;
  }

  async function uploadPetPhoto(petId, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${business.id}/${petId}/${uuid()}.${extension}`;
    check(await client.storage.from('pet-photos').upload(path, blob, { contentType: blob.type, upsert: false }));
    check(await client.from('pets').update({ photo_path: path }).eq('business_id', business.id).eq('id', petId));
    return { path, url: await signedPhoto('pet-photos', path) };
  }

  async function createGroomingSession(input) {
    const row = check(await client.from('grooming_sessions').insert({
      id: uuid(), business_id: business.id, appointment_id: input.appointmentId || null,
      client_id: input.clientId, pet_id: input.petId, workflow_id: input.workflowId,
      estimated_ready_at: input.estimatedReadyAt || null, internal_notes: input.internalNotes || null
    }).select().single());
    return row;
  }
  async function advanceStage(sessionId, stageId, version) {
    return check(await client.rpc('advance_grooming_stage', {
      p_session_id: sessionId, p_stage_id: stageId, p_expected_version: version,
      p_client_mutation_id: uuid(), p_device_id: getDeviceId(), p_notes: null
    }));
  }
  function getDeviceId() {
    let id = localStorage.getItem('scrappy_device_id');
    if (!id) { id = uuid(); localStorage.setItem('scrappy_device_id', id); }
    return id;
  }

  function subscribe(onChange) {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel(`business:${business.id}`);
    TABLES.forEach(table => realtimeChannel.on('postgres_changes', {
      event: '*', schema: 'public', table, filter: `business_id=eq.${business.id}`
    }, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onChange, 350);
    }));
    realtimeChannel.subscribe();
  }

  async function migrateLegacy(legacy) {
    if (!legacy || !Array.isArray(legacy.clients) || !Array.isArray(legacy.pets)) throw new Error('Datos locales inválidos.');
    const clientIds = new Map(legacy.clients.map(x => [x.id, uuid()]));
    const petIds = new Map(legacy.pets.map(x => [x.id, uuid()]));
    const appointmentIds = new Map((legacy.appointments || []).map(x => [x.id, uuid()]));
    const migrated = {
      settings: { business: business.name },
      clients: legacy.clients.map(x => ({ ...x, id: clientIds.get(x.id) })),
      pets: legacy.pets.map(x => ({ ...x, id: petIds.get(x.id), clientId: clientIds.get(x.clientId), photo: '', photoPath: '', vaccines: (x.vaccines || []).map(v => ({ ...v, id: uuid() })) })),
      appointments: (legacy.appointments || []).map(x => ({ ...x, id: appointmentIds.get(x.id), clientId: clientIds.get(x.clientId), petId: petIds.get(x.petId) })),
      history: (legacy.history || []).map(x => ({ ...x, id: uuid(), appointmentId: null, clientId: clientIds.get(legacy.pets.find(p => p.id === x.petId)?.clientId), petId: petIds.get(x.petId) })),
      cash: (legacy.cash || []).map(x => ({ ...x, id: uuid() })),
      inventory: (legacy.inventory || []).map(x => ({ ...x, id: uuid() })),
      workflows: [], stages: [], grooming: [], stageEvents: []
    };
    snapshot = { clients: [], pets: [], appointments: [], history: [], cash: [], inventory: [] };
    await performSync(migrated);
    for (const sourcePet of legacy.pets) {
      if (typeof sourcePet.photo === 'string' && sourcePet.photo.startsWith('data:image/')) {
        const targetPet = migrated.pets.find(p => p.id === petIds.get(sourcePet.id));
        const uploaded = await uploadPetPhoto(targetPet.id, sourcePet.photo);
        targetPet.photoPath = uploaded.path;
        targetPet.photo = uploaded.url;
      }
    }
    await performSync(migrated);
    localStorage.setItem('scrappy_supabase_migrated_at', new Date().toISOString());
    return migrated;
  }

  window.ScrappyData = {
    init, session, signIn, signUp, signOut, onAuthChange, loadBusiness, createBusiness,
    currentBusiness, loadAll, sync, subscribe, uploadPetPhoto,
    createGroomingSession, advanceStage, migrateLegacy, uuid
  };
}());
