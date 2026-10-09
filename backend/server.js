const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const APP_VERSION = process.env.APP_VERSION || 'local';

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// ---- auth middleware ----
const auth = (role) => (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const user = jwt.verify(token, SECRET);
    if (role && user.role !== role) return res.status(403).json({ error: 'Access denied' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
};

const sign = (u) =>
  jwt.sign({ id: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });

// ---- public routes ----
// Readiness check: report unhealthy when PostgreSQL cannot be reached.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'ok',
      db: 'up',
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return res.status(503).json({
      status: 'error',
      db: 'down',
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'student') RETURNING id,name,role",
      [name.trim(), email.trim().toLowerCase(), hash]
    );
    res.status(201).json({ token: sign(rows[0]), role: 'student', name: rows[0].name });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'This email is already registered' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').trim().toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Incorrect email or password' });
  res.json({ token: sign(u), role: u.role, name: u.name });
});

// ---- courses ----
app.get('/api/courses', auth(), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, c.seats - COUNT(r.id)::int AS seats_left
     FROM courses c LEFT JOIN registrations r ON r.course_id=c.id
     GROUP BY c.id ORDER BY c.id`
  );
  res.json(rows);
});

app.post('/api/courses', auth('admin'), async (req, res) => {
  const { title, description, instructor, seats } = req.body;
  if (!title) return res.status(400).json({ error: 'Course title is required' });
  const { rows } = await pool.query(
    'INSERT INTO courses (title,description,instructor,seats) VALUES ($1,$2,$3,$4) RETURNING *',
    [title, description || '', instructor || '', parseInt(seats) || 30]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/courses/:id', auth('admin'), async (req, res) => {
  await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---- registrations ----
// Shared by students (self) and admins (on behalf of a student)
async function enroll(userId, courseId, phone, qualification) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = await client.query(
      `SELECT c.seats - (SELECT COUNT(*) FROM registrations WHERE course_id=c.id) AS left
       FROM courses c WHERE c.id=$1 FOR UPDATE`, [courseId]);
    if (!c.rows[0]) { await client.query('ROLLBACK'); return { status: 404, error: 'Course not found' }; }
    if (Number(c.rows[0].left) <= 0) { await client.query('ROLLBACK'); return { status: 409, error: 'This course is full' }; }
    await client.query(
      'INSERT INTO registrations (user_id,course_id,phone,qualification) VALUES ($1,$2,$3,$4)',
      [userId, courseId, phone, qualification]);
    await client.query('COMMIT');
    return { status: 201, ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return { status: 409, error: 'Already registered for this course' };
    if (e.code === '23503') return { status: 404, error: 'Student or course not found' };
    console.error(e);
    return { status: 500, error: 'Server error' };
  } finally {
    client.release();
  }
}

app.post('/api/register', auth('student'), async (req, res) => {
  const { course_id, phone, qualification } = req.body;
  if (!course_id || !phone || !qualification)
    return res.status(400).json({ error: 'Course, phone and qualification are required' });
  const r = await enroll(req.user.id, course_id, phone, qualification);
  res.status(r.status).json(r.error ? { error: r.error } : { ok: true });
});

app.get('/api/my-registrations', auth('student'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, c.title, c.instructor, r.registered_at
     FROM registrations r JOIN courses c ON c.id=r.course_id
     WHERE r.user_id=$1 ORDER BY r.registered_at DESC`, [req.user.id]);
  res.json(rows);
});

app.delete('/api/my-registrations/:id', auth('student'), async (req, res) => {
  await pool.query('DELETE FROM registrations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

app.get('/api/registrations', auth('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, u.name, u.email, r.phone, r.qualification, c.title, r.registered_at
     FROM registrations r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id
     ORDER BY r.registered_at DESC`);
  res.json(rows);
});

// ---- admin: students ----
app.get('/api/students', auth('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email,
            COALESCE(json_agg(json_build_object('reg_id', r.id, 'title', c.title))
                     FILTER (WHERE r.id IS NOT NULL), '[]') AS courses
     FROM users u
     LEFT JOIN registrations r ON r.user_id = u.id
     LEFT JOIN courses c ON c.id = r.course_id
     WHERE u.role = 'student'
     GROUP BY u.id ORDER BY u.name`);
  res.json(rows);
});

app.post('/api/admin/register', auth('admin'), async (req, res) => {
  const { user_id, course_id, phone, qualification } = req.body;
  if (!user_id || !course_id || !phone || !qualification)
    return res.status(400).json({ error: 'Student, course, phone and qualification are required' });
  const r = await enroll(user_id, course_id, phone, qualification);
  res.status(r.status).json(r.error ? { error: r.error } : { ok: true });
});

app.delete('/api/registrations/:id', auth('admin'), async (req, res) => {
  await pool.query('DELETE FROM registrations WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---- startup: make sure the admin account exists ----
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@college.com').toLowerCase();
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
  await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Administrator',$1,$2,'admin')
     ON CONFLICT (email) DO NOTHING`, [email, hash]);
}

async function seedCourses() {
  const list = [
  ['Docker & Containers', 'Images, containers, volumes and Compose from scratch.', 'Prof. Rao', 30],
  ['CI/CD with GitHub Actions', 'Build, test and ship code automatically.', 'Prof. Meena', 25],
  ['Linux for DevOps', 'Shell, permissions, processes and scripting.', 'Prof. Kumar', 40],
  ['Kubernetes Fundamentals', 'Pods, deployments, services and scaling.', 'Prof. Anitha', 30],
  ['Git & GitHub Workflow', 'Branching, pull requests and team collaboration.', 'Prof. Suresh', 50],
  ['Jenkins Pipelines', 'Automate builds and deployments with Jenkins.', 'Prof. Lakshmi', 30],
  ['Terraform & Infrastructure as Code', 'Provision cloud resources with code.', 'Prof. Vijay', 25],
  ['AWS Cloud Essentials', 'EC2, S3, IAM, VPC and core cloud services.', 'Prof. Divya', 40],
  ['Ansible Automation', 'Configuration management with playbooks.', 'Prof. Karthik', 30],
  ['Monitoring with Prometheus & Grafana', 'Metrics, dashboards and alerting.', 'Prof. Revathi', 25],
  ['Python for Automation', 'Scripting for DevOps tasks and APIs.', 'Prof. Arun', 45],
  ['Web Development Basics', 'HTML, CSS and JavaScript fundamentals.', 'Prof. Priya', 50],
  ['Database Management with SQL', 'Design schemas and write queries in PostgreSQL.', 'Prof. Mohan', 40],
  ['Cyber Security Basics', 'Threats, secure coding and DevSecOps intro.', 'Prof. Nisha', 30],
  ];
  for (const [title, description, instructor, seats] of list) {
    await pool.query(
      `INSERT INTO courses (title,description,instructor,seats)
       SELECT $1::varchar, $2::text, $3::varchar, $4::int
       WHERE NOT EXISTS (SELECT 1 FROM courses WHERE title = $1::varchar)`,
      [title, description, instructor, seats]);
  }
}

seedAdmin()
  .then(seedCourses)
  .then(() => {
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log(JSON.stringify({
      level: 'info',
      message: 'Backend started',
      port,
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    })));
  })
  .catch((e) => { console.error('Startup failed:', e); process.exit(1); });
