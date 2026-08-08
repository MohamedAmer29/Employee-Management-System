const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'EMS',
});
c.connect()
  .then(async () => {
    const u = await c.query('SELECT role, count(*)::int n FROM "user" GROUP BY role ORDER BY role');
    console.log('users by role:', JSON.stringify(u.rows));
    const ut = await c.query('SELECT count(*)::int n FROM "user"');
    console.log('users total:', ut.rows[0].n);
    const e = await c.query('SELECT count(*)::int n FROM employee');
    console.log('employees total:', e.rows[0].n);
    const l = await c.query('SELECT "isActive", count(*)::int n FROM employee GROUP BY "isActive"');
    console.log('employees by isActive:', JSON.stringify(l.rows));
    const d = await c.query('SELECT count(*)::int n FROM department');
    console.log('departments total:', d.rows[0].n);
    const linked = await c.query('SELECT count(*)::int n FROM employee WHERE "userId" IS NOT NULL');
    console.log('employees with userId:', linked.rows[0].n);
  })
  .catch((e) => console.error('ERR', e.message))
  .finally(() => c.end());
