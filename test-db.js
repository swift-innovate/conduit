const DB = require('better-sqlite3');
const db = new DB('G:/Projects/conduit/data/conduit.db');

// Test 1: Using $id
try {
  const r = db.prepare('SELECT * FROM projects WHERE id = $id').get({ $id: 'a6403f35-3485-420b-91d7-3d6da6dfabda' });
  console.log('Test 1 (with $id):', r ? r.name : 'null');
} catch(e) {
  console.log('Test 1 ERROR:', e.message);
}

// Test 2: Using plain 'id' 
try {
  const r2 = db.prepare('SELECT * FROM projects WHERE id = $id').get({ id: 'a6403f35-3485-420b-91d7-3d6da6dfabda' });
  console.log('Test 2 (with id):', r2 ? r2.name : 'null');
} catch(e) {
  console.log('Test 2 ERROR:', e.message);
}

db.close();
