try {
  const DB = require('G:/Projects/conduit/node_modules/better-sqlite3');
  console.log('loaded better-sqlite3');
  const db = new DB('G:/Projects/conduit/data/conduit.db');
  console.log('opened db');
  const projects = db.prepare('SELECT * FROM projects').all();
  console.log('Projects count: ' + projects.length);
  if (projects.length > 0) {
    console.log('First: ' + projects[0].name + ' id=' + projects[0].id);
    try {
      const r = db.prepare('SELECT * FROM projects WHERE id = $id').get({ $id: projects[0].id });
      console.log('Param OK: ' + (r ? r.name : 'null'));
    } catch(e) {
      console.log('Param FAIL: ' + e.message);
    }
  }
  db.close();
} catch(e) {
  console.log('FATAL: ' + e.message);
  console.log(e.stack);
}
