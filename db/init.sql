CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  instructor VARCHAR(100),
  seats INT NOT NULL DEFAULT 30 CHECK (seats >= 0)
);

CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  qualification VARCHAR(100) NOT NULL,
  registered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);
